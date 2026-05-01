const DATA_NAMESPACE = "appearance_stack";
const DATA_KIND = "kind";
const DATA_STACK = "stack";
const DATA_GLOBAL = "global";
const DATA_BLEND = "blend";
const DATA_BLEND_ROLE = "blend_role";
const KIND_GROUP = "group";
const KIND_BASE = "base";
const KIND_RENDER = "render";
const KIND_BLEND_GROUP = "blend_group";
const KIND_BLEND_BASE = "blend_base";
const KIND_BLEND_RENDER = "blend_render";
const BLEND_ROLE_START = "start";
const BLEND_ROLE_END = "end";

const DEFAULT_FILL = "#4F8DFF";
const DEFAULT_STROKE = "#111111";
const DEFAULT_GRADIENT_END = "#B96BFF";
const DEFAULT_SHADOW = "#000000";
const STYLE_CLIPBOARD_KEY = "appearance_stack_clipboard";
const SWATCH_STORAGE_KEY = "appearance_stack_swatches";
const BLEND_MODES = [
  "NORMAL",
  "MULTIPLY",
  "SCREEN",
  "OVERLAY",
  "DARKEN",
  "LIGHTEN",
  "COLOR_DODGE",
  "COLOR_BURN",
  "HARD_LIGHT",
  "SOFT_LIGHT",
  "DIFFERENCE",
  "EXCLUSION",
  "HUE",
  "SATURATION",
  "COLOR",
  "LUMINOSITY"
];
const STROKE_CAPS = ["NONE", "ROUND", "SQUARE"];
const STROKE_JOINS = ["MITER", "ROUND", "BEVEL"];
const STROKE_ALIGNS = ["CENTER", "INSIDE", "OUTSIDE"];
const PAINT_TYPES = ["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL"];
const SHAPE_EFFECT_TYPES = ["RECTANGLE", "ROUNDED_RECTANGLE", "ELLIPSE"];
const OFFSET_JOINS = ["MITER", "ROUND", "BEVEL"];
const WARP_STYLES = ["ARC", "ARC_LOWER", "ARC_UPPER", "FLAG", "RISE"];
const WARP_AXES = ["HORIZONTAL", "VERTICAL"];
const BLEND_SPACING_MODES = ["SPECIFIED_STEPS", "SPECIFIED_DISTANCE", "SMOOTH_COLOR"];
