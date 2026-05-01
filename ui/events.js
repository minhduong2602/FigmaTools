wrapBtn.onclick = function () {
  selectedLayerId = "";
  post({ type: "wrap-selection" });
};

appearanceTabBtn.onclick = function () {
  activeTab = "appearance";
  closeModal();
  render();
};

objectTabBtn.onclick = function () {
  activeTab = "object";
  fxMenuOpen = false;
  closeModal();
  render();
};

blendTabBtn.onclick = function () {
  activeTab = "blend";
  fxMenuOpen = false;
  closeModal();
  render();
};

swatchesTabBtn.onclick = function () {
  activeTab = "swatches";
  fxMenuOpen = false;
  closeModal();
  render();
};

detachBtn.onclick = function () {
  selectedLayerId = "";
  post({ type: "detach" });
};

blendMakeBtn.onclick = function () {
  post({ type: "blend-make" });
};

blendEditEndpointsBtn.onclick = function () {
  post({ type: "blend-toggle-edit-endpoints" });
};

blendSelectStartBtn.onclick = function () {
  post({ type: "blend-select-start" });
};

blendSelectEndBtn.onclick = function () {
  post({ type: "blend-select-end" });
};

blendUpdateBtn.onclick = function () {
  post({ type: "blend-update" });
};

blendOptionsBtn.onclick = function () {
  openBlendOptionsModal();
};

blendReverseBtn.onclick = function () {
  post({ type: "blend-reverse-front-to-back" });
};

blendExpandBtn.onclick = function () {
  post({ type: "blend-expand" });
};

blendReleaseBtn.onclick = function () {
  post({ type: "blend-release" });
};

newSwatchBtn.onclick = function () {
  post({ type: "save-selection-swatch" });
};

saveSwatchBtn.onclick = function () {
  const layer = selectedLayer();
  if (!layer) return;
  post({ type: "save-swatch", layerId: layer.id });
};

simplifyPathBtn.onclick = function () {
  post({ type: "simplify-path", tolerance: objectToolsState.simplifyTolerance });
};

smoothPathBtn.onclick = function () {
  post({ type: "smooth-path", amount: objectToolsState.smoothAmount });
};

duplicateBtn.onclick = function () {
  const layer = selectedLayer();
  if (layer) {
    selectedLayerId = "";
    post({ type: "duplicate-layer", layerId: layer.id });
  }
};

deleteBtn.onclick = function () {
  const layer = selectedLayer();
  if (layer) {
    selectedLayerId = "";
    post({ type: "remove-layer", layerId: layer.id });
  }
};

copyStyleBtn.onclick = function () {
  post({ type: "copy-style" });
};

pasteStyleBtn.onclick = function () {
  selectedLayerId = "";
  fxMenuOpen = false;
  post({ type: "paste-style" });
};

basicBtn.onclick = function () {
  selectedLayerId = "";
  fxMenuOpen = false;
  post({ type: "reduce-basic" });
};

printExportBtn.onclick = function () {
  openPrintModal();
};

clearBtn.onclick = function () {
  selectedLayerId = "";
  fxMenuOpen = false;
  post({ type: "clear-appearance" });
};

fxBtn.onclick = function (event) {
  event.stopPropagation();
  if (!selectedLayer()) return;
  fxMenuOpen = !fxMenuOpen;
  renderFxMenu();
};

document.querySelectorAll("[data-add]").forEach(function (button) {
  button.onclick = function () {
    selectedLayerId = "";
    fxMenuOpen = false;
    post({ type: "add-layer", layerKind: button.dataset.add });
  };
});

document.querySelectorAll("[data-fx-kind]").forEach(function (button) {
  button.onclick = function () {
    const layer = selectedLayer();
    if (!layer) return;
    fxMenuOpen = false;
    renderFxMenu();
    expanded[layer.id] = true;
    pendingEffectModal = { layerId: layer.id, effectKind: button.dataset.fxKind };
    post({ type: "add-effect", layerId: layer.id, effectKind: button.dataset.fxKind });
  };
});

document.addEventListener("click", function (event) {
  if (!fxMenuOpen) return;
  if (event.target === fxBtn || fxMenu.contains(event.target)) return;
  fxMenuOpen = false;
  renderFxMenu();
});

modalClose.onclick = function () {
  closeModal();
};

editorModal.onclick = function (event) {
  if (event.target === editorModal) closeModal();
};

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && modalState.kind) closeModal();
});

onmessage = function (event) {
  const message = event.data.pluginMessage;
  if (!message) return;
  if (message.type === "print-export-result") {
    downloadPrintPackage(message);
    return;
  }
  if (message.type !== "selection-state") return;
  Object.assign(state, message);
  ensureExpandedDefaults();
  ensureSelectedLayer();
  if (isFieldEditing()) {
    dirtyWhileEditing = true;
    return;
  }
  if (pendingEffectModal) {
    var pending = pendingEffectModal;
    pendingEffectModal = null;
    render();
    var layer = findLayer(pending.layerId);
    if (layer) {
      var effect = layer.effects.filter(function (e) { return e.type === pending.effectKind; }).slice(-1)[0];
      if (effect) {
        openEffectModal(layer.id, effect.id);
      }
    }
  } else {
    render();
  }
};
