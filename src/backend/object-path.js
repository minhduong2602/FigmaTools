const OBJECT_PATH_SAMPLE_STEPS = 8;
const OBJECT_PATH_MAX_INPUT_POINTS = 1200;
const OBJECT_PATH_MAX_OUTPUT_POINTS = 1800;
const OBJECT_PATH_MAX_SMOOTH_ITERATIONS = 4;
let objectPathPreviewSession = null;
let lastObjectPathDebug = null;

async function simplifySelectedPath(tolerance) {
  const node = selectedVectorNode();
  if (!node) return;
  const amount = clampNumber(tolerance, 0, 100, 50);
  const result = transformVectorPathData(node, function (points, closed) {
    return simplifyPathPoints(points, amount, closed);
  });
  if (result) figma.notify("Path simplified.");
}

async function smoothSelectedPath(amount) {
  const node = selectedVectorNode();
  if (!node) return;
  const strength = clampNumber(amount, 0, 100, 50);
  const result = transformVectorPathData(node, function (points, closed) {
    return smoothPathPoints(points, strength, closed);
  });
  if (result) figma.notify("Path smoothed.");
}

async function startObjectPathPreview(tool, value) {
  const node = selectedVectorNode();
  if (!node) return false;
  lastObjectPathDebug = null;
  objectPathPreviewSession = {
    nodeId: node.id,
    tool: tool,
    originalVectorPaths: cloneVectorPaths(node.vectorPaths || [])
  };
  return await updateObjectPathPreview(value);
}

async function updateObjectPathPreview(value) {
  if (!objectPathPreviewSession) return false;
  const node = await figma.getNodeByIdAsync(objectPathPreviewSession.nodeId);
  if (!node || !("vectorPaths" in node)) {
    objectPathPreviewSession = null;
    lastObjectPathDebug = {
      tool: "",
      message: "Preview node was not found."
    };
    return false;
  }
  const transformed = transformVectorPaths(
    objectPathPreviewSession.originalVectorPaths,
    createObjectPathTransformer(objectPathPreviewSession.tool, value)
  );
  lastObjectPathDebug = buildObjectPathDebug(
    objectPathPreviewSession.tool,
    value,
    transformed ? transformed.debugEntries : [],
    transformed ? transformed.changed : false
  );
  if (!transformed || !transformed.changed) return false;
  try {
    node.vectorPaths = transformed.vectorPaths;
    return true;
  } catch (_error) {
    lastObjectPathDebug.message = "Figma rejected the transformed vectorPaths.";
    return false;
  }
}

function commitObjectPathPreview() {
  objectPathPreviewSession = null;
  if (lastObjectPathDebug) lastObjectPathDebug.message = "Applied current preview.";
}

async function cancelObjectPathPreview() {
  if (!objectPathPreviewSession) return false;
  const node = await figma.getNodeByIdAsync(objectPathPreviewSession.nodeId);
  if (!node || !("vectorPaths" in node)) {
    objectPathPreviewSession = null;
    return false;
  }
  try {
    node.vectorPaths = cloneVectorPaths(objectPathPreviewSession.originalVectorPaths);
    objectPathPreviewSession = null;
    if (lastObjectPathDebug) lastObjectPathDebug.message = "Preview cancelled and original path restored.";
    return true;
  } catch (_error) {
    objectPathPreviewSession = null;
    lastObjectPathDebug = {
      tool: "",
      message: "Could not restore original path."
    };
    return false;
  }
}

function readObjectPathDebug() {
  return lastObjectPathDebug;
}

function selectedVectorNode() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    figma.notify("Select one vector path.");
    return null;
  }
  const node = selection[0];
  if (!("vectorPaths" in node) || !Array.isArray(node.vectorPaths) || !node.vectorPaths.length) {
    figma.notify("Select a vector path first.");
    return null;
  }
  return node;
}

function transformVectorPathData(node, transformPoints) {
  const transformed = transformVectorPaths(node.vectorPaths, transformPoints);
  if (!transformed || !transformed.changed) return false;
  try {
    node.vectorPaths = transformed.vectorPaths;
    return true;
  } catch (_error) {
    figma.notify("Could not update this path.");
    return false;
  }
}

