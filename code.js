const DATA_NAMESPACE = "appearance_stack";
const DATA_KIND = "kind";
const DATA_STACK = "stack";
const DATA_GLOBAL = "global";
const KIND_GROUP = "group";
const KIND_BASE = "base";
const KIND_RENDER = "render";

const DEFAULT_FILL = "#4F8DFF";
const DEFAULT_STROKE = "#111111";
const DEFAULT_GRADIENT_END = "#B96BFF";
const DEFAULT_SHADOW = "#000000";
const STYLE_CLIPBOARD_KEY = "appearance_stack_clipboard";
const BLEND_MODES = [
  "NORMAL",
  "MULTIPLY",
  "SCREEN",
  "OVERLAY",
  "DARKEN",
  "LIGHTEN",
  "COLOR_DODGE",
  "COLOR_BURN",
  "HARD_LIGHT",
  "SOFT_LIGHT",
  "DIFFERENCE",
  "EXCLUSION",
  "HUE",
  "SATURATION",
  "COLOR",
  "LUMINOSITY"
];
const STROKE_CAPS = ["NONE", "ROUND", "SQUARE"];
const STROKE_JOINS = ["MITER", "ROUND", "BEVEL"];
const STROKE_ALIGNS = ["CENTER", "INSIDE", "OUTSIDE"];
const PAINT_TYPES = ["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL"];
const SHAPE_EFFECT_TYPES = ["RECTANGLE", "ROUNDED_RECTANGLE", "ELLIPSE"];
const OFFSET_JOINS = ["MITER", "ROUND", "BEVEL"];

function getSelection() {
  return figma.currentPage.selection.filter((node) => "clone" in node);
}

function getActiveAppearanceGroup() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (isAppearanceGroup(node)) return ensureFrameContainer(node);
  let parent = node.parent;
  while (parent && parent.type !== "PAGE") {
    if (isAppearanceGroup(parent)) return ensureFrameContainer(parent);
    parent = parent.parent;
  }
  return null;
}

function isAppearanceGroup(node) {
  return (node.type === "GROUP" || node.type === "FRAME") && node.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_GROUP;
}

function ensureFrameContainer(node) {
  if (node.type !== "GROUP") return node;
  if (!node.parent || node.parent.type === "DOCUMENT") return node;

  const parent = node.parent;
  const frame = figma.createFrame();
  const index = getChildIndex(parent, node);
  frame.name = node.name;
  frame.x = node.x;
  frame.y = node.y;
  frame.resizeWithoutConstraints(Math.max(0.01, node.width), Math.max(0.01, node.height));
  frame.clipsContent = false;
  frame.fills = [];
  frame.strokes = [];
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_STACK, node.getSharedPluginData(DATA_NAMESPACE, DATA_STACK));
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL, node.getSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL));
  parent.insertChild(index >= 0 ? index : parent.children.length, frame);

  for (const child of node.children.slice()) {
    const childX = child.x;
    const childY = child.y;
    frame.appendChild(child);
    child.x = childX;
    child.y = childY;
  }

  node.remove();
  figma.currentPage.selection = [frame];
  return frame;
}

function notifySelectAppearance() {
  figma.notify("Select an Appearance Stack group first.");
}

async function wrapSelection() {
  const selection = getSelection();
  if (selection.length !== 1) {
    figma.notify("Select one object to create an appearance stack.");
    return;
  }

  const node = selection[0];
  if (isAppearanceGroup(node)) {
    figma.notify("This object already has an appearance stack.");
    return;
  }

  if (!node.parent || node.parent.type === "DOCUMENT") {
    figma.notify("This object cannot be wrapped here.");
    return;
  }

  const parent = node.parent;
  const originalName = node.name;
  const stack = inferInitialStack(node);
  const group = createAppearanceFrame(node, parent, originalName);
  writeGlobalAppearance(group, createGlobalAppearance(node));
  node.name = `${originalName} base`;
  node.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BASE);
  if (group.type === "FRAME") {
    group.appendChild(node);
    node.x = 0;
    node.y = 0;
  }

  await renderAppearance(group, stack);
  figma.currentPage.selection = [group];
  figma.notify("Appearance stack created.");
}

function createAppearanceFrame(node, parent, originalName) {
  if ("width" in node && "height" in node) {
    const frame = figma.createFrame();
    const index = getChildIndex(parent, node);
    frame.name = `${originalName} Appearance`;
    frame.x = node.x;
    frame.y = node.y;
    frame.resizeWithoutConstraints(Math.max(0.01, node.width), Math.max(0.01, node.height));
    frame.clipsContent = false;
    frame.fills = [];
    frame.strokes = [];
    frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
    parent.insertChild(index >= 0 ? index : parent.children.length, frame);
    return frame;
  }

  const group = figma.group([node], parent);
  group.name = `${originalName} Appearance`;
  group.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
  return group;
}

function getChildIndex(parent, node) {
  return parent.children.findIndex((child) => child.id === node.id);
}

async function detachAppearance() {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();
  const base = findBase(group);
  if (!base || !group.parent) {
    figma.notify("Could not find the base object.");
    return;
  }

  const parent = group.parent;
  const baseX = base.x;
  const baseY = base.y;
  base.visible = true;
  base.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, "");
  base.name = base.name.replace(/\sbase$/, "");
  parent.appendChild(base);
  if (group.type === "FRAME") {
    base.x = group.x + baseX;
    base.y = group.y + baseY;
  } else {
    base.x = group.x;
    base.y = group.y;
  }
  group.remove();
  figma.currentPage.selection = [base];
  figma.notify("Appearance stack detached.");
}

async function renderAppearance(group, stack) {
  const base = findBase(group);
  if (!base) throw new Error("Missing base object.");

  for (const child of group.children.slice()) {
    if (child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_RENDER) {
      child.remove();
    }
  }

  const normalized = stack.map(normalizeLayer);
  const globalAppearance = readGlobalAppearance(group);
  applyGlobalAppearance(group, globalAppearance);
  base.visible = true;

  for (const layer of normalized) {
    if (!layer.visible) continue;
    const transforms = getTransformInstances(layer);
    for (const transform of transforms) {
      const render = createLayerRenderNode(base, layer);
      render.name = transform.label ? `${layer.name} ${transform.label}` : layer.name;
      render.visible = true;
      render.locked = false;
      render.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_RENDER);
      applyLayerAppearance(render, layer, base);
      applyGeometryPipelineEffects(render, layer);
      applyTransformInstance(render, transform);
      group.appendChild(render);
      appendRasterEffectOverlays(group, base, layer, transform);
    }
  }

  base.visible = false;
  group.setSharedPluginData(DATA_NAMESPACE, DATA_STACK, JSON.stringify(normalized));
}

function findBase(group) {
  return group.children.find((child) => child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BASE) || null;
}

async function setTextContent(textNode, characters) {
  await loadFontsForText(textNode);
  textNode.characters = characters;
}

