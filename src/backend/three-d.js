async function sendThreeDSource() {
  const selection = figma.currentPage.selection;
  if (!selection.length) {
    figma.ui.postMessage({
      type: "3d-source",
      source: null
    });
    return;
  }

  if (selection.length > 1) {
    await sendMultipleNodesAsThreeDSource(selection);
    return;
  }

  const node = selection[0];
  if (isThreeDRenderNode(node)) {
    figma.ui.postMessage({
      type: "3d-source",
      source: readThreeDRenderSource(node)
    });
    return;
  }

  if (!node || typeof node.exportAsync !== "function") {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: "Selected object cannot be exported as SVG."
    });
    return;
  }

  await sendNodeAsThreeDSource(node, false, "");
}

async function sendMultipleNodesAsThreeDSource(selection) {
  const exportable = selection.filter(function (node) {
    return Boolean(node && typeof node.exportAsync === "function" && "width" in node && "height" in node);
  });
  if (exportable.length < 2) {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: "Select two or more drawable objects, or one grouped object."
    });
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  exportable.forEach(function (node) {
    const bounds = getThreeDNodeBounds(node);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  });

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  try {
    const parts = [];
    for (let index = 0; index < exportable.length; index += 1) {
      const node = exportable[index];
      const bounds = getThreeDNodeBounds(node);
      const svgBytes = await node.exportAsync({
        format: "SVG",
        contentsOnly: true,
        useAbsoluteBounds: true,
        svgOutlineText: true,
        svgSimplifyStroke: false
      });
      const svgText = decodeUtf8Bytes(svgBytes);
      parts.push(
        '<svg x="' + roundThreeDNumber(bounds.x - minX) + '" y="' + roundThreeDNumber(bounds.y - minY) +
        '" width="' + roundThreeDNumber(bounds.width) + '" height="' + roundThreeDNumber(bounds.height) +
        '" viewBox="0 0 ' + roundThreeDNumber(bounds.width) + ' ' + roundThreeDNumber(bounds.height) +
        '" overflow="visible">' + extractThreeDSvgInner(svgText) + '</svg>'
      );
    }
    const combinedSvg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + roundThreeDNumber(width) + '" height="' + roundThreeDNumber(height) + '" viewBox="0 0 ' + roundThreeDNumber(width) + ' ' + roundThreeDNumber(height) + '">',
      parts.join(""),
      "</svg>"
    ].join("");
    figma.ui.postMessage({
      type: "3d-source",
      source: {
        name: exportable.length + " Objects",
        nodeType: "MULTI",
        width: width,
        height: height,
        svg: combinedSvg,
        renderNodeId: "",
        fromRender: false,
        sourceNodeId: ""
      }
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: error && error.message ? error.message : "Could not export the selected objects as one 3D source."
    });
  }
}

function getThreeDNodeBounds(node) {
  const absolute = node.absoluteRenderBounds || node.absoluteBoundingBox;
  if (absolute) {
    return {
      x: Number(absolute.x) || 0,
      y: Number(absolute.y) || 0,
      width: Math.max(1, Number(absolute.width) || 1),
      height: Math.max(1, Number(absolute.height) || 1)
    };
  }
  return {
    x: "x" in node ? Number(node.x) || 0 : 0,
    y: "y" in node ? Number(node.y) || 0 : 0,
    width: "width" in node ? Math.max(1, Number(node.width) || 1) : 1,
    height: "height" in node ? Math.max(1, Number(node.height) || 1) : 1
  };
}

function extractThreeDSvgInner(svgText) {
  const text = String(svgText || "");
  const openEnd = text.indexOf(">");
  const closeStart = text.lastIndexOf("</svg>");
  if (openEnd === -1 || closeStart === -1 || closeStart <= openEnd) {
    return text;
  }
  return text.slice(openEnd + 1, closeStart);
}

function roundThreeDNumber(value) {
  return Number((Number(value) || 0).toFixed(3));
}

async function sendThreeDSourceById(nodeId, renderNodeId) {
  if (!nodeId || typeof figma.getNodeByIdAsync !== "function") {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: "Original source is no longer available."
    });
    return;
  }

  const node = await figma.getNodeByIdAsync(String(nodeId));
  if (!node || typeof node.exportAsync !== "function") {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: "Original source is missing or cannot be exported."
    });
    return;
  }

  await sendNodeAsThreeDSource(node, false, renderNodeId || "");
}

