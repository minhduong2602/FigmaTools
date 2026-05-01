function bindEvents() {
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
      });
    }