async function loadFontsForText(textNode) {
  const fonts = [];
  if (typeof textNode.getRangeAllFontNames === "function" && textNode.characters.length > 0) {
    const rangeFonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    for (const fontName of rangeFonts) {
      fonts.push(fontName);
    }
  } else if (textNode.characters.length > 0 && typeof textNode.getRangeFontName === "function") {
    for (let index = 0; index < textNode.characters.length; index++) {
      const fontName = textNode.getRangeFontName(index, index + 1);
      if (isFontName(fontName)) fonts.push(fontName);
    }
  } else if (isFontName(textNode.fontName)) {
    fonts.push(textNode.fontName);
  }

  const seen = {};
  for (const font of fonts) {
    const key = `${font.family}::${font.style}`;
    if (seen[key]) continue;
    seen[key] = true;
    await figma.loadFontAsync(font);
  }
}

function isFontName(value) {
  return value && typeof value.family === "string" && typeof value.style === "string";
}

function readTextProperties(textNode) {
  const fontName = readWholeTextFontName(textNode);
  const lineHeight = normalizeTextLineHeight(textNode.lineHeight);
  const letterSpacing = normalizeTextLetterSpacing(textNode.letterSpacing);
  return {
    fontFamily: fontName.family,
    fontStyle: fontName.style,
    fontSize: readWholeTextNumber(textNode, "fontSize", 12),
    lineHeightMode: lineHeight.mode,
    lineHeightValue: lineHeight.value,
    letterSpacingMode: letterSpacing.mode,
    letterSpacingValue: letterSpacing.value,
    paragraphSpacing: readWholeTextNumber(textNode, "paragraphSpacing", 0),
    textCase: typeof textNode.textCase === "string" ? textNode.textCase : "ORIGINAL",
    textDecoration: typeof textNode.textDecoration === "string" ? textNode.textDecoration : "NONE"
  };
}

async function applyTextProperties(textNode, properties) {
  const current = readTextProperties(textNode);
  const nextFont = {
    family: properties.fontFamily || current.fontFamily,
    style: properties.fontStyle || current.fontStyle
  };

  await loadFontsForText(textNode);
  if (isFontName(nextFont)) await figma.loadFontAsync(nextFont);

  if (properties.fontFamily !== undefined || properties.fontStyle !== undefined) textNode.fontName = nextFont;
  if (properties.fontSize !== undefined && properties.fontSize !== "") textNode.fontSize = clampNumber(properties.fontSize, 1, 1000, current.fontSize);
  if (properties.lineHeightMode !== undefined || properties.lineHeightValue !== undefined) textNode.lineHeight = textLineHeightFromProperties(properties, current);
  if (properties.letterSpacingMode !== undefined || properties.letterSpacingValue !== undefined) textNode.letterSpacing = textLetterSpacingFromProperties(properties, current);
  if ("paragraphSpacing" in textNode && properties.paragraphSpacing !== undefined && properties.paragraphSpacing !== "") {
    textNode.paragraphSpacing = clampNumber(properties.paragraphSpacing, 0, 10000, current.paragraphSpacing);
  }
  if ("textCase" in textNode && properties.textCase !== undefined) textNode.textCase = normalizeTextCase(properties.textCase);
  if ("textDecoration" in textNode && properties.textDecoration !== undefined) textNode.textDecoration = normalizeTextDecoration(properties.textDecoration);
}

function readWholeTextFontName(textNode) {
  if (isFontName(textNode.fontName)) return textNode.fontName;
  if (textNode.characters.length > 0 && typeof textNode.getRangeFontName === "function") {
    const fontName = textNode.getRangeFontName(0, 1);
    if (isFontName(fontName)) return fontName;
  }
  return { family: "Inter", style: "Regular" };
}

function readWholeTextNumber(textNode, property, fallback) {
  const value = textNode[property];
  if (typeof value === "number") return roundForUi(value);
  return fallback;
}

function normalizeTextLineHeight(value) {
  if (!value || value === figma.mixed || value.unit === "AUTO") return { mode: "AUTO", value: "" };
  if (value.unit === "PERCENT") return { mode: "PERCENT", value: roundForUi(value.value) };
  return { mode: "PIXELS", value: roundForUi(value.value) };
}

function normalizeTextLetterSpacing(value) {
  if (!value || value === figma.mixed) return { mode: "PIXELS", value: 0 };
  if (value.unit === "PERCENT") return { mode: "PERCENT", value: roundForUi(value.value) };
  return { mode: "PIXELS", value: roundForUi(value.value) };
}

function textLineHeightFromProperties(properties, current) {
  const mode = properties.lineHeightMode || current.lineHeightMode || "AUTO";
  if (mode === "AUTO") return { unit: "AUTO" };
  return {
    unit: mode,
    value: clampNumber(properties.lineHeightValue, 0, 10000, current.lineHeightValue || current.fontSize)
  };
}

function textLetterSpacingFromProperties(properties, current) {
  const mode = properties.letterSpacingMode || current.letterSpacingMode || "PIXELS";
  return {
    unit: mode,
    value: clampNumber(properties.letterSpacingValue, -1000, 1000, current.letterSpacingValue || 0)
  };
}

function normalizeTextCase(value) {
  return ["ORIGINAL", "UPPER", "LOWER", "TITLE"].includes(value) ? value : "ORIGINAL";
}

function normalizeTextDecoration(value) {
  return ["NONE", "UNDERLINE", "STRIKETHROUGH"].includes(value) ? value : "NONE";
}

function readObjectProperties(group, base) {
  const width = "width" in group ? group.width : "width" in base ? base.width : 0;
  const height = "height" in group ? group.height : "height" in base ? base.height : 0;
  return {
    x: "x" in group ? roundForUi(group.x) : 0,
    y: "y" in group ? roundForUi(group.y) : 0,
    width: roundForUi(width),
    height: roundForUi(height),
    rotation: "rotation" in group ? roundForUi(group.rotation) : 0,
    cornerRadius: readCornerRadius(base),
    hasCornerRadius: "cornerRadius" in base && typeof base.cornerRadius === "number"
  };
}

function applyObjectProperties(group, base, properties) {
  if ("x" in group && properties.x !== undefined) group.x = clampNumber(properties.x, -100000, 100000, group.x);
  if ("y" in group && properties.y !== undefined) group.y = clampNumber(properties.y, -100000, 100000, group.y);
  if ("rotation" in group && properties.rotation !== undefined) group.rotation = clampNumber(properties.rotation, -3600, 3600, group.rotation);

  const nextWidth = properties.width === undefined ? ("width" in group ? group.width : base.width) : clampNumber(properties.width, 0.01, 100000, "width" in group ? group.width : base.width);
  const nextHeight = properties.height === undefined ? ("height" in group ? group.height : base.height) : clampNumber(properties.height, 0.01, 100000, "height" in group ? group.height : base.height);

  if (group.type === "FRAME") {
    group.resizeWithoutConstraints(nextWidth, nextHeight);
    resizeBaseNode(base, nextWidth, nextHeight);
  }

  if ("cornerRadius" in base && properties.cornerRadius !== undefined && properties.cornerRadius !== "") {
    base.cornerRadius = clampNumber(properties.cornerRadius, 0, 100000, readCornerRadius(base));
  }
}

function resizeBaseNode(base, width, height) {
  if (!("resize" in base)) return;
  try {
    base.resize(Math.max(0.01, width), Math.max(0.01, height));
  } catch (_error) {
    try {
      base.resizeWithoutConstraints(Math.max(0.01, width), Math.max(0.01, height));
    } catch (_innerError) {
      // Some nodes cannot be resized by plugins.
    }
  }
}

function readCornerRadius(base) {
  if (!("cornerRadius" in base) || typeof base.cornerRadius !== "number") return "";
  return roundForUi(base.cornerRadius);
}