function transformVectorPaths(vectorPaths, transformPoints) {
  const nextPaths = [];
  let changed = false;
  const debugEntries = [];
  for (let pathIndex = 0; pathIndex < vectorPaths.length; pathIndex++) {
    const vectorPath = vectorPaths[pathIndex];
    const subpaths = vectorPathToPointSubpaths(vectorPath.data);
    if (!subpaths.length) {
      nextPaths.push(cloneVectorPath(vectorPath));
      continue;
    }
    const pathParts = [];
    for (let subIndex = 0; subIndex < subpaths.length; subIndex++) {
      const subpath = subpaths[subIndex];
      const transformed = normalizeTransformedSubpath(transformPoints(subpath.points, subpath.closed), subpath.closed);
      debugEntries.push(describeSubpathTransform(subpath, transformed, pathIndex, subIndex));
      if (transformed.points.length >= 2) {
        pathParts.push(pathDataFromTransformedSubpath(transformed));
        changed = true;
      }
    }
    nextPaths.push({
      windingRule: vectorPath.windingRule || "NONZERO",
      data: pathParts.join(" ")
    });
  }
  return {
    changed: changed,
    vectorPaths: nextPaths,
    debugEntries: debugEntries
  };
}

function normalizeTransformedSubpath(value, closed) {
  if (Array.isArray(value)) {
    return {
      points: value,
      closed: closed,
      output: "lines",
      handleScale: 1 / 6,
      cornerDamping: 0.72,
      cornerCutoff: 0.92
    };
  }
  return {
    points: Array.isArray(value.points) ? value.points : [],
    curves: Array.isArray(value.curves) ? value.curves : [],
    closed: value.closed === undefined ? closed : value.closed,
    output: value.output || "lines",
    handleScale: value.handleScale === undefined ? 1 / 6 : value.handleScale,
    cornerDamping: value.cornerDamping === undefined ? 0.72 : value.cornerDamping,
    cornerCutoff: value.cornerCutoff === undefined ? 0.92 : value.cornerCutoff
  };
}

function pathDataFromTransformedSubpath(subpath) {
  if (subpath.output === "fit-curves") {
    return fitCurvesToSvgPath(subpath.curves, subpath.closed);
  }
  if (subpath.output === "cubic") {
    return cubicPathDataFromPoints(subpath.points, subpath.closed, subpath);
  }
  return pathPointsToSvgData(subpath.points, subpath.closed);
}

function createObjectPathTransformer(tool, value) {
  if (tool === "simplify") {
    const amount = clampNumber(value, 0, 100, 50);
    return function (points, closed) {
      return simplifyPathPoints(points, amount, closed);
    };
  }
  const strength = clampNumber(value, 0, 100, 50);
  return function (points, closed) {
    return smoothPathPoints(points, strength, closed);
  };
}

function vectorPathToPointSubpaths(data) {
  const sampled = sampleSvgPath(data, OBJECT_PATH_SAMPLE_STEPS);
  const subpaths = [];
  let current = null;
  for (let index = 0; index < sampled.length; index++) {
    const item = sampled[index];
    if (item.type === "M") {
      if (current && current.points.length) subpaths.push(current);
      current = { points: [{ x: item.x, y: item.y }], closed: false };
    } else if (item.type === "L") {
      if (!current) current = { points: [], closed: false };
      current.points.push({ x: item.x, y: item.y });
    } else if (item.type === "Z") {
      if (current) current.closed = true;
    }
  }
  if (current && current.points.length) subpaths.push(current);
  for (let subIndex = 0; subIndex < subpaths.length; subIndex++) {
    subpaths[subIndex].points = limitPathPointCount(subpaths[subIndex].points, OBJECT_PATH_MAX_INPUT_POINTS, subpaths[subIndex].closed);
  }
  return subpaths;
}

function simplifyPathPoints(points, tolerance, closed) {
  if (points.length <= 2) return points.slice();
  const work = limitPathPointCount(removeDuplicatePathPoints(points), OBJECT_PATH_MAX_INPUT_POINTS, closed);
  if (work.length <= 2) return work;
  const pathTolerance = simplifyToleranceForPoints(work, tolerance);
  if (pathTolerance <= 0.001) {
    return fitCurveSubpathFromPoints(work, closed, 1.5);
  }
  const simplified = simplifyPolylinePoints(work, pathTolerance, closed);
  return fitCurveSubpathFromPoints(simplified, closed, Math.max(1.5, pathTolerance * 0.9));
}

