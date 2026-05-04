const threeDPreviewRuntime = {
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  envTarget: null,
  orbitTargetX: 0,
  orbitTargetY: 0,
  orbitTargetZ: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragMode: "orbit",
  startRotationX: 0,
  startRotationY: 0,
  startRotationZ: 0,
  startQuaternion: null,
  dragStartVector: null,
  lightDragging: false,
  lightDragMode: "screen",
  lightStartX: 0,
  lightStartY: 0,
  lightStartZ: 0,
  lightScreenStartX: 0,
  lightScreenStartY: 0,
  lightDragPlane: null,
  lightDragPoint: null,
  lightMoveHandler: null,
  lightUpHandler: null,
  previewQueued: false,
  interactionMode: false,
  interactionTimer: 0
};

const THREE_D_EXPORT_MAX_DIMENSION = 3072;
const THREE_D_EXPORT_MAX_PIXELS = 6291456;
const THREE_D_LIGHT_SAFE_RANGE = 240;

window.addEventListener("appearance-3d-ready", function () {
  if (activeTab === "three-d") {
    render();
  }
});

function requestThreeDSource() {
  if (state.selectedCount < 1) {
    threeDState.requestPending = false;
    threeDState.source = null;
    return;
  }
  if (threeDState.requestPending) return;
  threeDState.requestPending = true;
  post({ type: "request-3d-source" });
}

function renderThreeDPanel() {
  closeModalIfAppearanceOnly();
  const hasSelection = state.selectedCount > 0;
  threeDRefreshBtn.disabled = !hasSelection;
  threeDExportBtn.disabled = !threeDState.source;
  if (!hasSelection) {
    threeDState.source = null;
    statusEl.textContent = "Select one object for 3D.";
  } else if (threeDState.requestPending) {
    statusEl.textContent = "Reading selected object for 3D";
  } else if (threeDState.source) {
    statusEl.textContent = threeDState.source.name + " - " + displayThreeDMode(threeDState.mode);
  } else if (threeDState.error) {
    statusEl.textContent = threeDState.error;
  } else {
    statusEl.textContent = "Select one grouped object, or multiple drawable objects.";
  }
  contentEl.innerHTML = threeDPanelTemplate();
  bindEvents();
  bindThreeDPanel();
  renderModal();
  ensureThreeDPreview();
}

function threeDPanelTemplate() {
  const source = threeDState.source;
  const settings = threeDState.settings;
  const actionLabel = source && source.renderNodeId ? "Update Render" : "Place Render";
  const relinkDisabled = !(source && source.fromRender && source.sourceNodeId);
  const stageStyle = threeDStageStyle(source, false);
  const sourceSummary = source
    ? escapeHtml(source.nodeType + " - " + Math.round(source.width) + " x " + Math.round(source.height))
    : (threeDState.requestPending ? "Loading source" : (threeDState.error ? escapeHtml(threeDState.error) : "Select one object and refresh."));
  return [
    '<div class="three-d-layout three-d-layout-compact">',
    '<section class="three-panel-card three-d-preview-card three-panel-surface three-d-preview-sticky-top">',
    '<div class="three-preview-meta">',
    '<div class="three-panel-heading">3D &amp; Materials</div>',
    '<span class="muted three-preview-summary">' + sourceSummary + '</span>',
    '</div>',
    '<div class="three-preview-grid">',
    '<div class="three-d-preview-stage three-d-preview-stage-fixed">',
    '<canvas id="three-d-canvas"></canvas>',
    '<img id="three-d-preview-image" class="three-d-preview-image" alt="">',
    '<div id="three-d-light-gizmos" class="three-d-light-gizmos"></div>',
    '<div id="three-d-overlay" class="three-d-overlay"></div>',
    '</div>',
    '<div class="three-d-preview-actions three-d-panel-actions three-preview-side-actions">',
    '<button class="command-btn three-side-btn" id="three-d-fit-frame"' + (source ? '' : ' disabled') + '>Fit</button>',
    '<button class="command-btn three-side-btn" id="three-d-open-preview"' + (source ? '' : ' disabled') + '>Focus</button>',
    '<button class="command-btn three-side-btn three-side-btn-primary" id="three-d-inline-export"' + (source ? '' : ' disabled') + '>' + actionLabel + '</button>',
    '</div>',
    '</div>',
    '<div class="three-preview-tip">Drag rotates freely. Shift + drag rolls Z. Drag the light source directly in the preview. Wheel over the source adjusts distance.</div>',
    '</section>',
    '<section class="three-panel-card three-d-sections-card three-panel-surface">',
    '<div class="three-section-tabs three-section-tabs-four">',
    threeSectionButton('effect', 'Object'),
    threeSectionButton('material', 'Materials'),
    threeSectionButton('camera', 'Lighting'),
    threeSectionButton('post', 'Post'),
    '</div>',
    '<div class="three-section-body three-section-body-padded">',
    threeSectionContent(settings, source, relinkDisabled),
    '</div>',
    '</section>',
    '</div>'
  ].join('');
}

function threeDStageStyle(source, large) {
  if (!source) {
    return "min-height:" + (large ? 280 : 180) + "px;";
  }
  const width = source && source.width ? Number(source.width) : 240;
  const height = source && source.height ? Number(source.height) : 180;
  const ratio = Math.max(0.35, Math.min(3.5, width / Math.max(1, height)));
  const minHeight = large ? 340 : 160;
  const maxHeight = large ? 560 : 220;
  const idealHeight = Math.round((large ? 420 : 190) / Math.max(0.75, ratio));
  const boundedHeight = Math.max(minHeight, Math.min(maxHeight, idealHeight));
  return "aspect-ratio:" + ratio + ";min-height:" + boundedHeight + "px;";
}

function configureThreeDRenderer(T, renderer, useDevicePixelRatio, settings) {
  if (!renderer) return;
  renderer.setPixelRatio(useDevicePixelRatio ? Math.min(window.devicePixelRatio || 1, 1.25) : 1);
  if ("outputColorSpace" in renderer && T.SRGBColorSpace) {
    renderer.outputColorSpace = T.SRGBColorSpace;
  }
  if ("toneMapping" in renderer && T.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = T.ACESFilmicToneMapping;
  }
  if ("toneMappingExposure" in renderer) {
    renderer.toneMappingExposure = Math.max(0.05, Number(settings && settings.exposure !== undefined ? settings.exposure : 1) || 1);
  }
}

function configureThreeDPreviewRenderer(T, renderer, settings, fastMode) {
  if (!renderer) return;
  if (fastMode) {
    renderer.setPixelRatio(0.75);
  } else {
    configureThreeDRenderer(T, renderer, true, settings);
  }
}

function threeModeButton(mode, label) {
  const active = threeDState.mode === mode;
  let icon = '';
  if (mode === 'extrude') icon = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" style="margin-bottom:4px;"><path d="M4 4h6v6H4z"/><path d="M14 14h6v6h-6z"/><path d="M10 10l4 4"/></svg>';
  if (mode === 'revolve') icon = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" style="margin-bottom:4px;"><path d="M12 2v20"/><path d="M12 12c4 0 8-3 8-7s-4-7-8-7"/></svg>';
  if (mode === 'inflate') icon = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" style="margin-bottom:4px;"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 8 8"/></svg>';

  return '<button class="three-mode-btn' + (active ? ' active' : '') + '" data-three-mode="' + mode + '" style="' +
    'background: ' + (active ? '#444' : '#2a2a2a') + ';' +
    'border: 1px solid ' + (active ? '#1473E6' : '#1a1a1a') + ';' +
    'border-radius: 4px;' +
    'color: ' + (active ? '#fff' : '#aaa') + ';' +
    'display: flex;' +
    'flex-direction: column;' +
    'align-items: center;' +
    'justify-content: center;' +
    'padding: 8px 0;' +
    'min-height: 52px;' +
    'cursor: pointer;' +
    'transition: all 0.15s ease;' +
    '">' +
    icon +
    '<span style="font-size: 10px; font-weight: ' + (active ? '600' : '400') + '">' + label + '</span>' +
    '</button>';
}

function threeSectionButton(section, label) {
  const active = threeDState.section === section;
  return '<button class="three-section-btn' + (active ? ' active' : '') + '" data-three-section="' + section + '">' + label + '</button>';
}

function threeLightTypeButton(type, label) {
  const active = (threeDState.settings.lightType || "directional") === type;
  return '<button class="three-light-type-btn' + (active ? ' active' : '') + '" data-three-light-type="' + type + '">' + label + '</button>';
}