function roundForUi(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

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

function createEffect(type) {
  if (type === "outerGlow") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Outer Glow",
      color: "#7AB3FF",
      opacity: 65,
      offsetX: 0,
      offsetY: 0,
      radius: 18,
      spread: 0,
      blendMode: "SCREEN",
      showShadowBehindNode: true,
      visible: true
    });
  }

  if (type === "innerGlow") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Inner Glow",
      color: "#FFFFFF",
      opacity: 55,
      offsetX: 0,
      offsetY: 0,
      radius: 14,
      spread: 0,
      blendMode: "SCREEN",
      visible: true
    });
  }

  if (type === "transform") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Transform",
      scaleX: 100,
      scaleY: 100,
      moveX: 0,
      moveY: 0,
      rotate: 0,
      reflectX: false,
      reflectY: false,
      copies: 0,
      visible: true
    });
  }

  if (type === "offsetPath") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Offset Path",
      amount: 8,
      joinStyle: "MITER",
      miterLimit: 4,
      visible: true
    });
  }

  if (type === "roundCorners") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Round Corners",
      radius: 12,
      visible: true
    });
  }

  if (type === "feather") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Feather",
      radius: 8,
      visible: true
    });
  }

  if (type === "convertShape") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Convert to Shape",
      shapeType: "ROUNDED_RECTANGLE",
      widthExtra: 16,
      heightExtra: 8,
      cornerRadius: 8,
      visible: true
    });
  }

  if (type === "colorHalftone") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Color Halftone",
      color: DEFAULT_SHADOW,
      opacity: 45,
      dotSize: 5,
      spacing: 12,
      angle: 45,
      blendMode: "MULTIPLY",
      visible: true
    });
  }

  if (type === "scribble") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Scribble",
      color: DEFAULT_SHADOW,
      opacity: 65,
      strokeWidth: 1.2,
      gap: 8,
      angle: -15,
      jitter: 2,
      blendMode: "NORMAL",
      visible: true
    });
  }

  if (type === "innerShadow") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Inner Shadow",
      color: DEFAULT_SHADOW,
      opacity: 24,
      offsetX: 0,
      offsetY: 3,
      radius: 8,
      spread: 0,
      blendMode: "NORMAL",
      visible: true
    });
  }

  if (type === "layerBlur") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Layer Blur",
      radius: 8,
      visible: true
    });
  }

  if (type === "backgroundBlur") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Background Blur",
      radius: 12,
      visible: true
    });
  }

  if (type === "noise") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Noise",
      color: DEFAULT_SHADOW,
      secondaryColor: "#FFFFFF",
      opacity: 22,
      density: 45,
      noiseSize: 2,
      noiseType: "MONOTONE",
      blendMode: "NORMAL",
      visible: true
    });
  }

  if (type === "texture") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Texture",
      noiseSize: 2,
      radius: 4,
      clipToShape: true,
      visible: true
    });
  }

  if (type === "glass") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Glass",
      lightIntensity: 45,
      lightAngle: 45,
      refraction: 35,
      depth: 12,
      dispersion: 15,
      radius: 8,
      visible: true
    });
  }

  return normalizeEffect({
    id: createId(),
    type: "dropShadow",
    name: "Drop Shadow",
    color: DEFAULT_SHADOW,
    opacity: 28,
    offsetX: 0,
    offsetY: 8,
    radius: 18,
    spread: 0,
    blendMode: "NORMAL",
    showShadowBehindNode: false,
    visible: true
  });
}

function normalizeEffect(effect) {
  const incomingType = effect.type;
  if (![
    "dropShadow",
    "innerShadow",
    "outerGlow",
    "innerGlow",
    "layerBlur",
    "backgroundBlur",
    "noise",
    "texture",
    "glass",
    "transform",
    "offsetPath",
    "roundCorners",
    "feather",
    "convertShape",
    "colorHalftone",
    "scribble"
  ].includes(incomingType)) return null;
  const type = incomingType;
  return {
    id: effect.id || createId(),
    type,
    name: typeof effect.name === "string" && effect.name.trim() ? effect.name.trim() : effectName(type),
    color: normalizeHex(effect.color || DEFAULT_SHADOW),
    secondaryColor: normalizeHex(effect.secondaryColor || "#FFFFFF"),
    opacity: clampNumber(effect.opacity, 0, 100, defaultEffectOpacity(type)),
    blendMode: normalizeBlendMode(effect.blendMode),
    showShadowBehindNode: effect.showShadowBehindNode === true,
    offsetX: clampNumber(effect.offsetX, -500, 500, 0),
    offsetY: clampNumber(effect.offsetY, -500, 500, defaultEffectOffsetY(type)),
    radius: clampNumber(effect.radius, 0, 500, defaultEffectRadius(type)),
    spread: clampNumber(effect.spread, -500, 500, 0),
    noiseSize: clampNumber(effect.noiseSize, 0.1, 100, 2),
    density: clampNumber(effect.density, 0, 100, 45),
    noiseType: normalizeNoiseType(effect.noiseType),
    clipToShape: effect.clipToShape !== false,
    lightIntensity: clampNumber(effect.lightIntensity, 0, 100, 45),
    lightAngle: clampNumber(effect.lightAngle, 0, 360, 45),
    refraction: clampNumber(effect.refraction, 0, 100, 35),
    depth: clampNumber(effect.depth, 1, 1000, 12),
    dispersion: clampNumber(effect.dispersion, 0, 100, 15),
    scaleX: clampNumber(effect.scaleX, 1, 1000, 100),
    scaleY: clampNumber(effect.scaleY, 1, 1000, 100),
    moveX: clampNumber(effect.moveX, -5000, 5000, 0),
    moveY: clampNumber(effect.moveY, -5000, 5000, 0),
    rotate: clampNumber(effect.rotate, -3600, 3600, 0),
    reflectX: effect.reflectX === true,
    reflectY: effect.reflectY === true,
    copies: Math.round(clampNumber(effect.copies, 0, 100, 0)),
    amount: clampNumber(effect.amount, -500, 500, 8),
    joinStyle: normalizeOffsetJoin(effect.joinStyle),
    miterLimit: clampNumber(effect.miterLimit, 1, 100, 4),
    shapeType: normalizeShapeEffectType(effect.shapeType),
    widthExtra: clampNumber(effect.widthExtra, -5000, 5000, 0),
    heightExtra: clampNumber(effect.heightExtra, -5000, 5000, 0),
    cornerRadius: clampNumber(effect.cornerRadius, 0, 10000, 8),
    dotSize: clampNumber(effect.dotSize, 0.5, 200, 5),
    spacing: clampNumber(effect.spacing, 1, 500, 12),
    angle: clampNumber(effect.angle, -3600, 3600, 0),
    strokeWidth: clampNumber(effect.strokeWidth, 0.1, 100, 1.2),
    gap: clampNumber(effect.gap, 1, 500, 8),
    jitter: clampNumber(effect.jitter, 0, 100, 2),
    visible: effect.visible !== false
  };
}

let didNotifyUnsupportedBetaEffects = false;
const noiseImageCache = {};
const rasterImageCache = {};