function smoothPathPoints(points, amount, closed) {
  const original = limitPathPointCount(removeDuplicatePathPoints(points), OBJECT_PATH_MAX_INPUT_POINTS, closed);
  if (original.length <= 2) return original;
  const strength = clampNumber(amount, 0, 100, 50);
  if (strength <= 0) return original.slice();
  const normalized = strength / 100;
  const iterations = Math.min(OBJECT_PATH_MAX_SMOOTH_ITERATIONS + 6, Math.max(1, Math.round(2 + normalized * 6)));
  const alpha = 0.24 + 0.52 * normalized;
  let result = original.slice();
  for (let index = 0; index < iterations; index++) {
    result = smoothPointSetOnce(result, closed, alpha);
    if (normalized >= 0.08) {
      result = straightenPointSetOnce(result, closed, 0.1 + normalized * 0.42);
    }
    if (result.length <= 2) break;
  }
  const simplifyTolerance = smoothToleranceForPoints(original, normalized);
  const simplified = simplifyTolerance > 0.001 ? simplifyPolylinePoints(result, simplifyTolerance, closed) : result;
  const fitError = Math.max(1.2, simplifyTolerance * 0.65);
  return fitCurveSubpathFromPoints(simplified, closed, fitError);
}

function rdpSimplify(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maxDistance = 0;
  let splitIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index++) {
    const distance = perpendicularDistance(points[index], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance > tolerance) {
    const left = rdpSimplify(points.slice(0, splitIndex + 1), tolerance);
    const right = rdpSimplify(points.slice(splitIndex), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [first, last];
}

function perpendicularDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return pathPointDistance(point, a);
  const numerator = Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x);
  return numerator / Math.sqrt(dx * dx + dy * dy);
}

function removeDuplicatePathPoints(points) {
  const result = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!result.length || !samePathPoint(point, result[result.length - 1])) {
      result.push(point);
    }
  }
  return result;
}