function threeSectionContent(settings, source, relinkDisabled) {
  if (threeDState.section === "camera") {
    return [
      '<div class="three-panel-block">',
      '<div class="three-block-heading">Environment & Lighting</div>',
      '<div class="three-grid two-col-grid">',
      '<div class="field"><label>Lighting</label><select data-three-field="lightingPreset">' + enumOptions(settings.lightingPreset, [
        ["studio", "Studio"],
        ["metal_booth", "Metal Booth"],
        ["glass_clean", "Glass Clean"],
        ["sunset", "Sunset"],
        ["night_neon", "Night Neon"]
      ]) + '</select></div>',
      '<div class="field"><label>Environment</label><select data-three-field="environmentPreset">' + enumOptions(settings.environmentPreset, [
        ["studio_soft", "Studio Soft"],
        ["chrome_booth", "Chrome Booth"],
        ["frosted_room", "Frosted Room"],
        ["sunset_band", "Sunset Band"],
        ["neon_tunnel", "Neon Tunnel"],
        ["holo_prism", "Holo Prism"]
      ]) + '</select></div>',
      '</div>',
      '<div class="three-grid two-col-grid">',
      threeNumberField("ambient", "Ambient Light", settings.ambient, undefined, undefined, "0.05"),
      threeNumberField("environmentStrength", "Env Intensity", settings.environmentStrength, undefined, undefined, "0.05"),
      '</div>',
      '<div class="three-block-subhead">Main Light</div>',
      '<div class="three-light-type-row">',
      threeLightTypeButton("point", "Point"),
      threeLightTypeButton("directional", "Directional"),
      threeLightTypeButton("spot", "Spot"),
      '</div>',
      '<div class="three-grid two-col-grid">',
      threeNumberField("directional", "Intensity", settings.directional, undefined, undefined, "0.05"),
      '<div></div>',
      '</div>',
      '<div class="three-grid two-col-grid">',
      threeSliderField("lightSoftness", "Softness", settings.lightSoftness, "0", "100", "1"),
      (settings.lightType === "spot"
        ? threeSliderField("lightConeAngle", "Cone Angle", settings.lightConeAngle, "5", "90", "1")
        : '<div></div>'),
      '</div>',
      '<div class="three-block-subhead">Light Direction</div>',
      '<div class="three-grid two-col-grid">',
      threeNumberField("lightX", "X", settings.lightX, undefined, undefined, "0.1"),
      threeNumberField("lightY", "Y", settings.lightY, undefined, undefined, "0.1"),
      threeNumberField("lightZ", "Z", settings.lightZ, undefined, undefined, "0.1"),
      '<div></div>',
      '</div>',
      '</div>'
    ].join("");
  }

  if (threeDState.section === "material") {
    return [
      '<div class="three-panel-block">',
      '<div class="three-grid one-col-grid">',
      '<div class="field"><label>Material Preset</label><select data-three-field="materialPreset">' + enumOptions(settings.materialPreset, [
        ["plastic", "Plastic"],
        ["matte", "Matte"],
        ["metal", "Metal"],
        ["glass", "Glass"],
        ["frosted_glass", "Frosted Glass"],
        ["chrome", "Chrome"],
        ["iridescent", "Iridescent"],
        ["holographic", "Holographic"],
        ["neon", "Neon"],
        ["clay", "Clay"]
      ]) + '</select></div>',
      '</div>',
      '<div class="three-grid two-col-grid three-color-pair">',
      threeColorField("color", "Base Color", settings.color, settings.useSourceColor),
      threeColorField("emissive", "Emissive", settings.emissive, false),
      '</div>',
      '<div class="three-toggle-row three-toggle-row-spaced">',
      '<label class="check-row"><input type="checkbox" data-three-field="useSourceColor"' + (settings.useSourceColor ? " checked" : "") + '> Source Color</label>',
      '<div></div>',
      '</div>',
      '<div class="three-grid two-col-grid">',
      threeSliderField("roughness", "Roughness", settings.roughness, "0", "1", "0.05"),
      threeSliderField("metalness", "Metallic", settings.metalness, "0", "1", "0.05"),
      threeSliderField("opacity", "Opacity", settings.opacity, "0.05", "1", "0.05"),
      '<div></div>',
      '</div>',
      '<details class="three-advanced-toggle"><summary>Advanced Properties</summary>',
      '<div class="three-grid two-col-grid three-advanced-grid">',
      threeSliderField("clearcoat", "Clearcoat", settings.clearcoat, "0", "1", "0.05"),
      threeSliderField("emissiveIntensity", "Glow", settings.emissiveIntensity, "0", "4", "0.05"),
      threeNumberField("transmission", "Transmit", settings.transmission, "0", "1", "0.05"),
      threeNumberField("thickness", "Thickness", settings.thickness, "0", "5", "0.05"),
      threeNumberField("iridescence", "Iridescence", settings.iridescence, "0", "1", "0.05"),
      threeNumberField("iridescenceIOR", "Iri IOR", settings.iridescenceIOR, "1", "2.5", "0.05"),
      threeNumberField("sheen", "Sheen", settings.sheen, "0", "1", "0.05"),
      threeNumberField("sheenRoughness", "Sheen Rough", settings.sheenRoughness, "0", "1", "0.05"),
      '</div></details>',
      '<div class="three-toggle-row three-toggle-row-spaced">',
      '<label class="check-row"><input type="checkbox" data-three-field="flatShading"' + (settings.flatShading ? " checked" : "") + '> Flat Shading</label>',
      '<div></div>',
      '</div>',
      '</div>'
    ].join("");
  }

  if (threeDState.section === "post") {
    return [
      '<div class="three-panel-block">',
      '<div class="three-block-heading">Post-Processing & Export</div>',
      '<div class="three-grid two-col-grid">',
      threeColorField("background", "Bg Color", settings.background, settings.transparentBackground),
      threeNumberField("exportScale", "Resolution", settings.exportScale, "1", "4", "1"),
      '</div>',
      '<div class="three-block-subhead">Look</div>',
      '<div class="three-grid two-col-grid">',
      threeSliderField("exposure", "Exposure", settings.exposure, "0.4", "2.4", "0.05"),
      threeSliderField("contrast", "Contrast", settings.contrast, "-0.6", "0.6", "0.05"),
      threeSliderField("grainAmount", "Film Grain", settings.grainAmount, "0", "0.18", "0.01"),
      threeSliderField("chromaticAberration", "Chromatic", settings.chromaticAberration, "0", "8", "0.25"),
      '</div>',
      '<div class="three-block-subhead">Depth</div>',
      '<div class="three-toggle-row three-toggle-row-spaced">',
      '<label class="check-row"><input type="checkbox" data-three-field="contactShadow"' + (settings.contactShadow ? " checked" : "") + '> Contact Shadow</label>',
      '</div>',
      '<div class="three-grid two-col-grid' + (settings.contactShadow ? "" : " is-disabled") + '">',
      threeSliderField("contactShadowOpacity", "Shadow Opacity", settings.contactShadowOpacity, "0", "1", "0.05"),
      threeSliderField("contactShadowSoftness", "Shadow Soft", settings.contactShadowSoftness, "0.4", "2.5", "0.05"),
      threeSliderField("contactShadowScale", "Shadow Scale", settings.contactShadowScale, "0.6", "2", "0.05"),
      '<div></div>',
      '</div>',
      '<div class="three-toggle-row three-toggle-row-spaced">',
      '<label class="check-row"><input type="checkbox" data-three-field="transparentBackground"' + (settings.transparentBackground ? " checked" : "") + '> Transparent</label>',
      '<label class="check-row"><input type="checkbox" data-three-field="bloomEnabled"' + (settings.bloomEnabled ? " checked" : "") + '> Bloom</label>',
      '<label class="check-row"><input type="checkbox" data-three-field="bloomSeparate"' + (settings.bloomSeparate ? " checked" : "") + (settings.bloomEnabled ? "" : " disabled") + '> Split Flare</label>',
      '</div>',
      '<div class="three-grid two-col-grid' + (settings.bloomEnabled ? '' : ' is-disabled') + '">',
      threeSliderField("bloomStrength", "Strength", settings.bloomStrength, "0", "3", "0.05"),
      threeSliderField("bloomRadius", "Radius", settings.bloomRadius, "0", "1", "0.05"),
      threeSliderField("bloomThreshold", "Threshold", settings.bloomThreshold, "0", "1", "0.05"),
      threeSliderField("flareOpacity", "Flare Opacity", settings.flareOpacity, "0", "100", "1"),
      '</div>',
      '<div class="three-action-stack three-action-stack-spaced">',
      '<button class="command-btn three-inline-btn" id="three-d-download-obj"' + (source ? "" : " disabled") + '>Download OBJ</button>',
      '<button class="command-btn three-inline-btn" id="three-d-relink"' + (relinkDisabled ? " disabled" : "") + '>Relink Original Layer</button>',
      '</div>',
      '</div>'
    ].join("");
  }

  return [
    '<div class="three-panel-block">',
    '<div class="three-block-heading">Transform</div>',
    '<div class="three-grid two-col-grid">',
    '<div class="field"><label>View Preset</label><select data-three-field="rotationPreset">' + enumOptions(settings.rotationPreset || "custom", [
      ["custom", "Custom Rotation"],
      ["front", "Front"],
      ["back", "Back"],
      ["left", "Left"],
      ["right", "Right"],
      ["top", "Top"],
      ["bottom", "Bottom"],
      ["offaxis_front", "Off-Axis Front"],
      ["offaxis_back", "Off-Axis Back"],
      ["offaxis_left", "Off-Axis Left"],
      ["offaxis_right", "Off-Axis Right"],
      ["offaxis_top", "Off-Axis Top"],
      ["offaxis_bottom", "Off-Axis Bottom"],
      ["isometric_left", "Isometric Left"],
      ["isometric_right", "Isometric Right"],
      ["isometric_top", "Isometric Top"],
      ["isometric_bottom", "Isometric Bottom"]
    ]) + '</select></div>',
    '<div></div>',
    '</div>',
    '<div class="three-grid two-col-grid">',
    threeNumberField("rotationX", "X", settings.rotationX),
    threeNumberField("rotationY", "Y", settings.rotationY),
    threeNumberField("rotationZ", "Z", settings.rotationZ),
    threeNumberField("zoom", "Zoom", settings.zoom, "120", "1200", "1"),
    threeNumberField("offsetX", "Offset X", settings.offsetX),
    threeNumberField("offsetY", "Offset Y", settings.offsetY),
    threeNumberField("offsetZ", "Offset Z", settings.offsetZ),
    threeNumberField("framePadding", "Padding", settings.framePadding, "0", "60", "1"),
    '</div>',
    '<div class="mini-btn-row three-inline-actions-row">',
    '<button type="button" class="mini-btn three-inline-btn" id="three-d-reset-orbit"' + (source ? "" : " disabled") + '>Reset View</button>',
    '<button type="button" class="mini-btn three-inline-btn" id="three-d-refresh-inline"' + (source ? "" : " disabled") + '>Refresh Src</button>',
    '</div>',
    '<div class="three-block-heading three-block-heading-divided">Object Type</div>',
    '<div class="three-mode-row three-mode-row-spaced">',
    threeModeButton("extrude", "Extrude"),
    threeModeButton("revolve", "Revolve"),
    threeModeButton("inflate", "Inflate"),
    '</div>',
    threeModeFields(settings),
    '</div>'
  ].join("");
}

function threeModeFields(settings) {
  if (threeDState.mode === "revolve") {
    return [
      '<div class="three-block-heading three-block-heading-divided">Shape Properties</div>',
      '<div class="three-grid two-col-grid">',
      threeSliderField("revolveAngle", "Angle", settings.revolveAngle, "1", "360", "1"),
      threeSliderField("revolveSegments", "Segments", settings.revolveSegments, "8", "160", "1"),
      '</div>',
      '<div class="three-grid two-col-grid three-grid-top-gap">',
      '<div class="field"><label>Axis</label><select data-three-field="revolveAxis">' + enumOptions(settings.revolveAxis, [
        ["VERTICAL", "Vertical"],
        ["HORIZONTAL", "Horizontal"]
      ]) + '</select></div>',
      '<div class="field"><label>Anchor</label><select data-three-field="revolveAnchor">' + enumOptions(settings.revolveAnchor, [
        ["MIN", "Min"],
        ["CENTER", "Center"],
        ["MAX", "Max"]
      ]) + '</select></div>',
      '</div>',
      '<div class="three-toggle-row three-grid-top-gap">',
      '<label class="check-row"><input type="checkbox" data-three-field="revolveFlip"' + (settings.revolveFlip ? " checked" : "") + '> Flip Profile</label>',
      '</div>'
    ].join("");
  }

  if (threeDState.mode === "inflate") {
    return [
      '<div class="three-block-heading three-block-heading-divided">Shape Properties</div>',
      '<div class="three-grid two-col-grid">',
      threeSliderField("inflateAmount", "Amount", settings.inflateAmount, "1", "100", "1"),
      threeSliderField("bevelSegments", "Segments", settings.bevelSegments, "1", "16", "1"),
      '</div>'
    ].join("");
  }

  return [
    '<div class="three-block-heading three-block-heading-divided">Shape Properties</div>',
    '<div class="three-grid two-col-grid">',
    threeSliderField("depth", "Depth", settings.depth, "1", "400", "1"),
    '<div></div>',
    '</div>',
    '<div class="three-block-heading three-block-heading-spaced">Bevel</div>',
    '<div class="three-grid two-col-grid">',
    threeSliderField("bevelSize", "Size", settings.bevelSize, "0", "80", "0.5"),
    threeSliderField("bevelThickness", "Depth", settings.bevelThickness, "0", "80", "0.5"),
    threeSliderField("bevelSegments", "Segments", settings.bevelSegments, "0", "16", "1"),
    threeSliderField("bevelOffset", "Offset", settings.bevelOffset, "-40", "40", "0.5"),
    '</div>',
    '<div class="field three-grid-top-gap"><label>Bevel Profile</label><select data-three-field="bevelProfile">' + enumOptions(settings.bevelProfile, [
      ["flat", "Flat"],
      ["round", "Round"],
      ["soft_round", "Soft Round"],
      ["chisel", "Chisel"],
      ["slope", "Slope"]
    ]) + '</select></div>'
  ].join("");
}

function threeNumberField(field, label, value, min, max, step) {
  return '<div class="field three-input-compact three-field-row">' +
    '<label class="three-field-label">' + label + '</label>' +
    '<input type="number" data-three-field="' + field + '" value="' + value + '"' +
    (min !== undefined ? ' min="' + min + '"' : '') +
    (max !== undefined ? ' max="' + max + '"' : '') +
    (step !== undefined ? ' step="' + step + '"' : '') +
    ' class="three-number-input">' +
    '</div>';
}

function threeSliderField(field, label, value, min, max, step) {
  return '<div class="three-slider-field three-field-block">' +
    '<div class="three-slider-head">' +
    '<label class="three-field-label">' + label + '</label>' +
    '<span class="three-slider-value" data-three-value="' + field + '">' + formatThreeDFieldValue(field, value) + '</span>' +
    '</div>' +
    '<input type="range" data-three-field="' + field + '" value="' + value + '"' +
    (min !== undefined ? ' min="' + min + '"' : '') +
    (max !== undefined ? ' max="' + max + '"' : '') +
    (step !== undefined ? ' step="' + step + '"' : '') +
    ' class="three-slider-input">' +
    '</div>';
}

function threeColorField(field, label, value, disabled) {
  return '<div class="field three-color-field">' +
    '<label class="three-field-label">' + label + '</label>' +
    '<div class="three-color-chip">' +
    '<input type="color" data-three-field="' + field + '" value="' + value + '"' + (disabled ? ' disabled' : '') + ' class="three-color-input">' +
    '<span class="three-color-readout">' + escapeHtml(String(value).toUpperCase()) + '</span>' +
    '</div>' +
    '</div>';
}

