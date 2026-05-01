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

  if (type === "warp") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Warp",
      warpStyle: "ARC",
      warpAxis: "HORIZONTAL",
      bend: 50,
      hDistort: 0,
      vDistort: 0,
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
    "scribble",
    "warp"
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
    warpStyle: normalizeWarpStyle(effect.warpStyle),
    warpAxis: normalizeWarpAxis(effect.warpAxis),
    bend: clampNumber(effect.bend, -100, 100, 50),
    hDistort: clampNumber(effect.hDistort, -100, 100, 0),
    vDistort: clampNumber(effect.vDistort, -100, 100, 0),
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
