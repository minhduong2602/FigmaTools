function getActiveBlendGroup() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (isBlendGroup(node)) return node;
  let parent = node.parent;
  while (parent && parent.type !== "PAGE") {
    if (isBlendGroup(parent)) return parent;
    parent = parent.parent;
  }
  return null;
}

function isBlendGroup(node) {
  return (node.type === "GROUP" || node.type === "FRAME") && node.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BLEND_GROUP;
}

function notifySelectBlend() {
  figma.notify("Select a Blend group first.");
}

function createBlendOptions(options) {
  return normalizeBlendOptions(options || {
    spacingMode: "SPECIFIED_STEPS",
    steps: 8,
    distance: 24,
    reverseFrontToBack: false,
    editEndpoints: false
  });
}

function normalizeBlendOptions(options) {
  const source = options || {};
  return {
    spacingMode: normalizeBlendSpacingMode(source.spacingMode),
    steps: Math.round(clampNumber(source.steps, 1, 200, 8)),
    distance: clampNumber(source.distance, 1, 10000, 24),
    reverseFrontToBack: source.reverseFrontToBack === true,
    editEndpoints: source.editEndpoints === true
  };
}

function readBlendOptions(group) {
  const raw = group.getSharedPluginData(DATA_NAMESPACE, DATA_BLEND);
  if (!raw) return createBlendOptions();
  try {
    return normalizeBlendOptions(JSON.parse(raw));
  } catch (_error) {
    return createBlendOptions();
  }
}

function writeBlendOptions(group, options) {
  group.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND, JSON.stringify(normalizeBlendOptions(options)));
}

async function makeBlend() {
  const selection = getSelection();
  if (selection.length !== 2) {
    figma.notify("Select exactly two objects to make a blend.");
    return;
  }

  const start = selection[0];
  const end = selection[1];
  if (!start.parent || start.parent !== end.parent || start.parent.type === "DOCUMENT") {
    figma.notify("Blend needs two objects in the same parent.");
    return;
  }
  if (!("width" in start) || !("height" in start) || !("width" in end) || !("height" in end)) {
    figma.notify("Blend needs objects with visible dimensions.");
    return;
  }

  const parent = start.parent;
  const originalName = start.name + " Blend";
  const frame = createBlendFrame(start, end, parent, originalName);
  const startX = start.x;
  const startY = start.y;
  const endX = end.x;
  const endY = end.y;
  start.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_BASE);
  start.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE, BLEND_ROLE_START);
  end.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_BASE);
  end.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE, BLEND_ROLE_END);
  frame.appendChild(start);
  frame.appendChild(end);
  start.x = startX - frame.x;
  start.y = startY - frame.y;
  end.x = endX - frame.x;
  end.y = endY - frame.y;
  start.visible = false;
  end.visible = false;
  const options = createBlendOptions();
  writeBlendOptions(frame, options);
  await renderBlend(frame, options);
  figma.currentPage.selection = [frame];
  figma.notify("Blend created.");
}

function createBlendFrame(start, end, parent, name) {
  const bounds = blendBounds(start, end);
  const frame = figma.createFrame();
  const startIndex = getChildIndex(parent, start);
  const endIndex = getChildIndex(parent, end);
  const index = Math.min(startIndex >= 0 ? startIndex : parent.children.length, endIndex >= 0 ? endIndex : parent.children.length);
  frame.name = name;
  frame.x = bounds.x;
  frame.y = bounds.y;
  frame.resizeWithoutConstraints(Math.max(0.01, bounds.width), Math.max(0.01, bounds.height));
  frame.clipsContent = false;
  frame.fills = [];
  frame.strokes = [];
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_GROUP);
  parent.insertChild(index >= 0 ? index : parent.children.length, frame);
  return frame;
}