function bindThreeDPanel() {
  contentEl.querySelectorAll("[data-three-mode]").forEach(function (button) {
    button.onclick = function () {
      threeDState.mode = button.dataset.threeMode;
      render();
    };
  });

  contentEl.querySelectorAll("[data-three-section]").forEach(function (button) {
    button.onclick = function () {
      threeDState.section = button.dataset.threeSection;
      render();
    };
  });

  contentEl.querySelectorAll("[data-three-light-type]").forEach(function (button) {
    button.onclick = function () {
      if (threeDState.settings.lightType === button.dataset.threeLightType) return;
      threeDState.settings.lightType = button.dataset.threeLightType;
      render();
      scheduleThreeDPreview();
    };
  });

  contentEl.querySelectorAll("[data-three-field]").forEach(function (input) {
    input.oninput = function () {
      if (input.type === "range") {
        beginThreeDInteraction();
        var shouldRenderUi = updateThreeDSetting(input);
        syncThreeDFieldInputs([input.dataset.threeField]);
        if (shouldRenderUi) {
          render();
          return;
        }
        scheduleThreeDPreview();
        return;
      }
      if (input.type === "number") {
        updateThreeDSetting(input);
        syncThreeDFieldInputs([input.dataset.threeField]);
        return;
      }
      if (input.type === "color") {
        beginThreeDInteraction();
      }
      var shouldRenderUi = updateThreeDSetting(input);
      syncThreeDFieldInputs([input.dataset.threeField]);
      if (shouldRenderUi) {
        render();
        return;
      }
      scheduleThreeDPreview();
    };
    input.onchange = function () {
      var shouldRenderUi = updateThreeDSetting(input);
      syncThreeDFieldInputs([input.dataset.threeField]);
      if (shouldRenderUi) {
        render();
        return;
      }
      endThreeDInteraction();
      scheduleThreeDPreview();
    };
    input.onblur = function () {
      if (input.type === "number") {
        endThreeDInteraction();
        scheduleThreeDPreview();
      }
    };
  });

  const inlineExport = document.getElementById("three-d-inline-export");
  if (inlineExport) {
    inlineExport.onclick = function () {
      exportThreeDRender();
    };
  }

  const previewButton = document.getElementById("three-d-open-preview");
  if (previewButton) {
    previewButton.onclick = function () {
      openThreeDPreviewModal();
    };
  }

  const refreshInlineButton = document.getElementById("three-d-refresh-inline");
  if (refreshInlineButton) {
    refreshInlineButton.onclick = function () {
      requestThreeDSource();
    };
  }

  const relinkButton = document.getElementById("three-d-relink");
  if (relinkButton) {
    relinkButton.onclick = function () {
      relinkThreeDOriginal();
    };
  }

  const objButton = document.getElementById("three-d-download-obj");
  if (objButton) {
    objButton.onclick = function () {
      exportThreeDObjectAsObj();
    };
  }

  const fitButton = document.getElementById("three-d-fit-frame");
  if (fitButton) {
    fitButton.onclick = function () {
      fitThreeDFrame();
    };
  }

  const resetButton = document.getElementById("three-d-reset-orbit");
  if (resetButton) {
    resetButton.onclick = function () {
      resetThreeDOrbit();
    };
  }
}

function beginThreeDInteraction() {
  threeDPreviewRuntime.interactionMode = true;
  if (threeDPreviewRuntime.interactionTimer) {
    window.clearTimeout(threeDPreviewRuntime.interactionTimer);
    threeDPreviewRuntime.interactionTimer = 0;
  }
}

function endThreeDInteraction() {
  if (threeDPreviewRuntime.interactionTimer) {
    window.clearTimeout(threeDPreviewRuntime.interactionTimer);
  }
  threeDPreviewRuntime.interactionTimer = window.setTimeout(function () {
    threeDPreviewRuntime.interactionMode = false;
    threeDPreviewRuntime.interactionTimer = 0;
    scheduleThreeDPreview();
  }, 120);
}

function updateThreeDSetting(input) {
  const key = input.dataset.threeField;
  if (!key) return false;
  if (key === "rotationPreset") {
    applyThreeDRotationPreset(input.value);
    return false;
  }
  if (key === "lightingPreset") {
    threeDState.settings.lightingPreset = input.value;
    applyThreeDLightingPreset(input.value);
    syncThreeDFieldInputs(["ambient", "directional", "lightX", "lightY", "lightZ", "background"]);
    return false;
  }
  if (key === "materialPreset") {
    threeDState.settings.materialPreset = input.value;
    applyThreeDMaterialPreset(input.value);
    syncThreeDFieldInputs(["roughness", "metalness", "clearcoat", "transmission", "thickness", "opacity", "emissive", "emissiveIntensity", "flatShading", "iridescence", "iridescenceIOR", "sheen", "sheenRoughness"]);
    return false;
  }
  if (input.type === "checkbox") {
    threeDState.settings[key] = input.checked;
    return key === "bloomEnabled" || key === "contactShadow" || key === "useSourceColor";
  }
  if (input.type === "number" || input.type === "range") {
    threeDState.settings[key] = input.value === "" ? 0 : Number(input.value);
    if (key === "rotationX" || key === "rotationY" || key === "rotationZ") {
      setThreeDRotationPresetCustom();
      updateThreeDQuaternionFromEuler();
    }
    return false;
  }
  threeDState.settings[key] = input.value;
  return false;
}

function relinkThreeDOriginal() {
  const source = threeDState.source;
  if (!source || !source.sourceNodeId) return;
  threeDState.requestPending = true;
  post({
    type: "request-3d-source-by-id",
    nodeId: source.sourceNodeId,
    renderNodeId: source.renderNodeId || ""
  });
}

function fitThreeDFrame() {
  const source = threeDState.source;
  const settings = threeDState.settings;
  const aspect = source && source.width && source.height ? Number(source.width) / Math.max(1, Number(source.height)) : 1;
  settings.offsetX = 0;
  settings.offsetY = 0;
  settings.offsetZ = 0;
  settings.framePadding = 18;
  settings.zoom = Math.round(aspect > 1.3 ? 420 : 470);
  syncThreeDFieldInputs(["offsetX", "offsetY", "offsetZ", "framePadding", "zoom"]);
  ensureThreeDPreview();
}

function resetThreeDOrbit() {
  const settings = threeDState.settings;
  settings.rotationPreset = "custom";
  settings.rotationX = 32;
  settings.rotationY = -28;
  settings.rotationZ = 0;
  updateThreeDQuaternionFromEuler();
  syncThreeDFieldInputs(["rotationPreset", "rotationX", "rotationY", "rotationZ"]);
  scheduleThreeDPreview();
}

function setThreeDRotationPresetCustom() {
  if (threeDState.settings.rotationPreset === "custom") return;
  threeDState.settings.rotationPreset = "custom";
  syncThreeDFieldInputs(["rotationPreset"]);
}

function applyThreeDRotationPreset(preset) {
  const settings = threeDState.settings;
  const map = {
    custom: { x: settings.rotationX, y: settings.rotationY, z: settings.rotationZ },
    front: { x: 0, y: 0, z: 0 },
    back: { x: 0, y: 180, z: 0 },
    left: { x: 0, y: -90, z: 0 },
    right: { x: 0, y: 90, z: 0 },
    top: { x: -90, y: 0, z: 0 },
    bottom: { x: 90, y: 0, z: 0 },
    offaxis_front: { x: 18, y: -18, z: 0 },
    offaxis_back: { x: 18, y: 162, z: 0 },
    offaxis_left: { x: 18, y: -108, z: 0 },
    offaxis_right: { x: 18, y: 72, z: 0 },
    offaxis_top: { x: -62, y: 24, z: 0 },
    offaxis_bottom: { x: 62, y: -24, z: 0 },
    isometric_left: { x: -35.264, y: -45, z: 0 },
    isometric_right: { x: -35.264, y: 45, z: 0 },
    isometric_top: { x: -54.736, y: 45, z: 0 },
    isometric_bottom: { x: 54.736, y: -45, z: 0 }
  };
  const next = map[preset] || map.custom;
  settings.rotationPreset = preset;
  settings.rotationX = next.x;
  settings.rotationY = next.y;
  settings.rotationZ = next.z;
  updateThreeDQuaternionFromEuler();
  syncThreeDFieldInputs(["rotationPreset", "rotationX", "rotationY", "rotationZ"]);
  scheduleThreeDPreview();
}

function normalizeThreeDAngle(value) {
  let next = Number(value) || 0;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return next;
}

function createThreeDQuaternion(x, y, z, w) {
  return {
    x: Number(x) || 0,
    y: Number(y) || 0,
    z: Number(z) || 0,
    w: Number(w) || 1
  };
}

function normalizeThreeDQuaternion(quaternion) {
  const q = quaternion || createThreeDQuaternion(0, 0, 0, 1);
  const length = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  return createThreeDQuaternion(q.x / length, q.y / length, q.z / length, q.w / length);
}

function ensureThreeDRotationQuaternion() {
  const settings = threeDState.settings;
  const q = settings.rotationQuaternion;
  if (q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w)) {
    settings.rotationQuaternion = normalizeThreeDQuaternion(q);
    return settings.rotationQuaternion;
  }
  updateThreeDQuaternionFromEuler();
  return settings.rotationQuaternion;
}

function updateThreeDQuaternionFromEuler() {
  const settings = threeDState.settings;
  const x = degToRad(settings.rotationX || 0) * 0.5;
  const y = degToRad(settings.rotationY || 0) * 0.5;
  const z = degToRad(settings.rotationZ || 0) * 0.5;
  const sx = Math.sin(x);
  const cx = Math.cos(x);
  const sy = Math.sin(y);
  const cy = Math.cos(y);
  const sz = Math.sin(z);
  const cz = Math.cos(z);
  settings.rotationQuaternion = normalizeThreeDQuaternion({
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz
  });
}

function updateThreeDEulerFromQuaternion(quaternion) {
  const q = normalizeThreeDQuaternion(quaternion);
  const sinrCosp = 2 * (q.w * q.x + q.y * q.z);
  const cosrCosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const rotX = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const rotY = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (q.w * q.z + q.x * q.y);
  const cosyCosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const rotZ = Math.atan2(sinyCosp, cosyCosp);
  threeDState.settings.rotationX = normalizeThreeDAngle(radToDeg(rotX));
  threeDState.settings.rotationY = normalizeThreeDAngle(radToDeg(rotY));
  threeDState.settings.rotationZ = normalizeThreeDAngle(radToDeg(rotZ));
}

function degToRad(value) {
  return (Number(value) || 0) * Math.PI / 180;
}

function radToDeg(value) {
  return (Number(value) || 0) * 180 / Math.PI;
}

function multiplyThreeDQuaternions(a, b) {
  return normalizeThreeDQuaternion({
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  });
}

function screenToArcballVector(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  const center = getThreeDArcballCenter(rect, canvas);
  const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.42);
  const x = (clientX - center.x) / radius;
  const y = -(clientY - center.y) / radius;
  const d = x * x + y * y;
  if (d <= 1) {
    const z = Math.sqrt(1 - d);
    return normalizeThreeDVector({ x: x, y: y, z: z });
  }
  const scale = 1 / Math.sqrt(d);
  return normalizeThreeDVector({ x: x * scale, y: y * scale, z: 0 });
}

