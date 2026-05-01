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
  const stops = Array.isArray(layer.gradientStops) && layer.gradientStops.length ? layer.gradientStops : defaultGradientStops(layer.gradientStart, layer.gradientEnd);
  return {
    type: layer.paintType,
    gradientTransform: gradientTransform(angle),
    gradientStops: stops.map(function (stop) {
      return {
        position: clampNumber(stop.position, 0, 100, 0) / 100,
        color: Object.assign({}, hexToRgb(stop.color), { a: opacity })
      };
    }),
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
      gradientStops: stops.length ? stops.map(function (stop) {
        return {
          id: createId(),
          position: clampNumber(Number(stop.position) * 100, 0, 100, 0),
          color: gradientStopToHex(stop) || start
        };
      }) : defaultGradientStops(start, end),
      gradientAngle: 0
    };
  }

  const color = paintToHex(paint) || fallbackColor;
  return {
    paintType: "SOLID",
    color,
    gradientStart: color,
    gradientEnd: DEFAULT_GRADIENT_END,
    gradientStops: defaultGradientStops(color, DEFAULT_GRADIENT_END),
    gradientAngle: 0
  };
}
