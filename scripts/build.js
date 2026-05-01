const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const backendFiles = [
  "src/backend/constants.js",
  "src/backend/document.js",
  "src/backend/render-stack.js",
  "src/backend/data.js",
  "src/backend/effects.js",
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
  "ui/list-events.js",
  "ui/modal.js",
  "ui/fields.js",
  "ui/boot.js"
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n").trim();
}

function write(relativePath, contents) {
  fs.writeFileSync(path.join(root, relativePath), contents.replace(/\n/g, "\r\n"));
}

function buildCode() {
  const body = backendFiles.map(read).join("\n\n");
  write("code.js", body + "\n");
}

function buildUi() {
  const styles = read("ui/styles.css");
  const body = read("ui/body.html");
  const script = uiFiles.map(read).join("\n\n");
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
    "  <script>",
    script,
    "  </script>",
    "</body>",
    "</html>",
    ""
  ].join("\n"));
}

function indent(contents, spaces) {
  const padding = " ".repeat(spaces);
  return contents.split("\n").map(function (line) {
    return line ? padding + line : "";
  }).join("\n");
}

buildCode();
buildUi();
