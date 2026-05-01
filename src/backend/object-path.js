async function simplifySelectedPath(tolerance) {
  const node = selectedVectorNode();
  if (!node) return;
  const amount = clampNumber(tolerance, 0.1, 50, 2);
  const result = transformVectorPathData(node, function (points, closed) {
    return simplifyPathPoints(points, amount, closed);
  });
  if (result) figma.notify("Path simplified.");
}

async function smoothSelectedPath(amount) {
  const node = selectedVectorNode();
  if (!node) return;
  const iterations = Math.round(clampNumber(amount, 1, 8, 2));
  const result = transformVectorPathData(node, function (points, closed) {
    return smoothPathPoints(points, iterations, closed);
  });
  if (result) figma.notify("Path smoothed.");
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
  const nextPaths = [];
  let changed = false;
  for (let pathIndex = 0; pathIndex < node.vectorPaths.length; pathIndex++) {
    const vectorPath = node.vectorPaths[pathIndex];
    const subpaths = vectorPathToPointSubpaths(vectorPath.data);
    if (!subpaths.length) {
      nextPaths.push(vectorPath);
      continue;
    }
    const pathParts = [];
    for (let subIndex = 0; subIndex < subpaths.length; subIndex++) {
      const subpath = subpaths[subIndex];
      const points = transformPoints(subpath.points, subpath.closed);
      if (points.length >= 2) {
        pathParts.push(pathPointsToSvgData(points, subpath.closed));
        changed = true;
      }
    }
    nextPaths.push({
      windingRule: vectorPath.windingRule || "NONZERO",
      data: pathParts.join(" ")
    });
  }
  if (!changed) return false;
  try {
    node.vectorPaths = nextPaths;
    return true;
  } catch (_error) {
    figma.notify("Could not update this path.");
    return false;
  }
}

function vectorPathToPointSubpaths(data) {
  const sampled = sampleSvgPath(data, 10);
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
  return subpaths;
}

function simplifyPathPoints(points, tolerance, closed) {
  if (points.length <= 2) return points.slice();
  const work = removeDuplicatePathPoints(points);
  if (work.length <= 2) return work;
  if (!closed) return rdpSimplify(work, tolerance);
  const opened = work.slice();
  opened.push(work[0]);
  const simplified = rdpSimplify(opened, tolerance);
  if (simplified.length > 1 && samePathPoint(simplified[0], simplified[simplified.length - 1])) simplified.pop();
  return simplified.length >= 3 ? simplified : work;
}

function smoothPathPoints(points, iterations, closed) {
  let result = removeDuplicatePathPoints(points);
  for (let index = 0; index < iterations; index++) {
    result = chaikinSmooth(result, closed);
  }
  return result;
}

function chaikinSmooth(points, closed) {
  if (points.length < 3) return points.slice();
  const result = [];
  if (!closed) result.push(points[0]);
  const max = closed ? points.length : points.length - 1;
  for (let index = 0; index < max; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    result.push({
      x: a.x * 0.75 + b.x * 0.25,
      y: a.y * 0.75 + b.y * 0.25
    });
    result.push({
      x: a.x * 0.25 + b.x * 0.75,
      y: a.y * 0.25 + b.y * 0.75
    });
  }
  if (!closed) result.push(points[points.length - 1]);
  return result;
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