function samePathPoint(a, b) {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function pathPointDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function simplifyToleranceForPoints(points, amount) {
  const bounds = pointBounds(points);
  const diagonal = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
  const precision = Math.max(0, Math.min(1, amount / 100));
  const reduction = 1 - precision;
  if (reduction <= 0.001) return 0;
  return diagonal * reduction * reduction * 0.12;
}

function pointBounds(points) {
  if (!points.length) {
    return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return {
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function limitPathPointCount(points, maxPoints, closed) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points.slice();
  const safeMax = Math.max(closed ? 3 : 2, maxPoints);
  if (points.length <= safeMax) return points.slice();
  const limited = [];
  const lastIndex = points.length - 1;
  const step = lastIndex / (safeMax - 1);
  for (let index = 0; index < safeMax; index++) {
    let sourceIndex = Math.round(index * step);
    if (sourceIndex > lastIndex) sourceIndex = lastIndex;
    if (!limited.length || !samePathPoint(points[sourceIndex], limited[limited.length - 1])) {
      limited.push(points[sourceIndex]);
    }
  }
  if (closed && limited.length >= 2 && samePathPoint(limited[0], limited[limited.length - 1])) limited.pop();
  return limited;
}

function ensureMinimumPathPoints(points, fallback, closed) {
  const minimum = closed ? 3 : 2;
  if (points.length >= minimum) return points;
  return fallback.slice();
}

function resamplePathPoints(points, targetCount, closed) {
  if (targetCount <= 0 || points.length <= 1) return points.slice();
  if (points.length === targetCount) return points.slice();
  const source = closed ? points.concat([points[0]]) : points.slice();
  const lengths = [0];
  for (let index = 1; index < source.length; index++) {
    lengths[index] = lengths[index - 1] + pathPointDistance(source[index - 1], source[index]);
  }
  const total = lengths[lengths.length - 1];
  if (total <= 0.001) return limitPathPointCount(points, targetCount, closed);
  const result = [];
  const steps = closed ? targetCount : Math.max(1, targetCount - 1);
  for (let index = 0; index < targetCount; index++) {
    const distance = closed ? total * index / targetCount : total * index / steps;
    result.push(pointAtPathDistance(source, lengths, distance));
  }
  return result;
}

function pointAtPathDistance(points, lengths, distance) {
  if (distance <= 0) return clonePathPoint(points[0]);
  const lastIndex = lengths.length - 1;
  if (distance >= lengths[lastIndex]) return clonePathPoint(points[lastIndex]);
  for (let index = 1; index < lengths.length; index++) {
    if (distance > lengths[index]) continue;
    const span = lengths[index] - lengths[index - 1];
    const t = span <= 0 ? 0 : (distance - lengths[index - 1]) / span;
    return {
      x: points[index - 1].x + (points[index].x - points[index - 1].x) * t,
      y: points[index - 1].y + (points[index].y - points[index - 1].y) * t
    };
  }
  return clonePathPoint(points[lastIndex]);
}

function smoothPointSetOnce(points, closed, alpha) {
  if (points.length < 3) return points.slice();
  const result = points.map(function (point) {
    return clonePathPoint(point);
  });
  const startIndex = closed ? 0 : 1;
  const endIndex = closed ? points.length : points.length - 1;
  for (let index = startIndex; index < endIndex; index++) {
    const prev = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cornerFactor = pathCornerFactor(prev, current, next);
    const averaged = {
      x: prev.x * 0.25 + current.x * 0.5 + next.x * 0.25,
      y: prev.y * 0.25 + current.y * 0.5 + next.y * 0.25
    };
    const tangent = normalizePathVector({
      x: next.x - prev.x,
      y: next.y - prev.y
    });
    const normal = {
      x: -tangent.y,
      y: tangent.x
    };
    const delta = {
      x: averaged.x - current.x,
      y: averaged.y - current.y
    };
    const normalOffset = dotPathVector(delta, normal);
    const tangentOffset = dotPathVector(delta, tangent);
    const localAlpha = alpha * (0.35 + cornerFactor * 0.65);
    result[index] = {
      x: current.x + delta.x * localAlpha * 0.88 + normal.x * normalOffset * localAlpha * 0.35 + tangent.x * tangentOffset * localAlpha * 0.1,
      y: current.y + delta.y * localAlpha * 0.88 + normal.y * normalOffset * localAlpha * 0.35 + tangent.y * tangentOffset * localAlpha * 0.1
    };
  }
  return result;
}

function straightenPointSetOnce(points, closed, amount) {
  if (points.length < 3) return points.slice();
  const result = points.map(function (point) {
    return clonePathPoint(point);
  });
  const startIndex = closed ? 0 : 1;
  const endIndex = closed ? points.length : points.length - 1;
  for (let index = startIndex; index < endIndex; index++) {
    const prev = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const projected = projectPointToLine(current, prev, next);
    const midpoint = {
      x: (prev.x + next.x) * 0.5,
      y: (prev.y + next.y) * 0.5
    };
    const target = {
      x: projected.x * 0.72 + midpoint.x * 0.28,
      y: projected.y * 0.72 + midpoint.y * 0.28
    };
    const cornerWeight = 0.28 + pathCornerFactor(prev, current, next) * 0.72;
    result[index] = {
      x: current.x + (target.x - current.x) * amount * cornerWeight,
      y: current.y + (target.y - current.y) * amount * cornerWeight
    };
  }
  return result;
}

function pathCornerFactor(prev, current, next) {
  const ax = current.x - prev.x;
  const ay = current.y - prev.y;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  const aLen = Math.sqrt(ax * ax + ay * ay);
  const bLen = Math.sqrt(bx * bx + by * by);
  if (aLen <= 0.001 || bLen <= 0.001) return 0;
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLen * bLen)));
  return Math.max(0, Math.min(1, (1 - cos) / 2));
}

function smoothToleranceForPoints(points, normalized) {
  const bounds = pointBounds(points);
  const diagonal = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
  return diagonal * normalized * normalized * 0.06;
}

function simplifyPolylinePoints(points, tolerance, closed) {
  let work = points.slice();
  if (closed) {
    work = ensureClosedPolyline(points);
  }
  const simplified = simplifyPathLib(work, tolerance, true);
  if (closed) {
    const opened = simplified.slice();
    if (opened.length > 1 && samePathPoint(opened[0], opened[opened.length - 1])) opened.pop();
    return ensureMinimumPathPoints(opened, points, true);
  }
  return ensureMinimumPathPoints(simplified, points, false);
}

function fitCurveSubpathFromPoints(points, closed, error) {
  const safePoints = limitPathPointCount(removeDuplicatePathPoints(points), OBJECT_PATH_MAX_OUTPUT_POINTS, closed);
  const minimum = closed ? 3 : 2;
  if (safePoints.length < minimum) {
    return {
      points: points.slice(),
      curves: [],
      closed: closed,
      output: "lines"
    };
  }
  let fitPoints = safePoints.slice();
  if (closed) fitPoints = ensureClosedPolyline(safePoints);
  const fitInput = fitPoints.map(function (point) {
    return [point.x, point.y];
  });
  try {
    const curves = fitCurve(fitInput, error);
    if (!curves || !curves.length) {
      return {
        points: safePoints,
        curves: [],
        closed: closed,
        output: "lines"
      };
    }
    return {
      points: closed && fitPoints.length > 1 ? fitPoints.slice(0, fitPoints.length - 1) : fitPoints,
      curves: curves,
      closed: closed,
      output: "fit-curves"
    };
  } catch (_error) {
    return {
      points: safePoints,
      curves: [],
      closed: closed,
      output: "lines"
    };
  }
}