function blendBounds(start, end) {
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const x2 = Math.max(start.x + start.width, end.x + end.width);
  const y2 = Math.max(start.y + start.height, end.y + end.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

async function renderBlend(group, options) {
  const endpoints = getBlendEndpoints(group);
  if (!endpoints.start || !endpoints.end) throw new Error("Blend is missing one endpoint.");

  const normalized = normalizeBlendOptions(options);
  clearBlendRenders(group);
  endpoints.start.visible = normalized.editEndpoints;
  endpoints.end.visible = normalized.editEndpoints;
  endpoints.start.locked = false;
  endpoints.end.locked = false;

  const steps = resolvedBlendSteps(normalized, endpoints.start, endpoints.end);
  const total = steps + 2;
  const renders = [];
  const firstIndex = normalized.editEndpoints ? 1 : 0;
  const lastIndex = normalized.editEndpoints ? total - 2 : total - 1;
  for (let index = firstIndex; index <= lastIndex; index++) {
    const t = total <= 1 ? 0 : index / (total - 1);
    const render = createBlendRenderNode(endpoints.start, endpoints.end, t, group);
    render.name = "Blend " + String(index + 1).padStart(2, "0");
    render.visible = true;
    render.locked = false;
    render.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_RENDER);
    renders.push(render);
  }

  if (normalized.reverseFrontToBack) renders.reverse();
  for (let index = 0; index < renders.length; index++) {
    group.appendChild(renders[index]);
  }
  writeBlendOptions(group, normalized);
}

function clearBlendRenders(group) {
  for (const child of group.children.slice()) {
    if (child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BLEND_RENDER) {
      child.remove();
    }
  }
}

function getBlendEndpoints(group) {
  const result = { start: null, end: null };
  for (const child of group.children) {
    if (child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) !== KIND_BLEND_BASE) continue;
    const role = child.getSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE);
    if (role === BLEND_ROLE_START) result.start = child;
    if (role === BLEND_ROLE_END) result.end = child;
  }
  return result;
}

function resolvedBlendSteps(options, start, end) {
  if (options.spacingMode === "SMOOTH_COLOR") return 24;
  if (options.spacingMode === "SPECIFIED_DISTANCE") {
    const dx = centerX(end) - centerX(start);
    const dy = centerY(end) - centerY(start);
    const distance = Math.sqrt(dx * dx + dy * dy);
    return Math.max(1, Math.min(200, Math.ceil(distance / options.distance) - 1));
  }
  return options.steps;
}

function createBlendRenderNode(start, end, t, group) {
  if (t > 0 && t < 1) {
    const morphed = createMorphedBlendPath(start, end, t, group);
    if (morphed) return morphed;
  }
  const source = t >= 1 ? end : start;
  const render = source.clone();
  applyBlendInterpolation(render, start, end, t);
  return render;
}

function applyBlendInterpolation(node, start, end, t) {
  if ("x" in node) node.x = lerp(start.x, end.x, t);
  if ("y" in node) node.y = lerp(start.y, end.y, t);
  if ("resize" in node && "width" in node && "height" in node) {
    try {
      node.resize(Math.max(0.01, lerp(start.width, end.width, t)), Math.max(0.01, lerp(start.height, end.height, t)));
    } catch (_resizeError) {}
  }
  if ("rotation" in node && "rotation" in start && "rotation" in end) node.rotation = lerp(start.rotation, end.rotation, t);
  if ("opacity" in node && "opacity" in start && "opacity" in end) node.opacity = lerp(start.opacity, end.opacity, t);
  if ("blendMode" in node && "blendMode" in start && "blendMode" in end) node.blendMode = t < 0.5 ? start.blendMode : end.blendMode;
  interpolateNodePaints(node, start, end, t);
  interpolateStrokeWeight(node, start, end, t);
}

function createMorphedBlendPath(start, end, t, group) {
  const startPath = sampleBlendPath(start, group);
  const endPath = sampleBlendPath(end, group);
  if (!startPath || !endPath) return null;

  const count = Math.max(16, Math.min(192, Math.max(startPath.points.length, endPath.points.length)));
  const startPoints = resampleBlendPoints(startPath.points, count, startPath.closed);
  let endPoints = resampleBlendPoints(endPath.points, count, endPath.closed);
  if (!startPoints.length || !endPoints.length || startPoints.length !== endPoints.length) return null;
  endPoints = alignBlendPointOrder(startPoints, endPoints, startPath.closed && endPath.closed);

  const points = [];
  for (let index = 0; index < startPoints.length; index++) {
    points.push({
      x: lerp(startPoints[index].x, endPoints[index].x, t),
      y: lerp(startPoints[index].y, endPoints[index].y, t)
    });
  }

  const closed = startPath.closed && endPath.closed;
  const bounds = blendPointBounds(points);
  const localPoints = translateBlendPoints(points, -bounds.x, -bounds.y);
  const pathData = blendPointsToPath(localPoints, closed);
  if (!pathData) return null;

  const vector = figma.createVector();
  vector.x = bounds.x;
  vector.y = bounds.y;
  try {
    vector.vectorPaths = [{ windingRule: "NONZERO", data: pathData }];
  } catch (_error) {
    vector.remove();
    return null;
  }
  applyBlendPathStyle(vector, start, end, t);
  return vector;
}