function getThreeDArcballCenter(rect, canvas) {
  const runtime = threeDPreviewRuntime;
  if (runtime.camera && runtime.root && runtime.orbitTargetX !== undefined) {
    const lib = threeDLib();
    if (lib && lib.THREE) {
      const T = lib.THREE;
      const projected = new T.Vector3(runtime.orbitTargetX, runtime.orbitTargetY, runtime.orbitTargetZ);
      projected.project(runtime.camera);
      return {
        x: rect.left + ((projected.x + 1) * 0.5) * rect.width,
        y: rect.top + ((1 - projected.y) * 0.5) * rect.height
      };
    }
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function normalizeThreeDVector(vector) {
  const x = Number(vector.x) || 0;
  const y = Number(vector.y) || 0;
  const z = Number(vector.z) || 0;
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function dotThreeDVector(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossThreeDVector(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function quatFromTwoThreeDVectors(v1, v2) {
  const start = normalizeThreeDVector(v1);
  const end = normalizeThreeDVector(v2);
  const dot = clampThreeDValue(dotThreeDVector(start, end), -1, 1);
  if (dot > 0.999999) {
    return createThreeDQuaternion(0, 0, 0, 1);
  }
  if (dot < -0.999999) {
    const axis = Math.abs(start.x) < 0.9 ? normalizeThreeDVector({ x: 1, y: 0, z: 0 }) : normalizeThreeDVector({ x: 0, y: 1, z: 0 });
    const ortho = normalizeThreeDVector(crossThreeDVector(start, axis));
    return normalizeThreeDQuaternion({ x: ortho.x, y: ortho.y, z: ortho.z, w: 0 });
  }
  const cross = crossThreeDVector(start, end);
  const s = Math.sqrt((1 + dot) * 2);
  const inv = 1 / s;
  return normalizeThreeDQuaternion({
    x: cross.x * inv,
    y: cross.y * inv,
    z: cross.z * inv,
    w: s * 0.5
  });
}

function quatFromAxisAngle(axis, angle) {
  const n = normalizeThreeDVector(axis);
  const half = angle * 0.5;
  const s = Math.sin(half);
  return normalizeThreeDQuaternion({
    x: n.x * s,
    y: n.y * s,
    z: n.z * s,
    w: Math.cos(half)
  });
}

function ensureThreeDPreview() {
  if (activeTab !== "three-d") return;
  const canvas = modalState.kind === "three-d-preview"
    ? document.getElementById("three-d-preview-canvas")
    : document.getElementById("three-d-canvas");
  const previewImage = modalState.kind === "three-d-preview"
    ? document.getElementById("three-d-preview-modal-image")
    : document.getElementById("three-d-preview-image");
  const overlay = modalState.kind === "three-d-preview"
    ? document.getElementById("three-d-preview-overlay")
    : document.getElementById("three-d-overlay");
  const gizmos = modalState.kind === "three-d-preview"
    ? document.getElementById("three-d-preview-light-gizmos")
    : document.getElementById("three-d-light-gizmos");
  if (!canvas || !overlay) return;

  const lib = threeDLib();
  if (!lib) {
    overlay.textContent = window.Appearance3DError || "Loading Three.js";
    return;
  }

  if (!threeDState.source || !threeDState.source.svg) {
    overlay.textContent = threeDState.error || "Select one object, then refresh the 3D source.";
    if (gizmos) gizmos.innerHTML = "";
    disposeThreeDPreview();
    return;
  }

  overlay.textContent = "";
  renderThreeDPreview(canvas, previewImage, overlay, gizmos, lib);
}

function scheduleThreeDPreview() {
  if (threeDPreviewRuntime.previewQueued) return;
  threeDPreviewRuntime.previewQueued = true;
  window.requestAnimationFrame(function () {
    threeDPreviewRuntime.previewQueued = false;
    ensureThreeDPreview();
  });
}

function renderThreeDPreview(canvas, previewImage, overlay, gizmos, lib) {
  const T = lib.THREE;
  const fastMode = threeDPreviewRuntime.interactionMode === true;
  if (!T) {
    overlay.textContent = "Three.js is not ready.";
    return;
  }

  if (threeDPreviewRuntime.canvas !== canvas) {
    disposeThreeDPreview();
    threeDPreviewRuntime.canvas = canvas;
    threeDPreviewRuntime.renderer = new T.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    configureThreeDPreviewRenderer(T, threeDPreviewRuntime.renderer, threeDState.settings, fastMode);
    threeDPreviewRuntime.scene = new T.Scene();
    threeDPreviewRuntime.camera = new T.PerspectiveCamera(32, 1, 0.1, 5000);
    bindThreeDCanvasOrbit(canvas);
  }

  const width = Math.max(1, canvas.clientWidth || 300);
  const height = Math.max(1, canvas.clientHeight || 240);
  configureThreeDPreviewRenderer(T, threeDPreviewRuntime.renderer, threeDState.settings, fastMode);
  threeDPreviewRuntime.renderer.setSize(width, height, false);
  threeDPreviewRuntime.camera.aspect = width / height;
  threeDPreviewRuntime.renderer.setClearAlpha(threeDState.settings.transparentBackground ? 0 : 1);
  threeDPreviewRuntime.scene.background = threeDState.settings.transparentBackground ? null : new T.Color(threeDState.settings.background);
  threeDPreviewRuntime.scene.environment = null;

  clearThreeDScene(T);

  applyThreeDLighting(T, threeDPreviewRuntime.renderer, threeDPreviewRuntime.scene, threeDState.settings, true);

  const object3d = buildThreeDObject(lib, threeDState.source, threeDState.settings, threeDState.mode);
  if (!object3d) {
    overlay.textContent = "This selection could not be converted into a 3D shape yet.";
    if (gizmos) gizmos.innerHTML = "";
    renderThreeDWithEffects(lib, threeDPreviewRuntime.renderer, threeDPreviewRuntime.scene, threeDPreviewRuntime.camera, width, height, threeDState.settings);
    return;
  }

  overlay.textContent = "";
  threeDPreviewRuntime.root = object3d;
  threeDPreviewRuntime.scene.add(object3d);
  const contactShadow = createThreeDContactShadow(T, object3d, threeDState.settings);
  if (contactShadow) {
    threeDPreviewRuntime.scene.add(contactShadow);
  }
  updateThreeDCameraOrbit(T, threeDPreviewRuntime.camera, threeDState.settings, object3d);
  renderThreeDLightGizmos(canvas, gizmos, T, threeDPreviewRuntime.camera, threeDState.settings);
  if (fastMode) {
    if (previewImage) {
      previewImage.removeAttribute("src");
      previewImage.classList.remove("visible");
    }
    canvas.classList.remove("three-d-canvas-hidden");
    const fallbackBackground = new T.Color(threeDState.settings.background || "#1D1D1D");
    threeDPreviewRuntime.scene.background = fallbackBackground;
    threeDPreviewRuntime.renderer.setClearAlpha(1);
    threeDPreviewRuntime.renderer.setClearColor(fallbackBackground, 1);
    threeDPreviewRuntime.scene.environment = null;
    renderThreeDWithEffects(lib, threeDPreviewRuntime.renderer, threeDPreviewRuntime.scene, threeDPreviewRuntime.camera, width, height, {
      bloomEnabled: false
    });
    return;
  }
  if (threeDState.settings.transparentBackground && threeDState.settings.bloomEnabled) {
    renderThreeDCompositePreview(lib, previewImage, width, height, threeDPreviewRuntime.scene, threeDPreviewRuntime.camera);
    canvas.classList.add("three-d-canvas-hidden");
  } else {
    renderThreeDWithEffects(lib, threeDPreviewRuntime.renderer, threeDPreviewRuntime.scene, threeDPreviewRuntime.camera, width, height, threeDState.settings);
    if (shouldUseThreeDCanvasEffects(threeDState.settings)) {
      renderThreeDProcessedPreview(previewImage, threeDPreviewRuntime.renderer.domElement, threeDState.settings);
      canvas.classList.add("three-d-canvas-hidden");
    } else {
      if (previewImage) {
        previewImage.removeAttribute("src");
        previewImage.classList.remove("visible");
      }
      canvas.classList.remove("three-d-canvas-hidden");
    }
  }
}

function renderThreeDCompositePreview(lib, previewImage, width, height, scene, camera) {
  if (!previewImage) return;
  let compositeCanvas = compositeTransparentBloomCanvas(lib, scene, camera, width, height);
  if (shouldUseThreeDCanvasEffects(threeDState.settings)) {
    compositeCanvas = applyThreeDCanvasEffects(compositeCanvas, threeDState.settings);
  }
  if (!compositeCanvas) return;
  const nextUrl = compositeCanvas.toDataURL("image/png");
  threeDPreviewCompositeUrl = nextUrl;
  previewImage.src = nextUrl;
  previewImage.classList.add("visible");
}

function renderThreeDProcessedPreview(previewImage, sourceCanvas, settings) {
  if (!previewImage || !sourceCanvas) return;
  const processed = applyThreeDCanvasEffects(sourceCanvas, settings);
  if (!processed) return;
  const nextUrl = processed.toDataURL("image/png");
  threeDPreviewCompositeUrl = nextUrl;
  previewImage.src = nextUrl;
  previewImage.classList.add("visible");
}

function renderThreeDWithEffects(lib, renderer, scene, camera, width, height, settings) {
  if (!lib || !renderer || !scene || !camera) return;
  if (!settings.bloomEnabled || !lib.EffectComposer || !lib.RenderPass || !lib.UnrealBloomPass) {
    renderer.render(scene, camera);
    return;
  }
  const T = lib.THREE;
  const composer = new lib.EffectComposer(renderer);
  composer.setSize(width, height);
  const renderPass = new lib.RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloomPass = new lib.UnrealBloomPass(
    new T.Vector2(width, height),
    Math.max(0, settings.bloomStrength || 0),
    clampThreeDValue(settings.bloomRadius || 0, 0, 1),
    clampThreeDValue(settings.bloomThreshold || 0, 0, 1)
  );
  composer.addPass(bloomPass);
  composer.render();
  if (typeof bloomPass.dispose === "function") {
    bloomPass.dispose();
  }
  if (typeof composer.dispose === "function") {
    composer.dispose();
  }
}

function clearThreeDScene(T) {
  while (threeDPreviewRuntime.scene.children.length) {
    const child = threeDPreviewRuntime.scene.children.pop();
    disposeThreeDNode(child, T);
  }
  threeDPreviewRuntime.root = null;
  if (threeDPreviewRuntime.envTarget) {
    if (threeDPreviewRuntime.envTarget.texture && typeof threeDPreviewRuntime.envTarget.texture.dispose === "function") {
      threeDPreviewRuntime.envTarget.texture.dispose();
    }
    if (typeof threeDPreviewRuntime.envTarget.dispose === "function") {
      threeDPreviewRuntime.envTarget.dispose();
    }
    threeDPreviewRuntime.envTarget = null;
  }
}

function bindThreeDCanvasOrbit(canvas) {
  canvas.onmousedown = function (event) {
    if (event.button !== 0) return;
    beginThreeDInteraction();
    threeDPreviewRuntime.dragging = true;
    threeDPreviewRuntime.dragStartX = event.clientX;
    threeDPreviewRuntime.dragStartY = event.clientY;
    threeDPreviewRuntime.dragMode = event.shiftKey ? "roll" : "orbit";
    threeDPreviewRuntime.startRotationX = threeDState.settings.rotationX;
    threeDPreviewRuntime.startRotationY = threeDState.settings.rotationY;
    threeDPreviewRuntime.startRotationZ = threeDState.settings.rotationZ;
    threeDPreviewRuntime.startQuaternion = ensureThreeDRotationQuaternion();
    threeDPreviewRuntime.dragStartVector = threeDPreviewRuntime.dragMode === "orbit"
      ? screenToArcballVector(event.clientX, event.clientY, canvas)
      : null;
    canvas.style.cursor = "grabbing";
  };

  canvas.onmousemove = function (event) {
    if (!threeDPreviewRuntime.dragging || threeDPreviewRuntime.lightDragging) return;
    const dx = event.clientX - threeDPreviewRuntime.dragStartX;
    if (threeDPreviewRuntime.dragMode === "roll") {
      const rollQuat = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, degToRad(dx * 0.45));
      threeDState.settings.rotationQuaternion = multiplyThreeDQuaternions(rollQuat, threeDPreviewRuntime.startQuaternion || ensureThreeDRotationQuaternion());
      updateThreeDEulerFromQuaternion(threeDState.settings.rotationQuaternion);
      syncThreeDFieldInputs(["rotationX", "rotationY", "rotationZ"]);
    } else {
      const nextVector = screenToArcballVector(event.clientX, event.clientY, canvas);
      const deltaQuat = quatFromTwoThreeDVectors(threeDPreviewRuntime.dragStartVector || nextVector, nextVector);
      threeDState.settings.rotationQuaternion = multiplyThreeDQuaternions(deltaQuat, threeDPreviewRuntime.startQuaternion || ensureThreeDRotationQuaternion());
      updateThreeDEulerFromQuaternion(threeDState.settings.rotationQuaternion);
      syncThreeDFieldInputs(["rotationX", "rotationY", "rotationZ"]);
    }
    setThreeDRotationPresetCustom();
    scheduleThreeDPreview();
  };

  canvas.onmouseup = function () {
    stopThreeDCanvasOrbit(canvas);
  };

  canvas.onmouseleave = function () {
    stopThreeDCanvasOrbit(canvas);
  };

  canvas.onwheel = function (event) {
    event.preventDefault();
    beginThreeDInteraction();
    const delta = event.deltaY > 0 ? 24 : -24;
    threeDState.settings.zoom = clampThreeDValue((threeDState.settings.zoom || 420) + delta, 120, 1200);
    syncThreeDFieldInputs(["zoom"]);
    scheduleThreeDPreview();
    endThreeDInteraction();
  };
}

function stopThreeDCanvasOrbit(canvas) {
  if (!threeDPreviewRuntime.dragging) return;
  threeDPreviewRuntime.dragging = false;
  canvas.style.cursor = "";
  endThreeDInteraction();
}

function renderThreeDLightGizmos(canvas, gizmos, T, camera, settings) {
  if (!gizmos || !canvas || !T || !camera) return;
  const width = Math.max(1, canvas.clientWidth || 300);
  const height = Math.max(1, canvas.clientHeight || 180);
  const targetProjection = projectThreeDPoint(T, camera, {
    x: threeDPreviewRuntime.orbitTargetX || 0,
    y: threeDPreviewRuntime.orbitTargetY || 0,
    z: threeDPreviewRuntime.orbitTargetZ || 0
  }, width, height);
  const keyProjection = projectThreeDPoint(T, camera, {
    x: settings.lightX,
    y: settings.lightY,
    z: settings.lightZ
  }, width, height);
  const mainVisual = threeDMainLightVisual(settings.lightType || "directional", keyProjection, targetProjection, settings.lightConeAngle || 30);
  gizmos.innerHTML = [
    '<div class="three-light-target" style="left:' + targetProjection.x.toFixed(2) + 'px;top:' + targetProjection.y.toFixed(2) + 'px"></div>',
    mainVisual
  ].join("");
  bindThreeDLightHandle(canvas, gizmos);
}

function threeDLightLine(start, end, extraClass) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return '<div class="three-light-line' + (extraClass ? ' ' + extraClass : '') + '" style="left:' + start.x.toFixed(2) + 'px;top:' + start.y.toFixed(2) + 'px;width:' + length.toFixed(2) + 'px;transform:rotate(' + angle.toFixed(2) + 'deg)"></div>';
}

function threeDMainLightVisual(type, source, target, coneAngle) {
  if (type === "spot") {
    return threeDSpotSource(source, target, coneAngle);
  }
  if (type === "point") {
    return threeDPointSource(source.x, source.y);
  }
  return threeDDirectionalSource(source, target);
}

function threeDDirectionalSource(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return [
    '<div class="three-light-source is-directional" id="three-d-light-handle" style="left:' + source.x.toFixed(2) + 'px;top:' + source.y.toFixed(2) + 'px">',
    '<div class="three-light-core"></div>',
    '<div class="three-light-arrow" style="transform:translate(-50%,-50%) rotate(' + angle.toFixed(2) + 'deg)"><span class="three-light-arrow-shaft"></span><span class="three-light-arrow-head"></span></div>',
    '</div>'
  ].join("");
}

function threeDPointSource(x, y) {
  var rays = [];
  for (var index = 0; index < 8; index += 1) {
    var angle = (Math.PI * 2 * index) / 8;
    rays.push('<div class="three-light-ray" style="transform:translate(-50%,-50%) rotate(' + (angle * 180 / Math.PI).toFixed(2) + 'deg)"></div>');
  }
  return [
    '<div class="three-light-source is-point" id="three-d-light-handle" style="left:' + x.toFixed(2) + 'px;top:' + y.toFixed(2) + 'px">',
    '<div class="three-light-halo"></div>',
    rays.join(""),
    '<div class="three-light-core"></div>',
    '</div>'
  ].join("");
}

function threeDSpotSource(source, target, angleDegrees) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const cone = clampThreeDValue(angleDegrees || 30, 5, 90);
  const spread = Math.tan(degToRad(cone)) * Math.max(36, length);
  return [
    '<div class="three-light-source is-spot" id="three-d-light-handle" style="left:' + source.x.toFixed(2) + 'px;top:' + source.y.toFixed(2) + 'px">',
    '<div class="three-light-cone" style="width:' + Math.max(24, length).toFixed(2) + 'px;height:' + Math.max(24, spread * 2).toFixed(2) + 'px;transform:translateY(-50%) rotate(' + angle.toFixed(2) + 'deg)"></div>',
    '<div class="three-light-core"></div>',
    '</div>'
  ].join("");
}

function projectThreeDPoint(T, camera, point, width, height) {
  const vector = new T.Vector3(point.x, point.y, point.z);
  vector.project(camera);
  return {
    x: ((vector.x + 1) * 0.5) * width,
    y: ((1 - vector.y) * 0.5) * height
  };
}

function bindThreeDLightHandle(canvas, gizmos) {
  const handle = gizmos ? gizmos.querySelector("#three-d-light-handle") : null;
  if (!handle) return;
  handle.onmousedown = function (event) {
    event.preventDefault();
    event.stopPropagation();
    const lib = threeDLib();
    const T = lib && lib.THREE;
    const camera = threeDPreviewRuntime.camera;
    if (!T || !camera) return;
    beginThreeDInteraction();
    const dragPlane = createThreeDLightDragPlane(T, camera, threeDState.settings);
    const dragPoint = projectThreeDScreenToPlane(T, camera, canvas, event.clientX, event.clientY, dragPlane);
    if (!dragPlane || !dragPoint) return;
    threeDPreviewRuntime.lightDragging = true;
    threeDPreviewRuntime.lightDragMode = "screen";
    threeDPreviewRuntime.lightStartX = threeDState.settings.lightX;
    threeDPreviewRuntime.lightStartY = threeDState.settings.lightY;
    threeDPreviewRuntime.lightStartZ = threeDState.settings.lightZ;
    threeDPreviewRuntime.lightScreenStartX = event.clientX;
    threeDPreviewRuntime.lightScreenStartY = event.clientY;
    threeDPreviewRuntime.lightDragPlane = dragPlane;
    threeDPreviewRuntime.lightDragPoint = dragPoint;
    threeDPreviewRuntime.lightMoveHandler = function (moveEvent) {
      if (!threeDPreviewRuntime.lightDragging) return;
      const nextPoint = projectThreeDScreenToPlane(
        T,
        camera,
        canvas,
        moveEvent.clientX,
        moveEvent.clientY,
        threeDPreviewRuntime.lightDragPlane
      );
      if (!nextPoint) return;
      threeDState.settings.lightX = clampThreeDLightValue(nextPoint.x);
      threeDState.settings.lightY = clampThreeDLightValue(nextPoint.y);
      threeDState.settings.lightZ = clampThreeDLightValue(nextPoint.z);
      syncThreeDFieldInputs(["lightX", "lightY", "lightZ"]);
      scheduleThreeDPreview();
    };
    threeDPreviewRuntime.lightUpHandler = function () {
      stopThreeDLightDrag();
    };
    window.addEventListener("mousemove", threeDPreviewRuntime.lightMoveHandler);
    window.addEventListener("mouseup", threeDPreviewRuntime.lightUpHandler);
  };
  handle.onwheel = function (event) {
    event.preventDefault();
    event.stopPropagation();
    beginThreeDInteraction();
    const target = getThreeDLightOrbitTarget();
    const orbit = getThreeDLightOrbitState(threeDState.settings, target);
    const delta = event.deltaY > 0 ? 10 : -10;
    const nextRadius = clampThreeDValue(orbit.radius + delta, 24, THREE_D_LIGHT_SAFE_RANGE);
    applyThreeDLightOrbitState(target, nextRadius, orbit.azimuth, orbit.elevation);
    syncThreeDFieldInputs(["lightX", "lightY", "lightZ"]);
    scheduleThreeDPreview();
    endThreeDInteraction();
  };
}

function createThreeDLightDragPlane(T, camera, settings) {
  if (!T || !camera || !settings) return null;
  const normal = new T.Vector3();
  camera.getWorldDirection(normal);
  if (normal.lengthSq() < 0.000001) return null;
  normal.normalize();
  const point = new T.Vector3(
    Number(settings.lightX) || 0,
    Number(settings.lightY) || 0,
    Number(settings.lightZ) || 0
  );
  return new T.Plane().setFromNormalAndCoplanarPoint(normal, point);
}

function projectThreeDScreenToPlane(T, camera, canvas, clientX, clientY, plane) {
  if (!T || !camera || !canvas || !plane) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ndc = new T.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1)
  );
  const raycaster = new T.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hit = new T.Vector3();
  const intersection = raycaster.ray.intersectPlane(plane, hit);
  return intersection ? hit.clone() : null;
}

