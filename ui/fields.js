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
      return Boolean(active && (active.hasAttribute("data-field") || active.hasAttribute("data-effect-field") || active.hasAttribute("data-text-field") || active.hasAttribute("data-text-style-field") || active.hasAttribute("data-global-field") || active.hasAttribute("data-object-field")));
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
      if (layer.gradientStart) colors.push(layer.gradientStart);
      if (layer.gradientEnd) colors.push(layer.gradientEnd);
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
        const cssAngle = 90 + (Number(layer.gradientAngle) || 0);
        const gradient = layer.paintType === "GRADIENT_RADIAL" ? "radial-gradient(circle, " : "linear-gradient(" + cssAngle + "deg, ";
        return "background:" + gradient + layer.gradientStart + ", " + layer.gradientEnd + ");";
      }
      return "background:" + layer.color + ";";
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