function sampleBlendPath(node, group) {
  if (!("width" in node) || !("height" in node)) return null;
  const toGroup = blendNodeToGroupTransform(node, group);

  try {
    if (Array.isArray(node.vectorPaths) && node.vectorPaths.length > 0 && node.vectorPaths[0].data) {
      return {
        points: transformBlendPoints(blendPathPoints(sampleSvgPath(node.vectorPaths[0].data, 24)), toGroup),
        closed: /[Zz]\s*$/.test(node.vectorPaths[0].data)
      };
    }
  } catch (_vectorPathError) {}

  try {
    const strokeGeometry = node.strokeGeometry;
    if (strokeGeometry && strokeGeometry.length > 0 && strokeGeometry[0].data) {
      return {
        points: transformBlendPoints(blendPathPoints(sampleSvgPath(strokeGeometry[0].data, 16)), toGroup),
        closed: /[Zz]\s*$/.test(strokeGeometry[0].data)
      };
    }
  } catch (_strokeGeometryError) {}

  try {
    const fillGeometry = node.fillGeometry;
    if (fillGeometry && fillGeometry.length > 0 && fillGeometry[0].data) {
      return {
        points: transformBlendPoints(blendPathPoints(sampleSvgPath(fillGeometry[0].data, 16)), toGroup),
        closed: /[Zz]\s*$/.test(fillGeometry[0].data)
      };
    }
  } catch (_fillGeometryError) {}

  return {
    points: transformBlendPoints(blendPathPoints(sampleRectOutline(node.width, node.height, blendCornerRadius(node), 24)), toGroup),
    closed: true
  };
}

function blendPathPoints(sampled) {
  const points = [];
  for (let index = 0; index < sampled.length; index++) {
    const point = sampled[index];
    if (point.type === "M" || point.type === "L") points.push({ x: point.x, y: point.y });
  }
  return points;
}

function blendCornerRadius(node) {
  if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
    return Math.min(node.cornerRadius, node.width / 2, node.height / 2);
  }
  return 0;
}

function resampleBlendPoints(points, count, closed) {
  if (!points.length || count <= 0) return [];
  if (points.length === 1) {
    const repeated = [];
    for (let index = 0; index < count; index++) repeated.push({ x: points[0].x, y: points[0].y });
    return repeated;
  }

  const segments = blendSegments(points, closed);
  const totalLength = segments.length ? segments[segments.length - 1].endLength : 0;
  if (totalLength <= 0) return points.slice(0, count);

  const result = [];
  const denominator = closed ? count : count - 1;
  for (let index = 0; index < count; index++) {
    const target = denominator <= 0 ? 0 : totalLength * index / denominator;
    result.push(pointAtBlendLength(segments, target));
  }
  return result;
}

function blendSegments(points, closed) {
  const segments = [];
  let length = 0;
  const max = closed ? points.length : points.length - 1;
  for (let index = 0; index < max; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (segmentLength <= 0) continue;
    length += segmentLength;
    segments.push({
      a: a,
      b: b,
      length: segmentLength,
      endLength: length
    });
  }
  return segments;
}

function pointAtBlendLength(segments, target) {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const startLength = segment.endLength - segment.length;
    if (target <= segment.endLength || index === segments.length - 1) {
      const local = segment.length <= 0 ? 0 : (target - startLength) / segment.length;
      return {
        x: lerp(segment.a.x, segment.b.x, Math.max(0, Math.min(1, local))),
        y: lerp(segment.a.y, segment.b.y, Math.max(0, Math.min(1, local)))
      };
    }
  }
  const last = segments[segments.length - 1];
  return { x: last.b.x, y: last.b.y };
}

function alignBlendPointOrder(startPoints, endPoints, closed) {
  if (!startPoints.length || startPoints.length !== endPoints.length) return endPoints;
  if (!closed) return alignOpenBlendPoints(startPoints, endPoints);
  const forward = bestClosedBlendShift(startPoints, endPoints);
  const reversed = reverseBlendPoints(endPoints);
  const backward = bestClosedBlendShift(startPoints, reversed);
  return backward.score < forward.score ? backward.points : forward.points;
}

