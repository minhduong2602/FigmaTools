function hexToRgb(hex) {
  const normalized = normalizeHex(hex).replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255
  };
}

function rgbToHex(r, g, b) {
  const parts = [r, g, b].map((value) => Math.round(value * 255).toString(16).padStart(2, "0"));
  return `#${parts.join("").toUpperCase()}`;
}

function normalizeHex(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }
  return fallback || DEFAULT_FILL;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeBlendMode(value) {
  return BLEND_MODES.includes(value) ? value : "NORMAL";
}

function normalizePaintType(value) {
  return PAINT_TYPES.includes(value) ? value : "SOLID";
}

function normalizeNoiseType(value) {
  return ["MONOTONE", "DUOTONE", "MULTITONE"].includes(value) ? value : "MONOTONE";
}

function normalizeShapeEffectType(value) {
  return SHAPE_EFFECT_TYPES.includes(value) ? value : "RECTANGLE";
}

function normalizeOffsetJoin(value) {
  return OFFSET_JOINS.includes(value) ? value : "MITER";
}

function defaultEffectOpacity(type) {
  if (type === "innerShadow") return 24;
  if (type === "outerGlow") return 65;
  if (type === "innerGlow") return 55;
  if (type === "noise") return 22;
  if (type === "colorHalftone") return 45;
  if (type === "scribble") return 65;
  return 28;
}

function defaultEffectOffsetY(type) {
  if (type === "innerShadow") return 3;
  if (type === "outerGlow" || type === "innerGlow") return 0;
  return 8;
}

function defaultEffectRadius(type) {
  if (type === "layerBlur") return 8;
  if (type === "backgroundBlur") return 12;
  if (type === "innerShadow") return 8;
  if (type === "outerGlow") return 18;
  if (type === "innerGlow") return 14;
  if (type === "texture") return 4;
  if (type === "glass") return 8;
  if (type === "feather") return 8;
  if (type === "roundCorners") return 12;
  return 18;
}

function normalizeOptionalEnum(value, options) {
  if (value === "" || value === undefined || value === null) return "";
  return options.includes(value) ? value : "";
}

function normalizeDashPattern(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clampNumber(item, 0, 1000, 0)).filter((item) => item > 0);
  }

  if (typeof value === "string") {
    return value.split(/[,\s]+/).map((item) => clampNumber(item, 0, 1000, 0)).filter((item) => item > 0);
  }

  return [];
}

function getNodeBlendMode(node) {
  return "blendMode" in node ? normalizeBlendMode(node.blendMode) : "NORMAL";
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function effectName(type) {
  if (type === "dropShadow") return "Drop Shadow";
  if (type === "innerShadow") return "Inner Shadow";
  if (type === "outerGlow") return "Outer Glow";
  if (type === "innerGlow") return "Inner Glow";
  if (type === "layerBlur") return "Layer Blur";
  if (type === "backgroundBlur") return "Background Blur";
  if (type === "noise") return "Noise";
  if (type === "texture") return "Texture";
  if (type === "glass") return "Glass";
  if (type === "transform") return "Transform";
  if (type === "offsetPath") return "Offset Path";
  if (type === "roundCorners") return "Round Corners";
  if (type === "feather") return "Feather";
  if (type === "convertShape") return "Convert to Shape";
  if (type === "colorHalftone") return "Color Halftone";
  if (type === "scribble") return "Scribble";
  return titleCase(type);
}

function positiveModulo(value, size) {
  return ((value % size) + size) % size;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed || 1;
  return function () {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const rawRow = y * stride;
    const rgbaRow = y * width * 4;
    raw[rawRow] = 0;
    raw.set(rgba.subarray(rgbaRow, rgbaRow + width * 4), rawRow + 1);
  }

  const compressed = zlibStore(raw);
  const chunks = [
    pngChunk("IHDR", pngIhdr(width, height)),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0))
  ];
  return concatBytes([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])].concat(chunks));
}

function pngIhdr(width, height) {
  const bytes = new Uint8Array(13);
  writeUint32(bytes, 0, width);
  writeUint32(bytes, 4, height);
  bytes[8] = 8;
  bytes[9] = 6;
  bytes[10] = 0;
  bytes[11] = 0;
  bytes[12] = 0;
  return bytes;
}

function pngChunk(type, data) {
  const typeBytes = asciiBytes(type);
  const bytes = new Uint8Array(12 + data.length);
  writeUint32(bytes, 0, data.length);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  writeUint32(bytes, 8 + data.length, crc32(concatBytes([typeBytes, data])));
  return bytes;
}

function zlibStore(data) {
  const blocks = [];
  let offset = 0;
  while (offset < data.length) {
    const length = Math.min(65535, data.length - offset);
    const finalBlock = offset + length >= data.length;
    const block = new Uint8Array(5 + length);
    block[0] = finalBlock ? 1 : 0;
    block[1] = length & 255;
    block[2] = length >>> 8 & 255;
    const nlen = (~length) & 65535;
    block[3] = nlen & 255;
    block[4] = nlen >>> 8 & 255;
    block.set(data.subarray(offset, offset + length), 5);
    blocks.push(block);
    offset += length;
  }

  const adler = adler32(data);
  const trailer = new Uint8Array(4);
  writeUint32(trailer, 0, adler);
  return concatBytes([new Uint8Array([120, 1])].concat(blocks).concat([trailer]));
}

function asciiBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value >>> 24 & 255;
  bytes[offset + 1] = value >>> 16 & 255;
  bytes[offset + 2] = value >>> 8 & 255;
  bytes[offset + 3] = value & 255;
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (let index = 0; index < data.length; index++) {
    a = (a + data[index]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < data.length; index++) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xEDB88320 ^ crc >>> 1 : crc >>> 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
