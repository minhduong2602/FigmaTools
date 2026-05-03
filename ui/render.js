function render() {
      dirtyWhileEditing = false;
      ensureSelectedLayer();
      updateTabChrome();
      if (activeTab === "blend") {
        renderBlendPanel();
        return;
      }
      if (activeTab === "object") {
        renderObjectPanel();
        return;
      }
      if (activeTab === "swatches") {
        renderSwatchesPanel();
        return;
      }
      if (activeTab === "three-d") {
        renderThreeDPanel();
        return;
      }
      wrapBtn.disabled = !state.hasSelection || state.selectedCount !== 1 || state.isAppearance;
      detachBtn.disabled = !state.isAppearance;
      fxBtn.disabled = !state.isAppearance || !selectedLayer();
      duplicateBtn.disabled = !state.isAppearance || !selectedLayer();
      deleteBtn.disabled = !state.isAppearance || !selectedLayer();
      copyStyleBtn.disabled = !state.isAppearance || state.stack.length === 0;
      pasteStyleBtn.disabled = !state.isAppearance;
      basicBtn.disabled = !state.isAppearance || state.stack.length === 0;
      printExportBtn.disabled = !state.isAppearance;
      clearBtn.disabled = !state.isAppearance || state.stack.length === 0;
      document.querySelectorAll("[data-add]").forEach(function (button) {
        button.disabled = !state.isAppearance;
      });

      if (state.isAppearance) {
        statusEl.textContent = state.groupName + " - " + state.stack.length + " stack item" + (state.stack.length === 1 ? "" : "s");
      } else if (state.selectedCount > 1) {
        statusEl.textContent = "Select exactly one object.";
      } else if (state.hasSelection) {
        statusEl.textContent = "Ready to create a stack.";
      } else {
        statusEl.textContent = "No Selection";
      }

      if (!state.isAppearance) {
        contentEl.innerHTML = '<div class="empty">Create a stack to manage fills, strokes, opacity, and real Figma effects.</div>';
        fxMenuOpen = false;
        closeModal();
        renderFxMenu();
        return;
      }

      if (state.stack.length === 0) {
        contentEl.innerHTML = '<div class="three-d-layout" style="gap: 4px; padding: 6px; background: #2b2b2b;">' + objectTemplate() + '<section class="three-panel-card" style="background: #323232; padding: 16px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2); text-align: center; margin-top: 4px;"><div class="empty" style="color: #888;">No appearance rows yet. Add a fill or stroke from the bottom bar.</div></section></div>';
        bindEvents();
        fxMenuOpen = false;
        renderFxMenu();
        renderModal();
        return;
      }

      contentEl.innerHTML = '<div class="three-d-layout" style="gap: 4px; padding: 6px; background: #2b2b2b;">' + objectTemplate() + '<section class="three-panel-card" style="background: #323232; padding: 4px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 4px;">' + state.stack.map(layerTemplate).reverse().join("") + '</section></div>';
      bindEvents();
      renderFxMenu();
      renderModal();
    }

    function updateTabChrome() {
      appearanceTabBtn.classList.toggle("active", activeTab === "appearance");
      objectTabBtn.classList.toggle("active", activeTab === "object");
      swatchesTabBtn.classList.toggle("active", activeTab === "swatches");
      blendTabBtn.classList.toggle("active", activeTab === "blend");
      threeDTabBtn.classList.toggle("active", activeTab === "three-d");
      appearanceTools.hidden = activeTab !== "appearance";
      objectTools.hidden = activeTab !== "object";
      appearanceFooter.hidden = activeTab !== "appearance";
      blendTools.hidden = activeTab !== "blend";
      swatchesTools.hidden = activeTab !== "swatches";
      threeDTools.hidden = activeTab !== "three-d";
      if (activeTab !== "three-d") {
        disposeThreeDPreview();
      }
      fxMenuOpen = activeTab === "appearance" ? fxMenuOpen : false;
      renderFxMenu();
    }

    function renderObjectPanel() {
      closeModalIfAppearanceOnly();
      const hasOne = state.selectedCount === 1;
      simplifyPathBtn.disabled = !hasOne;
      smoothPathBtn.disabled = !hasOne;
      statusEl.textContent = hasOne ? "Object path tools" : "Select one vector path.";
      contentEl.innerHTML = objectToolsTemplate();
      bindEvents();
      renderModal();
    }

    function objectToolsTemplate() {
      return [
        '<div class="three-d-layout" style="gap: 4px; padding: 6px; background: #2b2b2b; height: 100%;">',
        '<section class="three-panel-card" style="background: #323232; padding: 12px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">',
        '<div class="modal-section-title" style="font-weight: 600; font-size: 11px; color: #e0e0e0; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px;">Path Cleanup</div>',
        '<div class="object-tool-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">',
        '<button class="object-tool-card" data-open-object-tool="simplify" style="background: #2a2a2a; border: 1px solid #1a1a1a; border-radius: 4px; padding: 10px; text-align: left; transition: all 0.2s;"><span class="object-tool-name" style="display: block; color: #fff; font-weight: 600; margin-bottom: 4px;">Simplify</span><span class="object-tool-value" style="display: block; color: #888; font-size: 10px;">Precision ' + Math.round(objectToolsState.simplifyTolerance) + '%</span></button>',
        '<button class="object-tool-card" data-open-object-tool="smooth" style="background: #2a2a2a; border: 1px solid #1a1a1a; border-radius: 4px; padding: 10px; text-align: left; transition: all 0.2s;"><span class="object-tool-name" style="display: block; color: #fff; font-weight: 600; margin-bottom: 4px;">Smooth</span><span class="object-tool-value" style="display: block; color: #888; font-size: 10px;">' + Math.round(objectToolsState.smoothAmount) + '%</span></button>',
        '</div>',
        '<div class="field-note" style="margin-top: 12px; font-size: 10px; color: #888; line-height: 1.4;">Open a tool, drag the slider to preview directly on the selected path, then apply when it feels right.</div>',
        '</section>',
        '</div>'
      ].join("");
    }

    function renderSwatchesPanel() {
      closeModalIfAppearanceOnly();
      newSwatchBtn.disabled = state.selectedCount !== 1;
      saveSwatchBtn.disabled = !state.isAppearance || !selectedLayer();
      document.querySelectorAll("[data-add]").forEach(function (button) {
        button.disabled = true;
      });
      const target = selectedLayer();
      if (state.isAppearance && target) {
        statusEl.textContent = "Swatches - apply to " + target.name;
      } else {
        statusEl.textContent = "Swatches";
      }
      contentEl.innerHTML = swatchesTemplate();
      bindEvents();
      renderModal();
    }

    function swatchesTemplate() {
      const swatches = state.swatches || [];
      if (!swatches.length) {
        return '<div class="three-d-layout swatches-panel-layout"><section class="three-panel-card swatches-panel-card swatches-empty-card"><div class="empty">No swatches saved.</div></section></div>';
      }
      return [
        '<div class="three-d-layout swatches-panel-layout">',
        '<section class="three-panel-card swatches-panel-card">',
        '<div class="swatch-grid swatch-grid-compact">',
        swatches.map(function (swatch) {
          return [
            '<div class="swatch-card swatch-card-compact" data-swatch="' + swatch.id + '" title="' + escapeHtml(swatch.name || swatch.type) + '">',
            '<button class="swatch-chip swatch-chip-compact" data-swatch-apply="' + swatch.id + '" style="' + swatchStyleFromSwatch(swatch) + '"></button>',
            '<button class="footer-btn danger swatch-delete swatch-delete-compact" data-swatch-remove="' + swatch.id + '" title="Remove swatch">' + trashIcon + '</button>',
            '<div class="swatch-name swatch-name-compact">' + escapeHtml(swatchLabel(swatch)) + '</div>',
            '</div>'
          ].join("");
        }).join(""),
        '</div>',
        '</section>',
        '</div>'
      ].join("");
    }

    function renderBlendPanel() {
      closeModalIfAppearanceOnly();
      blendMakeBtn.disabled = state.selectedCount !== 2 || state.isBlend;
      blendEditEndpointsBtn.disabled = !state.isBlend;
      blendSelectStartBtn.disabled = !state.isBlend;
      blendSelectEndBtn.disabled = !state.isBlend;
      blendUpdateBtn.disabled = !state.isBlend;
      blendOptionsBtn.disabled = !state.isBlend;
      blendReverseBtn.disabled = !state.isBlend;
      blendExpandBtn.disabled = !state.isBlend;
      blendReleaseBtn.disabled = !state.isBlend;
      blendEditEndpointsBtn.classList.toggle("active", state.isBlend && state.blendOptions && state.blendOptions.editEndpoints === true);
      document.querySelectorAll("[data-add]").forEach(function (button) {
        button.disabled = true;
      });

      if (state.isBlend) {
        const options = state.blendOptions || {};
        statusEl.textContent = state.blendName + " - " + blendSummary(options);
        contentEl.innerHTML = blendTemplate(options);
        bindEvents();
        renderModal();
        return;
      }

      if (state.selectedCount === 2) {
        statusEl.textContent = "Ready to make a blend.";
        contentEl.innerHTML = '<div class="three-d-layout" style="gap: 4px; padding: 6px; background: #2b2b2b; height: 100%;"><section class="three-panel-card" style="background: #323232; padding: 16px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2); text-align: center;"><div class="empty" style="color: #888;">Use Make Blend to generate live interpolated objects between the two selected objects.</div></section></div>';
      } else {
        statusEl.textContent = "Select two objects.";
        contentEl.innerHTML = '<div class="three-d-layout" style="gap: 4px; padding: 6px; background: #2b2b2b; height: 100%;"><section class="three-panel-card" style="background: #323232; padding: 16px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2); text-align: center;"><div class="empty" style="color: #888;">Select exactly two objects, then switch here and click Make Blend.</div></section></div>';
      }
      renderModal();
    }

    function closeModalIfAppearanceOnly() {
      if (modalState.kind === "object" || modalState.kind === "layer" || modalState.kind === "effect" || modalState.kind === "print" || modalState.kind === "three-d-preview") {
        closeModal();
      }
    }

    function blendTemplate(options) {
      return [
        '<div class="three-d-layout" style="gap: 4px; padding: 6px; background: #2b2b2b;">',
        '<section class="three-panel-card" style="background: #323232; padding: 4px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2); margin-bottom: 6px;">',
        '<article data-blend="true">',
        '<div class="row object" data-blend-options title="Double click to edit blend options" style="background: #2a2a2a; border-radius: 3px; border: 1px solid #1a1a1a; margin-bottom: 0;">',
        '<div class="eye"></div>',
        '<div class="caret"></div>',
        '<div class="label"><span class="label-name" style="font-weight: 600; color: #fff;">Blend</span><span class="summary">' + blendSummary(options) + '</span></div>',
        '<button class="footer-btn" data-blend-edit title="Blend options">' + editIcon + '</button>',
        '</div>',
        '</article>',
        '</section>',
        '<section class="three-panel-card" style="background: #323232; padding: 12px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">',
        '<div class="modal-section-title" style="font-weight: 600; font-size: 11px; color: #e0e0e0; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px;">Endpoints</div>',
        '<div class="summary" style="font-size: 10px; color: #888;">' + (options.editEndpoints ? "Editable sources visible" : "Sources hidden") + '</div>',
        '</section>',
        '</div>'
      ].join("");
    }

    function blendSummary(options) {
      const mode = options.spacingMode || "SPECIFIED_STEPS";
      const endpointText = options.editEndpoints ? " - endpoints" : "";
      if (mode === "SMOOTH_COLOR") return "Smooth Color" + endpointText;
      if (mode === "SPECIFIED_DISTANCE") return "Distance " + options.distance + " px" + endpointText;
      return options.steps + " steps" + endpointText;
    }

    function objectTemplate() {
      const globalAppearance = state.globalAppearance || { opacity: 100, blendMode: "NORMAL" };
      const blend = globalAppearance.blendMode || "NORMAL";
      const blendText = blend === "NORMAL" ? "" : " " + displayBlendMode(blend);
      const objectType = state.baseType === "TEXT" ? "Type" : "Object";
      const textHint = state.isTextBase && state.textContent ? " - " + escapeHtml(state.textContent) : "";
      return [
        '<section class="three-panel-card" style="background: #323232; padding: 4px; border-radius: 4px; border: 1px solid #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.2); margin-bottom: 4px;">',
        '<article data-object="true">',
        '<div class="row object" data-object-row title="Double click to edit object appearance" style="background: #2a2a2a; border-radius: 3px; border: 1px solid #1a1a1a; margin-bottom: 0; min-height: 38px;">',
        '<div class="eye"></div>',
        '<div class="caret"></div>',
        '<div class="label"><span class="label-name" style="font-weight: 600; color: #fff;">' + objectType + '</span><span class="summary">Opacity: ' + globalAppearance.opacity + '%' + blendText + textHint + '</span></div>',
        '<button class="footer-btn" data-object-edit title="Edit object">' + editIcon + '</button>',
        '</div>',
        '</article>',
        '</section>'
      ].join("");
    }

    function layerTemplate(layer) {
      const opened = expanded[layer.id] !== false;
      const selected = layer.id === selectedLayerId;
      const label = layer.type === "stroke" ? "Stroke:" : "Fill:";
      const detailParts = [];
      if (layer.type === "stroke") detailParts.push(layer.weight + " px");
      detailParts.push("Opacity: " + layer.opacity + "%");
      if (layer.blendMode && layer.blendMode !== "NORMAL") detailParts.push(displayBlendMode(layer.blendMode));
      const detail = detailParts.join(" - ");
      const effects = layer.effects || [];
      const opacityRow = opened ? opacityTemplate(layer) : "";
      const effectRows = opened ? effects.map(function (effect) {
        return effectTemplate(layer, effect);
      }).join("") : "";

      return [
        '<article data-layer="' + layer.id + '" class="' + (layer.visible ? "" : "disabled") + '" style="background: #2a2a2a; border-radius: 3px; border: 1px solid #1a1a1a; overflow: hidden; margin-bottom: 2px;">',
        '<div class="row' + (selected ? " selected" : "") + '" data-row-layer="' + layer.id + '" draggable="true" title="Double click to edit" style="border-bottom: ' + (opened ? '1px solid #1a1a1a' : 'none') + '; background: ' + (selected ? '#38556b' : 'transparent') + ';">',
        '<div class="eye" data-action="visible" title="Toggle visibility">' + (layer.visible ? "o" : "-") + '</div>',
        '<div class="caret" data-action="expand" title="Expand">' + (opened ? "v" : ">") + '</div>',
        '<div class="label"><span class="label-name" style="font-weight: 500;">' + label + '</span><span class="swatch" style="' + swatchStyle(layer) + '; border-radius: 3px;"></span><span class="summary">' + detail + '</span></div>',
        '<button class="footer-btn" data-edit-layer="' + layer.id + '" title="Edit stack">' + (effects.length ? '<span class="fx-label">fx</span>' : editIcon) + '</button>',
        '</div>',
        opacityRow,
        effectRows,
        '</article>'
      ].join("");
    }

    function opacityTemplate(layer) {
      const blend = layer.blendMode || "NORMAL";
      const blendText = blend === "NORMAL" ? "Default" : displayBlendMode(blend);
      return [
        '<div class="row opacity-row" data-opacity-row="' + layer.id + '" title="Double click to edit opacity and blend" style="background: #252525; border-bottom: 1px solid #1a1a1a;">',
        '<div class="eye"></div>',
        '<div></div>',
        '<div class="label"><span class="label-name">Opacity:</span><span class="summary">' + layer.opacity + '% ' + blendText + '</span></div>',
        '<button class="footer-btn" data-edit-layer="' + layer.id + '" title="Edit opacity">' + editIcon + '</button>',
        '</div>'
      ].join("");
    }

    function paintFields(layer) {
      const paintRow = [
        '<div class="fields paint-row">',
        '<div class="field"><label>Paint</label><select data-field="paintType">' + paintTypeOptions(layer.paintType) + '</select></div>',
        '<div class="field"><label>Opacity</label><input type="number" min="0" max="100" data-field="opacity" value="' + layer.opacity + '"></div>',
        '<div class="field"><label>Blend</label><select data-field="blendMode">' + blendModeOptions(layer.blendMode) + '</select></div>',
        '</div>'
      ].join("");

      if (layer.paintType === "GRADIENT_LINEAR" || layer.paintType === "GRADIENT_RADIAL") {
        const gradientColors = [
          paintRow,
          gradientStopEditor(layer),
          '<div class="fields three">',
          layer.paintType === "GRADIENT_LINEAR" ? '<div class="field"><label>Angle</label><input type="number" min="-360" max="360" data-field="gradientAngle" value="' + layer.gradientAngle + '"></div>' : '<div class="field"></div>',
          '<div></div>',
          '<div></div>',
          '</div>'
        ];
        return gradientColors.join("");
      }

      return [
        paintRow,
        '<div class="fields three"><div class="field"><label>Color</label><input type="color" data-field="color" value="' + layer.color + '"></div><div></div><div></div></div>'
      ].join("");
    }

    function gradientStopEditor(layer) {
      const stops = normalizedUiGradientStops(layer);
      return [
        '<div class="gradient-editor">',
        '<div class="gradient-ramp" data-gradient-ramp="' + layer.id + '" style="' + gradientRampStyle(layer, stops) + '">',
        stops.map(function (stop) {
          return '<button class="gradient-stop" data-gradient-stop="' + stop.id + '" title="' + stop.position + '%" style="left:' + stop.position + '%;background:' + stop.color + '"></button>';
        }).join(""),
        '</div>',
        '<div class="gradient-stop-list">',
        stops.map(function (stop) {
          return [
            '<div class="gradient-stop-row" data-gradient-stop-row="' + stop.id + '">',
            '<input type="color" data-gradient-stop="' + stop.id + '" data-gradient-field="color" value="' + stop.color + '">',
            '<input type="number" min="0" max="100" data-gradient-stop="' + stop.id + '" data-gradient-field="position" value="' + stop.position + '">',
            '<button class="footer-btn danger" data-gradient-remove="' + stop.id + '" title="Remove stop">' + trashIcon + '</button>',
            '</div>'
          ].join("");
        }).join(""),
        '</div>',
        '</div>'
      ].join("");
    }

    function strokeStyleFields(layer) {
      return [
        '<div class="fields four">',
        '<div class="field"><label>Weight</label><input type="number" min="0" max="200" data-field="weight" value="' + layer.weight + '"></div>',
        '<div class="field"><label>Cap</label><select data-field="strokeCap">' + enumOptions(layer.strokeCap, [
          ["", "Keep"],
          ["NONE", "Butt"],
          ["ROUND", "Round"],
          ["SQUARE", "Square"]
        ]) + '</select></div>',
        '<div class="field"><label>Corner</label><select data-field="strokeJoin">' + enumOptions(layer.strokeJoin, [
          ["", "Keep"],
          ["MITER", "Miter"],
          ["ROUND", "Round"],
          ["BEVEL", "Bevel"]
        ]) + '</select></div>',
        '<div class="field"><label>Align</label><select data-field="strokeAlign">' + enumOptions(layer.strokeAlign, [
          ["", "Keep"],
          ["CENTER", "Center"],
          ["INSIDE", "Inside"],
          ["OUTSIDE", "Outside"]
        ]) + '</select></div>',
        '</div>',
        '<div class="fields three">',
        '<div class="field"><label>Miter limit</label><input type="number" min="1" max="100" data-empty="keep" data-field="miterLimit" value="' + (layer.miterLimit === "" ? "" : layer.miterLimit) + '"></div>',
        '<div class="field"><label>Dash</label><input data-field="dashPattern" value="' + dashPatternText(layer.dashPattern) + '" placeholder="4 4"></div>',
        '<div></div>',
        '</div>'
      ].join("");
    }

    function effectTemplate(layer, effect) {
      return [
        '<div class="row child" data-layer="' + layer.id + '" data-effect="' + effect.id + '" draggable="true" title="Double click to edit effect" style="background: #252525; border-bottom: 1px solid #1a1a1a;">',
        '<div class="eye" data-effect-action="visible" title="Toggle effect">' + (effect.visible ? "o" : "-") + '</div>',
        '<div></div>',
        '<div class="label"><span class="label-name">' + escapeHtml(effect.name) + '</span><span class="fx-mark">fx</span><span class="summary">' + effectSummary(effect) + '</span></div>',
        '<button class="footer-btn danger" data-effect-action="remove" title="Remove effect">' + trashIcon + '</button>',
        '</div>'
      ].join("");
    }

    function effectFields(effect) {
      if (effect.type === "transform") {
        return [
          '<div class="fields four">',
          '<div class="field"><label>Scale X %</label><input type="number" min="1" max="1000" data-effect-field="scaleX" value="' + effect.scaleX + '"></div>',
          '<div class="field"><label>Scale Y %</label><input type="number" min="1" max="1000" data-effect-field="scaleY" value="' + effect.scaleY + '"></div>',
          '<div class="field"><label>Move X</label><input type="number" min="-5000" max="5000" data-effect-field="moveX" value="' + effect.moveX + '"></div>',
          '<div class="field"><label>Move Y</label><input type="number" min="-5000" max="5000" data-effect-field="moveY" value="' + effect.moveY + '"></div>',
          '</div>',
          '<div class="fields four">',
          '<div class="field"><label>Rotate</label><input type="number" min="-3600" max="3600" data-effect-field="rotate" value="' + effect.rotate + '"></div>',
          '<div class="field"><label>Copies</label><input type="number" min="0" max="100" data-effect-field="copies" value="' + effect.copies + '"></div>',
          '<div class="field"><label>Reflect</label><label class="check-row"><input type="checkbox" data-effect-field="reflectX"' + (effect.reflectX ? " checked" : "") + '> X</label></div>',
          '<div class="field"><label>&nbsp;</label><label class="check-row"><input type="checkbox" data-effect-field="reflectY"' + (effect.reflectY ? " checked" : "") + '> Y</label></div>',
          '</div>'
        ].join("");
      }

      if (effect.type === "layerBlur" || effect.type === "backgroundBlur") {
        return '<div class="fields three"><div class="field"><label>Blur</label><input type="number" min="0" max="500" data-effect-field="radius" value="' + effect.radius + '"></div><div></div><div></div></div>';
      }

      if (effect.type === "offsetPath") {
        const textInsetNote = state.isTextBase ? '<div class="field-note">Negative offset on live text cannot shrink glyph outlines in Figma. Outline or flatten text first for a true inset.</div>' : '';
        return [
          '<div class="fields three">',
          '<div class="field"><label>Offset</label><input type="number" min="-500" max="500" data-effect-field="amount" value="' + effect.amount + '"></div>',
          '<div class="field"><label>Join</label><select data-effect-field="joinStyle">' + enumOptions(effect.joinStyle, [
            ["MITER", "Miter"],
            ["ROUND", "Round"],
            ["BEVEL", "Bevel"]
          ]) + '</select></div>',
          '<div class="field"><label>Miter limit</label><input type="number" min="1" max="100" data-effect-field="miterLimit" value="' + effect.miterLimit + '"' + (effect.joinStyle === "MITER" ? "" : " disabled") + '></div>',
          '</div>',
          textInsetNote
        ].join("");
      }

      if (effect.type === "roundCorners" || effect.type === "feather") {
        const label = effect.type === "feather" ? "Radius" : "Corner";
        return '<div class="fields three"><div class="field"><label>' + label + '</label><input type="number" min="0" max="500" data-effect-field="radius" value="' + effect.radius + '"></div><div></div><div></div></div>';
      }

      if (effect.type === "convertShape") {
        return [
          '<div class="fields four">',
          '<div class="field"><label>Shape</label><select data-effect-field="shapeType">' + enumOptions(effect.shapeType, [
            ["RECTANGLE", "Rectangle"],
            ["ROUNDED_RECTANGLE", "Rounded"],
            ["ELLIPSE", "Ellipse"]
          ]) + '</select></div>',
          '<div class="field"><label>Extra W</label><input type="number" min="-5000" max="5000" data-effect-field="widthExtra" value="' + effect.widthExtra + '"></div>',
          '<div class="field"><label>Extra H</label><input type="number" min="-5000" max="5000" data-effect-field="heightExtra" value="' + effect.heightExtra + '"></div>',
          '<div class="field"><label>Corner</label><input type="number" min="0" max="10000" data-effect-field="cornerRadius" value="' + effect.cornerRadius + '"' + (effect.shapeType === "ROUNDED_RECTANGLE" ? "" : " disabled") + '></div>',
          '</div>'
        ].join("");
      }

      if (effect.type === "noise") {
        return [
          '<div class="fields three">',
          '<div class="field"><label>Type</label><select data-effect-field="noiseType">' + enumOptions(effect.noiseType, [
            ["MONOTONE", "Monotone"],
            ["DUOTONE", "Duotone"],
            ["MULTITONE", "Multitone"]
          ]) + '</select></div>',
          '<div class="field"><label>Density %</label><input type="number" min="0" max="100" data-effect-field="density" value="' + effect.density + '"></div>',
          '<div class="field"><label>Size</label><input type="number" min="0.1" max="100" step="0.1" data-effect-field="noiseSize" value="' + effect.noiseSize + '"></div>',
          '</div>',
          '<div class="fields three">',
          '<div class="field"><label>Color</label><input type="color" data-effect-field="color" value="' + effect.color + '"></div>',
          '<div class="field"><label>Secondary</label><input type="color" data-effect-field="secondaryColor" value="' + effect.secondaryColor + '"></div>',
          '<div class="field"><label>Opacity</label><input type="number" min="0" max="100" data-effect-field="opacity" value="' + effect.opacity + '"></div>',
          '</div>',
          '<div class="fields three">',
          '<div class="field"><label>Blend</label><select data-effect-field="blendMode">' + blendModeOptions(effect.blendMode) + '</select></div>',
          '<div></div><div></div>',
          '</div>'
        ].join("");
      }

      if (effect.type === "colorHalftone") {
        return [
          '<div class="fields four">',
          '<div class="field"><label>Dot</label><input type="number" min="0.5" max="200" step="0.5" data-effect-field="dotSize" value="' + effect.dotSize + '"></div>',
          '<div class="field"><label>Spacing</label><input type="number" min="1" max="500" data-effect-field="spacing" value="' + effect.spacing + '"></div>',
          '<div class="field"><label>Angle</label><input type="number" min="-3600" max="3600" data-effect-field="angle" value="' + effect.angle + '"></div>',
          '<div class="field"><label>Opacity</label><input type="number" min="0" max="100" data-effect-field="opacity" value="' + effect.opacity + '"></div>',
          '</div>',
          '<div class="fields three">',
          '<div class="field"><label>Color</label><input type="color" data-effect-field="color" value="' + effect.color + '"></div>',
          '<div class="field"><label>Blend</label><select data-effect-field="blendMode">' + blendModeOptions(effect.blendMode) + '</select></div>',
          '<div></div>',
          '</div>'
        ].join("");
      }

      if (effect.type === "scribble") {
        return [
          '<div class="fields four">',
          '<div class="field"><label>Stroke</label><input type="number" min="0.1" max="100" step="0.1" data-effect-field="strokeWidth" value="' + effect.strokeWidth + '"></div>',
          '<div class="field"><label>Gap</label><input type="number" min="1" max="500" data-effect-field="gap" value="' + effect.gap + '"></div>',
          '<div class="field"><label>Angle</label><input type="number" min="-3600" max="3600" data-effect-field="angle" value="' + effect.angle + '"></div>',
          '<div class="field"><label>Jitter</label><input type="number" min="0" max="100" step="0.5" data-effect-field="jitter" value="' + effect.jitter + '"></div>',
          '</div>',
          '<div class="fields three">',
          '<div class="field"><label>Color</label><input type="color" data-effect-field="color" value="' + effect.color + '"></div>',
          '<div class="field"><label>Opacity</label><input type="number" min="0" max="100" data-effect-field="opacity" value="' + effect.opacity + '"></div>',
          '<div class="field"><label>Blend</label><select data-effect-field="blendMode">' + blendModeOptions(effect.blendMode) + '</select></div>',
          '</div>'
        ].join("");
      }

      if (effect.type === "texture") {
        return [
          '<div class="fields three">',
          '<div class="field"><label>Size</label><input type="number" min="0.1" max="100" step="0.1" data-effect-field="noiseSize" value="' + effect.noiseSize + '"></div>',
          '<div class="field"><label>Radius</label><input type="number" min="0" max="500" data-effect-field="radius" value="' + effect.radius + '"></div>',
          '<div class="field"><label>Clip</label><label class="check-row"><input type="checkbox" data-effect-field="clipToShape"' + (effect.clipToShape ? " checked" : "") + '> Shape</label></div>',
          '</div>'
        ].join("");
      }

      if (effect.type === "glass") {
        return [
          '<div class="fields three">',
          '<div class="field"><label>Light %</label><input type="number" min="0" max="100" data-effect-field="lightIntensity" value="' + effect.lightIntensity + '"></div>',
          '<div class="field"><label>Angle</label><input type="number" min="0" max="360" data-effect-field="lightAngle" value="' + effect.lightAngle + '"></div>',
          '<div class="field"><label>Radius</label><input type="number" min="0" max="500" data-effect-field="radius" value="' + effect.radius + '"></div>',
          '</div>',
          '<div class="fields three">',
          '<div class="field"><label>Refraction %</label><input type="number" min="0" max="100" data-effect-field="refraction" value="' + effect.refraction + '"></div>',
          '<div class="field"><label>Depth</label><input type="number" min="1" max="1000" data-effect-field="depth" value="' + effect.depth + '"></div>',
          '<div class="field"><label>Dispersion %</label><input type="number" min="0" max="100" data-effect-field="dispersion" value="' + effect.dispersion + '"></div>',
          '</div>'
        ].join("");
      }

      
      if (effect.type === "warp") {
        return [
          '<div class="fields three">',
          '<div class="field"><label>Style</label><select data-effect-field="warpStyle">' + enumOptions(effect.warpStyle, [
            ["ARC", "Arc"], ["ARC_LOWER", "Arc Lower"], ["ARC_UPPER", "Arc Upper"], ["FLAG", "Flag"], ["RISE", "Rise"]
          ]) + '</select></div>',
          '<div class="field"><label>Axis</label><select data-effect-field="warpAxis">' + enumOptions(effect.warpAxis, [
            ["HORIZONTAL", "Horizontal"], ["VERTICAL", "Vertical"]
          ]) + '</select></div>',
          '<div class="field"><label>Bend %</label><input type="number" min="-100" max="100" data-effect-field="bend" value="' + effect.bend + '"></div>',
          '</div>',
          '<div class="fields three">',
          '<div class="field"><label>H Distort %</label><input type="number" min="-100" max="100" data-effect-field="hDistort" value="' + effect.hDistort + '"></div>',
          '<div class="field"><label>V Distort %</label><input type="number" min="-100" max="100" data-effect-field="vDistort" value="' + effect.vDistort + '"></div>',
          '<div></div>',
          '</div>'
        ].join("");
      }
if (effect.type === "outerGlow" || effect.type === "innerGlow") {
        return [
          '<div class="fields four">',
          '<div class="field"><label>Color</label><input type="color" data-effect-field="color" value="' + effect.color + '"></div>',
          '<div class="field"><label>Opacity</label><input type="number" min="0" max="100" data-effect-field="opacity" value="' + effect.opacity + '"></div>',
          '<div class="field"><label>Blur</label><input type="number" min="0" max="500" data-effect-field="radius" value="' + effect.radius + '"></div>',
          '<div class="field"><label>Spread</label><input type="number" min="-500" max="500" data-effect-field="spread" value="' + effect.spread + '"></div>',
          '</div>',
          '<div class="fields three">',
          '<div class="field"><label>Blend</label><select data-effect-field="blendMode">' + blendModeOptions(effect.blendMode) + '</select></div>',
          effect.type === "outerGlow" ? '<div class="field"><label>Behind</label><label class="check-row"><input type="checkbox" data-effect-field="showShadowBehindNode"' + (effect.showShadowBehindNode ? " checked" : "") + '> Transparent</label></div>' : '<div></div>',
          '<div></div>',
          '</div>'
        ].join("");
      }

      return [
        '<div class="fields four">',
        '<div class="field"><label>Color</label><input type="color" data-effect-field="color" value="' + effect.color + '"></div>',
        '<div class="field"><label>Opacity</label><input type="number" min="0" max="100" data-effect-field="opacity" value="' + effect.opacity + '"></div>',
        '<div class="field"><label>Blur</label><input type="number" min="0" max="500" data-effect-field="radius" value="' + effect.radius + '"></div>',
        '<div class="field"><label>Spread</label><input type="number" min="-500" max="500" data-effect-field="spread" value="' + effect.spread + '"></div>',
        '</div>',
        '<div class="fields four">',
        '<div class="field"><label>Offset X</label><input type="number" min="-500" max="500" data-effect-field="offsetX" value="' + effect.offsetX + '"></div>',
        '<div class="field"><label>Offset Y</label><input type="number" min="-500" max="500" data-effect-field="offsetY" value="' + effect.offsetY + '"></div>',
        '<div class="field"><label>Blend</label><select data-effect-field="blendMode">' + blendModeOptions(effect.blendMode) + '</select></div>',
        effect.type === "dropShadow" ? '<div class="field"><label>Behind</label><label class="check-row"><input type="checkbox" data-effect-field="showShadowBehindNode"' + (effect.showShadowBehindNode ? " checked" : "") + '> Transparent</label></div>' : '<div></div>',
        '</div>'
      ].join("");
    }

    function effectSummary(effect) {
      if (effect.type === "transform") {
        const parts = [];
        if (Number(effect.moveX) || Number(effect.moveY)) parts.push("Move " + effect.moveX + ", " + effect.moveY);
        if (Number(effect.scaleX) !== 100 || Number(effect.scaleY) !== 100) parts.push("Scale " + effect.scaleX + "/" + effect.scaleY + "%");
        if (Number(effect.rotate)) parts.push(effect.rotate + "deg");
        if (Number(effect.copies)) parts.push(effect.copies + " copies");
        return parts.join(" - ");
      }

      if (effect.type === "layerBlur" || effect.type === "backgroundBlur") {
        return "Blur " + effect.radius;
      }

      if (effect.type === "offsetPath") {
        return effect.amount + " px - " + displayOffsetJoin(effect.joinStyle);
      }

      if (effect.type === "roundCorners") {
        return "Corner " + effect.radius;
      }

      if (effect.type === "feather") {
        return "Radius " + effect.radius;
      }

      if (effect.type === "convertShape") {
        return displayShapeType(effect.shapeType) + " - " + effect.widthExtra + "/" + effect.heightExtra;
      }

      if (effect.type === "outerGlow" || effect.type === "innerGlow") {
        return effect.opacity + "% - Blur " + effect.radius + " - " + displayBlendMode(effect.blendMode);
      }

      if (effect.type === "noise") {
        return displayNoiseType(effect.noiseType) + " - " + effect.density + "% - " + displayBlendMode(effect.blendMode);
      }

      if (effect.type === "colorHalftone") {
        return "Dot " + effect.dotSize + " / " + effect.spacing + " - " + displayBlendMode(effect.blendMode);
      }

      if (effect.type === "scribble") {
        return "Stroke " + effect.strokeWidth + " / Gap " + effect.gap + " - " + displayBlendMode(effect.blendMode);
      }

      if (effect.type === "texture") {
        return "Size " + effect.noiseSize + " - Radius " + effect.radius;
      }

      if (effect.type === "glass") {
        return "Refraction " + effect.refraction + "% - Depth " + effect.depth;
      }

      if (effect.type === "warp") {
        const styleLabel = { ARC: "Arc", ARC_LOWER: "Arc Lower", ARC_UPPER: "Arc Upper", FLAG: "Flag", RISE: "Rise" }[effect.warpStyle] || effect.warpStyle;
        const axisLabel = effect.warpAxis === "VERTICAL" ? "V" : "H";
        return styleLabel + " " + axisLabel + " - Bend " + effect.bend + "%";
      }

      return "Opacity " + effect.opacity + "% - Blur " + effect.radius + " - " + displayBlendMode(effect.blendMode);
    }
