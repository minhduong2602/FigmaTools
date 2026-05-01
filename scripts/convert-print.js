#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const DEFAULT_PROFILE = "U.S. Web Coated (SWOP) v2";
const SOURCE_SUFFIX = "-source-rgb.pdf";
const MANIFEST_SUFFIX = "-print-manifest.json";

main().catch(function (error) {
  console.error(error.message || error);
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || (!options.input && !options.watch)) {
    printHelp();
    return;
  }

  if (options.watch) {
    await watchFolder(path.resolve(options.watch), options);
    return;
  }

  await convertOne(options);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--input" || arg === "-i") options.input = argv[++index];
    else if (arg === "--manifest" || arg === "-m") options.manifest = argv[++index];
    else if (arg === "--output" || arg === "-o") options.output = argv[++index];
    else if (arg === "--out-dir") options.outDir = argv[++index];
    else if (arg === "--profile" || arg === "-p") options.profile = argv[++index];
    else if (arg === "--rgb-profile") options.rgbProfile = argv[++index];
    else if (arg === "--gs") options.gs = argv[++index];
    else if (arg === "--watch" || arg === "-w") {
      const next = argv[++index];
      if (next === "--help" || next === "-h") options.help = true;
      else options.watch = next;
    }
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else throw new Error("Unknown option: " + arg);
  }
  return options;
}

function printHelp() {
  console.log([
    "Usage:",
    "  npm run print:convert -- --input <file-source-rgb.pdf> [--profile <icc>] [--output <file-cmyk.pdf>]",
    "  npm run print:watch -- <folder> [--profile <icc>]",
    "",
    "Examples:",
    "  npm run print:convert -- --input \"$env:USERPROFILE\\Downloads\\poster-source-rgb.pdf\" --profile \"C:\\ICC\\USWebCoatedSWOP.icc\"",
    "  npm run print:watch -- \"$env:USERPROFILE\\Downloads\" --profile \"C:\\ICC\\USWebCoatedSWOP.icc\"",
    "",
    "Environment variables:",
    "  GHOSTSCRIPT_BIN   Path to gswin64c.exe when it is not in PATH.",
    "  CMYK_ICC          Path to the CMYK ICC profile.",
    "  RGB_ICC           Optional source RGB ICC profile."
  ].join("\n"));
}

async function convertOne(options) {
  const inputPath = requireFile(options.input, "input PDF");
  const manifestPath = resolveManifestPath(inputPath, options.manifest);
  const manifest = readManifest(manifestPath);
  const printProfileName = getManifestProfile(manifest) || DEFAULT_PROFILE;
  const outputPath = resolveOutputPath(inputPath, options.output, options.outDir);
  const gsPath = resolveGhostscript(options.gs);
  const cmykProfilePath = resolveCmykProfile(options.profile, printProfileName);
  const rgbProfilePath = resolveOptionalFile(options.rgbProfile || process.env.RGB_ICC, "RGB ICC profile");
  const dpi = getManifestDpi(manifest);
  const args = buildGhostscriptArgs(inputPath, outputPath, cmykProfilePath, rgbProfilePath, dpi);

  if (!options.force && fs.existsSync(outputPath)) {
    const outputStat = fs.statSync(outputPath);
    const inputStat = fs.statSync(inputPath);
    const manifestStat = fs.existsSync(manifestPath) ? fs.statSync(manifestPath) : null;
    const manifestTime = manifestStat ? manifestStat.mtimeMs : 0;
    if (outputStat.mtimeMs >= inputStat.mtimeMs && outputStat.mtimeMs >= manifestTime) {
      console.log("Skipped up-to-date file: " + outputPath);
      return { skipped: true, outputPath: outputPath };
    }
  }

  console.log("Source:  " + inputPath);
  console.log("Output:  " + outputPath);
  console.log("Profile: " + cmykProfilePath);
  console.log("Intent:  CMYK conversion helper, not a certified PDF/X preflight");

  if (options.dryRun) {
    console.log(formatCommand(gsPath, args));
    return { dryRun: true, outputPath: outputPath };
  }

  await runGhostscript(gsPath, args);
  console.log("Done: " + outputPath);
  console.log("Preflight reminder: inspect separations, total ink, fonts, trim, and bleed before sending to print.");
  return { outputPath: outputPath };
}

function requireFile(filePath, label) {
  if (!filePath) throw new Error("Missing " + label + ". Use --input <path>.");
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error("Cannot find " + label + ": " + absolutePath);
  return absolutePath;
}