function ensureClosedPolyline(points) {
  const result = points.slice();
  if (!result.length) return result;
  if (!samePathPoint(result[0], result[result.length - 1])) {
    result.push(clonePathPoint(result[0]));
  }
  return result;
}

function projectPointToLine(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 0.00001) return clonePathPoint(point);
  const t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq;
  return {
    x: a.x + abx * t,
    y: a.y + aby * t
  };
}

function fitCurvesToSvgPath(curves, closed) {
  if (!curves || !curves.length) return "";
  const first = curves[0][0];
  const parts = ["M " + objectPathRound(first[0]) + " " + objectPathRound(first[1])];
  for (let index = 0; index < curves.length; index++) {
    const curve = curves[index];
    parts.push(
      "C " +
      objectPathRound(curve[1][0]) + " " + objectPathRound(curve[1][1]) + " " +
      objectPathRound(curve[2][0]) + " " + objectPathRound(curve[2][1]) + " " +
      objectPathRound(curve[3][0]) + " " + objectPathRound(curve[3][1])
    );
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function cubicPathDataFromPoints(points, closed, options) {
  if (!points.length) return "";
  if (points.length < 3) return pathPointsToSvgData(points, closed);
  const handleScaleBase = options && options.handleScale !== undefined ? options.handleScale : 1 / 6;
  const cornerDamping = options && options.cornerDamping !== undefined ? options.cornerDamping : 0.72;
  const cornerCutoff = options && options.cornerCutoff !== undefined ? options.cornerCutoff : 0.92;
  const parts = ["M " + objectPathRound(points[0].x) + " " + objectPathRound(points[0].y)];
  if (closed) {
    for (let index = 0; index < points.length; index++) {
      const prev = points[(index - 1 + points.length) % points.length];
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const after = points[(index + 2) % points.length];
      const currentCorner = pathCornerFactor(prev, current, next);
      const nextCorner = pathCornerFactor(current, next, after);
      const currentScale = handleScaleBase * (1 - currentCorner * cornerDamping);
      const nextScale = handleScaleBase * (1 - nextCorner * cornerDamping);
      const cp1 = {
        x: current.x + (next.x - prev.x) * currentScale,
        y: current.y + (next.y - prev.y) * currentScale
      };
      const cp2 = {
        x: next.x - (after.x - current.x) * nextScale,
        y: next.y - (after.y - current.y) * nextScale
      };
      if (pathCornerFactor(prev, current, next) > cornerCutoff) {
        parts.push("L " + objectPathRound(next.x) + " " + objectPathRound(next.y));
        continue;
      }
      parts.push(
        "C " +
        objectPathRound(cp1.x) + " " + objectPathRound(cp1.y) + " " +
        objectPathRound(cp2.x) + " " + objectPathRound(cp2.y) + " " +
        objectPathRound(next.x) + " " + objectPathRound(next.y)
      );
    }
    parts.push("Z");
    return parts.join(" ");
  }
  for (let index = 0; index < points.length - 1; index++) {
    const prev = index === 0 ? points[index] : points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const after = index + 2 >= points.length ? points[index + 1] : points[index + 2];
    const currentCorner = index === 0 ? 0 : pathCornerFactor(prev, current, next);
    const nextCorner = index + 1 >= points.length - 1 ? 0 : pathCornerFactor(current, next, after);
    const currentScale = handleScaleBase * (1 - currentCorner * cornerDamping);
    const nextScale = handleScaleBase * (1 - nextCorner * cornerDamping);
    const cp1 = {
      x: current.x + (next.x - prev.x) * currentScale,
      y: current.y + (next.y - prev.y) * currentScale
    };
    const cp2 = {
      x: next.x - (after.x - current.x) * nextScale,
      y: next.y - (after.y - current.y) * nextScale
    };
    if (Math.max(currentCorner, nextCorner) > cornerCutoff) {
      parts.push("L " + objectPathRound(next.x) + " " + objectPathRound(next.y));
      continue;
    }
    parts.push(
      "C " +
      objectPathRound(cp1.x) + " " + objectPathRound(cp1.y) + " " +
      objectPathRound(cp2.x) + " " + objectPathRound(cp2.y) + " " +
      objectPathRound(next.x) + " " + objectPathRound(next.y)
    );
  }
  return parts.join(" ");
}

function cloneVectorPaths(vectorPaths) {
  return (vectorPaths || []).map(function (vectorPath) {
    return cloneVectorPath(vectorPath);
  });
}

function cloneVectorPath(vectorPath) {
  return {
    windingRule: vectorPath.windingRule || "NONZERO",
    data: vectorPath.data || ""
  };
}

function clonePathPoint(point) {
  return { x: point.x, y: point.y };
}

function normalizePathVector(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length <= 0.00001) {
    return { x: 1, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dotPathVector(a, b) {
  return a.x * b.x + a.y * b.y;
}

function describeSubpathTransform(original, transformed, pathIndex, subIndex) {
  const before = original.points || [];
  const after = transformed.points || [];
  const count = Math.min(before.length, after.length);
  let maxDelta = 0;
  let totalDelta = 0;
  for (let index = 0; index < count; index++) {
    const delta = pathPointDistance(before[index], after[index]);
    totalDelta += delta;
    if (delta > maxDelta) maxDelta = delta;
  }
  const beforeBounds = pointBounds(before);
  const afterBounds = pointBounds(after);
  return {
    pathIndex: pathIndex,
    subIndex: subIndex,
    beforeCount: before.length,
    afterCount: after.length,
    maxDelta: maxDelta,
    avgDelta: count ? totalDelta / count : 0,
    beforeBounds: beforeBounds,
    afterBounds: afterBounds,
    output: transformed.output || "lines"
  };
}

function buildObjectPathDebug(tool, value, entries, changed) {
  const summary = {
    tool: tool,
    value: value,
    changed: changed,
    pathCount: entries.length,
    beforeCount: 0,
    afterCount: 0,
    maxDelta: 0,
    avgDelta: 0,
    output: "",
    beforeBounds: null,
    afterBounds: null,
    message: changed ? "Geometry changed." : "No geometry change detected."
  };
  if (!entries.length) {
    summary.message = "No subpaths were sampled from the current vector path.";
    return summary;
  }
  let deltaSum = 0;
  let deltaSamples = 0;
  const beforePoints = [];
  const afterPoints = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    summary.beforeCount += entry.beforeCount;
    summary.afterCount += entry.afterCount;
    if (entry.maxDelta > summary.maxDelta) summary.maxDelta = entry.maxDelta;
    deltaSum += entry.avgDelta * Math.max(1, Math.min(entry.beforeCount, entry.afterCount));
    deltaSamples += Math.max(1, Math.min(entry.beforeCount, entry.afterCount));
    if (!summary.output) summary.output = entry.output;
    beforePoints.push({ x: entry.beforeBounds.minX, y: entry.beforeBounds.minY });
    beforePoints.push({ x: entry.beforeBounds.maxX, y: entry.beforeBounds.maxY });
    afterPoints.push({ x: entry.afterBounds.minX, y: entry.afterBounds.minY });
    afterPoints.push({ x: entry.afterBounds.maxX, y: entry.afterBounds.maxY });
  }
  summary.avgDelta = deltaSamples ? deltaSum / deltaSamples : 0;
  summary.beforeBounds = pointBounds(beforePoints);
  summary.afterBounds = pointBounds(afterPoints);
  if (summary.maxDelta < 0.01 && summary.beforeCount === summary.afterCount) {
    summary.message = "Path is effectively unchanged. Smooth is not moving sampled points enough.";
  } else if (summary.maxDelta < 0.01) {
    summary.message = "Point count changed, but coordinates barely moved.";
  } else if (summary.beforeCount !== summary.afterCount) {
    summary.message = "Point count changed and geometry moved.";
  }
  return summary;
}

function pathPointsToSvgData(points, closed) {
  if (!points.length) return "";
  const parts = ["M " + objectPathRound(points[0].x) + " " + objectPathRound(points[0].y)];
  for (let index = 1; index < points.length; index++) {
    parts.push("L " + objectPathRound(points[index].x) + " " + objectPathRound(points[index].y));
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function objectPathRound(value) {
  return Math.round(value * 100) / 100;
}