function getThreeDLightOrbitTarget() {
  return {
    x: Number(threeDPreviewRuntime.orbitTargetX) || 0,
    y: Number(threeDPreviewRuntime.orbitTargetY) || 0,
    z: Number(threeDPreviewRuntime.orbitTargetZ) || 0
  };
}

function getThreeDLightOrbitState(settings, target) {
  const dx = (Number(settings.lightX) || 0) - (target.x || 0);
  const dy = (Number(settings.lightY) || 0) - (target.y || 0);
  const dz = (Number(settings.lightZ) || 0) - (target.z || 0);
  const radius = Math.max(24, Math.sqrt(dx * dx + dy * dy + dz * dz) || 24);
  const azimuth = Math.atan2(dx, dz);
  const elevation = Math.asin(clampThreeDValue(dy / radius, -1, 1));
  return {
    radius: radius,
    azimuth: azimuth,
    elevation: elevation
  };
}

function applyThreeDLightOrbitState(target, radius, azimuth, elevation) {
  const safeRadius = clampThreeDValue(radius, 24, THREE_D_LIGHT_SAFE_RANGE);
  const cosElevation = Math.cos(elevation);
  threeDState.settings.lightX = clampThreeDLightValue((target.x || 0) + Math.sin(azimuth) * cosElevation * safeRadius);
  threeDState.settings.lightY = clampThreeDLightValue((target.y || 0) + Math.sin(elevation) * safeRadius);
  threeDState.settings.lightZ = clampThreeDLightValue((target.z || 0) + Math.cos(azimuth) * cosElevation * safeRadius);
}

function stopThreeDLightDrag() {
  if (!threeDPreviewRuntime.lightDragging) return;
  threeDPreviewRuntime.lightDragging = false;
  if (threeDPreviewRuntime.lightMoveHandler) {
    window.removeEventListener("mousemove", threeDPreviewRuntime.lightMoveHandler);
  }
  if (threeDPreviewRuntime.lightUpHandler) {
    window.removeEventListener("mouseup", threeDPreviewRuntime.lightUpHandler);
  }
  threeDPreviewRuntime.lightMoveHandler = null;
  threeDPreviewRuntime.lightUpHandler = null;
  threeDPreviewRuntime.lightDragPlane = null;
  threeDPreviewRuntime.lightDragPoint = null;
  endThreeDInteraction();
}

function disposeThreeDNode(node, T) {
  if (!node) return;
  if (node.geometry && typeof node.geometry.dispose === "function") {
    node.geometry.dispose();
  }
  if (node.material) {
    if (Array.isArray(node.material)) {
      node.material.forEach(function (material) {
        disposeThreeDMaterial(material);
      });
    } else {
      disposeThreeDMaterial(node.material);
    }
  }
  if (node.children && node.children.length) {
    node.children.forEach(function (child) {
      disposeThreeDNode(child, T);
    });
  }
}

function disposeThreeDMaterial(material) {
  if (!material) return;
  [
    "map",
    "alphaMap",
    "normalMap",
    "bumpMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "displacementMap",
    "envMap"
  ].forEach(function (key) {
    if (material[key] && typeof material[key].dispose === "function") {
      material[key].dispose();
      material[key] = null;
    }
  });
  if (typeof material.dispose === "function") {
    material.dispose();
  }
}

function disposeThreeDPreview() {
  const T = threeDLib() ? threeDLib().THREE : null;
  if (threeDPreviewRuntime.scene && T) {
    clearThreeDScene(T);
  }
  if (threeDPreviewRuntime.renderer) {
    threeDPreviewRuntime.renderer.dispose();
  }
  threeDPreviewRuntime.canvas = null;
  threeDPreviewRuntime.renderer = null;
  threeDPreviewRuntime.scene = null;
  threeDPreviewRuntime.camera = null;
  threeDPreviewRuntime.root = null;
  threeDPreviewRuntime.envTarget = null;
  threeDPreviewRuntime.dragging = false;
  threeDPreviewRuntime.dragMode = "orbit";
  threeDPreviewRuntime.interactionMode = false;
  stopThreeDLightDrag();
  if (threeDPreviewRuntime.interactionTimer) {
    window.clearTimeout(threeDPreviewRuntime.interactionTimer);
    threeDPreviewRuntime.interactionTimer = 0;
  }
}

function threeDLib() {
  if (!window.Appearance3D || !window.Appearance3D.THREE || !window.Appearance3D.SVGLoader) return null;
  return window.Appearance3D;
}

function buildThreeDObject(lib, source, settings, mode) {
  const T = lib.THREE;
  const loader = new lib.SVGLoader();
  const data = loader.parse(source.svg);
  if (!data || !data.paths || !data.paths.length) return null;

  let root = null;
  if (mode === "revolve") {
    root = buildRevolveObject(T, data, settings);
  } else if (mode === "inflate") {
    root = buildInflateObject(lib, data, settings);
  } else {
    root = buildExtrudeObject(lib, data, settings);
  }
  if (!root) return null;

  fitThreeDObject(root, T, settings);
  const pivot = new T.Group();
  pivot.add(root);
  const q = ensureThreeDRotationQuaternion();
  pivot.quaternion.set(q.x, q.y, q.z, q.w);
  return pivot;
}

function buildExtrudeObject(lib, data, settings) {
  const T = lib.THREE;
  const group = new T.Group();
  data.paths.forEach(function (path) {
    const shapes = lib.SVGLoader.createShapes(path);
    shapes.forEach(function (shape) {
      const geometry = new T.ExtrudeGeometry(shape, buildExtrudeSettings(settings));
      geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, createThreeDMaterialSet(T, path, settings, true));
      group.add(mesh);
    });
  });
  group.scale.y = -1;
  return group.children.length ? group : null;
}

function buildInflateObject(lib, data, settings) {
  const T = lib.THREE;
  const group = new T.Group();
  data.paths.forEach(function (path) {
    const shapes = lib.SVGLoader.createShapes(path);
    shapes.forEach(function (shape) {
      const amount = Math.max(1, settings.inflateAmount);
      const geometry = new T.ExtrudeGeometry(shape, {
        depth: Math.max(0.1, amount * 0.6),
        bevelEnabled: true,
        bevelSize: Math.max(0.1, amount * profileMultiplier(settings.bevelProfile, "size", 0.55)),
        bevelThickness: Math.max(0.1, amount * profileMultiplier(settings.bevelProfile, "thickness", 1)),
        bevelOffset: Math.max(-amount, Math.min(amount, settings.bevelOffset || 0)),
        bevelSegments: Math.max(2, Math.round(settings.bevelSegments + 2 + profileMultiplier(settings.bevelProfile, "segments", 0))),
        curveSegments: 30,
        steps: 1
      });
      geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, createThreeDMaterialSet(T, path, settings, true));
      group.add(mesh);
    });
  });
  group.scale.y = -1;
  return group.children.length ? group : null;
}

