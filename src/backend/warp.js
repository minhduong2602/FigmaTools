// Warp effect: Arc, Arc Lower, Arc Upper, Flag, Rise
// Supports HORIZONTAL and VERTICAL axis like Illustrator

function applyWarpEffect(node, layer, effect) {
  const bend = Number(effect.bend) || 0;
  const hDistort = Number(effect.hDistort) || 0;
  const vDistort = Number(effect.vDistort) || 0;

  // Skip if no warp is applied
  if (bend === 0 && hDistort === 0 && vDistort === 0) return node;

  if (!("width" in node) || !("height" in node)) return node;
  const width = node.width;
  const height = node.height;
  if (width < 0.1 || height < 0.1) return node;

  // Sample the outline as a dense polygon
  const points = sampleNodeOutline(node, width, height);

  // Warp each point
  const warped = points.map(function (pt) {
    if (pt.type === "M" || pt.type === "L") {
      var wp = warpPoint(pt.x, pt.y, effect, width, height);
      return { type: pt.type, x: wp.x, y: wp.y };
    }
    return pt; // Z
  });

  // Build SVG path string
  var pathData = warpedPointsToPath(warped);

  // Create vector node
  var vector = figma.createVector();
  vector.name = node.name;
  if ("x" in node) vector.x = node.x;
  if ("y" in node) vector.y = node.y;

  try {
    vector.vectorPaths = [{ windingRule: "NONZERO", data: pathData }];
  } catch (_e) {
    vector.remove();
    return node;
  }

  // Copy visual properties from the render node
  try { if ("fills" in node && "fills" in vector) vector.fills = node.fills; } catch (_e) {}
  try { if ("strokes" in node && "strokes" in vector) vector.strokes = node.strokes; } catch (_e) {}
  try { if ("strokeWeight" in node && "strokeWeight" in vector) vector.strokeWeight = node.strokeWeight; } catch (_e) {}
  try { if ("strokeAlign" in node && "strokeAlign" in vector) vector.strokeAlign = node.strokeAlign; } catch (_e) {}
  try { if ("effects" in node && "effects" in vector) vector.effects = node.effects; } catch (_e) {}
  try { if ("opacity" in node) vector.opacity = node.opacity; } catch (_e) {}
  try { if ("blendMode" in node) vector.blendMode = node.blendMode; } catch (_e) {}

  // Mark as render node
  vector.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_RENDER);

  // Remove the original clone (it was created inside the group by createLayerRenderNode)
  node.remove();

  return vector;
}

// ─── Outline Sampling ──────────────────────────────────────────────────────

function sampleNodeOutline(node, width, height) {
  // Try fillGeometry first (works for vectors, boolean ops, etc.)
  try {
    var geo = node.fillGeometry;
    if (geo && geo.length > 0 && geo[0].data) {
      return sampleSvgPath(geo[0].data, 24);
    }
  } catch (_e) {}

  // Fall back to generating a rectangle outline (possibly with corner radius)
  var cr = 0;
  if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
    cr = Math.min(node.cornerRadius, width / 2, height / 2);
  }
  return sampleRectOutline(width, height, cr, 32);
}

function sampleRectOutline(w, h, cr, stepsPerEdge) {
  var points = [];
  if (cr <= 0) {
    // Simple rectangle: distribute points along each edge
    points.push({ type: "M", x: 0, y: 0 });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w * i / stepsPerEdge, y: 0 });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w, y: h * i / stepsPerEdge });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w - w * i / stepsPerEdge, y: h });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: 0, y: h - h * i / stepsPerEdge });
    points.push({ type: "Z" });
    return points;
  }

  // Rounded rectangle
  var r = cr;
  var cornerSteps = 8;
  points.push({ type: "M", x: r, y: 0 });

  // Top edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: r + (w - 2 * r) * i / stepsPerEdge, y: 0 });
  // Top-right corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = -Math.PI / 2 + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: w - r + r * Math.cos(angle), y: r + r * Math.sin(angle) });
  }
  // Right edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w, y: r + (h - 2 * r) * i / stepsPerEdge });
  // Bottom-right corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = 0 + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: w - r + r * Math.cos(angle), y: h - r + r * Math.sin(angle) });
  }
  // Bottom edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w - r - (w - 2 * r) * i / stepsPerEdge, y: h });
  // Bottom-left corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = Math.PI / 2 + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: r + r * Math.cos(angle), y: h - r + r * Math.sin(angle) });
  }
  // Left edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: 0, y: h - r - (h - 2 * r) * i / stepsPerEdge });
  // Top-left corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = Math.PI + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: r + r * Math.cos(angle), y: r + r * Math.sin(angle) });
  }
  points.push({ type: "Z" });
  return points;
}

// ─── SVG Path Sampling ─────────────────────────────────────────────────────

function sampleSvgPath(data, stepsPerSegment) {
  var segments = parseSvgPathData(data);
  var abs = toAbsoluteSegments(segments);
  return subdivideSegments(abs, stepsPerSegment);
}

function parseSvgPathData(d) {
  var re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  var result = [];
  var m;
  while ((m = re.exec(d)) !== null) {
    var cmd = m[1];
    var nums = (m[2].match(/-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?/gi) || []).map(Number);
    result.push({ cmd: cmd, args: nums });
  }
  return result;
}