function alignOpenBlendPoints(startPoints, endPoints) {
  const normalScore = blendEndpointScore(startPoints, endPoints);
  const reversed = reverseBlendPoints(endPoints);
  const reversedScore = blendEndpointScore(startPoints, reversed);
  return reversedScore < normalScore ? reversed : endPoints;
}

function blendEndpointScore(startPoints, endPoints) {
  const last = startPoints.length - 1;
  return blendPointDistanceSquared(startPoints[0], endPoints[0]) + blendPointDistanceSquared(startPoints[last], endPoints[last]);
}

function bestClosedBlendShift(startPoints, endPoints) {
  let bestScore = Infinity;
  let bestOffset = 0;
  for (let offset = 0; offset < endPoints.length; offset++) {
    let score = 0;
    for (let index = 0; index < startPoints.length; index++) {
      score += blendPointDistanceSquared(startPoints[index], endPoints[(index + offset) % endPoints.length]);
    }
    if (score < bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  const points = [];
  for (let index = 0; index < endPoints.length; index++) {
    points.push(endPoints[(index + bestOffset) % endPoints.length]);
  }
  return { score: bestScore, points: points };
}

function reverseBlendPoints(points) {
  const result = [];
  for (let index = points.length - 1; index >= 0; index--) result.push(points[index]);
  return result;
}

function blendPointDistanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function blendPointBounds(points) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    x1 = Math.min(x1, point.x);
    y1 = Math.min(y1, point.y);
    x2 = Math.max(x2, point.x);
    y2 = Math.max(y2, point.y);
  }
  if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
    return { x: 0, y: 0, width: 0.01, height: 0.01 };
  }
  return { x: x1, y: y1, width: Math.max(0.01, x2 - x1), height: Math.max(0.01, y2 - y1) };
}

function translateBlendPoints(points, dx, dy) {
  const result = [];
  for (let index = 0; index < points.length; index++) {
    result.push({ x: points[index].x + dx, y: points[index].y + dy });
  }
  return result;
}

function transformBlendPoints(points, matrix) {
  const result = [];
  for (let index = 0; index < points.length; index++) {
    result.push(transformBlendPoint(points[index], matrix));
  }
  return result;
}

function blendNodeToGroupTransform(node, group) {
  try {
    if (group && group.absoluteTransform && node.absoluteTransform) {
      return multiplyBlendTransforms(invertBlendTransform(group.absoluteTransform), node.absoluteTransform);
    }
  } catch (_transformError) {}
  try {
    if (node.relativeTransform) return node.relativeTransform;
  } catch (_relativeError) {}
  return [[1, 0, node.x || 0], [0, 1, node.y || 0]];
}

function transformBlendPoint(point, matrix) {
  return {
    x: matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2],
    y: matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2]
  };
}

function invertBlendTransform(matrix) {
  const a = matrix[0][0];
  const c = matrix[0][1];
  const e = matrix[0][2];
  const b = matrix[1][0];
  const d = matrix[1][1];
  const f = matrix[1][2];
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 0.000001) return [[1, 0, 0], [0, 1, 0]];
  const invA = d / determinant;
  const invB = -b / determinant;
  const invC = -c / determinant;
  const invD = a / determinant;
  const invE = -(invA * e + invC * f);
  const invF = -(invB * e + invD * f);
  return [[invA, invC, invE], [invB, invD, invF]];
}

function multiplyBlendTransforms(a, b) {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2]
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2]
    ]
  ];
}

