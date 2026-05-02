function wireField(input, buildUpdate) {
      input.onfocus = function () {
        dirtyWhileEditing = false;
      };
      input.oninput = function () {
        const update = buildUpdate();
        if (!update) return;
        schedule(update.key, update.message);
      };
      input.onchange = function () {
        const update = buildUpdate();
        if (!update) return;
        flush(update.key, update.message);
        if (input.dataset.field === "paintType" || input.dataset.effectField === "shapeType") {
          setTimeout(render, 0);
        }
      };
      input.onblur = function () {
        const update = buildUpdate();
        if (update) flush(update.key, update.message);
        setTimeout(function () {
          if (dirtyWhileEditing || !isFieldEditing()) render();
        }, 0);
      };
    }

    function fieldValue(input) {
      if (input.dataset.field === "dashPattern") {
        return input.value;
      }

      if (input.type === "checkbox") {
        return input.checked;
      }

      if (input.type === "number") {
        if (input.value === "" && input.dataset.empty === "keep") return "";
        return input.value === "" ? 0 : Number(input.value);
      }
      return input.value;
    }

    function schedule(key, message) {
      pendingMessages[key] = message;
      clearTimeout(pendingTimers[key]);
      pendingTimers[key] = setTimeout(function () {
        post(pendingMessages[key]);
        delete pendingMessages[key];
        delete pendingTimers[key];
      }, 220);
    }

    function flush(key, message) {
      clearTimeout(pendingTimers[key]);
      delete pendingTimers[key];
      delete pendingMessages[key];
      post(message);
    }

    function isFieldEditing() {
      const active = document.activeElement;
      return Boolean(active && (active.hasAttribute("data-field") || active.hasAttribute("data-effect-field") || active.hasAttribute("data-gradient-field") || active.hasAttribute("data-text-field") || active.hasAttribute("data-text-style-field") || active.hasAttribute("data-global-field") || active.hasAttribute("data-object-field") || active.hasAttribute("data-blend-field") || active.hasAttribute("data-object-path-slider") || active.hasAttribute("data-object-path-input")));
    }

    function ensureExpandedDefaults() {
      state.stack.forEach(function (layer) {
        if (expanded[layer.id] === undefined) expanded[layer.id] = true;
      });
    }

    function ensureSelectedLayer() {
      if (!state.stack.length) {
        selectedLayerId = "";
        return;
      }
      if (!findLayer(selectedLayerId)) {
        selectedLayerId = state.stack[state.stack.length - 1].id;
      }
    }

    function selectedLayer() {
      return findLayer(selectedLayerId);
    }

    function updateLocalLayer(updated) {
      state.stack = state.stack.map(function (layer) {
        return layer.id === updated.id ? updated : layer;
      });
    }

    function wireGradientStopFields(layerId) {
      modalBody.querySelectorAll("[data-gradient-field]").forEach(function (input) {
        input.onfocus = function () {
          dirtyWhileEditing = false;
        };
        input.oninput = function () {
          updateGradientStopFromInput(layerId, input, true);
        };
        input.onchange = function () {
          updateGradientStopFromInput(layerId, input, false);
        };
        input.onblur = function () {
          updateGradientStopFromInput(layerId, input, false);
          setTimeout(function () {
            if (dirtyWhileEditing || !isFieldEditing()) render();
          }, 0);
        };
      });

      modalBody.querySelectorAll("[data-gradient-remove]").forEach(function (button) {
        button.onclick = function () {
          const layer = findLayer(layerId);
          if (!layer) return;
          const stops = normalizedUiGradientStops(layer);
          if (stops.length <= 2) return;
          const updatedStops = stops.filter(function (stop) {
            return stop.id !== button.dataset.gradientRemove;
          });
          updateGradientLayer(layer, updatedStops, false);
          render();
        };
      });

      modalBody.querySelectorAll("[data-gradient-ramp]").forEach(function (ramp) {
        ramp.onclick = function (event) {
          if (gradientDrag && gradientDrag.didDrag) return;
          if (event.target && event.target.hasAttribute("data-gradient-stop")) return;
          const rect = ramp.getBoundingClientRect();
          const position = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
          const layer = findLayer(layerId);
          if (!layer) return;
          const stops = normalizedUiGradientStops(layer);
          const color = gradientColorAtUi(stops, position);
          stops.push({ id: createUiId(), position: Math.round(position), color: color });
          updateGradientLayer(layer, stops, false);
          render();
        };
      });

      modalBody.querySelectorAll(".gradient-stop").forEach(function (handle) {
        handle.onmousedown = function (event) {
          event.preventDefault();
          event.stopPropagation();
          const ramp = handle.closest("[data-gradient-ramp]");
          if (!ramp) return;
          gradientDrag = {
            layerId: layerId,
            stopId: handle.dataset.gradientStop,
            ramp: ramp,
            didDrag: false
          };
          document.addEventListener("mousemove", onGradientStopDragMove);
          document.addEventListener("mouseup", onGradientStopDragEnd);
        };
      });
    }

    function wireSwatchDraftFields(inputs) {
      inputs.forEach(function (input) {
        input.oninput = function () {
          updateSwatchDraftField(input);
        };
        input.onchange = function () {
          updateSwatchDraftField(input);
          if (input.dataset.swatchField === "type" || input.dataset.swatchField === "paintType") {
            setTimeout(renderModal, 0);
          }
        };
      });
    }

    function updateSwatchDraftField(input) {
      const field = input.dataset.swatchField;
      if (field === "gradientAngle") {
        swatchDraft.gradientAngle = input.value === "" ? 0 : Number(input.value);
      } else {
        swatchDraft[field] = input.value;
      }
      refreshSwatchDraftRamp();
    }

    function wireSwatchGradientFields() {
      modalBody.querySelectorAll('[data-gradient-ramp="swatch_draft"]').forEach(function (ramp) {
        ramp.onclick = function (event) {
          if (gradientDrag && gradientDrag.didDrag) return;
          if (event.target && event.target.hasAttribute("data-gradient-stop")) return;
          const rect = ramp.getBoundingClientRect();
          const position = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
          const stops = normalizedUiGradientStops(swatchDraftLayer());
          const color = gradientColorAtUi(stops, position);
          swatchDraft.gradientStops = stops.concat([{ id: createUiId(), position: Math.round(position), color: color }]);
          renderModal();
        };
      });

      modalBody.querySelectorAll('[data-gradient-ramp="swatch_draft"] .gradient-stop').forEach(function (handle) {
        handle.onmousedown = function (event) {
          event.preventDefault();
          event.stopPropagation();
          const ramp = handle.closest("[data-gradient-ramp]");
          if (!ramp) return;
          gradientDrag = {
            layerId: "swatch_draft",
            stopId: handle.dataset.gradientStop,
            ramp: ramp,
            didDrag: false
          };
          document.addEventListener("mousemove", onSwatchGradientDragMove);
          document.addEventListener("mouseup", onSwatchGradientDragEnd);
        };
      });

      modalBody.querySelectorAll('[data-gradient-ramp="swatch_draft"] [data-gradient-stop]').forEach(function (_handle) {});

      modalBody.querySelectorAll('[data-gradient-field]').forEach(function (input) {
        input.oninput = function () {
          updateSwatchGradientStopFromInput(input);
        };
        input.onchange = function () {
          updateSwatchGradientStopFromInput(input);
        };
      });

      modalBody.querySelectorAll('[data-gradient-remove]').forEach(function (button) {
        button.onclick = function () {
          const stops = normalizedUiGradientStops(swatchDraftLayer());
          if (stops.length <= 2) return;
          swatchDraft.gradientStops = stops.filter(function (stop) {
            return stop.id !== button.dataset.gradientRemove;
          });
          renderModal();
        };
      });
    }

    function onSwatchGradientDragMove(event) {
      if (!gradientDrag) return;
      event.preventDefault();
      gradientDrag.didDrag = true;
      moveSwatchGradientStopToClientX(gradientDrag.stopId, gradientDrag.ramp, event.clientX);
    }

    function onSwatchGradientDragEnd(event) {
      if (!gradientDrag) return;
      event.preventDefault();
      moveSwatchGradientStopToClientX(gradientDrag.stopId, gradientDrag.ramp, event.clientX);
      document.removeEventListener("mousemove", onSwatchGradientDragMove);
      document.removeEventListener("mouseup", onSwatchGradientDragEnd);
      setTimeout(function () {
        gradientDrag = null;
      }, 0);
    }

    function moveSwatchGradientStopToClientX(stopId, ramp, clientX) {
      const rect = ramp.getBoundingClientRect();
      const position = rect.width <= 0 ? 0 : Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
      const rounded = Math.round(position);
      swatchDraft.gradientStops = normalizedUiGradientStops(swatchDraftLayer()).map(function (stop) {
        if (stop.id !== stopId) return stop;
        return Object.assign({}, stop, { position: rounded });
      });
      refreshSwatchDraftRamp();
      const input = modalBody.querySelector('[data-gradient-stop="' + stopId + '"][data-gradient-field="position"]');
      if (input) input.value = String(rounded);
    }

    function updateSwatchGradientStopFromInput(input) {
      const stopId = input.dataset.gradientStop;
      const field = input.dataset.gradientField;
      swatchDraft.gradientStops = normalizedUiGradientStops(swatchDraftLayer()).map(function (stop) {
        if (stop.id !== stopId) return stop;
        const updated = Object.assign({}, stop);
        if (field === "position") updated.position = Math.max(0, Math.min(100, input.value === "" ? 0 : Number(input.value)));
        if (field === "color") updated.color = input.value;
        return updated;
      });
      refreshSwatchDraftRamp();
    }

    function refreshSwatchDraftRamp() {
      const ramp = modalBody.querySelector('[data-gradient-ramp="swatch_draft"]');
      if (!ramp) return;
      const layer = swatchDraftLayer();
      const stops = normalizedUiGradientStops(layer);
      ramp.setAttribute("style", gradientRampStyle(layer, stops));
      stops.forEach(function (stop) {
        const handle = ramp.querySelector('[data-gradient-stop="' + stop.id + '"]');
        if (handle) {
          handle.style.left = stop.position + "%";
          handle.style.background = stop.color;
          handle.title = stop.position + "%";
        }
      });
    }

    function swatchDraftLayer() {
      return {
        id: "swatch_draft",
        paintType: swatchDraft.paintType,
        gradientAngle: swatchDraft.gradientAngle,
        gradientStops: swatchDraft.gradientStops,
        gradientStart: swatchDraft.gradientStops[0] ? swatchDraft.gradientStops[0].color : "#4F8DFF",
        gradientEnd: swatchDraft.gradientStops[swatchDraft.gradientStops.length - 1] ? swatchDraft.gradientStops[swatchDraft.gradientStops.length - 1].color : "#B96BFF"
      };
    }

    function swatchDraftPayload() {
      if (swatchDraft.type === "gradient") {
        const stops = normalizedUiGradientStops(swatchDraftLayer());
        return {
          type: "gradient",
          paintType: swatchDraft.paintType,
          gradientAngle: swatchDraft.gradientAngle,
          gradientStart: stops[0].color,
          gradientEnd: stops[stops.length - 1].color,
          gradientStops: stops
        };
      }
      return {
        type: "solid",
        color: swatchDraft.color
      };
    }

    function onGradientStopDragMove(event) {
      if (!gradientDrag) return;
      event.preventDefault();
      gradientDrag.didDrag = true;
      moveGradientStopToClientX(gradientDrag.layerId, gradientDrag.stopId, gradientDrag.ramp, event.clientX, true);
    }

    function onGradientStopDragEnd(event) {
      if (!gradientDrag) return;
      event.preventDefault();
      moveGradientStopToClientX(gradientDrag.layerId, gradientDrag.stopId, gradientDrag.ramp, event.clientX, false);
      document.removeEventListener("mousemove", onGradientStopDragMove);
      document.removeEventListener("mouseup", onGradientStopDragEnd);
      setTimeout(function () {
        gradientDrag = null;
      }, 0);
    }

    function moveGradientStopToClientX(layerId, stopId, ramp, clientX, scheduled) {
      const layer = findLayer(layerId);
      if (!layer) return;
      const rect = ramp.getBoundingClientRect();
      const position = rect.width <= 0 ? 0 : Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
      const rounded = Math.round(position);
      const stops = normalizedUiGradientStops(layer).map(function (stop) {
        if (stop.id !== stopId) return stop;
        return Object.assign({}, stop, { position: rounded });
      });
      updateGradientLayer(layer, stops, scheduled);
      const input = modalBody.querySelector('[data-gradient-stop="' + stopId + '"][data-gradient-field="position"]');
      if (input) input.value = String(rounded);
    }

    function updateGradientStopFromInput(layerId, input, scheduled) {
      const layer = findLayer(layerId);
      if (!layer) return;
      const stopId = input.dataset.gradientStop;
      const field = input.dataset.gradientField;
      const stops = normalizedUiGradientStops(layer).map(function (stop) {
        if (stop.id !== stopId) return stop;
        const updated = Object.assign({}, stop);
        if (field === "position") updated.position = Math.max(0, Math.min(100, input.value === "" ? 0 : Number(input.value)));
        if (field === "color") updated.color = input.value;
        return updated;
      });
      updateGradientLayer(layer, stops, scheduled);
    }

    function updateGradientLayer(layer, stops, scheduled) {
      const normalized = normalizedUiGradientStops(Object.assign({}, layer, { gradientStops: stops }));
      const updated = Object.assign({}, layer, {
        gradientStops: normalized,
        gradientStart: normalized[0].color,
        gradientEnd: normalized[normalized.length - 1].color
      });
      updateLocalLayer(updated);
      refreshGradientEditor(updated);
      const message = { type: "update-layer", layer: updated, silent: true };
      if (scheduled) {
        schedule("layer:" + layer.id, message);
      } else {
        flush("layer:" + layer.id, message);
      }
    }

    function refreshGradientEditor(layer) {
      const ramp = modalBody.querySelector('[data-gradient-ramp="' + layer.id + '"]');
      if (!ramp) return;
      const stops = normalizedUiGradientStops(layer);
      ramp.setAttribute("style", gradientRampStyle(layer, stops));
      stops.forEach(function (stop) {
        const handle = ramp.querySelector('[data-gradient-stop="' + stop.id + '"]');
        if (handle) {
          handle.style.left = stop.position + "%";
          handle.style.background = stop.color;
          handle.title = stop.position + "%";
        }
      });
    }

    function updateLocalEffect(layerId, updatedEffect) {
      state.stack = state.stack.map(function (layer) {
        if (layer.id !== layerId) return layer;
        const effects = (layer.effects || []).map(function (effect) {
          return effect.id === updatedEffect.id ? updatedEffect : effect;
        });
        return Object.assign({}, layer, { effects: effects });
      });
    }

    function findLayer(id) {
      return state.stack.find(function (layer) {
        return layer.id === id;
      });
    }

    function findEffect(layer, id) {
      return (layer.effects || []).find(function (effect) {
        return effect.id === id;
      });
    }

    function renderFxMenu() {
      fxMenu.hidden = !fxMenuOpen || !selectedLayer();
      if (fxMenu.hidden) {
        fxBtn.classList.remove("active");
      } else {
        fxBtn.classList.add("active");
      }
    }

    function blendModeOptions(value) {
      return enumOptions(value || "NORMAL", [
        ["NORMAL", "Normal"],
        ["MULTIPLY", "Multiply"],
        ["SCREEN", "Screen"],
        ["OVERLAY", "Overlay"],
        ["DARKEN", "Darken"],
        ["LIGHTEN", "Lighten"],
        ["COLOR_DODGE", "Color Dodge"],
        ["COLOR_BURN", "Color Burn"],
        ["HARD_LIGHT", "Hard Light"],
        ["SOFT_LIGHT", "Soft Light"],
        ["DIFFERENCE", "Difference"],
        ["EXCLUSION", "Exclusion"],
        ["HUE", "Hue"],
        ["SATURATION", "Saturation"],
        ["COLOR", "Color"],
        ["LUMINOSITY", "Luminosity"]
      ]);
    }

    function paintTypeOptions(value) {
      return enumOptions(value || "SOLID", [
        ["SOLID", "Solid"],
        ["GRADIENT_LINEAR", "Linear gradient"],
        ["GRADIENT_RADIAL", "Radial gradient"]
      ]);
    }

    function blendSpacingOptions(value) {
      return enumOptions(value || "SPECIFIED_STEPS", [
        ["SPECIFIED_STEPS", "Specified steps"],
        ["SPECIFIED_DISTANCE", "Specified distance"],
        ["SMOOTH_COLOR", "Smooth color"]
      ]);
    }

    function enumOptions(value, options) {
      return options.map(function (option) {
        const selected = option[0] === value ? " selected" : "";
        return '<option value="' + option[0] + '"' + selected + '>' + option[1] + '</option>';
      }).join("");
    }

    function fontFamilyOptions(value) {
      const families = [];
      const seen = {};
      (state.availableFonts || []).forEach(function (font) {
        if (seen[font.family]) return;
        seen[font.family] = true;
        families.push(font.family);
      });
      if (value && !seen[value]) families.unshift(value);
      return families.map(function (family) {
        return optionHtml(family, family, value);
      }).join("");
    }

    function fontStyleOptions(family, value) {
      const styles = [];
      const seen = {};
      (state.availableFonts || []).forEach(function (font) {
        if (font.family !== family || seen[font.style]) return;
        seen[font.style] = true;
        styles.push(font.style);
      });
      if (value && !seen[value]) styles.unshift(value);
      if (!styles.length) styles.push("Regular");
      return styles.map(function (style) {
        return optionHtml(style, style, value);
      }).join("");
    }

    function optionHtml(value, label, selectedValue) {
      const selected = value === selectedValue ? " selected" : "";
      return '<option value="' + escapeHtml(value) + '"' + selected + '>' + escapeHtml(label) + '</option>';
    }

    function validFontStyle(family, style) {
      const fonts = state.availableFonts || [];
      for (let index = 0; index < fonts.length; index++) {
        if (fonts[index].family === family && fonts[index].style === style) return style;
      }
      for (let index = 0; index < fonts.length; index++) {
        if (fonts[index].family === family) return fonts[index].style;
      }
      return style || "Regular";
    }

    function printWarnings() {
      const warnings = [];
      warnings.push("Figma exports RGB. This package still needs CMYK conversion outside Figma.");
      if (printSettings.profile === "U.S. Web Coated (SWOP) v2") {
        warnings.push("SWOP v2 is the default fallback. Ask the printer for a specific ICC profile when possible.");
      }
      if (printSettings.bleedMm < 3) warnings.push("Bleed is below the common 3 mm print minimum.");
      if (printSettings.dpi < 300) warnings.push("Raster DPI is below 300.");

      state.stack.forEach(function (layer) {
        if (isBrightPrintRisk(layer)) warnings.push(layer.name + " has bright RGB color that may shift in CMYK.");
        (layer.effects || []).forEach(function (effect) {
          if (["noise", "texture", "glass", "layerBlur", "backgroundBlur", "colorHalftone", "scribble", "feather"].includes(effect.type)) {
            warnings.push(layer.name + " uses " + effect.name + "; inspect raster output before print.");
          }
        });
      });

      return uniqueList(warnings);
    }

    function isBrightPrintRisk(layer) {
      const colors = [];
      if (layer.color) colors.push(layer.color);
      normalizedUiGradientStops(layer).forEach(function (stop) {
        colors.push(stop.color);
      });
      return colors.some(function (hex) {
        const rgb = parseHexColor(hex);
        const max = Math.max(rgb[0], rgb[1], rgb[2]);
        const min = Math.min(rgb[0], rgb[1], rgb[2]);
        return max > 224 && max - min > 140;
      });
    }

    function parseHexColor(hex) {
      const value = String(hex || "#000000").replace("#", "");
      return [
        parseInt(value.slice(0, 2), 16) || 0,
        parseInt(value.slice(2, 4), 16) || 0,
        parseInt(value.slice(4, 6), 16) || 0
      ];
    }

    function uniqueList(values) {
      const seen = {};
      const result = [];
      values.forEach(function (value) {
        if (seen[value]) return;
        seen[value] = true;
        result.push(value);
      });
      return result;
    }

    function downloadPrintPackage(message) {
      const base = message.fileName || "appearance-stack";
      downloadFile(base + "-source-rgb.pdf", message.pdfBytes, "application/pdf");
      downloadFile(base + "-print-manifest.json", message.manifestText, "application/json");
    }

    function downloadFile(fileName, contents, type) {
      const blob = contents instanceof Uint8Array || Array.isArray(contents)
        ? new Blob([new Uint8Array(contents)], { type: type })
        : new Blob([contents], { type: type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    }

    function dashPatternText(value) {
      if (Array.isArray(value)) return value.join(" ");
      return value || "";
    }

    function displayBlendMode(value) {
      return String(value || "NORMAL").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
    }

    function displayNoiseType(value) {
      return String(value || "MONOTONE").toLowerCase().replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
    }

    function displayShapeType(value) {
      if (value === "ROUNDED_RECTANGLE") return "Rounded Rectangle";
      return String(value || "RECTANGLE").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
    }

    function displayOffsetJoin(value) {
      return String(value || "MITER").toLowerCase().replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
    }

    function swatchStyle(layer) {
      if (layer.paintType === "GRADIENT_LINEAR" || layer.paintType === "GRADIENT_RADIAL") {
        return gradientRampStyle(layer, normalizedUiGradientStops(layer));
      }
      return "background:" + layer.color + ";";
    }

    function swatchStyleFromSwatch(swatch) {
      if (!swatch) return "background:#4F8DFF;";
      if (swatch.type === "gradient") {
        return gradientRampStyle({
          paintType: swatch.paintType,
          gradientAngle: swatch.gradientAngle,
          gradientStops: swatch.gradientStops,
          gradientStart: swatch.gradientStart,
          gradientEnd: swatch.gradientEnd
        }, normalizedUiGradientStops(swatch));
      }
      if (swatch.type === "pattern") {
        return "background:repeating-linear-gradient(45deg, #555 0 6px, #222 6px 12px);";
      }
      return "background:" + (swatch.color || "#4F8DFF") + ";";
    }

    function swatchLabel(swatch) {
      if (!swatch) return "Swatch";
      if (swatch.type === "gradient") return swatch.paintType === "GRADIENT_RADIAL" ? "Radial" : "Linear";
      if (swatch.type === "pattern") return "Pattern";
      return swatch.color || "Color";
    }

    function normalizedUiGradientStops(layer) {
      const fallbackStart = layer.gradientStart || layer.color || "#4F8DFF";
      const fallbackEnd = layer.gradientEnd || "#B96BFF";
      const source = Array.isArray(layer.gradientStops) && layer.gradientStops.length ? layer.gradientStops : [
        { id: createUiId(), position: 0, color: fallbackStart },
        { id: createUiId(), position: 100, color: fallbackEnd }
      ];
      const stops = source.map(function (stop, index) {
        return {
          id: stop.id || createUiId(),
          position: Math.max(0, Math.min(100, Number(stop.position) || (index === 0 ? 0 : 100))),
          color: stop.color || fallbackStart
        };
      });
      stops.sort(function (a, b) {
        return a.position - b.position;
      });
      if (stops.length === 1) {
        stops.push({ id: createUiId(), position: 100, color: stops[0].color });
      }
      return stops;
    }

    function gradientRampStyle(layer, stops) {
      const sorted = stops || normalizedUiGradientStops(layer);
      const stopText = sorted.map(function (stop) {
        return stop.color + " " + stop.position + "%";
      }).join(", ");
      if (layer.paintType === "GRADIENT_RADIAL") return "background:radial-gradient(circle, " + stopText + ");";
      const cssAngle = 90 + (Number(layer.gradientAngle) || 0);
      return "background:linear-gradient(" + cssAngle + "deg, " + stopText + ");";
    }

    function gradientColorAtUi(stops, position) {
      const sorted = stops.slice().sort(function (a, b) {
        return a.position - b.position;
      });
      if (!sorted.length) return "#4F8DFF";
      if (position <= sorted[0].position) return sorted[0].color;
      const last = sorted[sorted.length - 1];
      if (position >= last.position) return last.color;
      for (let index = 1; index < sorted.length; index++) {
        const before = sorted[index - 1];
        const after = sorted[index];
        if (position <= after.position) {
          const span = after.position - before.position;
          const local = span <= 0 ? 0 : (position - before.position) / span;
          return mixHexColor(before.color, after.color, local);
        }
      }
      return last.color;
    }

    function mixHexColor(a, b, t) {
      const ca = parseHexColor(a);
      const cb = parseHexColor(b);
      return rgbToHexUi(
        Math.round(ca[0] + (cb[0] - ca[0]) * t),
        Math.round(ca[1] + (cb[1] - ca[1]) * t),
        Math.round(ca[2] + (cb[2] - ca[2]) * t)
      );
    }

    function rgbToHexUi(r, g, b) {
      return "#" + [r, g, b].map(function (value) {
        const hex = Math.max(0, Math.min(255, value)).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      }).join("");
    }

    function createUiId() {
      return "ui_" + Math.random().toString(36).slice(2, 10);
    }

    function post(message) {
      parent.postMessage({ pluginMessage: message }, "*");
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[char];
      });
    }
