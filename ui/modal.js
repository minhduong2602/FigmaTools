function openObjectModal() {
      if (!state.isAppearance) return;
      modalState.kind = "object";
      modalState.layerId = "";
      modalState.effectId = "";
      fxMenuOpen = false;
      renderFxMenu();
      renderModal();
    }

    function openLayerModal(layerId) {
      if (!findLayer(layerId)) return;
      modalState.kind = "layer";
      modalState.layerId = layerId;
      modalState.effectId = "";
      selectedLayerId = layerId;
      fxMenuOpen = false;
      render();
    }

    function openEffectModal(layerId, effectId) {
      const layer = findLayer(layerId);
      const effect = layer ? findEffect(layer, effectId) : null;
      if (!layer || !effect) return;
      modalState.kind = "effect";
      modalState.layerId = layerId;
      modalState.effectId = effectId;
      selectedLayerId = layerId;
      fxMenuOpen = false;
      render();
    }

    function openPrintModal() {
      if (!state.isAppearance) return;
      modalState.kind = "print";
      modalState.layerId = "";
      modalState.effectId = "";
      fxMenuOpen = false;
      renderFxMenu();
      renderModal();
    }

    function closeModal() {
      modalState.kind = "";
      modalState.layerId = "";
      modalState.effectId = "";
      hideModal();
    }

    function hideModal() {
      editorModal.hidden = true;
      modalTitle.textContent = "Edit";
      modalBody.innerHTML = "";
    }

    function renderModal() {
      if (!modalState.kind) {
        hideModal();
        return;
      }

      if (!state.isAppearance) {
        closeModal();
        return;
      }

      if (modalState.kind === "object") {
        modalTitle.textContent = "Object Appearance";
        modalBody.innerHTML = objectModalHtml();
        editorModal.hidden = false;
        bindModalFields();
        return;
      }

      if (modalState.kind === "print") {
        modalTitle.textContent = "Print Export";
        modalBody.innerHTML = printModalHtml();
        editorModal.hidden = false;
        bindModalFields();
        return;
      }

      const layer = findLayer(modalState.layerId);
      if (!layer) {
        closeModal();
        return;
      }

      if (modalState.kind === "layer") {
        modalTitle.textContent = (layer.type === "stroke" ? "Stroke" : "Fill") + " Appearance";
        modalBody.innerHTML = layerModalHtml(layer);
        editorModal.hidden = false;
        bindModalFields();
        return;
      }

      const effect = findEffect(layer, modalState.effectId);
      if (!effect) {
        closeModal();
        return;
      }
      modalTitle.textContent = effect.name;
      modalBody.innerHTML = effectModalHtml(effect);
      editorModal.hidden = false;
      bindModalFields();
    }

    function objectModalHtml() {
      const properties = state.objectProperties || {};
      const globalAppearance = state.globalAppearance || { opacity: 100, blendMode: "NORMAL" };
      const textProperties = state.textProperties || {};
      const corner = properties.hasCornerRadius === true ? '<div class="field"><label>Corner</label><input type="number" min="0" data-object-field="cornerRadius" value="' + valueText(properties.cornerRadius) + '"></div>' : '<div></div>';
      const textSection = state.isTextBase ? [
        '<div class="modal-section">',
        '<div class="modal-section-title">Character</div>',
        '<div class="fields global-row">',
        '<div class="field"><label>Font</label><select data-text-style-field="fontFamily">' + fontFamilyOptions(textProperties.fontFamily) + '</select></div>',
        '<div class="field"><label>Style</label><select data-text-style-field="fontStyle">' + fontStyleOptions(textProperties.fontFamily, textProperties.fontStyle) + '</select></div>',
        '</div>',
        '<div class="fields four">',
        '<div class="field"><label>Size</label><input type="number" min="1" max="1000" data-text-style-field="fontSize" value="' + valueText(textProperties.fontSize) + '"></div>',
        '<div class="field"><label>Line</label><input type="number" min="0" max="10000" data-text-style-field="lineHeightValue" value="' + valueText(textProperties.lineHeightValue) + '"' + (textProperties.lineHeightMode === "AUTO" ? " disabled" : "") + '></div>',
        '<div class="field"><label>Line unit</label><select data-text-style-field="lineHeightMode">' + enumOptions(textProperties.lineHeightMode, [
          ["AUTO", "Auto"],
          ["PIXELS", "px"],
          ["PERCENT", "%"]
        ]) + '</select></div>',
        '<div class="field"><label>Tracking</label><input type="number" min="-1000" max="1000" data-text-style-field="letterSpacingValue" value="' + valueText(textProperties.letterSpacingValue) + '"></div>',
        '</div>',
        '<div class="fields four">',
        '<div class="field"><label>Track unit</label><select data-text-style-field="letterSpacingMode">' + enumOptions(textProperties.letterSpacingMode, [
          ["PIXELS", "px"],
          ["PERCENT", "%"]
        ]) + '</select></div>',
        '<div class="field"><label>Paragraph</label><input type="number" min="0" max="10000" data-text-style-field="paragraphSpacing" value="' + valueText(textProperties.paragraphSpacing) + '"></div>',
        '<div class="field"><label>Case</label><select data-text-style-field="textCase">' + enumOptions(textProperties.textCase, [
          ["ORIGINAL", "Original"],
          ["UPPER", "Upper"],
          ["LOWER", "Lower"],
          ["TITLE", "Title"]
        ]) + '</select></div>',
        '<div class="field"><label>Decoration</label><select data-text-style-field="textDecoration">' + enumOptions(textProperties.textDecoration, [
          ["NONE", "None"],
          ["UNDERLINE", "Underline"],
          ["STRIKETHROUGH", "Strike"]
        ]) + '</select></div>',
        '</div>',
        '</div>',
        '<div class="modal-section">',
        '<div class="modal-section-title">Text</div>',
        '<textarea data-text-field="characters" spellcheck="false">' + escapeHtml(state.textContent || "") + '</textarea>',
        '</div>'
      ].join("") : "";

      return [
        '<div class="modal-section">',
        '<div class="modal-section-title">Object</div>',
        '<div class="fields object-row">',
        '<div class="field"><label>X</label><input type="number" data-object-field="x" value="' + valueText(properties.x) + '"></div>',
        '<div class="field"><label>Y</label><input type="number" data-object-field="y" value="' + valueText(properties.y) + '"></div>',
        '<div class="field"><label>W</label><input type="number" min="0.01" data-object-field="width" value="' + valueText(properties.width) + '"></div>',
        '<div class="field"><label>H</label><input type="number" min="0.01" data-object-field="height" value="' + valueText(properties.height) + '"></div>',
        '</div>',
        '<div class="fields object-row">',
        '<div class="field"><label>Rotate</label><input type="number" data-object-field="rotation" value="' + valueText(properties.rotation) + '"></div>',
        corner,
        '<div></div>',
        '<div></div>',
        '</div>',
        '</div>',
        '<div class="modal-section">',
        '<div class="modal-section-title">Global Appearance</div>',
        '<div class="fields global-row">',
        '<div class="field"><label>Blend mode</label><select data-global-field="blendMode">' + blendModeOptions(globalAppearance.blendMode) + '</select></div>',
        '<div class="field"><label>Opacity</label><input type="number" min="0" max="100" data-global-field="opacity" value="' + valueText(globalAppearance.opacity) + '"></div>',
        '</div>',
        '</div>',
        textSection
      ].join("");
    }

    function layerModalHtml(layer) {
      return [
        '<div class="modal-section">',
        '<div class="modal-section-title">' + (layer.type === "stroke" ? "Stroke Paint" : "Fill Paint") + '</div>',
        paintFields(layer),
        '</div>',
        layer.type === "stroke" ? '<div class="modal-section"><div class="modal-section-title">Stroke Style</div>' + strokeStyleFields(layer) + '</div>' : ""
      ].join("");
    }

    function effectModalHtml(effect) {
      return [
        '<div class="modal-section">',
        '<div class="modal-section-title">Effect Settings</div>',
        effectFields(effect),
        '</div>'
      ].join("");
    }

    function printModalHtml() {
      const warnings = printWarnings();
      const warningHtml = warnings.length ? '<ul class="print-warnings">' + warnings.map(function (warning) {
        return '<li class="print-warning">' + escapeHtml(warning) + '</li>';
      }).join("") + '</ul>' : '<div class="print-ok">No obvious print warnings from the current stack.</div>';

      return [
        '<div class="modal-section">',
        '<div class="modal-section-title">CMYK Intent</div>',
        '<div class="fields global-row">',
        '<div class="field"><label>Profile</label><select data-print-field="profile">' + enumOptions(printSettings.profile, [
          ["U.S. Web Coated (SWOP) v2", "U.S. Web Coated (SWOP) v2"],
          ["GRACoL 2006 Coated1 v2", "GRACoL 2006 Coated1 v2"],
          ["FOGRA39 / ISO Coated v2", "FOGRA39 / ISO Coated v2"],
          ["Japan Color 2001 Coated", "Japan Color 2001 Coated"]
        ]) + '</select></div>',
        '<div class="field"><label>PDF target</label><select data-print-field="pdfTarget">' + enumOptions(printSettings.pdfTarget, [
          ["PDF/X-4 intent", "PDF/X-4 intent"],
          ["PDF/X-1a intent", "PDF/X-1a intent"]
        ]) + '</select></div>',
        '</div>',
        '</div>',
        '<div class="modal-section">',
        '<div class="modal-section-title">Page Setup</div>',
        '<div class="fields four">',
        '<div class="field"><label>Trim W mm</label><input type="number" min="1" data-print-field="trimWidthMm" value="' + printSettings.trimWidthMm + '"></div>',
        '<div class="field"><label>Trim H mm</label><input type="number" min="1" data-print-field="trimHeightMm" value="' + printSettings.trimHeightMm + '"></div>',
        '<div class="field"><label>Bleed mm</label><input type="number" min="0" data-print-field="bleedMm" value="' + printSettings.bleedMm + '"></div>',
        '<div class="field"><label>Safe mm</label><input type="number" min="0" data-print-field="safeMm" value="' + printSettings.safeMm + '"></div>',
        '</div>',
        '<div class="fields three">',
        '<div class="field"><label>Raster DPI</label><input type="number" min="72" max="1200" data-print-field="dpi" value="' + printSettings.dpi + '"></div>',
        '<div class="field"><label>Black policy</label><select data-print-field="blackPolicy">' + enumOptions(printSettings.blackPolicy, [
          ["100K text, rich black only for large solids", "100K text"],
          ["Preserve RGB black until CMYK conversion", "Preserve RGB black"]
        ]) + '</select></div>',
        '<div></div>',
        '</div>',
        '</div>',
        '<div class="modal-section">',
        '<div class="modal-section-title">Preflight</div>',
        warningHtml,
        '</div>',
        '<div class="modal-section">',
        '<button class="command-btn" id="export-print-package">Export source PDF + manifest</button>',
        '</div>'
      ].join("");
    }

    function bindModalFields() {
      if (modalState.kind === "layer") {
        const layerId = modalState.layerId;
        modalBody.querySelectorAll("[data-field]").forEach(function (control) {
          wireField(control, function () {
            const layer = findLayer(layerId);
            if (!layer) return null;
            const updated = Object.assign({}, layer);
            updated[control.dataset.field] = fieldValue(control);
            updateLocalLayer(updated);
            return { key: "layer:" + layerId, message: { type: "update-layer", layer: updated, silent: true } };
          });
        });
      }

      if (modalState.kind === "effect") {
        const layerId = modalState.layerId;
        const effectId = modalState.effectId;
        modalBody.querySelectorAll("[data-effect-field]").forEach(function (input) {
          wireField(input, function () {
            const layer = findLayer(layerId);
            const effect = layer ? findEffect(layer, effectId) : null;
            if (!layer || !effect) return null;
            const updated = Object.assign({}, effect);
            updated[input.dataset.effectField] = fieldValue(input);
            updateLocalEffect(layerId, updated);
            return {
              key: "effect:" + effectId,
              message: { type: "update-effect", layerId: layerId, effect: updated, silent: true }
            };
          });
        });
      }

      if (modalState.kind === "object") {
        wireModalObjectFields(Array.prototype.slice.call(modalBody.querySelectorAll("[data-object-field]")));
        wireModalGlobalFields(Array.prototype.slice.call(modalBody.querySelectorAll("[data-global-field]")));
        const textInput = modalBody.querySelector("[data-text-field]");
        if (textInput) wireModalTextField(textInput);
        wireModalTextStyleFields(Array.prototype.slice.call(modalBody.querySelectorAll("[data-text-style-field]")));
      }

      if (modalState.kind === "print") {
        wirePrintFields(Array.prototype.slice.call(modalBody.querySelectorAll("[data-print-field]")));
        const exportButton = modalBody.querySelector("#export-print-package");
        if (exportButton) {
          exportButton.onclick = function () {
            post({
              type: "export-print-package",
              printSettings: Object.assign({}, printSettings),
              silent: true
            });
          };
        }
      }
    }

    function wireModalObjectFields(inputs) {
      inputs.forEach(function (input) {
        input.onfocus = function () {
          dirtyWhileEditing = false;
        };
        input.oninput = function () {
          const objectProperties = currentObjectPropertiesFromControls(inputs);
          state.objectProperties = Object.assign({}, state.objectProperties || {}, objectProperties);
          schedule("object-properties", {
            type: "update-object-properties",
            objectProperties: objectProperties,
            silent: true
          });
        };
        input.onchange = function () {
          const objectProperties = currentObjectPropertiesFromControls(inputs);
          state.objectProperties = Object.assign({}, state.objectProperties || {}, objectProperties);
          flush("object-properties", {
            type: "update-object-properties",
            objectProperties: objectProperties,
            silent: true
          });
        };
        input.onblur = function () {
          const objectProperties = currentObjectPropertiesFromControls(inputs);
          state.objectProperties = Object.assign({}, state.objectProperties || {}, objectProperties);
          flush("object-properties", {
            type: "update-object-properties",
            objectProperties: objectProperties,
            silent: true
          });
          setTimeout(function () {
            if (dirtyWhileEditing || !isFieldEditing()) render();
          }, 0);
        };
      });
    }

    function wireModalGlobalFields(inputs) {
      inputs.forEach(function (input) {
        input.onfocus = function () {
          dirtyWhileEditing = false;
        };
        input.oninput = function () {
          const globalAppearance = currentGlobalAppearanceFromControls(inputs);
          state.globalAppearance = globalAppearance;
          schedule("global-appearance", {
            type: "update-global",
            globalAppearance: globalAppearance,
            silent: true
          });
        };
        input.onchange = function () {
          const globalAppearance = currentGlobalAppearanceFromControls(inputs);
          state.globalAppearance = globalAppearance;
          flush("global-appearance", {
            type: "update-global",
            globalAppearance: globalAppearance,
            silent: true
          });
        };
        input.onblur = function () {
          const globalAppearance = currentGlobalAppearanceFromControls(inputs);
          state.globalAppearance = globalAppearance;
          flush("global-appearance", {
            type: "update-global",
            globalAppearance: globalAppearance,
            silent: true
          });
          setTimeout(function () {
            if (dirtyWhileEditing || !isFieldEditing()) render();
          }, 0);
        };
      });
    }

    function wireModalTextField(input) {
      input.onfocus = function () {
        dirtyWhileEditing = false;
      };
      input.oninput = function () {
        state.textContent = input.value;
        schedule("text-content", {
          type: "update-text",
          characters: input.value,
          silent: true
        });
      };
      input.onchange = function () {
        state.textContent = input.value;
        flush("text-content", {
          type: "update-text",
          characters: input.value,
          silent: true
        });
      };
      input.onblur = function () {
        state.textContent = input.value;
        flush("text-content", {
          type: "update-text",
          characters: input.value,
          silent: true
        });
        setTimeout(function () {
          if (dirtyWhileEditing || !isFieldEditing()) render();
        }, 0);
      };
    }

    function wireModalTextStyleFields(inputs) {
      inputs.forEach(function (input) {
        input.onfocus = function () {
          dirtyWhileEditing = false;
        };
        input.oninput = function () {
          const textProperties = currentTextPropertiesFromControls(inputs);
          state.textProperties = Object.assign({}, state.textProperties || {}, textProperties);
          schedule("text-style", {
            type: "update-text-style",
            textProperties: textProperties,
            silent: true
          });
        };
        input.onchange = function () {
          const textProperties = currentTextPropertiesFromControls(inputs);
          state.textProperties = Object.assign({}, state.textProperties || {}, textProperties);
          flush("text-style", {
            type: "update-text-style",
            textProperties: textProperties,
            silent: true
          });
          if (input.dataset.textStyleField === "fontFamily" || input.dataset.textStyleField === "lineHeightMode") {
            setTimeout(renderModal, 0);
          }
        };
        input.onblur = function () {
          const textProperties = currentTextPropertiesFromControls(inputs);
          state.textProperties = Object.assign({}, state.textProperties || {}, textProperties);
          flush("text-style", {
            type: "update-text-style",
            textProperties: textProperties,
            silent: true
          });
          setTimeout(function () {
            if (dirtyWhileEditing || !isFieldEditing()) render();
          }, 0);
        };
      });
    }

    function currentObjectPropertiesFromControls(inputs) {
      const properties = {};
      inputs.forEach(function (input) {
        properties[input.dataset.objectField] = input.value === "" ? "" : Number(input.value);
      });
      return properties;
    }

    function currentGlobalAppearanceFromControls(inputs) {
      const globalAppearance = Object.assign({ opacity: 100, blendMode: "NORMAL" }, state.globalAppearance || {});
      inputs.forEach(function (input) {
        if (input.dataset.globalField === "opacity") {
          globalAppearance.opacity = input.value === "" ? 100 : Number(input.value);
        }
        if (input.dataset.globalField === "blendMode") {
          globalAppearance.blendMode = input.value || "NORMAL";
        }
      });
      return globalAppearance;
    }

    function wirePrintFields(inputs) {
      inputs.forEach(function (input) {
        input.oninput = function () {
          updatePrintSettingsFromControls(inputs);
        };
        input.onchange = function () {
          updatePrintSettingsFromControls(inputs);
          renderModal();
        };
      });
    }

    function updatePrintSettingsFromControls(inputs) {
      inputs.forEach(function (input) {
        const key = input.dataset.printField;
        if (input.type === "number") {
          printSettings[key] = input.value === "" ? 0 : Number(input.value);
        } else {
          printSettings[key] = input.value;
        }
      });
    }

    function currentTextPropertiesFromControls(inputs) {
      const properties = {};
      inputs.forEach(function (input) {
        const key = input.dataset.textStyleField;
        if (input.type === "number") {
          properties[key] = input.value === "" ? "" : Number(input.value);
          return;
        }
        properties[key] = input.value;
      });
      if (properties.fontFamily && properties.fontStyle) {
        properties.fontStyle = validFontStyle(properties.fontFamily, properties.fontStyle);
      }
      return properties;
    }

    function valueText(value) {
      return value === undefined || value === null ? "" : escapeHtml(value);
    }