function blendPointsToPath(points, closed) {
  if (!points.length) return "";
  const parts = ["M " + blendRound(points[0].x) + " " + blendRound(points[0].y)];
  for (let index = 1; index < points.length; index++) {
    parts.push("L " + blendRound(points[index].x) + " " + blendRound(points[index].y));
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function blendRound(value) {
  return Math.round(value * 100) / 100;
}

function applyBlendPathStyle(node, start, end, t) {
  if ("opacity" in node && "opacity" in start && "opacity" in end) node.opacity = lerp(start.opacity, end.opacity, t);
  if ("blendMode" in node && "blendMode" in start && "blendMode" in end) node.blendMode = t < 0.5 ? start.blendMode : end.blendMode;
  interpolateNodePaints(node, start, end, t);
  interpolateStrokeWeight(node, start, end, t);
  interpolateStrokeStyle(node, start, end, t);
}

function interpolateNodePaints(node, start, end, t) {
  if ("fills" in node && Array.isArray(start.fills) && Array.isArray(end.fills)) {
    node.fills = interpolatePaintArray(start.fills, end.fills, t);
  }
  if ("strokes" in node && Array.isArray(start.strokes) && Array.isArray(end.strokes)) {
    node.strokes = interpolatePaintArray(start.strokes, end.strokes, t);
  }
}

function interpolatePaintArray(startPaints, endPaints, t) {
  const max = Math.max(startPaints.length, endPaints.length);
  const result = [];
  for (let index = 0; index < max; index++) {
    const startPaint = startPaints[index] || startPaints[startPaints.length - 1];
    const endPaint = endPaints[index] || endPaints[endPaints.length - 1];
    if (!startPaint && !endPaint) continue;
    const paint = interpolateBlendPaint(startPaint, endPaint, t);
    if (paint) result.push(paint);
  }
  return result;
}

function interpolateBlendPaint(startPaint, endPaint, t) {
  if (!startPaint && !endPaint) return null;
  if (!startPaint || !endPaint) return cloneSerializable(t < 0.5 ? startPaint : endPaint);
  if (startPaint.type === "SOLID" && endPaint.type === "SOLID") return interpolateSolidBlendPaint(startPaint, endPaint, t);
  if (isBlendGradientPaint(startPaint) || isBlendGradientPaint(endPaint)) return interpolateGradientBlendPaint(startPaint, endPaint, t);
  return cloneSerializable(t < 0.5 ? startPaint : endPaint);
}

function interpolateSolidBlendPaint(startPaint, endPaint, t) {
  const paint = cloneSerializable(startPaint);
  paint.color = {
    r: lerp(startPaint.color.r, endPaint.color.r, t),
    g: lerp(startPaint.color.g, endPaint.color.g, t),
    b: lerp(startPaint.color.b, endPaint.color.b, t)
  };
  paint.opacity = lerp(paintOpacity(startPaint), paintOpacity(endPaint), t);
  paint.visible = startPaint.visible !== false || endPaint.visible !== false;
  return paint;
}

function interpolateGradientBlendPaint(startPaint, endPaint, t) {
  const startGradient = isBlendGradientPaint(startPaint) ? startPaint : solidPaintAsGradient(startPaint, endPaint);
  const endGradient = isBlendGradientPaint(endPaint) ? endPaint : solidPaintAsGradient(endPaint, startPaint);
  if (!startGradient || !endGradient) return cloneSerializable(t < 0.5 ? startPaint : endPaint);

  const template = cloneSerializable(t < 0.5 ? startGradient : endGradient);
  template.type = startGradient.type === endGradient.type ? startGradient.type : (t < 0.5 ? startGradient.type : endGradient.type);
  template.gradientStops = interpolateGradientStops(startGradient, endGradient, t);
  template.gradientTransform = interpolateGradientTransform(startGradient.gradientTransform, endGradient.gradientTransform, t);
  template.visible = startPaint.visible !== false || endPaint.visible !== false;
  if ("opacity" in template) {
    delete template.opacity;
  }
  return template;
}

function isBlendGradientPaint(paint) {
  return paint && typeof paint.type === "string" && paint.type.indexOf("GRADIENT_") === 0 && Array.isArray(paint.gradientStops);
}

function solidPaintAsGradient(solidPaint, gradientTemplate) {
  if (!solidPaint || solidPaint.type !== "SOLID" || !isBlendGradientPaint(gradientTemplate)) return null;
  const template = cloneSerializable(gradientTemplate);
  const positions = gradientStopPositions(gradientTemplate);
  const color = {
    r: solidPaint.color.r,
    g: solidPaint.color.g,
    b: solidPaint.color.b,
    a: paintOpacity(solidPaint)
  };
  template.gradientStops = positions.map(function (position) {
    return {
      position: position,
      color: Object.assign({}, color)
    };
  });
  template.visible = solidPaint.visible !== false;
  return template;
}

function interpolateGradientStops(startPaint, endPaint, t) {
  const positions = mergeGradientStopPositions(startPaint, endPaint);
  const stops = [];
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    const startColor = gradientColorAt(startPaint, position);
    const endColor = gradientColorAt(endPaint, position);
    stops.push({
      position: position,
      color: {
        r: lerp(startColor.r, endColor.r, t),
        g: lerp(startColor.g, endColor.g, t),
        b: lerp(startColor.b, endColor.b, t),
        a: lerp(startColor.a, endColor.a, t)
      }
    });
  }
  return stops;
}

function mergeGradientStopPositions(startPaint, endPaint) {
  const map = { "0": 0, "1": 1 };
  const startPositions = gradientStopPositions(startPaint);
  const endPositions = gradientStopPositions(endPaint);
  for (let index = 0; index < startPositions.length; index++) {
    map[String(blendRound(startPositions[index]))] = startPositions[index];
  }
  for (let index = 0; index < endPositions.length; index++) {
    map[String(blendRound(endPositions[index]))] = endPositions[index];
  }
  const result = Object.keys(map).map(function (key) {
    return Math.max(0, Math.min(1, Number(map[key])));
  });
  result.sort(function (a, b) { return a - b; });
  return result;
}

function gradientStopPositions(paint) {
  if (!paint || !Array.isArray(paint.gradientStops) || !paint.gradientStops.length) return [0, 1];
  const positions = [];
  for (let index = 0; index < paint.gradientStops.length; index++) {
    const stop = paint.gradientStops[index];
    positions.push(typeof stop.position === "number" ? stop.position : index / Math.max(1, paint.gradientStops.length - 1));
  }
  return positions;
}

function gradientColorAt(paint, position) {
  if (!paint || !Array.isArray(paint.gradientStops) || !paint.gradientStops.length) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  const stops = cloneSerializable(paint.gradientStops).sort(function (a, b) {
    return a.position - b.position;
  });
  if (position <= stops[0].position) return gradientStopColor(stops[0], paint);
  const last = stops[stops.length - 1];
  if (position >= last.position) return gradientStopColor(last, paint);
  for (let index = 1; index < stops.length; index++) {
    const before = stops[index - 1];
    const after = stops[index];
    if (position <= after.position) {
      const span = after.position - before.position;
      const local = span <= 0 ? 0 : (position - before.position) / span;
      const beforeColor = gradientStopColor(before, paint);
      const afterColor = gradientStopColor(after, paint);
      return {
        r: lerp(beforeColor.r, afterColor.r, local),
        g: lerp(beforeColor.g, afterColor.g, local),
        b: lerp(beforeColor.b, afterColor.b, local),
        a: lerp(beforeColor.a, afterColor.a, local)
      };
    }
  }
  return gradientStopColor(last, paint);
}

function gradientStopColor(stop, paint) {
  const color = stop && stop.color ? stop.color : { r: 0, g: 0, b: 0, a: 1 };
  const paintAlpha = typeof paint.opacity === "number" ? paint.opacity : 1;
  return {
    r: typeof color.r === "number" ? color.r : 0,
    g: typeof color.g === "number" ? color.g : 0,
    b: typeof color.b === "number" ? color.b : 0,
    a: (typeof color.a === "number" ? color.a : 1) * paintAlpha
  };
}

function interpolateGradientTransform(startTransform, endTransform, t) {
  if (!isBlendTransform(startTransform) && !isBlendTransform(endTransform)) return [[1, 0, 0], [0, 1, 0]];
  if (!isBlendTransform(startTransform)) return cloneSerializable(endTransform);
  if (!isBlendTransform(endTransform)) return cloneSerializable(startTransform);
  return [
    [
      lerp(startTransform[0][0], endTransform[0][0], t),
      lerp(startTransform[0][1], endTransform[0][1], t),
      lerp(startTransform[0][2], endTransform[0][2], t)
    ],
    [
      lerp(startTransform[1][0], endTransform[1][0], t),
      lerp(startTransform[1][1], endTransform[1][1], t),
      lerp(startTransform[1][2], endTransform[1][2], t)
    ]
  ];
}

function isBlendTransform(transform) {
  return Array.isArray(transform) && transform.length >= 2 && Array.isArray(transform[0]) && Array.isArray(transform[1]);
}

function interpolateStrokeWeight(node, start, end, t) {
  if (!("strokeWeight" in node) || !("strokeWeight" in start) || !("strokeWeight" in end)) return;
  if (typeof start.strokeWeight !== "number" || typeof end.strokeWeight !== "number") return;
  node.strokeWeight = lerp(start.strokeWeight, end.strokeWeight, t);
}

function interpolateStrokeStyle(node, start, end, t) {
  if ("strokeCap" in node && "strokeCap" in start && "strokeCap" in end) node.strokeCap = t < 0.5 ? start.strokeCap : end.strokeCap;
  if ("strokeJoin" in node && "strokeJoin" in start && "strokeJoin" in end) node.strokeJoin = t < 0.5 ? start.strokeJoin : end.strokeJoin;
  if ("strokeAlign" in node && "strokeAlign" in start && "strokeAlign" in end) node.strokeAlign = t < 0.5 ? start.strokeAlign : end.strokeAlign;
  if ("strokeMiterLimit" in node && "strokeMiterLimit" in start && "strokeMiterLimit" in end && typeof start.strokeMiterLimit === "number" && typeof end.strokeMiterLimit === "number") {
    node.strokeMiterLimit = lerp(start.strokeMiterLimit, end.strokeMiterLimit, t);
  }
  if ("dashPattern" in node && "dashPattern" in start && "dashPattern" in end) node.dashPattern = t < 0.5 ? cloneSerializable(start.dashPattern) : cloneSerializable(end.dashPattern);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function centerX(node) {
  return node.x + node.width / 2;
}

function centerY(node) {
  return node.y + node.height / 2;
}

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

async function updateBlendOptions(group, options) {
  const normalized = normalizeBlendOptions(Object.assign({}, readBlendOptions(group), options || {}));
  await renderBlend(group, normalized);
}

async function updateActiveBlend() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const selection = figma.currentPage.selection;
  const selectedEndpoint = selection.length === 1 && selection[0].getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BLEND_BASE ? selection[0] : null;
  await renderBlend(group, readBlendOptions(group));
  if (selectedEndpoint && selectedEndpoint.parent === group) {
    figma.currentPage.selection = [selectedEndpoint];
  } else {
    figma.currentPage.selection = [group];
  }
  figma.notify("Blend updated from endpoints.");
}

async function toggleBlendEndpointEditMode() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.editEndpoints = !options.editEndpoints;
  await renderBlend(group, options);
  figma.currentPage.selection = [group];
  figma.notify(options.editEndpoints ? "Blend endpoints are editable." : "Blend endpoints hidden.");
}

