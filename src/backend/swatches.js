let savedSwatches = [];

async function loadSavedSwatches() {
  try {
    const stored = await figma.clientStorage.getAsync(SWATCH_STORAGE_KEY);
    savedSwatches = normalizeSwatches(stored);
  } catch (_error) {
    savedSwatches = [];
  }
  sendSelectionState();
}

async function writeSavedSwatches() {
  await figma.clientStorage.setAsync(SWATCH_STORAGE_KEY, savedSwatches);
}

function normalizeSwatches(value) {
  const source = Array.isArray(value) ? value : [];
  return source.map(normalizeSwatch).filter(Boolean);
}

function normalizeSwatch(swatch) {
  if (!swatch || typeof swatch !== "object") return null;
  const type = swatch.type === "gradient" ? "gradient" : swatch.type === "pattern" ? "pattern" : "solid";
  if (type === "pattern") {
    return {
      id: swatch.id || createId(),
      type: "pattern",
      name: swatch.name || "Pattern",
      pattern: swatch.pattern || null
    };
  }
  if (type === "gradient") {
    const stops = normalizeGradientStops(swatch.gradientStops, swatch.gradientStart || DEFAULT_FILL, swatch.gradientEnd || DEFAULT_GRADIENT_END);
    return {
      id: swatch.id || createId(),
      type: "gradient",
      name: swatch.name || "Gradient",
      paintType: normalizePaintType(swatch.paintType) === "SOLID" ? "GRADIENT_LINEAR" : normalizePaintType(swatch.paintType),
      gradientStart: stops[0].color,
      gradientEnd: stops[stops.length - 1].color,
      gradientStops: stops,
      gradientAngle: clampNumber(swatch.gradientAngle, -360, 360, 0)
    };
  }
  const color = normalizeHex(swatch.color || swatch.gradientStart || DEFAULT_FILL, DEFAULT_FILL);
  return {
    id: swatch.id || createId(),
    type: "solid",
    name: swatch.name || color,
    color: color
  };
}

function swatchFromLayer(layer) {
  if (!layer) return null;
  if (layer.paintType === "GRADIENT_LINEAR" || layer.paintType === "GRADIENT_RADIAL") {
    const stops = normalizeGradientStops(layer.gradientStops, layer.gradientStart, layer.gradientEnd);
    return normalizeSwatch({
      id: createId(),
      type: "gradient",
      name: layer.paintType === "GRADIENT_RADIAL" ? "Radial Gradient" : "Linear Gradient",
      paintType: layer.paintType,
      gradientStart: stops[0].color,
      gradientEnd: stops[stops.length - 1].color,
      gradientStops: stops,
      gradientAngle: layer.gradientAngle
    });
  }
  return normalizeSwatch({
    id: createId(),
    type: "solid",
    name: layer.color || DEFAULT_FILL,
    color: layer.color || DEFAULT_FILL
  });
}

function swatchFromPaint(paint, fallbackColor) {
  if (!paint || !PAINT_TYPES.includes(paint.type)) return null;
  const fields = paintToLayerFields(paint, fallbackColor || DEFAULT_FILL);
  if (fields.paintType === "GRADIENT_LINEAR" || fields.paintType === "GRADIENT_RADIAL") {
    return normalizeSwatch({
      id: createId(),
      type: "gradient",
      name: fields.paintType === "GRADIENT_RADIAL" ? "Radial Gradient" : "Linear Gradient",
      paintType: fields.paintType,
      gradientStart: fields.gradientStart,
      gradientEnd: fields.gradientEnd,
      gradientStops: fields.gradientStops,
      gradientAngle: fields.gradientAngle
    });
  }
  return normalizeSwatch({
    id: createId(),
    type: "solid",
    name: fields.color,
    color: fields.color
  });
}

function firstSelectionPaint(node) {
  if (!node) return null;
  if ("fills" in node && Array.isArray(node.fills)) {
    const fill = findSupportedPaint(node.fills);
    if (fill) return { paint: fill, fallback: DEFAULT_FILL };
  }
  if ("strokes" in node && Array.isArray(node.strokes)) {
    const stroke = findSupportedPaint(node.strokes);
    if (stroke) return { paint: stroke, fallback: DEFAULT_STROKE };
  }
  return null;
}

async function saveSwatchFromSelection() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    figma.notify("Select one object with a fill or stroke paint.");
    return;
  }
  const selectedPaint = firstSelectionPaint(selection[0]);
  if (!selectedPaint) {
    figma.notify("Selected object has no supported solid or gradient paint.");
    return;
  }
  const swatch = swatchFromPaint(selectedPaint.paint, selectedPaint.fallback);
  if (!swatch) return;
  savedSwatches.push(swatch);
  await writeSavedSwatches();
  figma.notify("Swatch saved from selection.");
}

async function saveSwatchFromLayer(layerId) {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();
  const stack = readStack(group);
  const layer = stack.find(function (item) {
    return item.id === layerId;
  });
  if (!layer) {
    figma.notify("Select a fill or stroke stack first.");
    return;
  }
  const swatch = swatchFromLayer(layer);
  if (!swatch) return;
  savedSwatches.push(swatch);
  await writeSavedSwatches();
  figma.notify("Swatch saved.");
}

async function createSavedSwatch(swatch) {
  const normalized = normalizeSwatch(Object.assign({}, swatch || {}, { id: createId() }));
  if (!normalized) return;
  savedSwatches.push(normalized);
  await writeSavedSwatches();
  figma.notify("Swatch saved.");
}

async function removeSavedSwatch(swatchId) {
  savedSwatches = savedSwatches.filter(function (swatch) {
    return swatch.id !== swatchId;
  });
  await writeSavedSwatches();
}

async function applySavedSwatch(layerId, swatchId) {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();
  const stack = readStack(group);
  const layerIndex = stack.findIndex(function (item) {
    return item.id === layerId;
  });
  if (layerIndex < 0) {
    figma.notify("Select a fill or stroke stack first.");
    return;
  }
  const swatch = savedSwatches.find(function (item) {
    return item.id === swatchId;
  });
  if (!swatch) {
    figma.notify("Swatch not found.");
    return;
  }
  if (swatch.type === "pattern") {
    figma.notify("Pattern swatches are reserved for future pattern paint support.");
    return;
  }
  stack[layerIndex] = applySwatchToLayer(stack[layerIndex], swatch);
  await renderAppearance(group, stack);
}

function applySwatchToLayer(layer, swatch) {
  if (swatch.type === "gradient") {
    const stops = normalizeGradientStops(swatch.gradientStops, swatch.gradientStart, swatch.gradientEnd);
    return normalizeLayer(Object.assign({}, layer, {
      paintType: swatch.paintType,
      color: stops[0].color,
      gradientStart: stops[0].color,
      gradientEnd: stops[stops.length - 1].color,
      gradientStops: stops,
      gradientAngle: swatch.gradientAngle
    }));
  }
  return normalizeLayer(Object.assign({}, layer, {
    paintType: "SOLID",
    color: swatch.color,
    gradientStart: swatch.color,
    gradientEnd: DEFAULT_GRADIENT_END,
    gradientStops: defaultGradientStops(swatch.color, DEFAULT_GRADIENT_END)
  }));
}