async function placeThreeDRender(payload) {
  const imageBytes = decodeBase64Png(payload && payload.pngDataUrl);
  if (!imageBytes) {
    throw new Error("3D preview image is missing.");
  }

  const image = createThreeDImageOrThrow(imageBytes, "base render");
  const selection = figma.currentPage.selection;
  const selectedNode = selection.length === 1 ? selection[0] : null;
  const updatingExisting = isThreeDRenderNode(selectedNode);
  const hasSeparateBloom = Boolean(payload && payload.bloomDataUrl);
  const sourceNode = updatingExisting ? null : selectedNode;
  const targetWidth = clampNumber(payload && payload.width, 1, 10000, updatingExisting ? ("width" in selectedNode ? selectedNode.width : 240) : sourceNode && "width" in sourceNode ? sourceNode.width : 240);
  const targetHeight = clampNumber(payload && payload.height, 1, 10000, updatingExisting ? ("height" in selectedNode ? selectedNode.height : 240) : sourceNode && "height" in sourceNode ? sourceNode.height : 240);

  let container = updatingExisting ? selectedNode : null;
  if (!container) {
    container = hasSeparateBloom ? figma.createFrame() : figma.createRectangle();
  } else if (hasSeparateBloom && container.type !== "FRAME") {
    container = convertThreeDRenderToFrame(container, targetWidth, targetHeight);
  }

  if (!container) {
    throw new Error("Could not create 3D render container.");
  }

  container.name = (payload && payload.name ? payload.name : "3D Object") + " Render";

  if (hasSeparateBloom && container.type === "FRAME") {
    container.clipsContent = false;
    container.fills = [];
    container.strokes = [];
    container.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
    const baseRect = ensureThreeDFrameChild(container, "Base");
    applyThreeDImageFill(baseRect, image.hash);
    baseRect.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
    baseRect.x = 0;
    baseRect.y = 0;

    const bloomBytes = decodeBase64Png(payload && payload.bloomDataUrl);
    const bloomImage = bloomBytes ? createThreeDImageOrThrow(bloomBytes, "bloom flare") : null;
    const bloomRect = ensureThreeDFrameChild(container, "Bloom");
    if (bloomImage) {
      applyThreeDImageFill(bloomRect, bloomImage.hash);
    }
    bloomRect.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
    bloomRect.x = 0;
    bloomRect.y = 0;
    bloomRect.opacity = clampNumber(payload && payload.bloomOpacity, 0, 100, 100) / 100;
    if ("blendMode" in bloomRect) {
      bloomRect.blendMode = normalizeBlendMode(payload && payload.bloomBlendMode ? payload.bloomBlendMode : "SCREEN");
    }
  } else {
    const rect = container;
    rect.fills = [{
      type: "IMAGE",
      scaleMode: "FIT",
      imageHash: image.hash
    }];
    rect.strokes = [];
    rect.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
  }

  if (!updatingExisting && sourceNode && sourceNode.parent && sourceNode.parent.type !== "DOCUMENT") {
    const parent = sourceNode.parent;
    const index = getChildIndex(parent, sourceNode);
    parent.insertChild(index >= 0 ? index + 1 : parent.children.length, container);
    container.x = sourceNode.x;
    container.y = sourceNode.y;
  } else if (!updatingExisting) {
    figma.currentPage.appendChild(container);
    container.x = figma.viewport.center.x - targetWidth / 2;
    container.y = figma.viewport.center.y - targetHeight / 2;
  }

  writeThreeDRenderData(container, payload);
  figma.currentPage.selection = [container];
  figma.notify(updatingExisting ? "3D render updated." : "3D render placed on canvas.");
}

function createThreeDImageOrThrow(bytes, label) {
  try {
    return figma.createImage(bytes);
  } catch (error) {
    const message = error && error.message ? error.message : "";
    if (/image is too large/i.test(message)) {
      throw new Error("3D " + label + " is too large for Figma. Lower Export scale, or turn off Bloom / Split Flare for this render.");
    }
    throw error;
  }
}

function applyThreeDImageFill(node, imageHash) {
  node.fills = [{
    type: "IMAGE",
    scaleMode: "FIT",
    imageHash: imageHash
  }];
  node.strokes = [];
}

function ensureThreeDFrameChild(frame, role) {
  const targetName = role === "Bloom" ? "Bloom Flare" : "Base Render";
  const existing = frame.children.find((child) => child.type === "RECTANGLE" && child.name === targetName);
  if (existing) return existing;
  const rect = figma.createRectangle();
  rect.name = targetName;
  frame.appendChild(rect);
  return rect;
}

