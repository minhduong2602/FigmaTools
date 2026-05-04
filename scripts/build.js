const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fitCurvePath = path.join(root, "node_modules", "fit-curve", "lib", "fit-curve.js");
const simplifyJsPath = path.join(root, "node_modules", "simplify-js", "simplify.js");
const threeModulePath = path.join(root, "node_modules", "three", "build", "three.module.min.js");
const threeCorePath = path.join(root, "node_modules", "three", "build", "three.core.min.js");
const svgLoaderPath = path.join(root, "node_modules", "three", "examples", "jsm", "loaders", "SVGLoader.js");
const objExporterPath = path.join(root, "node_modules", "three", "examples", "jsm", "exporters", "OBJExporter.js");
const effectComposerPath = path.join(root, "node_modules", "three", "examples", "jsm", "postprocessing", "EffectComposer.js");
const renderPassPath = path.join(root, "node_modules", "three", "examples", "jsm", "postprocessing", "RenderPass.js");
const unrealBloomPassPath = path.join(root, "node_modules", "three", "examples", "jsm", "postprocessing", "UnrealBloomPass.js");
const passPath = path.join(root, "node_modules", "three", "examples", "jsm", "postprocessing", "Pass.js");
const shaderPassPath = path.join(root, "node_modules", "three", "examples", "jsm", "postprocessing", "ShaderPass.js");
const maskPassPath = path.join(root, "node_modules", "three", "examples", "jsm", "postprocessing", "MaskPass.js");
const copyShaderPath = path.join(root, "node_modules", "three", "examples", "jsm", "shaders", "CopyShader.js");
const luminosityHighPassShaderPath = path.join(root, "node_modules", "three", "examples", "jsm", "shaders", "LuminosityHighPassShader.js");

const backendFiles = [
  "src/backend/constants.js",
  "src/backend/document.js",
  "src/backend/three-d.js",
  "src/backend/render-stack.js",
  "src/backend/blend.js",
  "src/backend/swatches.js",
  "src/backend/data.js",
  "src/backend/effects.js",
  "src/backend/warp.js",
  "src/backend/object-path.js",
  "src/backend/render-effects.js",
  "src/backend/print.js",
  "src/backend/paint.js",
  "src/backend/utils.js",
  "src/backend/main.js"
];

const uiFiles = [
  "ui/state.js",
  "ui/events.js",
  "ui/render.js",
  "ui/three-panel.js",
  "ui/list-events.js",
  "ui/modal.js",
  "ui/fields.js",
  "ui/boot.js"
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n").trim();
}

