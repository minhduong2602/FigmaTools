# Appearance Stack

A local Figma plugin that mimics Adobe Illustrator's Appearance panel by rendering stacked duplicates of a selected object.

## What it does

- Wraps one selected object in a managed `Appearance` group.
- Preserves the original object as a hidden base.
- Creates visible duplicate render layers for independent fills, strokes, gradients, and effects.
- Lets you add, remove, duplicate, reorder, hide, and edit appearance layers.
- Lets you drag appearance rows to reorder the stack.
- Supports per-stack opacity, blend mode, and real Figma effects.
- Supports native shadow/blur effect rows: Drop Shadow, Inner Shadow, Outer Glow, Inner Glow, Layer Blur, and Background Blur.
- Renders Noise with a generated PNG tile overlay so it works even when Figma's beta native Noise effect is unavailable.
- Adds Illustrator-style render-pipeline effects that do not rely on missing Figma APIs: Offset Path with Miter/Round/Bevel joins, Round Corners, Feather, Convert to Shape, Color Halftone, and Scribble.
- Exposes native beta effect rows for Texture and Glass when the running Figma editor supports them.
- Supports solid, linear gradient, and radial gradient paints per stack item, including linear gradient angle.
- Supports global object opacity and blend mode after the full appearance stack is rendered.
- Uses a fixed frame container for new stacks so adding fills, strokes, and effects does not change the stack object's X/Y/width/height.
- Shows and edits common object properties: X, Y, width, height, rotation, and corner radius when Figma exposes it for the base object.
- Keeps the main panel compact like Illustrator: rows show only the stack summary, swatch, opacity/blend, and effects.
- Opens object, text, fill, stroke, gradient, stroke-style, and effect settings in focused modals.
- For text stacks, the Object modal includes Character controls for local font family/style, size, line height, tracking, paragraph spacing, case, and decoration.
- Supports stroke options that Figma exposes: cap, corner, align, miter limit, and dash pattern.
- Supports live render-pipeline effects on duplicate layers, including Transform scale/move/rotate/reflect/copies and raster pattern overlays for halftone/scribble.
- For text stacks, provides a shared text content editor that updates the hidden base text and rebuilds every rendered appearance layer together.
- Includes Appearance-style footer commands: add fill, add stroke, add effect, duplicate selected item, copy/paste appearance, reduce to basic, clear appearance, and delete selected item.
- Includes a Print Export workflow with a default `U.S. Web Coated (SWOP) v2` CMYK intent, trim/bleed/safe/DPI settings, preflight warnings, and source PDF + print manifest export.
- Stores the stack as plugin data on the managed group.

## Load it in Figma

1. Open Figma.
2. Go to `Plugins > Development > Import plugin from manifest...`.
3. Select `manifest.json` in this folder.
4. Run `Appearance Stack` from `Plugins > Development`.

## Development

Figma still loads the generated `code.js` and `ui.html` files from `manifest.json`, but day-to-day edits should happen in the smaller source files:

- `src/backend/constants.js`: shared constants and supported enum values.
- `src/backend/document.js`: selection, wrapping, detaching, and object/text helpers.
- `src/backend/data.js`: stack schema, normalization, clipboard/reduce helpers.
- `src/backend/effects.js`: effect creation and normalization.
- `src/backend/render-stack.js`: stack rebuild loop.
- `src/backend/render-effects.js`: fill/stroke/effect application to render clones.
- `src/backend/paint.js`: solid/gradient paint conversion.
- `src/backend/utils.js`: color, number, id, and enum utilities.
- `src/backend/main.js`: Figma UI startup, message routing, and selection payloads.
- `ui/*.js`, `ui/styles.css`, `ui/body.html`: panel state, templates, modal editors, events, and styling.

After editing source files, regenerate the Figma entry files:

```bash
npm run build
```

Run the lightweight syntax checks:

```bash
npm run check
```

## Print conversion helper

Figma cannot create a native CMYK/PDF-X final, so the plugin exports a source RGB PDF plus a print manifest. For automated desktop conversion, install Ghostscript and keep the Adobe/print-shop ICC profile available locally.

Convert one export:

```bash
npm run print:convert -- --input "$env:USERPROFILE\Downloads\poster-source-rgb.pdf" --profile "C:\ICC\USWebCoatedSWOP.icc"
```

Watch a folder and auto-convert every new `*-source-rgb.pdf` export that has a matching `*-print-manifest.json`:

```bash
npm run print:watch -- "$env:USERPROFILE\Downloads" --profile "C:\ICC\USWebCoatedSWOP.icc"
```

If Ghostscript or the ICC profile is not in a common location, pass `--gs`, set `GHOSTSCRIPT_BIN`, pass `--profile`, or set `CMYK_ICC`. The script writes `*-print-cmyk.pdf` next to the source export.

This helper performs ICC-based CMYK conversion. It is not a replacement for final Acrobat/print-shop preflight: inspect separations, total ink, overprint, rich black versus 100K text, font embedding, trim, and bleed before production.

## Notes

This is intentionally a fake appearance system. Figma does not expose Illustrator-style multiple fills and strokes for arbitrary objects, so the plugin keeps a hidden base object and rebuilds duplicate layers whenever the stack changes.

The plugin only exposes controls backed by real Figma plugin APIs or by the duplicate-layer render pipeline. Illustrator-only behaviors such as full Type/Characters appearance hierarchy, Photoshop filter galleries, true arbitrary vector warps, 3D materials, and target-layer inheritance are intentionally not shown as fake UI.

Figma does not export native CMYK/PDF-X final files. Print Export creates an RGB source PDF and a JSON manifest that records the intended CMYK profile and production settings. Convert the source PDF outside Figma with the target ICC profile before sending final artwork to print.

The first version is optimized for common shapes, frames, groups, and vector-like nodes. Text and complex component instances may need detaching or outlining before every appearance type behaves exactly as expected.

Offset Path on live text can add an outward stroke-style offset, but Figma does not expose live glyph-outline inset editing. For a true negative text offset, outline or flatten the text first.