function toAbsoluteSegments(segments) {
  var out = [];
  var cx = 0, cy = 0, startX = 0, startY = 0;
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var cmd = seg.cmd;
    var a = seg.args;
    if (cmd === "M") { cx = a[0]; cy = a[1]; startX = cx; startY = cy; out.push({ cmd: "M", args: [cx, cy] }); }
    else if (cmd === "m") { cx += a[0]; cy += a[1]; startX = cx; startY = cy; out.push({ cmd: "M", args: [cx, cy] }); }
    else if (cmd === "L") { cx = a[0]; cy = a[1]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "l") { cx += a[0]; cy += a[1]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "H") { cx = a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "h") { cx += a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "V") { cy = a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "v") { cy += a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "C") { out.push({ cmd: "C", args: a.slice(0, 6) }); cx = a[4]; cy = a[5]; }
    else if (cmd === "c") { out.push({ cmd: "C", args: [cx+a[0], cy+a[1], cx+a[2], cy+a[3], cx+a[4], cy+a[5]] }); cx += a[4]; cy += a[5]; }
    else if (cmd === "Q") {
      var qx = a[0], qy = a[1], ex = a[2], ey = a[3];
      out.push({ cmd: "C", args: [cx+2/3*(qx-cx), cy+2/3*(qy-cy), ex+2/3*(qx-ex), ey+2/3*(qy-ey), ex, ey] });
      cx = ex; cy = ey;
    }
    else if (cmd === "q") {
      var qx = cx+a[0], qy = cy+a[1], ex = cx+a[2], ey = cy+a[3];
      out.push({ cmd: "C", args: [cx+2/3*(qx-cx), cy+2/3*(qy-cy), ex+2/3*(qx-ex), ey+2/3*(qy-ey), ex, ey] });
      cx = ex; cy = ey;
    }
    else if (cmd === "Z" || cmd === "z") { out.push({ cmd: "Z", args: [] }); cx = startX; cy = startY; }
  }
  return out;
}

function subdivideSegments(segments, steps) {
  var out = [];
  var cx = 0, cy = 0;
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (seg.cmd === "M") { cx = seg.args[0]; cy = seg.args[1]; out.push({ type: "M", x: cx, y: cy }); continue; }
    if (seg.cmd === "Z") { out.push({ type: "Z" }); continue; }
    if (seg.cmd === "L") {
      var x2 = seg.args[0], y2 = seg.args[1];
      for (var j = 1; j <= steps; j++) {
        var t = j / steps;
        out.push({ type: "L", x: cx + t * (x2 - cx), y: cy + t * (y2 - cy) });
      }
      cx = x2; cy = y2; continue;
    }
    if (seg.cmd === "C") {
      var x1 = seg.args[0], y1 = seg.args[1], x2 = seg.args[2], y2 = seg.args[3], x3 = seg.args[4], y3 = seg.args[5];
      for (var j = 1; j <= steps; j++) {
        var t = j / steps;
        var mt = 1 - t;
        out.push({ type: "L",
          x: mt*mt*mt*cx + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3,
          y: mt*mt*mt*cy + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3
        });
      }
      cx = x3; cy = y3; continue;
    }
    out.push({ type: "L", x: cx, y: cy });
  }
  return out;
}

// ─── Warp Point Transform ──────────────────────────────────────────────────

function warpPoint(x, y, effect, width, height) {
  var bend = effect.bend / 100;
  var hd = effect.hDistort / 100;
  var vd = effect.vDistort / 100;
  var isH = effect.warpAxis === "HORIZONTAL";

  // Normalize to [0,1]
  var u0 = width > 0 ? x / width : 0;
  var v0 = height > 0 ? y / height : 0;

  // Primary axis (u) and secondary axis (v) depend on orientation
  var u = isH ? u0 : v0;
  var v = isH ? v0 : u0;

  var disp = warpDisplace(effect.warpStyle, u, v, bend);

  // Apply perspective distortion (trapezoid, not shear)
  // V Distort: scales width by vertical position — bottom wider, top narrower (positive)
  var du = disp.du + vd * (u - 0.5) * (2 * v - 1);
  // H Distort: scales height by horizontal position — right taller, left shorter (positive)
  var dv = disp.dv + hd * (v - 0.5) * (2 * u - 1);

  var newX, newY;
  if (isH) {
    newX = (u0 + du) * width;
    newY = (v0 + dv) * height;
  } else {
    newX = (u0 + dv) * width;
    newY = (v0 + du) * height;
  }

  return { x: newX, y: newY };
}

function warpDisplace(style, u, v, bend) {
  var arc = -bend * Math.sin(Math.PI * u) / 2;

  switch (style) {
    case "ARC":
      return { du: 0, dv: arc };
    case "ARC_LOWER":
      return { du: 0, dv: arc * v };
    case "ARC_UPPER":
      return { du: 0, dv: arc * (1 - v) };
    case "FLAG":
      return { du: 0, dv: -bend * Math.sin(2 * Math.PI * u) / 2 };
    case "RISE":
      return { du: 0, dv: -bend * u / 2 };
    default:
      return { du: 0, dv: 0 };
  }
}

// ─── Path Output ───────────────────────────────────────────────────────────

function warpedPointsToPath(points) {
  var parts = [];
  for (var i = 0; i < points.length; i++) {
    var pt = points[i];
    if (pt.type === "Z") { parts.push("Z"); continue; }
    parts.push(pt.type + " " + warpRound(pt.x) + " " + warpRound(pt.y));
  }
  return parts.join(" ");
}

function warpRound(n) {
  return Math.round(n * 100) / 100;
}