function createLayerRenderNode(base, layer) {
  const shapeEffect = firstVisibleEffect(layer, "convertShape");
  if (!shapeEffect || !("width" in base) || !("height" in base)) return base.clone();

  const node = shapeEffect.shapeType === "ELLIPSE" ? figma.createEllipse() : figma.createRectangle();
  const width = Math.max(0.01, base.width + shapeEffect.widthExtra);
  const height = Math.max(0.01, base.height + shapeEffect.heightExtra);
  node.name = effectName(shapeEffect.type);
  node.x = "x" in base ? base.x - shapeEffect.widthExtra / 2 : 0;
  node.y = "y" in base ? base.y - shapeEffect.heightExtra / 2 : 0;
  if ("resize" in node) node.resize(width, height);
  if ("rotation" in node && "rotation" in base) node.rotation = base.rotation;
  if ("cornerRadius" in node) {
    node.cornerRadius = shapeEffect.shapeType === "ROUNDED_RECTANGLE" ? shapeEffect.cornerRadius : 0;
  }
  return node;
}

function firstVisibleEffect(layer, type) {
  const effects = layer.effects || [];
  for (const effect of effects) {
    if (effect.visible && effect.type === type) return effect;
  }
  return null;
}

function applyLayerAppearance(node, layer, base) {
  node.opacity = 1;
  node.blendMode = layer.blendMode;
  if ("effects" in node) node.effects = [];

  if (layer.type === "fill") {
    if ("fills" in node) node.fills = [layerPaint(layer)];
    if ("strokes" in node) node.strokes = [];
    applyLayerEffects(node, layer);
    return;
  }

  if (layer.type === "stroke") {
    if ("fills" in node) node.fills = [];
    if ("strokes" in node) node.strokes = [layerPaint(layer)];
    if ("strokeWeight" in node) node.strokeWeight = layer.weight;
    applyStrokeStyle(node, layer);
    applyLayerEffects(node, layer);
    return;
  }
}

function applyStrokeStyle(node, layer) {
  if ("strokeCap" in node && layer.strokeCap) node.strokeCap = layer.strokeCap;
  if ("strokeJoin" in node && layer.strokeJoin) node.strokeJoin = layer.strokeJoin;
  if ("strokeAlign" in node && layer.strokeAlign) node.strokeAlign = layer.strokeAlign;
  if ("strokeMiterLimit" in node && layer.miterLimit !== "") node.strokeMiterLimit = layer.miterLimit;
  if ("dashPattern" in node) node.dashPattern = layer.dashPattern;
}

function applyLayerEffects(node, layer) {
  const figmaEffects = [];
  for (const effect of layer.effects) {
    if (!effect.visible) continue;

    if (effect.type === "dropShadow" || effect.type === "outerGlow") {
      const isGlow = effect.type === "outerGlow";
      figmaEffects.push({
        type: "DROP_SHADOW",
        visible: true,
        color: Object.assign({}, hexToRgb(effect.color), { a: effect.opacity / 100 }),
        offset: { x: isGlow ? 0 : effect.offsetX, y: isGlow ? 0 : effect.offsetY },
        radius: effect.radius,
        spread: effect.spread,
        blendMode: effect.blendMode,
        showShadowBehindNode: effect.showShadowBehindNode
      });
    }

    if (effect.type === "innerShadow" || effect.type === "innerGlow") {
      const isGlow = effect.type === "innerGlow";
      figmaEffects.push({
        type: "INNER_SHADOW",
        visible: true,
        color: Object.assign({}, hexToRgb(effect.color), { a: effect.opacity / 100 }),
        offset: { x: isGlow ? 0 : effect.offsetX, y: isGlow ? 0 : effect.offsetY },
        radius: effect.radius,
        spread: effect.spread,
        blendMode: effect.blendMode
      });
    }

    if (effect.type === "layerBlur") {
      figmaEffects.push({
        type: "LAYER_BLUR",
        visible: true,
        radius: effect.radius
      });
    }

    if (effect.type === "backgroundBlur") {
      figmaEffects.push({
        type: "BACKGROUND_BLUR",
        visible: true,
        radius: effect.radius
      });
    }

    if (effect.type === "feather") {
      figmaEffects.push({
        type: "LAYER_BLUR",
        visible: true,
        radius: effect.radius
      });
    }

    if (effect.type === "texture") {
      figmaEffects.push({
        type: "TEXTURE",
        visible: true,
        noiseSize: effect.noiseSize,
        radius: effect.radius,
        clipToShape: effect.clipToShape,
        boundVariables: {}
      });
    }

    if (effect.type === "glass") {
      figmaEffects.push({
        type: "GLASS",
        visible: true,
        lightIntensity: effect.lightIntensity / 100,
        lightAngle: effect.lightAngle,
        refraction: effect.refraction / 100,
        depth: effect.depth,
        dispersion: effect.dispersion / 100,
        radius: effect.radius,
        boundVariables: {}
      });
    }
  }

  if ("effects" in node) {
    assignEffects(node, figmaEffects);
  }
}

function applyGeometryPipelineEffects(node, layer) {
  const offsetEffect = firstVisibleEffect(layer, "offsetPath");
  if (offsetEffect) applyOffsetPathEffect(node, layer, offsetEffect);

  const roundEffect = firstVisibleEffect(layer, "roundCorners");
  if (roundEffect && "cornerRadius" in node) {
    node.cornerRadius = roundEffect.radius;
  }
}

function applyOffsetPathEffect(node, layer, effect) {
  const amount = Number(effect.amount) || 0;
  if (amount === 0) return;

  if (node.type === "TEXT" && amount < 0) return;

  if (layer.type === "fill" && amount > 0 && "strokes" in node) {
    const paint = node.fills && node.fills.length ? clonePaint(node.fills[0]) : layerPaint(layer);
    node.strokes = [paint];
    if ("strokeWeight" in node) node.strokeWeight = Math.abs(amount) * 2;
    if ("strokeAlign" in node) node.strokeAlign = "OUTSIDE";
    applyOffsetJoinStyle(node, effect);
    return;
  }

  resizeNodeByOffset(node, amount);
  applyOffsetJoinStyle(node, effect);
}

function applyOffsetJoinStyle(node, effect) {
  if ("strokeJoin" in node) node.strokeJoin = effect.joinStyle;
  if ("strokeMiterLimit" in node && effect.joinStyle === "MITER") node.strokeMiterLimit = effect.miterLimit;
}

function resizeNodeByOffset(node, amount) {
  if (!("width" in node) || !("height" in node) || !("resize" in node)) return;
  const nextWidth = Math.max(0.01, node.width + amount * 2);
  const nextHeight = Math.max(0.01, node.height + amount * 2);
  if ("x" in node) node.x -= amount;
  if ("y" in node) node.y -= amount;
  try {
    node.resize(nextWidth, nextHeight);
  } catch (_error) {
    try {
      node.resizeWithoutConstraints(nextWidth, nextHeight);
    } catch (_innerError) {
      // Some nodes cannot be resized by plugins.
    }
  }
}

function appendRasterEffectOverlays(group, base, layer, transform) {
  const rasterEffects = layer.effects.filter((effect) => {
    return effect.visible && (effect.type === "noise" || effect.type === "colorHalftone" || effect.type === "scribble");
  });
  if (!rasterEffects.length) return;

  for (const effect of rasterEffects) {
    const overlay = createLayerRenderNode(base, layer);
    overlay.name = `${layer.name} ${effect.name}`;
    overlay.visible = true;
    overlay.locked = false;
    overlay.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_RENDER);
    applyRasterOverlayAppearance(overlay, layer, effect);
    applyGeometryPipelineEffects(overlay, layer);
    applyTransformInstance(overlay, transform);
    group.appendChild(overlay);
  }
}

