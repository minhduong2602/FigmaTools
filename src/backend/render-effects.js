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
  const warpEffect = firstVisibleEffect(layer, "warp");
  if (warpEffect) {
    const warped = applyWarpEffect(node, layer, warpEffect);
    if (warped) node = warped;
  }

  const offsetEffect = firstVisibleEffect(layer, "offsetPath");
  if (offsetEffect) {
    const offsetNode = applyOffsetPathEffect(node, layer, offsetEffect);
    if (offsetNode) node = offsetNode;
  }

  const roundEffect = firstVisibleEffect(layer, "roundCorners");
  if (roundEffect && "cornerRadius" in node) {
    node.cornerRadius = roundEffect.radius;
  }

  return node;
}

function applyOffsetPathEffect(node, layer, effect) {
  const amount = Number(effect.amount) || 0;
  if (amount === 0) return node;

  if (layer.type === "fill" && amount > 0 && "strokes" in node) {
    // Positive offset on fill: expand via outside stroke
    const paint = node.fills && node.fills.length ? clonePaint(node.fills[0]) : layerPaint(layer);
    node.strokes = [paint];
    if ("strokeWeight" in node) node.strokeWeight = amount * 2;
    if ("strokeAlign" in node) node.strokeAlign = "OUTSIDE";
    applyOffsetJoinStyle(node, effect);
    return node;
  }

  if (amount < 0) {
    // Negative offset: shrink width/height
    resizeNodeByOffset(node, amount);
    // Simulate join style via cornerRadius
    if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
      const absAmount = Math.abs(amount);
      if (effect.joinStyle === "ROUND") {
        // Round: set cornerRadius to |amount| to create natural inward rounding
        node.cornerRadius = absAmount;
      } else if (effect.joinStyle === "BEVEL") {
        // Bevel: approximate with a small cornerRadius (less than amount)
        node.cornerRadius = Math.round(absAmount * 0.4);
      } else {
        // MITER (default): keep existing cornerRadius, reduced by inset amount
        node.cornerRadius = Math.max(0, node.cornerRadius + amount);
      }
    }
    return node;
  }

  resizeNodeByOffset(node, amount);
  applyOffsetJoinStyle(node, effect);
  return node;
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
    let overlay = createLayerRenderNode(base, layer);
    overlay.name = `${layer.name} ${effect.name}`;
    overlay.visible = true;
    overlay.locked = false;
    overlay.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_RENDER);
    applyRasterOverlayAppearance(overlay, layer, effect);
    overlay = applyGeometryPipelineEffects(overlay, layer);
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
