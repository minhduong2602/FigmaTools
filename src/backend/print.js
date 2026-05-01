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
