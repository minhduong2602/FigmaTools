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
  startRotationZ: 0
};

window.addEventListener("appearance-3d-ready", function () {
  if (activeTab === "three-d") {
    render();
  }
});

function requestThreeDSource() {
  if (state.selectedCount !== 1) {
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
  const hasOne = state.selectedCount === 1;
  threeDRefreshBtn.disabled = !hasOne;
  threeDExportBtn.disabled = !hasOne || !threeDState.source;
  if (!hasOne) {
    threeDState.source = null;
    statusEl.textContent = "Select one object for 3D.";
  } else if (threeDState.requestPending) {
    statusEl.textContent = "Reading selected object for 3D";
  } else if (threeDState.source) {
    statusEl.textContent = threeDState.source.name + " - " + displayThreeDMode(threeDState.mode);
  } else if (threeDState.error) {
    statusEl.textContent = threeDState.error;
  } else {
    statusEl.textContent = "Select one vector-like object.";
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
    '<div class="three-d-layout three-d-split-layout">',
    '<div class="three-d-preview-shell">',
    '<div class="three-d-preview-head"><span>Preview</span><span class="muted">' + sourceSummary + '</span></div>',
    '<div class="three-d-preview-stage" style="' + stageStyle + '"><canvas id="three-d-canvas"></canvas><img id="three-d-preview-image" class="three-d-preview-image" alt=""><div id="three-d-overlay" class="three-d-overlay"></div></div>',
    '<div class="three-d-preview-actions three-d-panel-actions"><button class="command-btn" id="three-d-inline-export"' + (source ? "" : " disabled") + '>' + actionLabel + '</button><button class="command-btn" id="three-d-relink"' + (relinkDisabled ? " disabled" : "") + '>Relink Original</button><button class="command-btn" id="three-d-open-preview"' + (source ? "" : " disabled") + '>Focus Preview</button></div>',
    '<div class="three-d-help muted">Drag orbits X/Y. Shift + drag rolls Z. Mouse wheel zooms.</div>',
    '</div>',
    '<div class="three-d-controls">',
    '<div class="modal-section">',
    '<div class="modal-section-title">Effect</div>',
    '<div class="three-mode-row">',
    threeModeButton("extrude", "Extrude"),
    threeModeButton("revolve", "Revolve"),
    threeModeButton("inflate", "Inflate"),
    '</div>',
    source ? '' : '<div class="field-note">This tab renders the selected object in Three.js, then places a PNG on the canvas. Extrude works best with closed fills. Revolve works best with a side profile path.</div>',
    '</div>',
    '<div class="modal-section">',
    '<div class="modal-section-title">Shape</div>',
    threeModeFields(settings),
    '</div>',
    '<div class="modal-section">',
    '<div class="modal-section-title">Camera & Light</div>',
    '<div class="three-grid three-grid-5">',
    threeNumberField("rotationX", "Rot X", settings.rotationX),
    threeNumberField("rotationY", "Rot Y", settings.rotationY),
    threeNumberField("rotationZ", "Rot Z", settings.rotationZ),
    threeNumberField("zoom", "Zoom", settings.zoom, "120", "1200", "1"),
    '</div>',
    '<div class="three-grid three-grid-4">',
    threeNumberField("offsetX", "Offset X", settings.offsetX, "-240", "240", "1"),
    threeNumberField("offsetY", "Offset Y", settings.offsetY, "-240", "240", "1"),
    threeNumberField("offsetZ", "Offset Z", settings.offsetZ, "-240", "240", "1"),
    threeNumberField("framePadding", "Padding", settings.framePadding, "0", "60", "1"),
    '</div>',
    '<div class="three-grid three-grid-3">',
    '<div class="field"><label>Light Preset</label><select data-three-field="lightingPreset">' + enumOptions(settings.lightingPreset, [
      ["studio", "Studio"],
      ["metal_booth", "Metal Booth"],
      ["glass_clean", "Glass Clean"],
      ["sunset", "Sunset"],
      ["night_neon", "Night Neon"]
    ]) + '</select></div>',
    threeNumberField("ambient", "Ambient", settings.ambient, "0", "3", "0.05"),
    threeNumberField("directional", "Direct", settings.directional, "0", "4", "0.05"),
    '</div>',
    '<div class="three-grid three-grid-3">',
    '<div class="field"><label>HDRI / Env</label><select data-three-field="environmentPreset">' + enumOptions(settings.environmentPreset, [
      ["studio_soft", "Studio Soft"],
      ["chrome_booth", "Chrome Booth"],
      ["frosted_room", "Frosted Room"],
      ["sunset_band", "Sunset Band"],
      ["neon_tunnel", "Neon Tunnel"],
      ["holo_prism", "Holo Prism"]
    ]) + '</select></div>',
    threeNumberField("environmentStrength", "Env Strength", settings.environmentStrength, "0", "4", "0.05"),
    '<div></div>',
    '</div>',
    '<div class="three-grid three-grid-3">',
    threeNumberField("lightX", "Light X", settings.lightX, "-8", "8", "0.1"),
    threeNumberField("lightY", "Light Y", settings.lightY, "-8", "8", "0.1"),
    threeNumberField("lightZ", "Light Z", settings.lightZ, "-8", "8", "0.1"),
    '</div>',
    '</div>',
    '<div class="modal-section">',
    '<div class="modal-section-title">Material</div>',
    '<div class="three-grid three-grid-3">',
    '<div class="field"><label>Preset</label><select data-three-field="materialPreset">' + enumOptions(settings.materialPreset, [
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
    '<div class="field"><label>Color</label><input type="color" data-three-field="color" value="' + settings.color + '"' + (settings.useSourceColor ? " disabled" : "") + '></div>',
    '<div class="field"><label>Emissive</label><input type="color" data-three-field="emissive" value="' + settings.emissive + '"></div>',
    '</div>',
    '<div class="three-grid three-grid-4">',
    threeNumberField("roughness", "Rough", settings.roughness, "0", "1", "0.05"),
    threeNumberField("metalness", "Metal", settings.metalness, "0", "1", "0.05"),
    threeNumberField("clearcoat", "Clearcoat", settings.clearcoat, "0", "1", "0.05"),
    threeNumberField("emissiveIntensity", "Glow", settings.emissiveIntensity, "0", "4", "0.05"),
    '</div>',
    '<div class="three-grid three-grid-4">',
    threeNumberField("transmission", "Transmit", settings.transmission, "0", "1", "0.05"),
    threeNumberField("thickness", "Thickness", settings.thickness, "0", "5", "0.05"),
    threeNumberField("opacity", "Opacity", settings.opacity, "0.05", "1", "0.05"),
    '<div class="field"><label>Flat</label><label class="check-row"><input type="checkbox" data-three-field="flatShading"' + (settings.flatShading ? " checked" : "") + '> Shading</label></div>',
    '</div>',
    '<div class="three-grid three-grid-4">',
    threeNumberField("iridescence", "Iridescence", settings.iridescence, "0", "1", "0.05"),
    threeNumberField("iridescenceIOR", "Iri IOR", settings.iridescenceIOR, "1", "2.5", "0.05"),
    threeNumberField("sheen", "Sheen", settings.sheen, "0", "1", "0.05"),
    threeNumberField("sheenRoughness", "Sheen Rough", settings.sheenRoughness, "0", "1", "0.05"),
    '</div>',
    '<label class="check-row"><input type="checkbox" data-three-field="useSourceColor"' + (settings.useSourceColor ? " checked" : "") + '> Use source fill color when possible</label>',
    '</div>',
    '<div class="modal-section">',
    '<div class="modal-section-title">Output</div>',
    '<div class="three-grid three-grid-3">',
    '<div class="field"><label>Background</label><input type="color" data-three-field="background" value="' + settings.background + '"' + (settings.transparentBackground ? " disabled" : "") + '></div>',
    '<div class="field"><label>Export scale</label><input type="number" min="1" max="4" step="1" data-three-field="exportScale" value="' + settings.exportScale + '"></div>',
    '<div></div>',
    '</div>',
    '<label class="check-row"><input type="checkbox" data-three-field="transparentBackground"' + (settings.transparentBackground ? " checked" : "") + '> Transparent background</label>',
    '<div class="three-grid three-grid-4">',
    '<div class="field"><label>Bloom</label><label class="check-row"><input type="checkbox" data-three-field="bloomEnabled"' + (settings.bloomEnabled ? " checked" : "") + '> Enabled</label></div>',
    '<div class="field"><label>Export</label><label class="check-row"><input type="checkbox" data-three-field="bloomSeparate"' + (settings.bloomSeparate ? " checked" : "") + (settings.bloomEnabled ? "" : " disabled") + '> Separate flare</label></div>',
    threeNumberField("bloomStrength", "Bloom Str", settings.bloomStrength, "0", "3", "0.05"),
    threeNumberField("bloomRadius", "Bloom Rad", settings.bloomRadius, "0", "1", "0.05"),
    threeNumberField("bloomThreshold", "Bloom Thres", settings.bloomThreshold, "0", "1", "0.05"),
    '</div>',
    '</div>',
    '</div>',
    '</div>'
  ].join("");
}

function threeDStageStyle(source, large) {
  const width = source && source.width ? Number(source.width) : 240;
  const height = source && source.height ? Number(source.height) : 180;
  const ratio = Math.max(0.35, Math.min(3.5, width / Math.max(1, height)));
  const minHeight = large ? 340 : 160;
  const maxHeight = large ? 560 : 220;
  const idealHeight = Math.round((large ? 420 : 190) / Math.max(0.75, ratio));
  const boundedHeight = Math.max(minHeight, Math.min(maxHeight, idealHeight));
  return "aspect-ratio:" + ratio + ";min-height:" + boundedHeight + "px;";
}

function configureThreeDRenderer(T, renderer, useDevicePixelRatio) {
  if (!renderer) return;
  renderer.setPixelRatio(useDevicePixelRatio ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  if ("outputColorSpace" in renderer && T.SRGBColorSpace) {
    renderer.outputColorSpace = T.SRGBColorSpace;
  }
  if ("toneMapping" in renderer && T.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = T.ACESFilmicToneMapping;
  }
  if ("toneMappingExposure" in renderer) {
    renderer.toneMappingExposure = 1;
  }
}

function threeModeButton(mode, label) {
  return '<button class="three-mode-btn' + (threeDState.mode === mode ? ' active' : '') + '" data-three-mode="' + mode + '">' + label + '</button>';
}

function threeModeFields(settings) {
  if (threeDState.mode === "revolve") {
    return [
      '<div class="three-grid three-grid-4">',
      threeNumberField("revolveSegments", "Segments", settings.revolveSegments, "8", "160", "1"),
      threeNumberField("revolveAngle", "Angle", settings.revolveAngle, "1", "360", "1"),
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
      '<div class="three-grid three-grid-3">',
      '<div class="field"><label>Flip</label><label class="check-row"><input type="checkbox" data-three-field="revolveFlip"' + (settings.revolveFlip ? " checked" : "") + '> Profile</label></div>',
      '<div class="field-note compact-note">Axis controls decide which side of the source profile becomes radius.</div>',
      '<div></div>',
      '</div>'
    ].join("");
  }

  if (threeDState.mode === "inflate") {
    return [
      '<div class="three-grid three-grid-3">',
      threeNumberField("inflateAmount", "Amount", settings.inflateAmount, "1", "100", "1"),
      threeNumberField("bevelSegments", "Segments", settings.bevelSegments, "1", "16", "1"),
      '<div></div>',
      '</div>'
    ].join("");
  }

  return [
    '<div class="three-grid three-grid-4">',
    threeNumberField("depth", "Depth", settings.depth, "1", "400", "1"),
    threeNumberField("bevelSize", "Bevel Size", settings.bevelSize, "0", "80", "0.5"),
    threeNumberField("bevelThickness", "Bevel Depth", settings.bevelThickness, "0", "80", "0.5"),
    threeNumberField("bevelSegments", "Segments", settings.bevelSegments, "0", "16", "1"),
    '</div>',
    '<div class="three-grid three-grid-4">',
    threeNumberField("bevelOffset", "Bevel Offset", settings.bevelOffset, "-40", "40", "0.5"),
    '<div class="field"><label>Bevel Profile</label><select data-three-field="bevelProfile">' + enumOptions(settings.bevelProfile, [
      ["flat", "Flat"],
      ["round", "Round"],
      ["soft_round", "Soft Round"],
      ["chisel", "Chisel"],
      ["slope", "Slope"]
    ]) + '</select></div>',
    '<div></div>',
    '<div></div>',
    '</div>'
  ].join("");
}

function threeNumberField(field, label, value, min, max, step) {
  return '<div class="field"><label>' + label + '</label><input type="number" data-three-field="' + field + '" value="' + value + '"' +
    (min !== undefined ? ' min="' + min + '"' : '') +
    (max !== undefined ? ' max="' + max + '"' : '') +
    (step !== undefined ? ' step="' + step + '"' : '') +
    '></div>';
}

function bindThreeDPanel() {
  contentEl.querySelectorAll("[data-three-mode]").forEach(function (button) {
    button.onclick = function () {
      threeDState.mode = button.dataset.threeMode;
      render();
    };
  });

  contentEl.querySelectorAll("[data-three-field]").forEach(function (input) {
    input.oninput = function () {
      updateThreeDSetting(input);
      ensureThreeDPreview();
    };
    input.onchange = function () {
      updateThreeDSetting(input);
      render();
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

  const relinkButton = document.getElementById("three-d-relink");
  if (relinkButton) {
    relinkButton.onclick = function () {
      relinkThreeDOriginal();
    };
  }
}

function updateThreeDSetting(input) {
  const key = input.dataset.threeField;
  if (!key) return;
  if (key === "lightingPreset") {
    threeDState.settings.lightingPreset = input.value;
    applyThreeDLightingPreset(input.value);
    render();
    return;
  }
  if (key === "materialPreset") {
    threeDState.settings.materialPreset = input.value;
    applyThreeDMaterialPreset(input.value);
    render();
    return;
  }
  if (input.type === "checkbox") {
    threeDState.settings[key] = input.checked;
    if (key === "transparentBackground" || key === "useSourceColor") {
      render();
    }
    return;
  }
  if (input.type === "number") {
    threeDState.settings[key] = input.value === "" ? 0 : Number(input.value);
    return;
  }
  threeDState.settings[key] = input.value;
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
  if (!canvas || !overlay) return;

  const lib = threeDLib();
  if (!lib) {
    overlay.textContent = window.Appearance3DError || "Loading Three.js";
    return;
  }

  if (!threeDState.source || !threeDState.source.svg) {
    overlay.textContent = threeDState.error || "Select one object, then refresh the 3D source.";
    disposeThreeDPreview();
    return;
  }

  overlay.textContent = "";
  renderThreeDPreview(canvas, previewImage, overlay, lib);
}

function renderThreeDPreview(canvas, previewImage, overlay, lib) {
  const T = lib.THREE;
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
    configureThreeDRenderer(T, threeDPreviewRuntime.renderer, true);
    threeDPreviewRuntime.scene = new T.Scene();
    threeDPreviewRuntime.camera = new T.PerspectiveCamera(32, 1, 0.1, 5000);
    bindThreeDCanvasOrbit(canvas);
  }

  const width = Math.max(1, canvas.clientWidth || 300);
  const height = Math.max(1, canvas.clientHeight || 240);
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
    renderThreeDWithEffects(lib, threeDPreviewRuntime.renderer, threeDPreviewRuntime.scene, threeDPreviewRuntime.camera, width, height, threeDState.settings);
    return;
  }

  overlay.textContent = "";
  threeDPreviewRuntime.root = object3d;
  threeDPreviewRuntime.scene.add(object3d);
  updateThreeDCameraOrbit(T, threeDPreviewRuntime.camera, threeDState.settings, object3d);
  if (threeDState.settings.transparentBackground && threeDState.settings.bloomEnabled) {
    renderThreeDCompositePreview(lib, previewImage, width, height, threeDPreviewRuntime.scene, threeDPreviewRuntime.camera);
    canvas.classList.add("three-d-canvas-hidden");
  } else {
    if (previewImage) {
      previewImage.removeAttribute("src");
      previewImage.classList.remove("visible");
    }
    canvas.classList.remove("three-d-canvas-hidden");
    renderThreeDWithEffects(lib, threeDPreviewRuntime.renderer, threeDPreviewRuntime.scene, threeDPreviewRuntime.camera, width, height, threeDState.settings);
  }
}

function renderThreeDCompositePreview(lib, previewImage, width, height, scene, camera) {
  if (!previewImage) return;
  const compositeCanvas = compositeTransparentBloomCanvas(lib, scene, camera, width, height);
  if (!compositeCanvas) return;
  const nextUrl = compositeCanvas.toDataURL("image/png");
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
    threeDPreviewRuntime.dragging = true;
    threeDPreviewRuntime.dragStartX = event.clientX;
    threeDPreviewRuntime.dragStartY = event.clientY;
    threeDPreviewRuntime.dragMode = event.shiftKey ? "roll" : "orbit";
    threeDPreviewRuntime.startRotationX = threeDState.settings.rotationX;
    threeDPreviewRuntime.startRotationY = threeDState.settings.rotationY;
    threeDPreviewRuntime.startRotationZ = threeDState.settings.rotationZ;
    canvas.style.cursor = "grabbing";
  };

  canvas.onmousemove = function (event) {
    if (!threeDPreviewRuntime.dragging) return;
    const dx = event.clientX - threeDPreviewRuntime.dragStartX;
    const dy = event.clientY - threeDPreviewRuntime.dragStartY;
    if (threeDPreviewRuntime.dragMode === "roll") {
      threeDState.settings.rotationZ = clampThreeDValue(threeDPreviewRuntime.startRotationZ + dx * 0.35, -180, 180);
      syncThreeDFieldInputs(["rotationZ"]);
    } else {
      threeDState.settings.rotationY = clampThreeDValue(threeDPreviewRuntime.startRotationY + dx * 0.22, -180, 180);
      threeDState.settings.rotationX = clampThreeDValue(threeDPreviewRuntime.startRotationX - dy * 0.22, -89, 89);
      syncThreeDFieldInputs(["rotationX", "rotationY"]);
    }
    ensureThreeDPreview();
  };

  canvas.onmouseup = function () {
    stopThreeDCanvasOrbit(canvas);
  };

  canvas.onmouseleave = function () {
    stopThreeDCanvasOrbit(canvas);
  };

  canvas.onwheel = function (event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 24 : -24;
    threeDState.settings.zoom = clampThreeDValue((threeDState.settings.zoom || 420) + delta, 120, 1200);
    syncThreeDFieldInputs(["zoom"]);
    ensureThreeDPreview();
  };
}

function stopThreeDCanvasOrbit(canvas) {
  if (!threeDPreviewRuntime.dragging) return;
  threeDPreviewRuntime.dragging = false;
  canvas.style.cursor = "";
}

function disposeThreeDNode(node, T) {
  if (!node) return;
  if (node.geometry && typeof node.geometry.dispose === "function") {
    node.geometry.dispose();
  }
  if (node.material) {
    if (Array.isArray(node.material)) {
      node.material.forEach(function (material) {
        if (material && typeof material.dispose === "function") material.dispose();
      });
    } else if (typeof node.material.dispose === "function") {
      node.material.dispose();
    }
  }
  if (node.children && node.children.length) {
    node.children.forEach(function (child) {
      disposeThreeDNode(child, T);
    });
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
  pivot.rotation.z = T.MathUtils.degToRad(settings.rotationZ);
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
      const mesh = new T.Mesh(geometry, threeDMaterialForPath(T, path, settings));
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
      const mesh = new T.Mesh(geometry, threeDMaterialForPath(T, path, settings));
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
  const mesh = new T.Mesh(geometry, threeDMaterialForPath(T, data.paths[0], settings));
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

function threeDMaterialForPath(T, path, settings) {
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
  const pitch = T.MathUtils.degToRad(clampThreeDValue(settings.rotationX || 0, -89, 89));
  const yaw = T.MathUtils.degToRad(settings.rotationY || 0);
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * radius,
    target.y + Math.sin(pitch) * radius,
    target.z + Math.cos(yaw) * Math.cos(pitch) * radius
  );
  camera.lookAt(target.x, target.y, target.z);
  camera.updateProjectionMatrix();
}

function exportThreeDRender() {
  if (!threeDPreviewRuntime.renderer || !threeDPreviewRuntime.canvas || !threeDState.source) return;
  const scale = Math.max(1, Math.min(4, Math.round(threeDState.settings.exportScale || 1)));
  const separateBloom = threeDState.settings.bloomEnabled && threeDState.settings.bloomSeparate;
  const baseResult = scaledThreeDExportCanvas(scale, threeDState.source, separateBloom ? "base" : "combined");
  const dataUrl = baseResult && baseResult.canvas ? baseResult.canvas.toDataURL("image/png") : "";
  let bloomDataUrl = "";
  let bloomBlendMode = "";
  let bloomOpacity = 100;
  if (separateBloom) {
    const bloomResult = scaledThreeDExportCanvas(scale, threeDState.source, "bloom");
    bloomDataUrl = bloomResult && bloomResult.canvas ? bloomResult.canvas.toDataURL("image/png") : "";
    if (bloomResult && bloomResult.renderer) {
      bloomResult.renderer.dispose();
    }
    bloomBlendMode = "SCREEN";
    bloomOpacity = 100;
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
    sourceNodeId: threeDState.source.sourceNodeId || ""
  });
}

function scaledThreeDExportCanvas(scale, source, mode) {
  if (!threeDPreviewRuntime.renderer || !threeDState.source || scale < 1) return null;
  const lib = threeDLib();
  if (!lib || !lib.THREE) return null;
  const T = lib.THREE;
  const sourceWidth = source && source.width ? Number(source.width) : threeDPreviewRuntime.canvas.width;
  const sourceHeight = source && source.height ? Number(source.height) : threeDPreviewRuntime.canvas.height;
  const ratio = Math.max(0.35, Math.min(3.5, sourceWidth / Math.max(1, sourceHeight)));
  const baseWidth = Math.max(256, Math.round(Math.min(2048, sourceWidth * 2)));
  const width = Math.max(1, baseWidth);
  const height = Math.max(1, Math.round(baseWidth / ratio));
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  configureThreeDRenderer(T, renderer, false);
  renderer.setSize(width * scale, height * scale, false);
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
  const camera = new T.PerspectiveCamera(32, width / height, 0.1, 5000);
  updateThreeDCameraOrbit(T, camera, threeDState.settings, object3d);
  let outputCanvas = renderer.domElement;
  if (mode === "bloom") {
    outputCanvas = renderBloomOnlyCanvas(lib, scene, camera, width * scale, height * scale) || renderer.domElement;
  } else if (mode === "base") {
    renderer.render(scene, camera);
  } else if (threeDState.settings.transparentBackground && threeDState.settings.bloomEnabled && lib.EffectComposer && lib.RenderPass && lib.UnrealBloomPass) {
    outputCanvas = compositeTransparentBloomExport(lib, scene, camera, width * scale, height * scale, renderer.domElement);
  } else {
    renderThreeDWithEffects(lib, renderer, scene, camera, width * scale, height * scale, threeDState.settings);
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
  configureThreeDRenderer(T, bloomRenderer, false);
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
  configureThreeDRenderer(T, baseRenderer, false);
  baseRenderer.setSize(width, height, false);
  baseRenderer.setClearColor(0x000000, 0);
  baseRenderer.render(scene, camera);

  const bloomRenderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  configureThreeDRenderer(T, bloomRenderer, false);
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
  const ambient = new T.AmbientLight(0xffffff, Math.max(0, settings.ambient) * lighting.ambientScale);
  scene.add(ambient);

  const hemi = new T.HemisphereLight(lighting.sky, lighting.ground, lighting.hemiIntensity);
  scene.add(hemi);

  const key = new T.DirectionalLight(lighting.keyColor, Math.max(0, settings.directional) * lighting.keyScale);
  key.position.set(settings.lightX, settings.lightY, settings.lightZ);
  scene.add(key);

  const fill = new T.DirectionalLight(lighting.fillColor, Math.max(0, settings.directional) * lighting.fillScale);
  fill.position.set(-settings.lightX * 0.9, Math.max(0.6, settings.lightY * 0.55), settings.lightZ * 0.6);
  scene.add(fill);

  const rim = new T.DirectionalLight(lighting.rimColor, Math.max(0, settings.directional) * lighting.rimScale);
  rim.position.set(settings.lightX * -0.35, -settings.lightY * 0.4, -Math.max(1, settings.lightZ));
  scene.add(rim);

  if (lighting.spotScale) {
    const spot = new T.SpotLight(lighting.spotColor || 0xffffff, Math.max(0, settings.directional) * lighting.spotScale, 0, 0.72, 0.28, 1);
    spot.position.set(settings.lightX * 0.45, Math.max(1.2, settings.lightY * 1.2), Math.max(2, settings.lightZ * 1.25));
    scene.add(spot);
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
    const input = contentEl.querySelector('[data-three-field="' + key + '"]');
    if (!input) return;
    if (input.type === "checkbox") {
      input.checked = threeDState.settings[key] === true;
    } else {
      input.value = String(threeDState.settings[key]);
    }
  });
}

function clampThreeDValue(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
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
    '<div class="three-d-preview-stage three-d-preview-stage-modal" style="' + stageStyle + '"><canvas id="three-d-preview-canvas"></canvas><img id="three-d-preview-modal-image" class="three-d-preview-image" alt=""><div id="three-d-preview-overlay" class="three-d-overlay"></div></div>',
    '<div class="three-d-preview-actions two-actions">',
    '<button class="command-btn" id="three-d-modal-export"' + (source ? "" : " disabled") + '>' + actionLabel + '</button>',
    '<button class="command-btn" id="three-d-modal-relink"' + (relinkDisabled ? " disabled" : "") + '>Relink Original</button>',
    '</div>',
    '<div class="three-d-help muted">Drag orbits X/Y. Shift + drag rolls Z. Mouse wheel zooms.</div>',
    '</div>'
  ].join("");
}
