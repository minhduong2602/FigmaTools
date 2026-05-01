function readStack(group) {
  const raw = group.getSharedPluginData(DATA_NAMESPACE, DATA_STACK);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(normalizeLayer);
  } catch (_error) {
    return [];
  }
  return [];
}

function createGlobalAppearance(node) {
  return normalizeGlobalAppearance({
    opacity: node && "opacity" in node ? Math.round(node.opacity * 100) : 100,
    blendMode: node && "blendMode" in node ? node.blendMode : "NORMAL"
  });
}

function readGlobalAppearance(group) {
  const raw = group.getSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL);
  if (!raw) return createGlobalAppearance();
  try {
    return normalizeGlobalAppearance(JSON.parse(raw));
  } catch (_error) {
    return createGlobalAppearance();
  }
}

function writeGlobalAppearance(group, globalAppearance) {
  group.setSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL, JSON.stringify(normalizeGlobalAppearance(globalAppearance)));
}

function normalizeGlobalAppearance(globalAppearance) {
  return {
    opacity: clampNumber(globalAppearance && globalAppearance.opacity, 0, 100, 100),
    blendMode: normalizeBlendMode(globalAppearance && globalAppearance.blendMode)
  };
}

function applyGlobalAppearance(group, globalAppearance) {
  const normalized = normalizeGlobalAppearance(globalAppearance);
  if ("opacity" in group) group.opacity = normalized.opacity / 100;
  if ("blendMode" in group) group.blendMode = normalized.blendMode;
}

function inferInitialStack(node) {
  const layers = [];
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fills = node.fills.filter((paint) => PAINT_TYPES.includes(paint.type));
    for (const fill of fills) {
      layers.push(normalizeLayer(Object.assign({
        id: createId(),
        type: "fill",
        name: "Fill",
        opacity: Math.round((paintOpacity(fill) * 100)),
        blendMode: normalizeBlendMode(fill.blendMode || "NORMAL"),
        visible: fill.visible !== false
      }, paintToLayerFields(fill, DEFAULT_FILL))));
    }
  }

  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const strokes = node.strokes.filter((paint) => PAINT_TYPES.includes(paint.type));
    for (const stroke of strokes) {
      layers.push(normalizeLayer(Object.assign({
        id: createId(),
        type: "stroke",
        name: "Stroke",
        opacity: Math.round((paintOpacity(stroke) * 100)),
        weight: "strokeWeight" in node && typeof node.strokeWeight === "number" ? node.strokeWeight : 2,
        blendMode: normalizeBlendMode(stroke.blendMode || "NORMAL"),
        strokeCap: "strokeCap" in node ? node.strokeCap : "",
        strokeJoin: "strokeJoin" in node ? node.strokeJoin : "",
        strokeAlign: "strokeAlign" in node ? node.strokeAlign : "",
        miterLimit: "strokeMiterLimit" in node ? node.strokeMiterLimit : "",
        dashPattern: "dashPattern" in node && Array.isArray(node.dashPattern) ? node.dashPattern : [],
        visible: stroke.visible !== false
      }, paintToLayerFields(stroke, DEFAULT_STROKE))));
    }
  }

  if (layers.length === 0) {
    layers.push(createLayer("fill"));
  }

  return layers;
}

function createLayer(type) {
  if (type === "stroke") {
    return normalizeLayer({
      id: createId(),
      type,
      name: "Stroke",
      paintType: "SOLID",
      color: DEFAULT_STROKE,
      gradientStart: DEFAULT_STROKE,
      gradientEnd: DEFAULT_GRADIENT_END,
      gradientAngle: 0,
      opacity: 100,
      weight: 4,
      blendMode: "NORMAL",
      strokeCap: "",
      strokeJoin: "",
      strokeAlign: "",
      miterLimit: "",
      dashPattern: [],
      visible: true
    });
  }

  return normalizeLayer({
    id: createId(),
    type: "fill",
    name: "Fill",
    paintType: "SOLID",
    color: DEFAULT_FILL,
    gradientStart: DEFAULT_FILL,
    gradientEnd: DEFAULT_GRADIENT_END,
    gradientAngle: 0,
    opacity: 100,
    blendMode: "NORMAL",
    visible: true
  });
}

function reduceToBasic(stack) {
  const reduced = [];
  const fill = stack.find((layer) => layer.type === "fill");
  const stroke = stack.find((layer) => layer.type === "stroke");
  if (fill) reduced.push(normalizeLayer(Object.assign({}, fill, {
    id: createId(),
    effects: [],
    visible: true
  })));
  if (stroke) reduced.push(normalizeLayer(Object.assign({}, stroke, {
    id: createId(),
    effects: [],
    visible: true
  })));
  return reduced;
}

function cloneLayerForPaste(layer) {
  const clonedEffects = Array.isArray(layer.effects) ? layer.effects.map((effect) => Object.assign({}, effect, { id: createId() })) : [];
  return normalizeLayer(Object.assign({}, layer, {
    id: createId(),
    effects: clonedEffects
  }));
}

function normalizeLayer(layer) {
  const type = ["fill", "stroke"].includes(layer.type) ? layer.type : "fill";
  const effects = Array.isArray(layer.effects) ? layer.effects.map(normalizeEffect).filter(Boolean) : legacyEffects(layer);
  const fallbackColor = type === "stroke" ? DEFAULT_STROKE : DEFAULT_FILL;
  return {
    id: layer.id || createId(),
    type,
    name: typeof layer.name === "string" && layer.name.trim() ? layer.name.trim() : titleCase(type),
    paintType: normalizePaintType(layer.paintType),
    color: normalizeHex(layer.color || layer.gradientStart || fallbackColor, fallbackColor),
    gradientStart: normalizeHex(layer.gradientStart || layer.color || fallbackColor, fallbackColor),
    gradientEnd: normalizeHex(layer.gradientEnd || DEFAULT_GRADIENT_END, DEFAULT_GRADIENT_END),
    gradientAngle: clampNumber(layer.gradientAngle, -360, 360, 0),
    opacity: clampNumber(layer.opacity, 0, 100, 100),
    blendMode: normalizeBlendMode(layer.blendMode),
    weight: clampNumber(layer.weight, 0, 200, type === "stroke" ? 4 : 0),
    strokeCap: normalizeOptionalEnum(layer.strokeCap, STROKE_CAPS),
    strokeJoin: normalizeOptionalEnum(layer.strokeJoin, STROKE_JOINS),
    strokeAlign: normalizeOptionalEnum(layer.strokeAlign, STROKE_ALIGNS),
    miterLimit: layer.miterLimit === "" || layer.miterLimit === undefined ? "" : clampNumber(layer.miterLimit, 1, 100, 4),
    dashPattern: normalizeDashPattern(layer.dashPattern),
    offsetX: clampNumber(layer.offsetX, -500, 500, 0),
    offsetY: clampNumber(layer.offsetY, -500, 500, 8),
    radius: clampNumber(layer.radius, 0, 500, 18),
    spread: clampNumber(layer.spread, -500, 500, 0),
    effects,
    visible: layer.visible !== false
  };
}

function legacyEffects(layer) {
  if (layer.type !== "shadow") return [];
  return [normalizeEffect({
    id: createId(),
    type: "dropShadow",
    color: layer.color || DEFAULT_SHADOW,
    opacity: layer.opacity || 28,
    offsetX: layer.offsetX || 0,
    offsetY: layer.offsetY || 8,
    radius: layer.radius || 18,
    spread: layer.spread || 0,
    visible: layer.visible !== false
  })];
}