function readRaw(absolutePath) {
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function write(relativePath, contents) {
  fs.writeFileSync(path.join(root, relativePath), contents.replace(/\n/g, "\r\n"));
}

function buildCode() {
  const vendor = buildVendorCode();
  const body = [vendor].concat(backendFiles.map(read)).join("\n\n");
  write("code.js", body + "\n");
}

function buildVendorCode() {
  const fitCurveSource = readRaw(fitCurvePath);
  const simplifySource = readRaw(simplifyJsPath);
  return [
    "var fitCurve = (function () {",
    "  var module = { exports: {} };",
    "  var exports = module.exports;",
    indent(stripTrailingNewline(fitCurveSource), 2),
    "  return module.exports;",
    "})();",
    "",
    "var simplifyPathLib = (function () {",
    "  var module = { exports: {} };",
    "  var exports = module.exports;",
    indent(stripTrailingNewline(simplifySource), 2),
    "  return module.exports.default || module.exports;",
    "})();"
  ].join("\n");
}

function buildUi() {
  const styles = read("ui/styles.css");
  const body = read("ui/body.html");
  const script = uiFiles.map(read).join("\n\n");
  const moduleScript = buildUiModuleScript();
  write("ui.html", [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <style>",
    indent(styles, 4),
    "  </style>",
    "</head>",
    "<body>",
    indent(body, 2),
    "",
    "  <script type=\"module\">",
    moduleScript,
    "  </script>",
    "",
    "  <script>",
    script,
    "  </script>",
    "</body>",
    "</html>",
    ""
  ].join("\n"));
}

function buildUiModuleScript() {
  const threeCoreUrl = moduleDataUrl(threeCorePath);
  const threeUrl = moduleDataUrl(threeModulePath, [
    ["./three.core.min.js", threeCoreUrl]
  ]);
  const passUrl = moduleDataUrl(passPath, [
    ["from 'three';", "from '" + threeUrl + "';"]
  ]);
  const copyShaderUrl = moduleDataUrl(copyShaderPath);
  const maskPassUrl = moduleDataUrl(maskPassPath, [
    ["from './Pass.js';", "from '" + passUrl + "';"]
  ]);
  const shaderPassUrl = moduleDataUrl(shaderPassPath, [
    ["from 'three';", "from '" + threeUrl + "';"],
    ["from './Pass.js';", "from '" + passUrl + "';"]
  ]);
  const luminosityHighPassShaderUrl = moduleDataUrl(luminosityHighPassShaderPath, [
    ["from 'three';", "from '" + threeUrl + "';"]
  ]);
  const renderPassUrl = moduleDataUrl(renderPassPath, [
    ["from 'three';", "from '" + threeUrl + "';"],
    ["from './Pass.js';", "from '" + passUrl + "';"]
  ]);
  const effectComposerUrl = moduleDataUrl(effectComposerPath, [
    ["from 'three';", "from '" + threeUrl + "';"],
    ["from '../shaders/CopyShader.js';", "from '" + copyShaderUrl + "';"],
    ["from './ShaderPass.js';", "from '" + shaderPassUrl + "';"],
    ["from './MaskPass.js';", "from '" + maskPassUrl + "';"]
  ]);
  const unrealBloomPassUrl = moduleDataUrl(unrealBloomPassPath, [
    ["from 'three';", "from '" + threeUrl + "';"],
    ["from './Pass.js';", "from '" + passUrl + "';"],
    ["from '../shaders/CopyShader.js';", "from '" + copyShaderUrl + "';"],
    ["from '../shaders/LuminosityHighPassShader.js';", "from '" + luminosityHighPassShaderUrl + "';"]
  ]);
  const svgLoaderUrl = moduleDataUrl(svgLoaderPath, [
    ["from 'three';", "from '" + threeUrl + "';"]
  ]);
  const objExporterUrl = moduleDataUrl(objExporterPath, [
    ["from 'three';", "from '" + threeUrl + "';"]
  ]);
  return [
    "(async function () {",
    "  try {",
    "    var modules = await Promise.all([",
    "      import('" + threeUrl + "'),",
    "      import('" + svgLoaderUrl + "'),",
    "      import('" + objExporterUrl + "'),",
    "      import('" + effectComposerUrl + "'),",
    "      import('" + renderPassUrl + "'),",
    "      import('" + unrealBloomPassUrl + "')",
    "    ]);",
    "    var threeModule = modules[0];",
    "    var svgLoaderModule = modules[1];",
    "    var objExporterModule = modules[2];",
    "    var effectComposerModule = modules[3];",
    "    var renderPassModule = modules[4];",
    "    var unrealBloomPassModule = modules[5];",
    "    window.Appearance3D = {",
    "      THREE: threeModule,",
    "      SVGLoader: svgLoaderModule.SVGLoader || null,",
    "      OBJExporter: objExporterModule.OBJExporter || null,",
    "      EffectComposer: effectComposerModule.EffectComposer || null,",
    "      RenderPass: renderPassModule.RenderPass || null,",
    "      UnrealBloomPass: unrealBloomPassModule.UnrealBloomPass || null",
    "    };",
    "  } catch (error) {",
    "    window.Appearance3D = null;",
    "    window.Appearance3DError = error && error.message ? error.message : 'Failed to load Three.js.';",
    "  }",
    "  window.dispatchEvent(new Event('appearance-3d-ready'));",
    "})();"
  ].join("\n");
}

function moduleDataUrl(absolutePath, replacements) {
  let source = readRaw(absolutePath);
  (replacements || []).forEach(function (entry) {
    source = source.split(entry[0]).join(entry[1]);
  });
  return toDataUrl(source);
}

function indent(contents, spaces) {
  const padding = " ".repeat(spaces);
  return contents.split("\n").map(function (line) {
    return line ? padding + line : "";
  }).join("\n");
}

function stripTrailingNewline(contents) {
  return contents.replace(/\n+$/, "");
}

function toDataUrl(contents) {
  return "data:text/javascript;base64," + Buffer.from(contents, "utf8").toString("base64");
}

buildCode();
buildUi();
