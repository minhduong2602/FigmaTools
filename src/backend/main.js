figma.showUI(__html__, { width: 360, height: 620, themeColors: true });

let availableFonts = [];

loadAvailableFonts();

figma.on("selectionchange", () => {
  sendSelectionState();
});

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "wrap-selection") {
      await wrapSelection();
      sendSelectionState();
    }

    if (message.type === "detach") {
      await detachAppearance();
      sendSelectionState();
    }

    if (message.type === "close-plugin") {
      figma.closePlugin();
    }

    if (message.type === "update-text") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base || base.type !== "TEXT") {
        figma.notify("This appearance stack is not a text object.");
        return;
      }
      await setTextContent(base, message.characters || "");
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-text-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base || base.type !== "TEXT") {
        figma.notify("This appearance stack is not a text object.");
        return;
      }
      await applyTextProperties(base, message.textProperties || {});
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-global") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const globalAppearance = normalizeGlobalAppearance(Object.assign({}, readGlobalAppearance(group), message.globalAppearance));
      writeGlobalAppearance(group, globalAppearance);
      applyGlobalAppearance(group, globalAppearance);
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-object-properties") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base) return notifySelectAppearance();
      applyObjectProperties(group, base, message.objectProperties || {});
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "export-print-package") {
      await exportPrintPackage(message.printSettings || {});
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "add-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      stack.push(createLayer(message.layerKind));
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "add-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      if (index >= 0) {
        if (message.effectKind === "transform" && stack[index].effects.some((effect) => effect.type === "transform")) {
          figma.notify("This stack already has a Transform effect.");
          sendSelectionState();
          return;
        }
        stack[index].effects.push(createEffect(message.effectKind));
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "update-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const layer = stack.find((item) => item.id === message.layerId);
      if (layer) {
        const effectIndex = layer.effects.findIndex((effect) => effect.id === message.effect.id);
        if (effectIndex >= 0) {
          layer.effects[effectIndex] = normalizeEffect(Object.assign({}, layer.effects[effectIndex], message.effect));
          await renderAppearance(group, stack);
        }
      }
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "remove-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const layer = stack.find((item) => item.id === message.layerId);
      if (layer) {
        layer.effects = layer.effects.filter((effect) => effect.id !== message.effectId);
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "update-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layer.id);
      if (index >= 0) {
        stack[index] = normalizeLayer(Object.assign({}, stack[index], message.layer));
        await renderAppearance(group, stack);
      }
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "remove-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group).filter((layer) => layer.id !== message.layerId);
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "clear-appearance") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      writeGlobalAppearance(group, createGlobalAppearance());
      await renderAppearance(group, []);
      sendSelectionState();
    }

    if (message.type === "copy-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      await figma.clientStorage.setAsync(STYLE_CLIPBOARD_KEY, {
        stack: readStack(group),
        globalAppearance: readGlobalAppearance(group)
      });
      figma.notify("Appearance copied.");
      sendSelectionState();
    }

    if (message.type === "paste-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = await figma.clientStorage.getAsync(STYLE_CLIPBOARD_KEY);
      if (!Array.isArray(stack)) {
        if (!stack || !Array.isArray(stack.stack)) {
          figma.notify("No copied appearance yet.");
          return;
        }
        writeGlobalAppearance(group, normalizeGlobalAppearance(stack.globalAppearance));
        await renderAppearance(group, stack.stack.map(cloneLayerForPaste));
      } else {
        writeGlobalAppearance(group, createGlobalAppearance());
        await renderAppearance(group, stack.map(cloneLayerForPaste));
      }
      figma.notify("Appearance pasted.");
      sendSelectionState();
    }

    if (message.type === "reduce-basic") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = reduceToBasic(readStack(group));
      writeGlobalAppearance(group, createGlobalAppearance());
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "duplicate-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      if (index >= 0) {
        stack.splice(index + 1, 0, normalizeLayer(Object.assign({}, stack[index], {
          id: createId(),
          name: `${stack[index].name} copy`
        })));
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "move-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      const next = index + message.direction;
      if (index >= 0 && next >= 0 && next < stack.length) {
        const [layer] = stack.splice(index, 1);
        stack.splice(next, 0, layer);
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "reorder-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const from = stack.findIndex((layer) => layer.id === message.layerId);
      const before = message.beforeLayerId ? stack.findIndex((layer) => layer.id === message.beforeLayerId) : -1;
      const after = message.afterLayerId ? stack.findIndex((layer) => layer.id === message.afterLayerId) : -1;
      if (from >= 0) {
        const layer = stack.splice(from, 1)[0];
        const adjustedAfter = after >= 0 && from < after ? after - 1 : after;
        const adjustedBefore = before >= 0 && from < before ? before - 1 : before;
        if (adjustedAfter >= 0) {
          stack.splice(adjustedAfter + 1, 0, layer);
        } else if (adjustedBefore >= 0) {
          stack.splice(adjustedBefore, 0, layer);
        } else {
          stack.push(layer);
        }
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }
  } catch (error) {
    figma.notify(error && error.message ? error.message : "Appearance Stack hit an error.");
  }
};

async function loadAvailableFonts() {
  if (typeof figma.listAvailableFontsAsync !== "function") {
    sendSelectionState();
    return;
  }

  try {
    const fonts = await figma.listAvailableFontsAsync();
    availableFonts = fonts.map((font) => {
      return {
        family: font.fontName.family,
        style: font.fontName.style
      };
    }).sort((a, b) => {
      const familySort = a.family.localeCompare(b.family);
      return familySort || a.style.localeCompare(b.style);
    });
  } catch (_error) {
    availableFonts = [];
  }
  sendSelectionState();
}

function sendSelectionState() {
  const selection = figma.currentPage.selection;
  const group = getActiveAppearanceGroup();
  const base = group ? findBase(group) : null;
  figma.ui.postMessage({
    type: "selection-state",
    hasSelection: selection.length > 0,
    selectedCount: selection.length,
    isAppearance: Boolean(group),
    groupName: group ? group.name : "",
    baseName: base ? base.name.replace(/\sbase$/, "") : "",
    baseType: base ? base.type : "",
    isTextBase: Boolean(base && base.type === "TEXT"),
    textContent: base && base.type === "TEXT" ? base.characters : "",
    textProperties: base && base.type === "TEXT" ? readTextProperties(base) : null,
    availableFonts,
    objectProperties: group && base ? readObjectProperties(group, base) : null,
    globalAppearance: group ? readGlobalAppearance(group) : createGlobalAppearance(),
    stack: group ? readStack(group) : []
  });
}

sendSelectionState();
