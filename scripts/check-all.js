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
const blocks = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g));
const lastBlock = blocks.length ? blocks[blocks.length - 1] : null;

if (!lastBlock) {
  throw new Error("Inline UI script not found");
}

new vm.Script(lastBlock[1]);