async function selectBlendEndpoint(role) {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.editEndpoints = true;
  await renderBlend(group, options);
  const endpoints = getBlendEndpoints(group);
  const endpoint = role === BLEND_ROLE_END ? endpoints.end : endpoints.start;
  if (!endpoint) return notifySelectBlend();
  endpoint.visible = true;
  endpoint.locked = false;
  figma.currentPage.selection = [endpoint];
  figma.notify(role === BLEND_ROLE_END ? "End endpoint selected." : "Start endpoint selected.");
}

async function releaseBlend() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const endpoints = getBlendEndpoints(group);
  if (!endpoints.start || !endpoints.end || !group.parent) return notifySelectBlend();
  clearBlendRenders(group);
  const parent = group.parent;
  const released = [endpoints.start, endpoints.end];
  for (let index = 0; index < released.length; index++) {
    restoreBlendNode(parent, group, released[index]);
  }
  group.remove();
  figma.currentPage.selection = released;
  figma.notify("Blend released.");
}

async function expandBlend() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  if (!group.parent) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.editEndpoints = false;
  await renderBlend(group, options);
  const parent = group.parent;
  const expanded = [];
  for (const child of group.children.slice()) {
    const kind = child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND);
    if (kind === KIND_BLEND_RENDER) {
      child.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, "");
      restoreBlendNode(parent, group, child);
      expanded.push(child);
    } else if (kind === KIND_BLEND_BASE) {
      child.remove();
    }
  }
  group.remove();
  figma.currentPage.selection = expanded;
  figma.notify("Blend expanded.");
}

function restoreBlendNode(parent, group, node) {
  const x = node.x;
  const y = node.y;
  node.visible = true;
  node.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, "");
  node.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE, "");
  parent.appendChild(node);
  node.x = group.x + x;
  node.y = group.y + y;
}

async function reverseBlendFrontToBack() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.reverseFrontToBack = !options.reverseFrontToBack;
  await renderBlend(group, options);
  figma.notify("Blend front-to-back reversed.");
}