function resolveOptionalFile(filePath, label) {
  if (!filePath) return "";
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error("Cannot find " + label + ": " + absolutePath);
  return absolutePath;
}

function resolveManifestPath(inputPath, explicitPath) {
  if (explicitPath) return requireFile(explicitPath, "manifest");
  const folder = path.dirname(inputPath);
  const base = path.basename(inputPath);
  const stem = base.toLowerCase().endsWith(SOURCE_SUFFIX)
    ? base.slice(0, -SOURCE_SUFFIX.length)
    : base.replace(/\.pdf$/i, "");
  const candidate = path.join(folder, stem + MANIFEST_SUFFIX);
  return fs.existsSync(candidate) ? candidate : "";
}

function readManifest(manifestPath) {
  if (!manifestPath) return {};
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("Cannot read manifest JSON: " + manifestPath + "\n" + error.message);
  }
}

function getManifestProfile(manifest) {
  if (manifest && manifest.target && manifest.target.iccProfile) return manifest.target.iccProfile;
  if (manifest && manifest.printSettings && manifest.printSettings.profile) return manifest.printSettings.profile;
  return "";
}

function getManifestDpi(manifest) {
  if (manifest && manifest.layout && manifest.layout.rasterDpi) return clampDpi(manifest.layout.rasterDpi);
  return 300;
}

function clampDpi(value) {
  const number = Number(value);
  if (!isFinite(number)) return 300;
  return Math.max(72, Math.min(1200, Math.round(number)));
}

function resolveOutputPath(inputPath, explicitPath, outDir) {
  if (explicitPath) return path.resolve(explicitPath);
  const outputDir = outDir ? path.resolve(outDir) : path.dirname(inputPath);
  const base = path.basename(inputPath);
  const stem = base.toLowerCase().endsWith(SOURCE_SUFFIX)
    ? base.slice(0, -SOURCE_SUFFIX.length)
    : base.replace(/\.pdf$/i, "");
  return path.join(outputDir, stem + "-print-cmyk.pdf");
}

function resolveGhostscript(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(explicitPath);
  if (process.env.GHOSTSCRIPT_BIN) candidates.push(process.env.GHOSTSCRIPT_BIN);
  candidates.push(findExecutableInPath(["gswin64c.exe", "gswin32c.exe", "gs"]));
  candidates.push(findGhostscriptInProgramFiles());

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate && fs.existsSync(candidate)) return path.resolve(candidate);
  }

  throw new Error([
    "Cannot find Ghostscript executable.",
    "Install Ghostscript, add gswin64c.exe to PATH, or pass:",
    "  --gs \"C:\\Program Files\\gs\\gs10.xx.x\\bin\\gswin64c.exe\"",
    "You can also set GHOSTSCRIPT_BIN."
  ].join("\n"));
}

function resolveCmykProfile(explicitPath, profileName) {
  const candidates = [];
  if (explicitPath) candidates.push(explicitPath);
  if (process.env.CMYK_ICC) candidates.push(process.env.CMYK_ICC);
  candidates.push(findProfileByName(profileName || DEFAULT_PROFILE));

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate && fs.existsSync(candidate)) return path.resolve(candidate);
  }

  throw new Error([
    "Cannot find CMYK ICC profile for: " + (profileName || DEFAULT_PROFILE),
    "Pass it explicitly with:",
    "  --profile \"C:\\ICC\\USWebCoatedSWOP.icc\"",
    "or set CMYK_ICC.",
    "Common Adobe path:",
    "  C:\\Program Files (x86)\\Common Files\\Adobe\\Color\\Profiles\\Recommended\\USWebCoatedSWOP.icc"
  ].join("\n"));
}

function findExecutableInPath(names) {
  const pathValue = process.env.PATH || "";
  const folders = pathValue.split(path.delimiter);
  for (let folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
    for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
      const candidate = path.join(folders[folderIndex], names[nameIndex]);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

function findGhostscriptInProgramFiles() {
  const roots = [
    "C:\\Program Files\\gs",
    "C:\\Program Files (x86)\\gs"
  ];
  const matches = [];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex];
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name, "bin", "gswin64c.exe");
      if (fs.existsSync(candidate)) matches.push(candidate);
    }
  }
  matches.sort();
  return matches.length ? matches[matches.length - 1] : "";
}

function findProfileByName(profileName) {
  const fileNames = profileFileNames(profileName);
  const folders = profileSearchFolders();
  for (let folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
    const found = findFileByName(folders[folderIndex], fileNames, 3);
    if (found) return found;
  }
  return "";
}