function applyRasterOverlayAppearance(node, layer, effect) {
  node.opacity = 1;
  node.blendMode = effect.blendMode;
  if ("effects" in node) node.effects = [];

  const paint = rasterImagePaint(effect);
  if (layer.type === "fill") {
    if ("fills" in node) node.fills = [paint];
    if ("strokes" in node) node.strokes = [];
    return;
  }

  if (layer.type === "stroke") {
    if ("fills" in node) node.fills = [];
    if ("strokes" in node) node.strokes = [paint];
    if ("strokeWeight" in node) node.strokeWeight = layer.weight;
    applyStrokeStyle(node, layer);
  }
}

function rasterImagePaint(effect) {
  if (effect.type === "colorHalftone") return halftoneImagePaint(effect);
  if (effect.type === "scribble") return scribbleImagePaint(effect);
  return noiseImagePaint(effect);
}

function noiseImagePaint(effect) {
  return {
    type: "IMAGE",
    visible: true,
    scaleMode: "TILE",
    imageHash: noiseImageHash(effect),
    scalingFactor: 1,
    opacity: effect.opacity / 100,
    blendMode: effect.blendMode
  };
}

function noiseImageHash(effect) {
  const key = [
    effect.noiseType,
    effect.color,
    effect.secondaryColor,
    effect.density,
    effect.noiseSize
  ].join("|");
  if (!noiseImageCache[key]) {
    noiseImageCache[key] = figma.createImage(createNoisePng(effect)).hash;
  }
  return noiseImageCache[key];
}

function halftoneImagePaint(effect) {
  return {
    type: "IMAGE",
    visible: true,
    scaleMode: "TILE",
    imageHash: halftoneImageHash(effect),
    scalingFactor: 1,
    opacity: effect.opacity / 100,
    blendMode: effect.blendMode
  };
}

function halftoneImageHash(effect) {
  const key = [
    "halftone",
    effect.color,
    effect.dotSize,
    effect.spacing,
    effect.angle
  ].join("|");
  if (!rasterImageCache[key]) {
    rasterImageCache[key] = figma.createImage(createHalftonePng(effect)).hash;
  }
  return rasterImageCache[key];
}

function createHalftonePng(effect) {
  const width = 128;
  const height = 128;
  const spacing = Math.max(1, effect.spacing);
  const radius = Math.max(0.25, effect.dotSize / 2);
  const color = hexToBytes(effect.color);
  const radians = effect.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centeredX = x - width / 2;
      const centeredY = y - height / 2;
      const rx = centeredX * cos - centeredY * sin;
      const ry = centeredX * sin + centeredY * cos;
      const cellX = positiveModulo(rx + spacing / 2, spacing) - spacing / 2;
      const cellY = positiveModulo(ry + spacing / 2, spacing) - spacing / 2;
      const inside = Math.sqrt(cellX * cellX + cellY * cellY) <= radius;
      const index = (y * width + x) * 4;
      rgba[index] = color[0];
      rgba[index + 1] = color[1];
      rgba[index + 2] = color[2];
      rgba[index + 3] = inside ? 255 : 0;
    }
  }

  return encodePng(width, height, rgba);
}

function scribbleImagePaint(effect) {
  return {
    type: "IMAGE",
    visible: true,
    scaleMode: "TILE",
    imageHash: scribbleImageHash(effect),
    scalingFactor: 1,
    opacity: effect.opacity / 100,
    blendMode: effect.blendMode
  };
}

function scribbleImageHash(effect) {
  const key = [
    "scribble",
    effect.color,
    effect.strokeWidth,
    effect.gap,
    effect.angle,
    effect.jitter
  ].join("|");
  if (!rasterImageCache[key]) {
    rasterImageCache[key] = figma.createImage(createScribblePng(effect)).hash;
  }
  return rasterImageCache[key];
}

function createScribblePng(effect) {
  const width = 128;
  const height = 128;
  const gap = Math.max(1, effect.gap);
  const stroke = Math.max(0.1, effect.strokeWidth);
  const jitter = Math.max(0, effect.jitter);
  const color = hexToBytes(effect.color);
  const radians = effect.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centeredX = x - width / 2;
      const centeredY = y - height / 2;
      const rx = centeredX * cos - centeredY * sin;
      const ry = centeredX * sin + centeredY * cos;
      const wobble = Math.sin(rx * 0.11) * jitter + Math.sin(rx * 0.031 + 1.7) * jitter * 0.6;
      const distance = Math.abs(positiveModulo(ry + wobble + gap / 2, gap) - gap / 2);
      const inside = distance <= stroke / 2;
      const index = (y * width + x) * 4;
      rgba[index] = color[0];
      rgba[index + 1] = color[1];
      rgba[index + 2] = color[2];
      rgba[index + 3] = inside ? 255 : 0;
    }
  }

  return encodePng(width, height, rgba);
}

function createNoisePng(effect) {
  const width = 128;
  const height = 128;
  const grainSize = Math.max(1, Math.round(effect.noiseSize));
  const density = Math.max(0, Math.min(1, effect.density / 100));
  const primary = hexToBytes(effect.color);
  const secondary = hexToBytes(effect.secondaryColor);
  const seed = hashString([effect.noiseType, effect.color, effect.secondaryColor, effect.density, effect.noiseSize].join("|"));
  const random = seededRandom(seed);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += grainSize) {
    for (let x = 0; x < width; x += grainSize) {
      const active = random() <= density;
      const color = noiseCellColor(effect, primary, secondary, random);
      const alpha = active ? 255 : 0;
      for (let yy = y; yy < Math.min(height, y + grainSize); yy++) {
        for (let xx = x; xx < Math.min(width, x + grainSize); xx++) {
          const index = (yy * width + xx) * 4;
          rgba[index] = color[0];
          rgba[index + 1] = color[1];
          rgba[index + 2] = color[2];
          rgba[index + 3] = alpha;
        }
      }
    }
  }

  return encodePng(width, height, rgba);
}

function noiseCellColor(effect, primary, secondary, random) {
  if (effect.noiseType === "DUOTONE") {
    return random() < 0.5 ? primary : secondary;
  }

  if (effect.noiseType === "MULTITONE") {
    const value = Math.round(random() * 255);
    return [value, value, value];
  }

  return primary;
}

function hexToBytes(hex) {
  const rgb = hexToRgb(hex);
  return [
    Math.round(rgb.r * 255),
    Math.round(rgb.g * 255),
    Math.round(rgb.b * 255)
  ];
}

function clonePaint(paint) {
  return JSON.parse(JSON.stringify(paint));
}

function assignEffects(node, effects) {
  try {
    node.effects = effects;
  } catch (_error) {
    notifyUnsupportedBetaEffects(effects);
    const stableEffects = effects.filter((effect) => {
      return effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW" || effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR";
    });
    try {
      node.effects = stableEffects;
    } catch (_stableError) {
      node.effects = [];
    }
  }
}

