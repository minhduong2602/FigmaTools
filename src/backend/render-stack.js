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