function profileFileNames(profileName) {
  const normalized = String(profileName || "").toLowerCase();
  if (normalized.indexOf("swop") >= 0) {
    return [
      "USWebCoatedSWOP.icc",
      "USWebCoatedSWOP.icm",
      "U.S. Web Coated (SWOP) v2.icc",
      "SWOP_TR005_coated_5.icc"
    ];
  }
  if (normalized.indexOf("fogra") >= 0) {
    return ["CoatedFOGRA39.icc", "ISOcoated_v2_eci.icc", "FOGRA39L_coated.icc"];
  }
  if (normalized.indexOf("japan") >= 0) {
    return ["JapanColor2001Coated.icc", "JapanColor2001Coated.icm"];
  }
  if (normalized.indexOf("gracol") >= 0) {
    return ["GRACoL2006_Coated1v2.icc", "CGATS21_CRPC6.icc"];
  }
  return [profileName];
}

function profileSearchFolders() {
  const folders = [
    "C:\\Windows\\System32\\spool\\drivers\\color",
    "C:\\Program Files\\Common Files\\Adobe\\Color\\Profiles",
    "C:\\Program Files\\Common Files\\Adobe\\Color\\Profiles\\Recommended",
    "C:\\Program Files (x86)\\Common Files\\Adobe\\Color\\Profiles",
    "C:\\Program Files (x86)\\Common Files\\Adobe\\Color\\Profiles\\Recommended",
    "C:\\ProgramData\\Adobe\\Color\\Profiles"
  ];
  if (process.env.USERPROFILE) {
    folders.push(path.join(process.env.USERPROFILE, "AppData", "Roaming", "Adobe", "Color", "Profiles"));
  }
  return folders;
}

function findFileByName(root, names, depth) {
  if (!root || !fs.existsSync(root) || depth < 0) return "";
  const lowerNames = names.map(function (name) { return String(name).toLowerCase(); });
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    return "";
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && lowerNames.indexOf(entry.name.toLowerCase()) >= 0) return fullPath;
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry.isDirectory()) continue;
    const found = findFileByName(path.join(root, entry.name), names, depth - 1);
    if (found) return found;
  }
  return "";
}

function buildGhostscriptArgs(inputPath, outputPath, cmykProfilePath, rgbProfilePath, dpi) {
  const args = [
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/prepress",
    "-dCompatibilityLevel=1.7",
    "-sProcessColorModel=DeviceCMYK",
    "-sColorConversionStrategy=CMYK",
    "-sColorConversionStrategyForImages=CMYK",
    "-dOverrideICC=true",
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dAutoRotatePages=/None",
    "-r" + dpi,
    "-sDefaultCMYKProfile=" + cmykProfilePath,
    "-sOutputICCProfile=" + cmykProfilePath
  ];
  if (rgbProfilePath) args.push("-sDefaultRGBProfile=" + rgbProfilePath);
  args.push("-sOutputFile=" + outputPath);
  args.push(inputPath);
  return args;
}

function runGhostscript(gsPath, args) {
  return new Promise(function (resolve, reject) {
    const child = cp.spawn(gsPath, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", function (code) {
      if (code === 0) resolve();
      else reject(new Error("Ghostscript failed with exit code " + code + "."));
    });
  });
}

function formatCommand(binary, args) {
  return [quote(binary)].concat(args.map(quote)).join(" ");
}

function quote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=\\-]+$/.test(text)) return text;
  return "\"" + text.replace(/"/g, "\\\"") + "\"";
}

async function watchFolder(folder, options) {
  if (!fs.existsSync(folder)) throw new Error("Watch folder does not exist: " + folder);
  console.log("Watching print exports: " + folder);
  console.log("Drop/export *" + SOURCE_SUFFIX + " next to *" + MANIFEST_SUFFIX + ".");

  let timer = null;
  let running = false;
  function queueScan() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(scan, 600);
  }
  async function scan() {
    if (running) return;
    running = true;
    try {
      const files = fs.readdirSync(folder);
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file.toLowerCase().endsWith(SOURCE_SUFFIX)) continue;
        const input = path.join(folder, file);
        const nextOptions = copyOptions(options);
        nextOptions.input = input;
        await convertOne(nextOptions);
      }
    } catch (error) {
      console.error(error.message || error);
    } finally {
      running = false;
    }
  }

  fs.watch(folder, queueScan);
  setInterval(queueScan, 5000);
  queueScan();
}

function copyOptions(options) {
  const copy = {};
  Object.keys(options).forEach(function (key) {
    copy[key] = options[key];
  });
  return copy;
}
