wrapBtn.onclick = function () {
      selectedLayerId = "";
      post({ type: "wrap-selection" });
    };

    detachBtn.onclick = function () {
      selectedLayerId = "";
      post({ type: "detach" });
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
      render();
    };