function notifyUnsupportedBetaEffects(effects) {
  const hasBetaEffect = effects.some((effect) => {
    return effect.type === "NOISE" || effect.type === "TEXTURE" || effect.type === "GLASS";
  });
  if (hasBetaEffect) {
    if (didNotifyUnsupportedBetaEffects) return;
    didNotifyUnsupportedBetaEffects = true;
    figma.notify("This Figma build rejected a beta effect. Noise/Texture/Glass may need a newer Figma runtime.");
  }
}

function getTransformInstances(layer) {
  const transform = layer.effects.find((effect) => effect.type === "transform" && effect.visible);
  if (!transform) {
    return [{
      scaleX: 1,
      scaleY: 1,
      moveX: 0,
      moveY: 0,
      rotate: 0,
      reflectX: false,
      reflectY: false,
      label: ""
    }];
  }

  const instances = [];
  const total = transform.copies + 1;
  for (let index = 1; index <= total; index++) {
    instances.push({
      scaleX: Math.pow(transform.scaleX / 100, index),
      scaleY: Math.pow(transform.scaleY / 100, index),
      moveX: transform.moveX * index,
      moveY: transform.moveY * index,
      rotate: transform.rotate * index,
      reflectX: transform.reflectX && index % 2 === 1,
      reflectY: transform.reflectY && index % 2 === 1,
      label: index > 1 ? `copy ${index - 1}` : ""
    });
  }
  return instances;
}

function applyTransformInstance(node, transform) {
  const scaleX = (transform.reflectX ? -1 : 1) * transform.scaleX;
  const scaleY = (transform.reflectY ? -1 : 1) * transform.scaleY;
  const needsMatrix = scaleX < 0 || scaleY < 0;

  if (needsMatrix && "relativeTransform" in node) {
    try {
      node.relativeTransform = multiplyTransform(node.relativeTransform, transformMatrix(
        scaleX,
        scaleY,
        transform.rotate,
        transform.moveX,
        transform.moveY
      ));
      return;
    } catch (_error) {
      // Fall back to non-reflected transforms below when matrix assignment is not available.
    }
  }

  if ("resize" in node && "width" in node && "height" in node) {
    const nextWidth = Math.max(0.01, node.width * Math.abs(transform.scaleX));
    const nextHeight = Math.max(0.01, node.height * Math.abs(transform.scaleY));
    try {
      node.resize(nextWidth, nextHeight);
    } catch (_error) {
      // Some Figma nodes cannot be resized directly.
    }
  }

  if ("rotation" in node) {
    node.rotation += transform.rotate;
  }
  if ("x" in node) node.x += transform.moveX;
  if ("y" in node) node.y += transform.moveY;
}

function transformMatrix(scaleX, scaleY, rotate, moveX, moveY) {
  const radians = rotate * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [cos * scaleX, -sin * scaleY, moveX],
    [sin * scaleX, cos * scaleY, moveY]
  ];
}

function multiplyTransform(a, b) {
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

function normalizePrintSettings(settings) {
  const source = settings || {};
  return {
    profile: source.profile || "U.S. Web Coated (SWOP) v2",
    pdfTarget: source.pdfTarget || "PDF/X-4 intent",
    bleedMm: clampNumber(source.bleedMm, 0, 50, 3),
    safeMm: clampNumber(source.safeMm, 0, 50, 3),
    dpi: Math.round(clampNumber(source.dpi, 72, 1200, 300)),
    trimWidthMm: clampNumber(source.trimWidthMm, 1, 10000, 210),
    trimHeightMm: clampNumber(source.trimHeightMm, 1, 10000, 297),
    blackPolicy: source.blackPolicy || "100K text, rich black only for large solids"
  };
}

async function exportPrintPackage(settings) {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();

  const normalizedSettings = normalizePrintSettings(settings);
  const base = findBase(group);
  const stack = readStack(group);
  await renderAppearance(group, stack);

  const pdfBytes = await group.exportAsync({
    format: "PDF",
    contentsOnly: false,
    useAbsoluteBounds: false,
    colorProfile: "SRGB"
  });

  const manifest = createPrintManifest(group, base, stack, normalizedSettings);
  figma.ui.postMessage({
    type: "print-export-result",
    fileName: safeFileName(group.name || "appearance-stack"),
    pdfBytes,
    manifestText: JSON.stringify(manifest, null, 2)
  });
  figma.notify("Print source PDF and manifest are ready.");
}

function createPrintManifest(group, base, stack, settings) {
  return {
    version: 1,
    source: "Appearance Stack Figma plugin",
    warning: "Figma export is RGB. Convert this source PDF with the target ICC profile before sending to print.",
    target: {
      colorSpace: "CMYK",
      iccProfile: settings.profile,
      pdfTarget: settings.pdfTarget,
      blackPolicy: settings.blackPolicy
    },
    layout: {
      trimWidthMm: settings.trimWidthMm,
      trimHeightMm: settings.trimHeightMm,
      bleedMm: settings.bleedMm,
      safeMarginMm: settings.safeMm,
      rasterDpi: settings.dpi
    },
    figmaSource: {
      nodeName: group.name,
      baseName: base ? base.name.replace(/\sbase$/, "") : "",
      widthPx: "width" in group ? roundForUi(group.width) : 0,
      heightPx: "height" in group ? roundForUi(group.height) : 0,
      exportedColorProfile: "sRGB"
    },
    preflight: collectPrintWarnings(stack, settings)
  };
}

function collectPrintWarnings(stack, settings) {
  const warnings = [];
  warnings.push("Convert the exported PDF to CMYK outside Figma. Native Figma PDF is not a CMYK/PDF-X final.");
  if (settings.profile === "U.S. Web Coated (SWOP) v2") {
    warnings.push("SWOP v2 is a fallback profile. Ask the printer for their exact ICC profile when possible.");
  }

  for (const layer of stack) {
    if (isBrightPrintRisk(layer)) warnings.push(layer.name + " uses a bright RGB color that may shift in CMYK.");
    const effects = layer.effects || [];
    for (const effect of effects) {
      if (effect.type === "noise" || effect.type === "texture" || effect.type === "glass" || effect.type === "layerBlur" || effect.type === "backgroundBlur" || effect.type === "colorHalftone" || effect.type === "scribble" || effect.type === "feather") {
        warnings.push(layer.name + " has " + effectName(effect.type) + "; inspect raster output at " + settings.dpi + " DPI.");
      }
    }
  }

  return uniqueStrings(warnings);
}

function isBrightPrintRisk(layer) {
  const colors = [];
  if (layer.color) colors.push(layer.color);
  if (layer.gradientStart) colors.push(layer.gradientStart);
  if (layer.gradientEnd) colors.push(layer.gradientEnd);
  return colors.some((hex) => {
    const rgb = hexToRgb(hex);
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    return max > 0.88 && max - min > 0.55;
  });
}

function uniqueStrings(values) {
  const seen = {};
  const result = [];
  for (const value of values) {
    if (seen[value]) continue;
    seen[value] = true;
    result.push(value);
  }
  return result;
}

function safeFileName(value) {
  return String(value || "appearance-stack").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").toLowerCase();
}

function solidPaint(hex, opacity) {
  return {
    type: "SOLID",
    color: hexToRgb(hex),
    opacity,
    visible: true
  };
}

function gradientPaint(layer) {
  const opacity = layer.opacity / 100;
  const angle = layer.paintType === "GRADIENT_LINEAR" ? layer.gradientAngle : 0;
  return {
    type: layer.paintType,
    gradientTransform: gradientTransform(angle),
    gradientStops: [
      { position: 0, color: Object.assign({}, hexToRgb(layer.gradientStart), { a: opacity }) },
      { position: 1, color: Object.assign({}, hexToRgb(layer.gradientEnd), { a: opacity }) }
    ],
    visible: true
  };
}

function gradientTransform(angle) {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [cos, sin, 0],
    [-sin, cos, 0]
  ];
}