function convertThreeDRenderToFrame(node, width, height) {
  const frame = figma.createFrame();
  frame.name = node.name;
  frame.fills = [];
  frame.strokes = [];
  frame.clipsContent = false;
  frame.resizeWithoutConstraints(Math.max(1, width), Math.max(1, height));
  frame.x = node.x;
  frame.y = node.y;
  if (node.parent && node.parent.type !== "DOCUMENT") {
    const parent = node.parent;
    const index = getChildIndex(parent, node);
    parent.insertChild(index >= 0 ? index : parent.children.length, frame);
    frame.x = node.x;
    frame.y = node.y;
    parent.removeChild(node);
  } else {
    figma.currentPage.appendChild(frame);
    frame.x = node.x;
    frame.y = node.y;
    figma.currentPage.removeChild(node);
  }
  return frame;
}

async function sendNodeAsThreeDSource(node, fromRender, renderNodeId) {
  try {
    const svgBytes = await node.exportAsync({
      format: "SVG",
      contentsOnly: true,
      useAbsoluteBounds: true,
      svgOutlineText: true,
      svgSimplifyStroke: false
    });
    figma.ui.postMessage({
      type: "3d-source",
      source: {
        name: node.name || "3D Source",
        nodeType: node.type,
        width: "width" in node ? node.width : 0,
        height: "height" in node ? node.height : 0,
        svg: decodeUtf8Bytes(svgBytes),
        renderNodeId: renderNodeId || "",
        fromRender: fromRender === true,
        sourceNodeId: node.id
      }
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: error && error.message ? error.message : "Could not export the selected object as SVG."
    });
  }
}

function isThreeDRenderNode(node) {
  return Boolean(node && (node.type === "RECTANGLE" || node.type === "FRAME" || node.type === "ELLIPSE" || node.type === "POLYGON" || node.type === "STAR" || node.type === "VECTOR") && node.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_THREE_RENDER);
}

function readThreeDRenderSource(node) {
  const sourceRaw = node.getSharedPluginData(DATA_NAMESPACE, DATA_THREE_SOURCE);
  const metaRaw = node.getSharedPluginData(DATA_NAMESPACE, DATA_THREE_META);
  let meta = {};
  try {
    meta = metaRaw ? JSON.parse(metaRaw) : {};
  } catch (_error) {
    meta = {};
  }
  return {
    name: meta.name || node.name.replace(/\sRender$/, ""),
    nodeType: meta.nodeType || "RENDER",
    width: "width" in node ? node.width : meta.width || 0,
    height: "height" in node ? node.height : meta.height || 0,
    svg: sourceRaw || "",
    mode: meta.mode || "extrude",
    settings: meta.settings || null,
    renderNodeId: node.id,
    fromRender: true,
    sourceNodeId: meta.sourceNodeId || ""
  };
}

function writeThreeDRenderData(node, payload) {
  node.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_THREE_RENDER);
  node.setSharedPluginData(DATA_NAMESPACE, DATA_THREE_SOURCE, String(payload && payload.svgSource || ""));
  node.setSharedPluginData(DATA_NAMESPACE, DATA_THREE_META, JSON.stringify({
    name: payload && payload.name ? payload.name : "3D Object",
    nodeType: payload && payload.nodeType ? payload.nodeType : "RENDER",
    width: payload && payload.width ? payload.width : ("width" in node ? node.width : 0),
    height: payload && payload.height ? payload.height : ("height" in node ? node.height : 0),
    mode: payload && payload.mode ? payload.mode : "extrude",
    settings: payload && payload.settings ? payload.settings : {},
    sourceNodeId: payload && payload.sourceNodeId ? payload.sourceNodeId : ""
  }));
}

function decodeUtf8Bytes(bytes) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  let result = "";
  for (let index = 0; index < bytes.length; index++) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}

function decodeBase64Png(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  const base64 = comma >= 0 ? raw.slice(comma + 1) : raw;
  if (!base64) return null;
  return base64ToBytes(base64);
}

function base64ToBytes(base64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleaned = String(base64).replace(/[^A-Za-z0-9+/=]/g, "");
  const output = [];
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < cleaned.length; index++) {
    const char = cleaned.charAt(index);
    if (char === "=") break;
    const value = alphabet.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push(buffer >> bits & 255);
    }
  }

  return new Uint8Array(output);
}
