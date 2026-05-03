const fs = require("fs");
const path = require("path");
const vm = require("vm");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");

function runNodeCheck(relativePath) {
  childProcess.execFileSync(process.execPath, ["--check", path.join(root, relativePath)], {
    stdio: "inherit"
  });
}

runNodeCheck("code.js");
runNodeCheck("scripts/convert-print.js");

const html = fs.readFileSync(path.join(root, "ui.html"), "utf8");
const openTag = html.lastIndexOf("<script");
const closeTag = html.lastIndexOf("</script>");

if (openTag === -1 || closeTag === -1 || closeTag <= openTag) {
  throw new Error("Inline UI script not found");
}

const tagEnd = html.indexOf(">", openTag);
if (tagEnd === -1 || tagEnd >= closeTag) {
  throw new Error("Inline UI script tag is malformed");
}

new vm.Script(html.slice(tagEnd + 1, closeTag));