function layerPaint(layer) {
  if (layer.paintType === "GRADIENT_LINEAR" || layer.paintType === "GRADIENT_RADIAL") {
    return gradientPaint(layer);
  }
  return solidPaint(layer.color, layer.opacity / 100);
}

function paintToHex(paint) {
  if (!paint || paint.type !== "SOLID") return null;
  return rgbToHex(paint.color.r, paint.color.g, paint.color.b);
}

function gradientStopToHex(stop) {
  if (!stop || !stop.color) return null;
  return rgbToHex(stop.color.r, stop.color.g, stop.color.b);
}

function paintOpacity(paint) {
  if (!paint) return 1;
  if (typeof paint.opacity === "number") return paint.opacity;
  if (paint.gradientStops && paint.gradientStops[0] && paint.gradientStops[0].color && typeof paint.gradientStops[0].color.a === "number") {
    return paint.gradientStops[0].color.a;
  }
  return 1;
}

function findSupportedPaint(paints) {
  return paints.find((paint) => PAINT_TYPES.includes(paint.type)) || null;
}

function paintToLayerFields(paint, fallbackColor) {
  if (!paint) {
    return {
      paintType: "SOLID",
      color: fallbackColor,
      gradientStart: fallbackColor,
      gradientEnd: DEFAULT_GRADIENT_END,
      gradientAngle: 0
    };
  }

  if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") {
    const stops = Array.isArray(paint.gradientStops) ? paint.gradientStops : [];
    const start = gradientStopToHex(stops[0]) || fallbackColor;
    const end = gradientStopToHex(stops[stops.length - 1]) || DEFAULT_GRADIENT_END;
    return {
      paintType: paint.type,
      color: start,
      gradientStart: start,
      gradientEnd: end,
      gradientAngle: 0
    };
  }

  const color = paintToHex(paint) || fallbackColor;
  return {
    paintType: "SOLID",
    color,
    gradientStart: color,
    gradientEnd: DEFAULT_GRADIENT_END,
    gradientAngle: 0
  };
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex).replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255
  };
}

function rgbToHex(r, g, b) {
  const parts = [r, g, b].map((value) => Math.round(value * 255).toString(16).padStart(2, "0"));
  return `#${parts.join("").toUpperCase()}`;
}

function normalizeHex(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }
  return fallback || DEFAULT_FILL;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeBlendMode(value) {
  return BLEND_MODES.includes(value) ? value : "NORMAL";
}

function normalizePaintType(value) {
  return PAINT_TYPES.includes(value) ? value : "SOLID";
}

function normalizeNoiseType(value) {
  return ["MONOTONE", "DUOTONE", "MULTITONE"].includes(value) ? value : "MONOTONE";
}

function normalizeShapeEffectType(value) {
  return SHAPE_EFFECT_TYPES.includes(value) ? value : "RECTANGLE";
}

function normalizeOffsetJoin(value) {
  return OFFSET_JOINS.includes(value) ? value : "MITER";
}

function defaultEffectOpacity(type) {
  if (type === "innerShadow") return 24;
  if (type === "outerGlow") return 65;
  if (type === "innerGlow") return 55;
  if (type === "noise") return 22;
  if (type === "colorHalftone") return 45;
  if (type === "scribble") return 65;
  return 28;
}

function defaultEffectOffsetY(type) {
  if (type === "innerShadow") return 3;
  if (type === "outerGlow" || type === "innerGlow") return 0;
  return 8;
}

function defaultEffectRadius(type) {
  if (type === "layerBlur") return 8;
  if (type === "backgroundBlur") return 12;
  if (type === "innerShadow") return 8;
  if (type === "outerGlow") return 18;
  if (type === "innerGlow") return 14;
  if (type === "texture") return 4;
  if (type === "glass") return 8;
  if (type === "feather") return 8;
  if (type === "roundCorners") return 12;
  return 18;
}

function normalizeOptionalEnum(value, options) {
  if (value === "" || value === undefined || value === null) return "";
  return options.includes(value) ? value : "";
}

function normalizeDashPattern(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clampNumber(item, 0, 1000, 0)).filter((item) => item > 0);
  }

  if (typeof value === "string") {
    return value.split(/[,\s]+/).map((item) => clampNumber(item, 0, 1000, 0)).filter((item) => item > 0);
  }

  return [];
}

function getNodeBlendMode(node) {
  return "blendMode" in node ? normalizeBlendMode(node.blendMode) : "NORMAL";
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function effectName(type) {
  if (type === "dropShadow") return "Drop Shadow";
  if (type === "innerShadow") return "Inner Shadow";
  if (type === "outerGlow") return "Outer Glow";
  if (type === "innerGlow") return "Inner Glow";
  if (type === "layerBlur") return "Layer Blur";
  if (type === "backgroundBlur") return "Background Blur";
  if (type === "noise") return "Noise";
  if (type === "texture") return "Texture";
  if (type === "glass") return "Glass";
  if (type === "transform") return "Transform";
  if (type === "offsetPath") return "Offset Path";
  if (type === "roundCorners") return "Round Corners";
  if (type === "feather") return "Feather";
  if (type === "convertShape") return "Convert to Shape";
  if (type === "colorHalftone") return "Color Halftone";
  if (type === "scribble") return "Scribble";
  return titleCase(type);
}

function positiveModulo(value, size) {
  return ((value % size) + size) % size;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed || 1;
  return function () {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const rawRow = y * stride;
    const rgbaRow = y * width * 4;
    raw[rawRow] = 0;
    raw.set(rgba.subarray(rgbaRow, rgbaRow + width * 4), rawRow + 1);
  }

  const compressed = zlibStore(raw);
  const chunks = [
    pngChunk("IHDR", pngIhdr(width, height)),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0))
  ];
  return concatBytes([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])].concat(chunks));
}

function pngIhdr(width, height) {
  const bytes = new Uint8Array(13);
  writeUint32(bytes, 0, width);
  writeUint32(bytes, 4, height);
  bytes[8] = 8;
  bytes[9] = 6;
  bytes[10] = 0;
  bytes[11] = 0;
  bytes[12] = 0;
  return bytes;
}

function pngChunk(type, data) {
  const typeBytes = asciiBytes(type);
  const bytes = new Uint8Array(12 + data.length);
  writeUint32(bytes, 0, data.length);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  writeUint32(bytes, 8 + data.length, crc32(concatBytes([typeBytes, data])));
  return bytes;
}

