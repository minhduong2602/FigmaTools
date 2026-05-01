function render() {
      dirtyWhileEditing = false;
      ensureSelectedLayer();
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
        contentEl.innerHTML = objectTemplate() + '<div class="empty">No appearance rows yet. Add a fill or stroke from the bottom bar.</div>';
        bindEvents();
        fxMenuOpen = false;
        renderFxMenu();
        renderModal();
        return;
      }

      contentEl.innerHTML = objectTemplate() + state.stack.map(layerTemplate).reverse().join("");
      bindEvents();
      renderFxMenu();
      renderModal();
    }

    function objectTemplate() {
      const globalAppearance = state.globalAppearance || { opacity: 100, blendMode: "NORMAL" };
      const blend = globalAppearance.blendMode || "NORMAL";
      const blendText = blend === "NORMAL" ? "" : " " + displayBlendMode(blend);
      const objectType = state.baseType === "TEXT" ? "Type" : "Object";
      const textHint = state.isTextBase && state.textContent ? " - " + escapeHtml(state.textContent) : "";
      return [
        '<article data-object="true">',
        '<div class="row object" data-object-row title="Double click to edit object appearance">',
        '<div class="eye"></div>',
        '<div class="caret"></div>',
        '<div class="label"><span class="label-name">' + objectType + '</span><span class="summary">Opacity: ' + globalAppearance.opacity + '%' + blendText + textHint + '</span></div>',
        '<button class="footer-btn" data-object-edit title="Edit object">' + editIcon + '</button>',
        '</div>',
        '</article>'
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
        '<article data-layer="' + layer.id + '" class="' + (layer.visible ? "" : "disabled") + '">',
        '<div class="row' + (selected ? " selected" : "") + '" data-row-layer="' + layer.id + '" draggable="true" title="Double click to edit">',
        '<div class="eye" data-action="visible" title="Toggle visibility">' + (layer.visible ? "o" : "-") + '</div>',
        '<div class="caret" data-action="expand" title="Expand">' + (opened ? "v" : ">") + '</div>',
        '<div class="label"><span class="label-name">' + label + '</span><span class="swatch" style="' + swatchStyle(layer) + '"></span><span class="summary">' + detail + '</span></div>',
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
        '<div class="row opacity-row" data-opacity-row="' + layer.id + '" title="Double click to edit opacity and blend">',
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
          '<div class="fields three">',
          '<div class="field"><label>Gradient start</label><input type="color" data-field="gradientStart" value="' + layer.gradientStart + '"></div>',
          '<div class="field"><label>End</label><input type="color" data-field="gradientEnd" value="' + layer.gradientEnd + '"></div>',
          layer.paintType === "GRADIENT_LINEAR" ? '<div class="field"><label>Angle</label><input type="number" min="-360" max="360" data-field="gradientAngle" value="' + layer.gradientAngle + '"></div>' : '<div class="field"></div>',
          '</div>'
        ];
        return gradientColors.join("");
      }

      return [
        paintRow,
        '<div class="fields three"><div class="field"><label>Color</label><input type="color" data-field="color" value="' + layer.color + '"></div><div></div><div></div></div>'
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
        '<div class="row child" data-layer="' + layer.id + '" data-effect="' + effect.id + '" title="Double click to edit effect">',
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

      return "Opacity " + effect.opacity + "% - Blur " + effect.radius + " - " + displayBlendMode(effect.blendMode);
    }