function buildRevolveObject(T, data, settings) {
  const profile = collectRevolvePoints(T, data, settings);
  if (!profile || profile.length < 3) return null;
  const geometry = new T.LatheGeometry(profile, Math.max(8, Math.round(settings.revolveSegments)), 0, T.MathUtils.degToRad(Math.max(1, settings.revolveAngle)));
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, threeDMaterialForPath(T, data.paths[0], settings, "base"));
  return mesh;
}

function collectRevolvePoints(T, data, settings) {
  if (!data.paths || !data.paths.length) return null;
  const path = data.paths[0];
  if (!path.subPaths || !path.subPaths.length) return null;
  const rawPoints = path.subPaths[0].getPoints(96);
  if (!rawPoints || rawPoints.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  rawPoints.forEach(function (point) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  });
  const anchorX = revolveAnchorValue(settings.revolveAnchor, minX, maxX);
  const centerY = (minY + maxY) / 2;
  const anchorY = revolveAnchorValue(settings.revolveAnchor, minY, maxY);
  const points = [];
  rawPoints.forEach(function (point) {
    let radius;
    let axis;
    if (settings.revolveAxis === "HORIZONTAL") {
      radius = settings.revolveFlip ? (anchorY - point.y) : (point.y - anchorY);
      axis = point.x - (minX + maxX) / 2;
    } else {
      radius = settings.revolveFlip ? (anchorX - point.x) : (point.x - anchorX);
      axis = -(point.y - centerY);
    }
    radius = Math.abs(radius);
    const sample = new T.Vector2(Math.max(0.01, radius), axis);
    if (!points.length || points[points.length - 1].distanceTo(sample) > 0.25) {
      points.push(sample);
    }
  });
  return points;
}

function revolveAnchorValue(anchor, min, max) {
  if (anchor === "MAX") return max;
  if (anchor === "CENTER") return (min + max) / 2;
  return min;
}

function createThreeDMaterialSet(T, path, settings, allowSideMaterial) {
  return threeDMaterialForPath(T, path, settings, "base");
}

function threeDMaterialForPath(T, path, settings, variant) {
  const baseVariant = variant || "base";
  const color = settings.useSourceColor && path && path.color ? path.color : new T.Color(settings.color);
  const materialConfig = {
    color: color,
    roughness: clampThreeDValue(settings.roughness, 0, 1),
    metalness: clampThreeDValue(settings.metalness, 0, 1),
    clearcoat: clampThreeDValue(settings.clearcoat, 0, 1),
    transmission: clampThreeDValue(settings.transmission, 0, 1),
    thickness: Math.max(0, settings.thickness || 0),
    transparent: settings.opacity < 1 || settings.transmission > 0,
    opacity: clampThreeDValue(settings.opacity, 0.05, 1),
    emissive: new T.Color(settings.emissive || "#000000"),
    emissiveIntensity: Math.max(0, settings.emissiveIntensity || 0),
    iridescence: clampThreeDValue(settings.iridescence || 0, 0, 1),
    iridescenceIOR: clampThreeDValue(settings.iridescenceIOR || 1.3, 1, 2.5),
    sheen: clampThreeDValue(settings.sheen || 0, 0, 1),
    sheenRoughness: clampThreeDValue(settings.sheenRoughness || 0, 0, 1),
    envMapIntensity: Math.max(0, Number(settings.environmentStrength) || 0),
    flatShading: settings.flatShading === true,
    side: T.DoubleSide
  };
  return new T.MeshPhysicalMaterial(materialConfig);
}

function fitThreeDObject(object3d, T, settings) {
  const box = new T.Box3().setFromObject(object3d);
  const center = box.getCenter(new T.Vector3());
  object3d.position.sub(center);
  const size = box.getSize(new T.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const padding = settings && settings.framePadding !== undefined ? Math.max(0, Number(settings.framePadding) || 0) : 0;
  const paddedSize = maxSize * (1 + padding / 100);
  const scale = 180 / Math.max(1, paddedSize);
  object3d.scale.multiplyScalar(scale);
  const offsetX = settings && settings.offsetX !== undefined ? Number(settings.offsetX) || 0 : 0;
  const offsetY = settings && settings.offsetY !== undefined ? Number(settings.offsetY) || 0 : 0;
  const offsetZ = settings && settings.offsetZ !== undefined ? Number(settings.offsetZ) || 0 : 0;
  object3d.position.x += offsetX;
  object3d.position.y += offsetY;
  object3d.position.z += offsetZ;
}

function createThreeDContactShadow(T, object3d, settings) {
  if (!settings.contactShadow) return null;
  const box = new T.Box3().setFromObject(object3d);
  const center = box.getCenter(new T.Vector3());
  const size = box.getSize(new T.Vector3());
  const width = Math.max(24, size.x * 0.95 * Math.max(0.6, settings.contactShadowScale || 1));
  const height = Math.max(16, Math.min(size.y * 0.28, size.x * 0.34) * Math.max(0.6, settings.contactShadowScale || 1));
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(128, 64, 8, 128, 64, 92);
  gradient.addColorStop(0, "rgba(0,0,0," + clampThreeDValue(settings.contactShadowOpacity || 0.24, 0, 1) + ")");
  gradient.addColorStop(0.45, "rgba(0,0,0," + clampThreeDValue((settings.contactShadowOpacity || 0.24) * 0.52, 0, 1) + ")");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new T.CanvasTexture(canvas);
  const material = new T.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false
  });
  const shadow = new T.Mesh(new T.PlaneGeometry(width, height), material);
  shadow.position.set(center.x, box.min.y + height * 0.18, center.z - Math.max(2, size.z * 0.45));
  shadow.renderOrder = -1;
  return shadow;
}

function updateThreeDCameraOrbit(T, camera, settings, object3d) {
  if (!T || !camera) return;
  const target = new T.Vector3(0, 0, 0);
  if (object3d) {
    const box = new T.Box3().setFromObject(object3d);
    box.getCenter(target);
  }
  threeDPreviewRuntime.orbitTargetX = target.x;
  threeDPreviewRuntime.orbitTargetY = target.y;
  threeDPreviewRuntime.orbitTargetZ = target.z;
  const radius = Math.max(120, settings.zoom || 420);
  camera.position.set(target.x, target.y, target.z + radius);
  camera.lookAt(target.x, target.y, target.z);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}

function exportThreeDRender() {
  if (!threeDPreviewRuntime.renderer || !threeDPreviewRuntime.canvas || !threeDState.source) return;
  const scale = Math.max(1, Math.min(4, Math.round(threeDState.settings.exportScale || 1)));
  const separateBloom = threeDState.settings.bloomEnabled && threeDState.settings.bloomSeparate;
  const exportPlan = createThreeDExportPlan(scale, threeDState.source);
  const baseResult = scaledThreeDExportCanvas(exportPlan, threeDState.source, separateBloom ? "base" : "combined");
  const dataUrl = baseResult && baseResult.canvas ? baseResult.canvas.toDataURL("image/png") : "";
  let bloomDataUrl = "";
  let bloomBlendMode = "";
  let bloomOpacity = 100;
  if (separateBloom) {
    const bloomResult = scaledThreeDExportCanvas(exportPlan, threeDState.source, "bloom");
    bloomDataUrl = bloomResult && bloomResult.canvas ? bloomResult.canvas.toDataURL("image/png") : "";
    if (bloomResult && bloomResult.renderer) {
      bloomResult.renderer.dispose();
    }
    bloomBlendMode = "SCREEN";
    bloomOpacity = clampThreeDValue(threeDState.settings.flareOpacity || 100, 0, 100);
  }
  if (baseResult && baseResult.renderer) {
    baseResult.renderer.dispose();
  }
  if (!dataUrl) return;
  post({
    type: "place-3d-render",
    pngDataUrl: dataUrl,
    bloomDataUrl: bloomDataUrl,
    bloomBlendMode: bloomBlendMode,
    bloomOpacity: bloomOpacity,
    width: threeDState.source.width || 240,
    height: threeDState.source.height || 240,
    name: threeDState.source.name || "3D Object",
    mode: threeDState.mode,
    nodeType: threeDState.source.nodeType || "",
    svgSource: threeDState.source.svg || "",
    settings: cloneThreeDSettings(),
    sourceNodeId: threeDState.source.sourceNodeId || "",
    exportWidth: exportPlan.width,
    exportHeight: exportPlan.height,
    exportScaleApplied: exportPlan.effectiveScale
  });
}