function zlibStore(data) {
  const blocks = [];
  let offset = 0;
  while (offset < data.length) {
    const length = Math.min(65535, data.length - offset);
    const finalBlock = offset + length >= data.length;
    const block = new Uint8Array(5 + length);
    block[0] = finalBlock ? 1 : 0;
    block[1] = length & 255;
    block[2] = length >>> 8 & 255;
    const nlen = (~length) & 65535;
    block[3] = nlen & 255;
    block[4] = nlen >>> 8 & 255;
    block.set(data.subarray(offset, offset + length), 5);
    blocks.push(block);
    offset += length;
  }

  const adler = adler32(data);
  const trailer = new Uint8Array(4);
  writeUint32(trailer, 0, adler);
  return concatBytes([new Uint8Array([120, 1])].concat(blocks).concat([trailer]));
}

function asciiBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value >>> 24 & 255;
  bytes[offset + 1] = value >>> 16 & 255;
  bytes[offset + 2] = value >>> 8 & 255;
  bytes[offset + 3] = value & 255;
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (let index = 0; index < data.length; index++) {
    a = (a + data[index]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < data.length; index++) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xEDB88320 ^ crc >>> 1 : crc >>> 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

figma.showUI(__html__, { width: 360, height: 620, themeColors: true });

let availableFonts = [];

loadAvailableFonts();

figma.on("selectionchange", () => {
  sendSelectionState();
});

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "wrap-selection") {
      await wrapSelection();
      sendSelectionState();
    }

    if (message.type === "detach") {
      await detachAppearance();
      sendSelectionState();
    }

    if (message.type === "close-plugin") {
      figma.closePlugin();
    }

    if (message.type === "update-text") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base || base.type !== "TEXT") {
        figma.notify("This appearance stack is not a text object.");
        return;
      }
      await setTextContent(base, message.characters || "");
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-text-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base || base.type !== "TEXT") {
        figma.notify("This appearance stack is not a text object.");
        return;
      }
      await applyTextProperties(base, message.textProperties || {});
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-global") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const globalAppearance = normalizeGlobalAppearance(Object.assign({}, readGlobalAppearance(group), message.globalAppearance));
      writeGlobalAppearance(group, globalAppearance);
      applyGlobalAppearance(group, globalAppearance);
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-object-properties") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base) return notifySelectAppearance();
      applyObjectProperties(group, base, message.objectProperties || {});
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "export-print-package") {
      await exportPrintPackage(message.printSettings || {});
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "add-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      stack.push(createLayer(message.layerKind));
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "add-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      if (index >= 0) {
        if (message.effectKind === "transform" && stack[index].effects.some((effect) => effect.type === "transform")) {
          figma.notify("This stack already has a Transform effect.");
          sendSelectionState();
          return;
        }
        stack[index].effects.push(createEffect(message.effectKind));
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "update-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const layer = stack.find((item) => item.id === message.layerId);
      if (layer) {
        const effectIndex = layer.effects.findIndex((effect) => effect.id === message.effect.id);
        if (effectIndex >= 0) {
          layer.effects[effectIndex] = normalizeEffect(Object.assign({}, layer.effects[effectIndex], message.effect));
          await renderAppearance(group, stack);
        }
      }
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "remove-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const layer = stack.find((item) => item.id === message.layerId);
      if (layer) {
        layer.effects = layer.effects.filter((effect) => effect.id !== message.effectId);
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "update-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layer.id);
      if (index >= 0) {
        stack[index] = normalizeLayer(Object.assign({}, stack[index], message.layer));
        await renderAppearance(group, stack);
      }
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "remove-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group).filter((layer) => layer.id !== message.layerId);
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "clear-appearance") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      writeGlobalAppearance(group, createGlobalAppearance());
      await renderAppearance(group, []);
      sendSelectionState();
    }

    if (message.type === "copy-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      await figma.clientStorage.setAsync(STYLE_CLIPBOARD_KEY, {
        stack: readStack(group),
        globalAppearance: readGlobalAppearance(group)
      });
      figma.notify("Appearance copied.");
      sendSelectionState();
    }

    if (message.type === "paste-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = await figma.clientStorage.getAsync(STYLE_CLIPBOARD_KEY);
      if (!Array.isArray(stack)) {
        if (!stack || !Array.isArray(stack.stack)) {
          figma.notify("No copied appearance yet.");
          return;
        }
        writeGlobalAppearance(group, normalizeGlobalAppearance(stack.globalAppearance));
        await renderAppearance(group, stack.stack.map(cloneLayerForPaste));
      } else {
        writeGlobalAppearance(group, createGlobalAppearance());
        await renderAppearance(group, stack.map(cloneLayerForPaste));
      }
      figma.notify("Appearance pasted.");
      sendSelectionState();
    }

    if (message.type === "reduce-basic") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = reduceToBasic(readStack(group));
      writeGlobalAppearance(group, createGlobalAppearance());
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "duplicate-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      if (index >= 0) {
        stack.splice(index + 1, 0, normalizeLayer(Object.assign({}, stack[index], {
          id: createId(),
          name: `${stack[index].name} copy`
        })));
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "move-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      const next = index + message.direction;
      if (index >= 0 && next >= 0 && next < stack.length) {
        const [layer] = stack.splice(index, 1);
        stack.splice(next, 0, layer);
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "reorder-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const from = stack.findIndex((layer) => layer.id === message.layerId);
      const before = message.beforeLayerId ? stack.findIndex((layer) => layer.id === message.beforeLayerId) : -1;
      const after = message.afterLayerId ? stack.findIndex((layer) => layer.id === message.afterLayerId) : -1;
      if (from >= 0) {
        const layer = stack.splice(from, 1)[0];
        const adjustedAfter = after >= 0 && from < after ? after - 1 : after;
        const adjustedBefore = before >= 0 && from < before ? before - 1 : before;
        if (adjustedAfter >= 0) {
          stack.splice(adjustedAfter + 1, 0, layer);
        } else if (adjustedBefore >= 0) {
          stack.splice(adjustedBefore, 0, layer);
        } else {
          stack.push(layer);
        }
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }
  } catch (error) {
    figma.notify(error && error.message ? error.message : "Appearance Stack hit an error.");
  }
};

async function loadAvailableFonts() {
  if (typeof figma.listAvailableFontsAsync !== "function") {
    sendSelectionState();
    return;
  }

  try {
    const fonts = await figma.listAvailableFontsAsync();
    availableFonts = fonts.map((font) => {
      return {
        family: font.fontName.family,
        style: font.fontName.style
      };
    }).sort((a, b) => {
      const familySort = a.family.localeCompare(b.family);
      return familySort || a.style.localeCompare(b.style);
    });
  } catch (_error) {
    availableFonts = [];
  }
  sendSelectionState();
}

function sendSelectionState() {
  const selection = figma.currentPage.selection;
  const group = getActiveAppearanceGroup();
  const base = group ? findBase(group) : null;
  figma.ui.postMessage({
    type: "selection-state",
    hasSelection: selection.length > 0,
    selectedCount: selection.length,
    isAppearance: Boolean(group),
    groupName: group ? group.name : "",
    baseName: base ? base.name.replace(/\sbase$/, "") : "",
    baseType: base ? base.type : "",
    isTextBase: Boolean(base && base.type === "TEXT"),
    textContent: base && base.type === "TEXT" ? base.characters : "",
    textProperties: base && base.type === "TEXT" ? readTextProperties(base) : null,
    availableFonts,
    objectProperties: group && base ? readObjectProperties(group, base) : null,
    globalAppearance: group ? readGlobalAppearance(group) : createGlobalAppearance(),
    stack: group ? readStack(group) : []
  });
}

sendSelectionState();
