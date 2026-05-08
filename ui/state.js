const state = {
  hasSelection: false,
  selectedCount: 0,
  isAppearance: false,
  groupName: "",
  baseName: "",
  baseType: "",
  isTextBase: false,
  textContent: "",
  textProperties: null,
  availableFonts: [],
  objectProperties: null,
  globalAppearance: {
    opacity: 100,
    blendMode: "NORMAL"
  },
  stack: [],
  isBlend: false,
  blendName: "",
  blendOptions: {
    spacingMode: "SPECIFIED_STEPS",
    steps: 8,
    distance: 24,
    reverseFrontToBack: false,
    editEndpoints: false
  },
  swatches: [],
  objectPathDebug: null
};

const threeDState = {
  source: null,
  error: "",
  mode: "extrude",
  section: "effect",
  requestPending: false,
  settings: {
    depth: 48,
    bevelSize: 6,
    bevelThickness: 6,
    bevelSegments: 4,
    bevelOffset: 0,
    bevelProfile: "round",
    revolveSegments: 56,
    revolveAngle: 360,
    revolveAxis: "VERTICAL",
    revolveAnchor: "MIN",
    revolveFlip: false,
    inflateAmount: 20,
    rotationPreset: "custom",
    rotationX: 32,
    rotationY: -28,
    rotationZ: 0,
    rotationQuaternion: { x: 0.240278, y: -0.229261, z: 0.058294, w: 0.941078 },
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    framePadding: 12,
    ambient: 0.8,
    directional: 1.15,
    lightType: "directional",
    lightSoftness: 40,
    lightConeAngle: 30,
    lightX: 1.5,
    lightY: 2.2,
    lightZ: 2.8,
    zoom: 420,
    lightingPreset: "studio",
    environmentPreset: "studio_soft",
    environmentStrength: 1.2,
    hemiStrength: 1,
    fillStrength: 1,
    rimStrength: 1,
    extraSpotStrength: 1,
    extraPointStrength: 1,
    color: "#D7DFFF",
    useSourceColor: true,
    background: "#1D1D1D",
    transparentBackground: false,
    exportScale: 2,
    materialPreset: "plastic",
    roughness: 0.55,
    metalness: 0.08,
    clearcoat: 0.18,
    transmission: 0,
    thickness: 0.5,
    opacity: 1,
    emissive: "#000000",
    emissiveIntensity: 0,
    flatShading: false,
    iridescence: 0,
    iridescenceIOR: 1.3,
    sheen: 0,
    sheenRoughness: 0.45,
    exposure: 1,
    contrast: 0,
    grainAmount: 0,
    chromaticAberration: 0,
    contactShadow: false,
    contactShadowOpacity: 0.24,
    contactShadowSoftness: 1.15,
    contactShadowScale: 1.05,
    bloomEnabled: false,
    bloomSeparate: false,
    flareOpacity: 100,
    bloomStrength: 0.85,
    bloomRadius: 0.35,
    bloomThreshold: 0.72
  }
};

const swatchDraft = {
  type: "solid",
  color: "#4F8DFF",
  paintType: "GRADIENT_LINEAR",
  gradientAngle: 0,
  gradientStops: [
    { id: "draft_start", position: 0, color: "#4F8DFF" },
    { id: "draft_end", position: 100, color: "#B96BFF" }
  ]
};

const objectToolsState = {
  simplifyTolerance: 35,
  smoothAmount: 40
};

const expanded = {};
const pendingTimers = {};
const pendingMessages = {};
const trashIcon = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M6 7h12"></path><path d="M10 7V5h4v2"></path><path d="M8 7l1 13h6l1-13"></path></svg>';
const editIcon = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';
let dirtyWhileEditing = false;
let selectedLayerId = "";
let fxMenuOpen = false;
let activeTab = "appearance";
const printSettings = {
  profile: "U.S. Web Coated (SWOP) v2",
  pdfTarget: "PDF/X-4 intent",
  bleedMm: 3,
  safeMm: 3,
  dpi: 300,
  trimWidthMm: 210,
  trimHeightMm: 297,
  blackPolicy: "100K text, rich black only for large solids"
};
const modalState = {
  kind: "",
  layerId: "",
  effectId: ""
};
const objectPathModalState = {
  tool: "",
  value: 0,
  committed: false
};

const appEl = document.getElementById("app");
const statusEl = document.getElementById("status");
const contentEl = document.getElementById("content");
const appearanceTabBtn = document.getElementById("tab-appearance");
const objectTabBtn = document.getElementById("tab-object");
const swatchesTabBtn = document.getElementById("tab-swatches");
const blendTabBtn = document.getElementById("tab-blend");
const threeDTabBtn = document.getElementById("tab-three-d");
const appearanceTools = document.getElementById("appearance-tools");
const objectTools = document.getElementById("object-tools");
const blendTools = document.getElementById("blend-tools");
const swatchesTools = document.getElementById("swatches-tools");
const threeDTools = document.getElementById("three-d-tools");
const appearanceFooter = document.getElementById("appearance-footer");
const wrapBtn = document.getElementById("wrap");
const detachBtn = document.getElementById("detach");
const blendMakeBtn = document.getElementById("blend-make");
const blendEditEndpointsBtn = document.getElementById("blend-edit-endpoints");
const blendSelectStartBtn = document.getElementById("blend-select-start");
const blendSelectEndBtn = document.getElementById("blend-select-end");
const blendUpdateBtn = document.getElementById("blend-update");
const blendOptionsBtn = document.getElementById("blend-options");
const blendReverseBtn = document.getElementById("blend-reverse");
const blendExpandBtn = document.getElementById("blend-expand");
const blendReleaseBtn = document.getElementById("blend-release");
const newSwatchBtn = document.getElementById("new-swatch");
const saveSwatchBtn = document.getElementById("save-swatch");
const simplifyPathBtn = document.getElementById("simplify-path");
const smoothPathBtn = document.getElementById("smooth-path");
const threeDRefreshBtn = document.getElementById("three-d-refresh");
const threeDExportBtn = document.getElementById("three-d-export");
const fxBtn = document.getElementById("fx");
const fxMenu = document.getElementById("fx-menu");
const duplicateBtn = document.getElementById("duplicate-layer");
const deleteBtn = document.getElementById("delete-layer");
const copyStyleBtn = document.getElementById("copy-style");
const pasteStyleBtn = document.getElementById("paste-style");
const basicBtn = document.getElementById("basic");
const printExportBtn = document.getElementById("print-export");
const clearBtn = document.getElementById("clear");
const editorModal = document.getElementById("editor-modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");
let draggedLayerId = "";
let draggedEffectId = "";
let draggedEffectLayerId = "";
let pendingEffectModal = null;
let gradientDrag = null;
let threeDPreviewCompositeUrl = "";