function exportThreeDObjectAsObj() {
  if (!threeDState.source || !threeDState.source.svg) return;
  const lib = threeDLib();
  if (!lib || !lib.THREE || !lib.OBJExporter) {
    statusEl.textContent = "OBJ export is not ready yet.";
    return;
  }
  const object3d = buildThreeDObject(lib, threeDState.source, threeDState.settings, threeDState.mode);
  if (!object3d) {
    statusEl.textContent = "This selection could not be converted into an OBJ mesh.";
    return;
  }
  try {
    const exporter = new lib.OBJExporter();
    const objText = exporter.parse(object3d);
    const blob = new Blob([objText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeThreeDFileName((threeDState.source.name || "3d-object") + ".obj");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    statusEl.textContent = "OBJ exported from current 3D mesh.";
  } finally {
    disposeThreeDNode(object3d, lib.THREE);
  }
}

function safeThreeDFileName(name) {
  return String(name || "3d-object.obj")
    .replace(/[<>:\"\/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "3d-object.obj";
}

function createThreeDExportPlan(scale, source) {
  const sourceWidth = source && source.width ? Number(source.width) : threeDPreviewRuntime.canvas.width;
  const sourceHeight = source && source.height ? Number(source.height) : threeDPreviewRuntime.canvas.height;
  const ratio = Math.max(0.35, Math.min(3.5, sourceWidth / Math.max(1, sourceHeight)));
  const baseWidth = Math.max(256, Math.round(Math.min(2048, sourceWidth * 2)));
  const baseHeight = Math.max(1, Math.round(baseWidth / ratio));
  let width = Math.max(1, Math.round(baseWidth * scale));
  let height = Math.max(1, Math.round(baseHeight * scale));
  const dimensionScale = Math.min(
    1,
    THREE_D_EXPORT_MAX_DIMENSION / Math.max(1, width),
    THREE_D_EXPORT_MAX_DIMENSION / Math.max(1, height)
  );
  const pixelScale = Math.min(
    1,
    Math.sqrt(THREE_D_EXPORT_MAX_PIXELS / Math.max(1, width * height))
  );
  const reduction = Math.min(1, dimensionScale, pixelScale);
  if (reduction < 1) {
    width = Math.max(256, Math.round(width * reduction));
    height = Math.max(256, Math.round(height * reduction));
  }
  return {
    width: width,
    height: height,
    effectiveScale: Number((scale * reduction).toFixed(2)),
    reduced: reduction < 0.999
  };
}

function scaledThreeDExportCanvas(exportPlan, source, mode) {
  if (!threeDPreviewRuntime.renderer || !threeDState.source || !exportPlan) return null;
  const lib = threeDLib();
  if (!lib || !lib.THREE) return null;
  const T = lib.THREE;
  const width = Math.max(1, Math.round(exportPlan.width));
  const height = Math.max(1, Math.round(exportPlan.height));
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  configureThreeDRenderer(T, renderer, false, threeDState.settings);
  renderer.setSize(width, height, false);
  renderer.setClearAlpha(threeDState.settings.transparentBackground ? 0 : 1);
  if (!threeDState.settings.transparentBackground) {
    renderer.setClearColor(threeDState.settings.background);
  }
  const scene = new T.Scene();
  scene.background = threeDState.settings.transparentBackground ? null : new T.Color(threeDState.settings.background);
  const exportEnvironment = applyThreeDLighting(T, renderer, scene, threeDState.settings, false);
  const object3d = buildThreeDObject(lib, source, threeDState.settings, threeDState.mode);
  if (!object3d) {
    renderer.dispose();
    return null;
  }
  scene.add(object3d);
  const contactShadow = createThreeDContactShadow(T, object3d, threeDState.settings);
  if (contactShadow) {
    scene.add(contactShadow);
  }
  const camera = new T.PerspectiveCamera(32, width / height, 0.1, 5000);
  updateThreeDCameraOrbit(T, camera, threeDState.settings, object3d);
  let outputCanvas = renderer.domElement;
  if (mode === "bloom") {
    outputCanvas = renderBloomOnlyCanvas(lib, scene, camera, width, height) || renderer.domElement;
  } else if (mode === "base") {
    renderer.render(scene, camera);
  } else if (threeDState.settings.transparentBackground && threeDState.settings.bloomEnabled && lib.EffectComposer && lib.RenderPass && lib.UnrealBloomPass) {
    outputCanvas = compositeTransparentBloomExport(lib, scene, camera, width, height, renderer.domElement);
  } else {
    renderThreeDWithEffects(lib, renderer, scene, camera, width, height, threeDState.settings);
  }
  if (mode !== "bloom" && shouldUseThreeDCanvasEffects(threeDState.settings)) {
    outputCanvas = applyThreeDCanvasEffects(outputCanvas, threeDState.settings);
  }
  if (exportEnvironment) {
    if (exportEnvironment.texture && typeof exportEnvironment.texture.dispose === "function") {
      exportEnvironment.texture.dispose();
    }
    if (typeof exportEnvironment.dispose === "function") {
      exportEnvironment.dispose();
    }
  }
  disposeThreeDNode(object3d, T);
  while (scene.children.length) {
    const child = scene.children.pop();
    disposeThreeDNode(child, T);
  }
  return {
    canvas: outputCanvas,
    renderer: renderer
  };
}

function renderBloomOnlyCanvas(lib, scene, camera, width, height) {
  if (!lib || !lib.THREE || !lib.EffectComposer || !lib.RenderPass || !lib.UnrealBloomPass) return null;
  const T = lib.THREE;
  const bloomRenderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  configureThreeDRenderer(T, bloomRenderer, false, threeDState.settings);
  bloomRenderer.setSize(width, height, false);
  bloomRenderer.setClearColor(0x000000, 1);
  const composer = new lib.EffectComposer(bloomRenderer);
  composer.setSize(width, height);
  const renderPass = new lib.RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloomPass = new lib.UnrealBloomPass(
    new T.Vector2(width, height),
    Math.max(0, threeDState.settings.bloomStrength || 0),
    clampThreeDValue(threeDState.settings.bloomRadius || 0, 0, 1),
    clampThreeDValue(threeDState.settings.bloomThreshold || 0, 0, 1)
  );
  composer.addPass(bloomPass);
  composer.render();
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const context = outputCanvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.drawImage(bloomRenderer.domElement, 0, 0, width, height);
  }
  if (typeof bloomPass.dispose === "function") {
    bloomPass.dispose();
  }
  if (typeof composer.dispose === "function") {
    composer.dispose();
  }
  bloomRenderer.dispose();
  return outputCanvas;
}

function compositeTransparentBloomCanvas(lib, scene, camera, width, height) {
  const T = lib.THREE;
  const baseRenderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  configureThreeDRenderer(T, baseRenderer, false, threeDState.settings);
  baseRenderer.setSize(width, height, false);
  baseRenderer.setClearColor(0x000000, 0);
  baseRenderer.render(scene, camera);

  const bloomRenderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  configureThreeDRenderer(T, bloomRenderer, false, threeDState.settings);
  bloomRenderer.setSize(width, height, false);
  bloomRenderer.setClearColor(0x000000, 0);
  const composer = new lib.EffectComposer(bloomRenderer);
  composer.setSize(width, height);
  const renderPass = new lib.RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloomPass = new lib.UnrealBloomPass(
    new T.Vector2(width, height),
    Math.max(0, threeDState.settings.bloomStrength || 0),
    clampThreeDValue(threeDState.settings.bloomRadius || 0, 0, 1),
    clampThreeDValue(threeDState.settings.bloomThreshold || 0, 0, 1)
  );
  composer.addPass(bloomPass);
  composer.render();

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = width;
  finalCanvas.height = height;
  const context = finalCanvas.getContext("2d");
  const bloomCanvas = stripBlackBackground(bloomRenderer.domElement, width, height);
  if (context) {
    context.clearRect(0, 0, width, height);
    context.drawImage(baseRenderer.domElement, 0, 0, width, height);
    context.globalCompositeOperation = "lighter";
    context.drawImage(bloomCanvas, 0, 0, width, height);
    context.globalCompositeOperation = "source-over";
  }

  if (typeof bloomPass.dispose === "function") {
    bloomPass.dispose();
  }
  if (typeof composer.dispose === "function") {
    composer.dispose();
  }
  baseRenderer.dispose();
  bloomRenderer.dispose();
  return finalCanvas;
}

function compositeTransparentBloomExport(lib, scene, camera, width, height, baseCanvas) {
  return compositeTransparentBloomCanvas(lib, scene, camera, width, height) || baseCanvas;
}

function stripBlackBackground(sourceCanvas, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return sourceCanvas;
  context.drawImage(sourceCanvas, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const maxChannel = Math.max(r, g, b);
    const threshold = 20;
    if (maxChannel <= threshold) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
    } else {
      const normalized = Math.min(255, Math.max(0, (maxChannel - threshold) * 3.2));
      data[index + 3] = Math.max(data[index + 3], normalized);
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function shouldUseThreeDCanvasEffects(settings) {
  return Math.abs(Number(settings.contrast) || 0) > 0.001 ||
    (Number(settings.grainAmount) || 0) > 0.001 ||
    (Number(settings.chromaticAberration) || 0) > 0.001;
}

function applyThreeDCanvasEffects(sourceCanvas, settings) {
  if (!sourceCanvas) return sourceCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const context = canvas.getContext("2d");
  if (!context) return sourceCanvas;
  context.drawImage(sourceCanvas, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const original = new Uint8ClampedArray(data);
  const contrast = Number(settings.contrast) || 0;
  const grain = Math.max(0, Number(settings.grainAmount) || 0);
  const chroma = Math.max(0, Number(settings.chromaticAberration) || 0);
  const shift = Math.round(chroma);
  const contrastFactor = 1 + contrast * 1.45;
  for (var y = 0; y < canvas.height; y += 1) {
    for (var x = 0; x < canvas.width; x += 1) {
      var index = (y * canvas.width + x) * 4;
      if (original[index + 3] === 0) continue;
      if (shift > 0) {
        var redIndex = (y * canvas.width + clampPixel(x - shift, 0, canvas.width - 1)) * 4;
        var blueIndex = (y * canvas.width + clampPixel(x + shift, 0, canvas.width - 1)) * 4;
        data[index] = original[redIndex];
        data[index + 2] = original[blueIndex + 2];
      }
      data[index] = clampPixel((data[index] - 128) * contrastFactor + 128, 0, 255);
      data[index + 1] = clampPixel((data[index + 1] - 128) * contrastFactor + 128, 0, 255);
      data[index + 2] = clampPixel((data[index + 2] - 128) * contrastFactor + 128, 0, 255);
      if (grain > 0) {
        var noise = (Math.random() - 0.5) * 255 * grain;
        data[index] = clampPixel(data[index] + noise, 0, 255);
        data[index + 1] = clampPixel(data[index + 1] + noise, 0, 255);
        data[index + 2] = clampPixel(data[index + 2] + noise, 0, 255);
      }
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function clampPixel(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function cloneThreeDSettings() {
  return JSON.parse(JSON.stringify(threeDState.settings));
}

function buildExtrudeSettings(settings) {
  const sizeBase = Math.max(0, settings.bevelSize);
  const thicknessBase = Math.max(0, settings.bevelThickness);
  return {
    depth: Math.max(0.1, settings.depth),
    bevelEnabled: sizeBase > 0 || thicknessBase > 0,
    bevelSize: Math.max(0, sizeBase * profileMultiplier(settings.bevelProfile, "size", 1)),
    bevelThickness: Math.max(0, thicknessBase * profileMultiplier(settings.bevelProfile, "thickness", 1)),
    bevelOffset: clampThreeDValue(settings.bevelOffset || 0, -80, 80) + profileMultiplier(settings.bevelProfile, "offset", 0),
    bevelSegments: Math.max(0, Math.round(settings.bevelSegments + profileMultiplier(settings.bevelProfile, "segments", 0))),
    curveSegments: 24,
    steps: 1
  };
}

function profileMultiplier(profile, key, fallback) {
  const map = {
    flat: { size: 0.1, thickness: 0.2, offset: 0, segments: 0 },
    round: { size: 1, thickness: 1, offset: 0, segments: 2 },
    soft_round: { size: 1.25, thickness: 0.8, offset: -0.6, segments: 3 },
    chisel: { size: 0.65, thickness: 1.3, offset: 0.35, segments: 1 },
    slope: { size: 1.15, thickness: 0.6, offset: -0.2, segments: 1 }
  };
  const entry = map[profile] || map.round;
  return entry[key] !== undefined ? entry[key] : fallback;
}

function applyThreeDMaterialPreset(preset) {
  const settings = threeDState.settings;
  if (preset === "matte") {
    settings.roughness = 0.92;
    settings.metalness = 0.02;
    settings.clearcoat = 0;
    settings.transmission = 0;
    settings.thickness = 0.2;
    settings.opacity = 1;
    settings.emissive = "#000000";
    settings.emissiveIntensity = 0;
    settings.flatShading = false;
    settings.iridescence = 0;
    settings.iridescenceIOR = 1.3;
    settings.sheen = 0.08;
    settings.sheenRoughness = 0.75;
  } else if (preset === "metal") {
    settings.roughness = 0.24;
    settings.metalness = 0.9;
    settings.clearcoat = 0.35;
    settings.transmission = 0;
    settings.thickness = 0.4;
    settings.opacity = 1;
    settings.emissive = "#000000";
    settings.emissiveIntensity = 0;
    settings.flatShading = false;
    settings.iridescence = 0;
    settings.iridescenceIOR = 1.3;
    settings.sheen = 0.04;
    settings.sheenRoughness = 0.35;
  } else if (preset === "chrome") {
    settings.roughness = 0.08;
    settings.metalness = 1;
    settings.clearcoat = 0.8;
    settings.transmission = 0;
    settings.thickness = 0.35;
    settings.opacity = 1;
    settings.emissive = "#000000";
    settings.emissiveIntensity = 0;
    settings.flatShading = false;
    settings.iridescence = 0;
    settings.iridescenceIOR = 1.3;
    settings.sheen = 0;
    settings.sheenRoughness = 0.2;
  } else if (preset === "glass") {
    settings.roughness = 0.08;
    settings.metalness = 0;
    settings.clearcoat = 1;
    settings.transmission = 0.88;
    settings.thickness = 1.4;
    settings.opacity = 0.5;
    settings.emissive = "#000000";
    settings.emissiveIntensity = 0;
    settings.flatShading = false;
    settings.iridescence = 0;
    settings.iridescenceIOR = 1.45;
    settings.sheen = 0;
    settings.sheenRoughness = 0.25;
  } else if (preset === "frosted_glass") {
    settings.roughness = 0.42;
    settings.metalness = 0;
    settings.clearcoat = 0.55;
    settings.transmission = 0.92;
    settings.thickness = 1.8;
    settings.opacity = 0.88;
    settings.emissive = "#000000";
    settings.emissiveIntensity = 0;
    settings.flatShading = false;
    settings.iridescence = 0.08;
    settings.iridescenceIOR = 1.35;
    settings.sheen = 0.02;
    settings.sheenRoughness = 0.8;
  } else if (preset === "iridescent") {
    settings.roughness = 0.18;
    settings.metalness = 0.35;
    settings.clearcoat = 0.95;
    settings.transmission = 0.08;
    settings.thickness = 0.85;
    settings.opacity = 1;
    settings.emissive = "#160028";
    settings.emissiveIntensity = 0.08;
    settings.flatShading = false;
    settings.iridescence = 0.92;
    settings.iridescenceIOR = 1.7;
    settings.sheen = 0.22;
    settings.sheenRoughness = 0.18;
  } else if (preset === "holographic") {
    settings.roughness = 0.14;
    settings.metalness = 0.2;
    settings.clearcoat = 1;
    settings.transmission = 0.12;
    settings.thickness = 1.1;
    settings.opacity = 0.96;
    settings.emissive = "#1A0E30";
    settings.emissiveIntensity = 0.12;
    settings.flatShading = false;
    settings.iridescence = 1;
    settings.iridescenceIOR = 1.95;
    settings.sheen = 0.4;
    settings.sheenRoughness = 0.12;
  } else if (preset === "neon") {
    settings.roughness = 0.16;
    settings.metalness = 0;
    settings.clearcoat = 0.65;
    settings.transmission = 0;
    settings.thickness = 0.5;
    settings.opacity = 1;
    settings.emissive = settings.useSourceColor ? settings.color : settings.color;
    settings.emissiveIntensity = 1.4;
    settings.flatShading = false;
    settings.iridescence = 0.08;
    settings.iridescenceIOR = 1.3;
    settings.sheen = 0.1;
    settings.sheenRoughness = 0.2;
  } else if (preset === "clay") {
    settings.roughness = 0.82;
    settings.metalness = 0;
    settings.clearcoat = 0.08;
    settings.transmission = 0;
    settings.thickness = 0.3;
    settings.opacity = 1;
    settings.emissive = "#000000";
    settings.emissiveIntensity = 0;
    settings.flatShading = false;
    settings.iridescence = 0;
    settings.iridescenceIOR = 1.3;
    settings.sheen = 0.14;
    settings.sheenRoughness = 0.72;
  } else {
    settings.roughness = 0.55;
    settings.metalness = 0.08;
    settings.clearcoat = 0.18;
    settings.transmission = 0;
    settings.thickness = 0.5;
    settings.opacity = 1;
    settings.emissive = "#000000";
    settings.emissiveIntensity = 0;
    settings.flatShading = false;
    settings.iridescence = 0;
    settings.iridescenceIOR = 1.3;
    settings.sheen = 0.05;
    settings.sheenRoughness = 0.45;
  }
}

function applyThreeDLightingPreset(preset) {
  const settings = threeDState.settings;
  if (preset === "metal_booth") {
    settings.ambient = 0.35;
    settings.directional = 1.9;
    settings.lightX = 2.8;
    settings.lightY = 2.6;
    settings.lightZ = 3.6;
    settings.background = "#161A22";
  } else if (preset === "glass_clean") {
    settings.ambient = 0.55;
    settings.directional = 2.2;
    settings.lightX = 1.2;
    settings.lightY = 2.8;
    settings.lightZ = 4.1;
    settings.background = "#0E1118";
  } else if (preset === "sunset") {
    settings.ambient = 0.7;
    settings.directional = 1.35;
    settings.lightX = -2.6;
    settings.lightY = 1.8;
    settings.lightZ = 2.4;
    settings.background = "#24181A";
  } else if (preset === "night_neon") {
    settings.ambient = 0.25;
    settings.directional = 1.5;
    settings.lightX = 1.8;
    settings.lightY = 2.2;
    settings.lightZ = 3.2;
    settings.background = "#10131E";
  } else {
    settings.ambient = 0.8;
    settings.directional = 1.15;
    settings.lightX = 1.5;
    settings.lightY = 2.2;
    settings.lightZ = 2.8;
    settings.background = "#1D1D1D";
  }
}

function applyThreeDLighting(T, renderer, scene, settings, trackEnvironment) {
  const lighting = createLightingPresetConfig(settings.lightingPreset);
  const target = new T.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  const ambient = new T.AmbientLight(0xffffff, Math.max(0, settings.ambient) * lighting.ambientScale);
  scene.add(ambient);

  const hemi = new T.HemisphereLight(lighting.sky, lighting.ground, lighting.hemiIntensity);
  scene.add(hemi);
  const keyIntensity = Math.max(0, settings.directional) * lighting.keyScale;
  const lightType = settings.lightType || "directional";
  const softness = clampThreeDValue(settings.lightSoftness || 0, 0, 100) / 100;
  let key = null;
  if (lightType === "point") {
    key = new T.PointLight(lighting.keyColor, keyIntensity, 0, Math.max(1.2, 1 + softness * 2.6));
    key.position.set(settings.lightX, settings.lightY, settings.lightZ);
    scene.add(key);
  } else if (lightType === "spot") {
    key = new T.SpotLight(
      lighting.keyColor,
      keyIntensity,
      0,
      degToRad(clampThreeDValue(settings.lightConeAngle || 30, 5, 90)),
      clampThreeDValue(0.08 + softness * 0.82, 0, 1),
      1
    );
    key.position.set(settings.lightX, settings.lightY, settings.lightZ);
    key.target = target;
    scene.add(key);
    scene.add(key.target);
  } else {
    key = new T.DirectionalLight(lighting.keyColor, keyIntensity);
    key.position.set(settings.lightX, settings.lightY, settings.lightZ);
    key.target = target;
    scene.add(key);
    scene.add(key.target);
  }

  const fill = new T.DirectionalLight(lighting.fillColor, Math.max(0, settings.directional) * lighting.fillScale);
  fill.position.set(-settings.lightX * 0.9, Math.max(0.6, settings.lightY * 0.55), settings.lightZ * 0.6);
  fill.target = target;
  scene.add(fill);
  scene.add(fill.target);

  const rim = new T.DirectionalLight(lighting.rimColor, Math.max(0, settings.directional) * lighting.rimScale);
  rim.position.set(settings.lightX * -0.35, -settings.lightY * 0.4, -Math.max(1, settings.lightZ));
  rim.target = target;
  scene.add(rim);
  scene.add(rim.target);

  if (lighting.spotScale) {
    const spot = new T.SpotLight(lighting.spotColor || 0xffffff, Math.max(0, settings.directional) * lighting.spotScale, 0, 0.72, 0.18 + softness * 0.42, 1);
    spot.position.set(settings.lightX * 0.45, Math.max(1.2, settings.lightY * 1.2), Math.max(2, settings.lightZ * 1.25));
    spot.target = target;
    scene.add(spot);
    scene.add(spot.target);
  }

  if (lighting.pointScale) {
    const point = new T.PointLight(lighting.pointColor || 0xffffff, Math.max(0, settings.directional) * lighting.pointScale, 0, 2);
    point.position.set(-settings.lightX * 0.85, Math.max(0.6, settings.lightY * 0.75), Math.max(1.2, settings.lightZ * 0.45));
    scene.add(point);
  }

  const environment = createFakeEnvironmentMap(T, renderer, settings);
  if (environment && environment.texture) {
    scene.environment = environment.texture;
    if (trackEnvironment) {
      threeDPreviewRuntime.envTarget = environment;
    }
  }
  return environment;
}

function createLightingPresetConfig(preset) {
  if (preset === "metal_booth") {
    return {
      ambientScale: 0.55,
      sky: 0xf8fbff,
      ground: 0x1a1d24,
      hemiIntensity: 0.95,
      keyColor: 0xffffff,
      fillColor: 0x9ab8ff,
      rimColor: 0xffffff,
      keyScale: 1.35,
      fillScale: 0.7,
      rimScale: 0.95,
      spotScale: 0.42,
      pointScale: 0.25,
      spotColor: 0xffffff,
      pointColor: 0xbcd4ff
    };
  }
  if (preset === "glass_clean") {
    return {
      ambientScale: 0.7,
      sky: 0xffffff,
      ground: 0x1e2530,
      hemiIntensity: 1.1,
      keyColor: 0xffffff,
      fillColor: 0xd9f0ff,
      rimColor: 0xffffff,
      keyScale: 1.55,
      fillScale: 0.9,
      rimScale: 1.15,
      spotScale: 0.55,
      pointScale: 0.16,
      spotColor: 0xffffff,
      pointColor: 0xe9f8ff
    };
  }
  if (preset === "sunset") {
    return {
      ambientScale: 0.85,
      sky: 0xffd0b0,
      ground: 0x372127,
      hemiIntensity: 0.9,
      keyColor: 0xffc08c,
      fillColor: 0xff7fb9,
      rimColor: 0xffefc2,
      keyScale: 1.1,
      fillScale: 0.65,
      rimScale: 0.72,
      spotScale: 0.12,
      pointScale: 0.35,
      spotColor: 0xffd29f,
      pointColor: 0xff71b0
    };
  }
  if (preset === "night_neon") {
    return {
      ambientScale: 0.45,
      sky: 0x6c82ff,
      ground: 0x130f22,
      hemiIntensity: 0.7,
      keyColor: 0x7ef6ff,
      fillColor: 0xff4ad8,
      rimColor: 0xa7b7ff,
      keyScale: 1.15,
      fillScale: 0.95,
      rimScale: 0.9,
      spotScale: 0.26,
      pointScale: 0.65,
      spotColor: 0x7ef6ff,
      pointColor: 0xff4ad8
    };
  }
  return {
    ambientScale: 1,
    sky: 0xfafcff,
    ground: 0x23252c,
    hemiIntensity: 0.85,
    keyColor: 0xffffff,
    fillColor: 0xb7c9ff,
    rimColor: 0xfff6e8,
    keyScale: 1,
    fillScale: 0.55,
    rimScale: 0.45,
    spotScale: 0.18,
    pointScale: 0.08,
    spotColor: 0xffffff,
    pointColor: 0xdce5ff
  };
}

function createEnvironmentPresetConfig(preset) {
  if (preset === "chrome_booth") {
    return {
      top: "#FFFFFF",
      mid: "#D4DEEE",
      bottom: "#0F131B",
      bands: [["rgba(255,255,255,0.82)", 0.12, 16], ["rgba(255,255,255,0.48)", 0.56, 10], ["rgba(173,196,255,0.3)", 0.78, 12]]
    };
  }
  if (preset === "frosted_room") {
    return {
      top: "#F8FBFF",
      mid: "#DCEBFF",
      bottom: "#243141",
      bands: [["rgba(255,255,255,0.4)", 0.18, 18], ["rgba(226,243,255,0.22)", 0.62, 14]]
    };
  }
  if (preset === "sunset_band") {
    return {
      top: "#FFD8A4",
      mid: "#F08AB4",
      bottom: "#281527",
      bands: [["rgba(255,240,186,0.5)", 0.16, 16], ["rgba(255,123,191,0.26)", 0.7, 14]]
    };
  }
  if (preset === "neon_tunnel") {
    return {
      top: "#74A8FF",
      mid: "#171C39",
      bottom: "#100C22",
      bands: [["rgba(126,246,255,0.4)", 0.18, 10], ["rgba(255,74,216,0.38)", 0.56, 10], ["rgba(173,183,255,0.25)", 0.78, 8]]
    };
  }
  if (preset === "holo_prism") {
    return {
      top: "#F8FCFF",
      mid: "#B3B6FF",
      bottom: "#161225",
      bands: [["rgba(255,108,216,0.35)", 0.2, 12], ["rgba(124,255,254,0.35)", 0.42, 12], ["rgba(255,230,110,0.24)", 0.68, 14]]
    };
  }
  return {
    top: "#FFFFFF",
    mid: "#C7D6FF",
    bottom: "#1B1E27",
    bands: [["rgba(255,255,255,0.28)", 0.14, 10], ["rgba(255,255,255,0.16)", 0.68, 7]]
  };
}

function createFakeEnvironmentMap(T, renderer, settings) {
  if (!renderer) return null;
  const environment = createEnvironmentPresetConfig(settings.environmentPreset);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, environment.top);
  gradient.addColorStop(0.48, environment.mid);
  gradient.addColorStop(1, environment.bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  environment.bands.forEach(function (band) {
    context.fillStyle = band[0];
    context.fillRect(18, Math.round(canvas.height * band[1]), 220, band[2]);
  });

  const texture = new T.CanvasTexture(canvas);
  texture.mapping = T.EquirectangularReflectionMapping;
  const generator = new T.PMREMGenerator(renderer);
  const envTarget = generator.fromEquirectangular(texture);
  texture.dispose();
  generator.dispose();
  return envTarget;
}

function syncThreeDFieldInputs(keys) {
  keys.forEach(function (key) {
    contentEl.querySelectorAll('[data-three-field="' + key + '"]').forEach(function (input) {
      if (input.type === "checkbox") {
        input.checked = threeDState.settings[key] === true;
      } else {
        input.value = String(threeDState.settings[key]);
      }
    });
    contentEl.querySelectorAll('[data-three-value="' + key + '"]').forEach(function (token) {
      token.textContent = formatThreeDFieldValue(key, threeDState.settings[key]);
    });
    contentEl.querySelectorAll('[data-three-field="' + key + '"][type="color"]').forEach(function (input) {
      const readout = input.parentNode && input.parentNode.querySelector(".three-color-readout");
      if (readout) {
        readout.textContent = String(threeDState.settings[key]).toUpperCase();
      }
    });
  });
}

function formatThreeDFieldValue(key, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (key === "flareOpacity") return Math.round(number) + "%";
  if (Math.abs(number - Math.round(number)) < 0.001) return String(Math.round(number));
  return number.toFixed(2);
}

function clampThreeDValue(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function clampThreeDLightValue(value) {
  return clampThreeDValue(value, -THREE_D_LIGHT_SAFE_RANGE, THREE_D_LIGHT_SAFE_RANGE);
}

function displayThreeDMode(mode) {
  if (mode === "revolve") return "Revolve";
  if (mode === "inflate") return "Inflate";
  return "Extrude";
}

function threeDPreviewModalHtml() {
  const source = threeDState.source;
  const actionLabel = source && source.renderNodeId ? "Update Render" : "Place Render";
  const relinkDisabled = !(source && source.fromRender && source.sourceNodeId);
  const stageStyle = threeDStageStyle(source, true);
  return [
    '<div class="three-d-modal-layout">',
    '<div class="three-d-preview-stage three-d-preview-stage-modal" style="' + stageStyle + '"><canvas id="three-d-preview-canvas"></canvas><img id="three-d-preview-modal-image" class="three-d-preview-image" alt=""><div id="three-d-preview-light-gizmos" class="three-d-light-gizmos"></div><div id="three-d-preview-overlay" class="three-d-overlay"></div></div>',
    '<div class="three-d-preview-actions two-actions">',
    '<button class="command-btn" id="three-d-modal-export"' + (source ? "" : " disabled") + '>' + actionLabel + '</button>',
    '<button class="command-btn" id="three-d-modal-relink"' + (relinkDisabled ? " disabled" : "") + '>Relink Original</button>',
    '</div>',
    '<div class="three-d-help muted">Drag rotates freely. Shift + drag rolls Z. Drag the light source directly in the preview. Wheel over the source adjusts distance.</div>',
    '</div>'
  ].join("");
}
