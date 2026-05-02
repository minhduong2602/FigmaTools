function bindEvents() {
      contentEl.querySelectorAll("[data-blend-options]").forEach(function (row) {
        row.ondblclick = function () {
          openBlendOptionsModal();
        };
      });

      contentEl.querySelectorAll("[data-blend-edit]").forEach(function (button) {
        button.onclick = function (event) {
          event.stopPropagation();
          openBlendOptionsModal();
        };
      });

      contentEl.querySelectorAll("[data-swatch-apply]").forEach(function (button) {
        button.onclick = function () {
          const layer = selectedLayer();
          if (!layer) return;
          post({ type: "apply-swatch", layerId: layer.id, swatchId: button.dataset.swatchApply });
        };
      });

      contentEl.querySelectorAll("[data-swatch-remove]").forEach(function (button) {
        button.onclick = function (event) {
          event.stopPropagation();
          post({ type: "remove-swatch", swatchId: button.dataset.swatchRemove });
        };
      });

      contentEl.querySelectorAll("[data-object-tool]").forEach(function (input) {
        input.oninput = function () {
          const key = input.dataset.objectTool;
          objectToolsState[key] = input.value === "" ? 0 : Number(input.value);
        };
      });

      contentEl.querySelectorAll("[data-open-object-tool]").forEach(function (button) {
        button.onclick = function () {
          openObjectPathModal(button.dataset.openObjectTool);
        };
      });

      contentEl.querySelectorAll("[data-object-row]").forEach(function (row) {
        row.ondblclick = function () {
          openObjectModal();
        };
      });

      contentEl.querySelectorAll("[data-object-edit]").forEach(function (button) {
        button.onclick = function (event) {
          event.stopPropagation();
          openObjectModal();
        };
      });

      contentEl.querySelectorAll("[data-row-layer]").forEach(function (row) {
        row.onclick = function () {
          selectedLayerId = row.dataset.rowLayer;
          fxMenuOpen = false;
          render();
        };

        row.ondblclick = function () {
          selectedLayerId = row.dataset.rowLayer;
          openLayerModal(row.dataset.rowLayer);
        };

        row.ondragstart = function (event) {
          draggedLayerId = row.dataset.rowLayer;
          selectedLayerId = draggedLayerId;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", draggedLayerId);
        };

        row.ondragover = function (event) {
          if (!draggedLayerId || draggedLayerId === row.dataset.rowLayer) return;
          event.preventDefault();
          row.classList.add("drop-before");
        };

        row.ondragleave = function () {
          row.classList.remove("drop-before");
        };

        row.ondrop = function (event) {
          event.preventDefault();
          row.classList.remove("drop-before");
          const targetLayerId = row.dataset.rowLayer;
          if (!draggedLayerId || draggedLayerId === targetLayerId) return;
          post({ type: "reorder-layer", layerId: draggedLayerId, afterLayerId: targetLayerId });
          draggedLayerId = "";
        };

        row.ondragend = function () {
          draggedLayerId = "";
          contentEl.querySelectorAll(".drop-before").forEach(function (item) {
            item.classList.remove("drop-before");
          });
        };
      });

      contentEl.querySelectorAll("[data-edit-layer]").forEach(function (button) {
        button.onclick = function (event) {
          event.stopPropagation();
          selectedLayerId = button.dataset.editLayer;
          openLayerModal(button.dataset.editLayer);
        };
      });

      contentEl.querySelectorAll("[data-opacity-row]").forEach(function (row) {
        row.ondblclick = function () {
          selectedLayerId = row.dataset.opacityRow;
          openLayerModal(row.dataset.opacityRow);
        };
      });

      contentEl.querySelectorAll("[data-action]").forEach(function (button) {
        button.onclick = function (event) {
          event.stopPropagation();
          const article = button.closest("[data-layer]");
          const layerId = article ? article.dataset.layer : "";
          const layer = findLayer(layerId);
          if (!layer) return;
          const action = button.dataset.action;
          selectedLayerId = layerId;
          if (action === "expand") {
            expanded[layerId] = expanded[layerId] === false;
            render();
          }
          if (action === "visible") {
            post({ type: "update-layer", layer: Object.assign({}, layer, { visible: !layer.visible }) });
          }
        };
      });

      contentEl.querySelectorAll("[data-effect-action]").forEach(function (button) {
        button.onclick = function (event) {
          event.stopPropagation();
          const row = button.closest("[data-effect]");
          const layerId = row ? row.dataset.layer : "";
          const effectId = row ? row.dataset.effect : "";
          const layer = findLayer(layerId);
          const effect = layer ? findEffect(layer, effectId) : null;
          if (!layer || !effect) return;
          const action = button.dataset.effectAction;
          selectedLayerId = layerId;
          if (action === "remove") post({ type: "remove-effect", layerId: layerId, effectId: effectId });
          if (action === "visible") post({ type: "update-effect", layerId: layerId, effect: Object.assign({}, effect, { visible: !effect.visible }) });
        };
      });

      contentEl.querySelectorAll("[data-effect]").forEach(function (row) {
        row.ondblclick = function () {
          const layerId = row.dataset.layer;
          const effectId = row.dataset.effect;
          selectedLayerId = layerId;
          openEffectModal(layerId, effectId);
        };

        row.ondragstart = function (event) {
          draggedEffectId = row.dataset.effect;
          draggedEffectLayerId = row.dataset.layer;
          selectedLayerId = draggedEffectLayerId;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", draggedEffectId);
          event.stopPropagation();
        };

        row.ondragover = function (event) {
          if (!draggedEffectId) return;
          if (row.dataset.layer !== draggedEffectLayerId) return;
          if (row.dataset.effect === draggedEffectId) return;
          event.preventDefault();
          event.stopPropagation();
          row.classList.add("drop-before");
        };

        row.ondragleave = function () {
          row.classList.remove("drop-before");
        };

        row.ondrop = function (event) {
          event.preventDefault();
          event.stopPropagation();
          row.classList.remove("drop-before");
          var targetEffectId = row.dataset.effect;
          if (!draggedEffectId || draggedEffectId === targetEffectId) return;
          if (row.dataset.layer !== draggedEffectLayerId) return;
          post({ type: "reorder-effect", layerId: draggedEffectLayerId, effectId: draggedEffectId, beforeEffectId: targetEffectId });
          draggedEffectId = "";
          draggedEffectLayerId = "";
        };

        row.ondragend = function () {
          draggedEffectId = "";
          draggedEffectLayerId = "";
          contentEl.querySelectorAll(".drop-before").forEach(function (item) {
            item.classList.remove("drop-before");
          });
        };
      });
    }
