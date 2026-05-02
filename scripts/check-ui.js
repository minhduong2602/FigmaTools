const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("ui.html", "utf8");
const start = html.lastIndexOf("<script>");
const end = html.lastIndexOf("</script>");

if (start < 0 || end < 0 || end <= start) {
  throw new Error("Inline UI script not found");
}

const script = html.slice(start + 8, end);
new vm.Script(script);
