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
      stack: []
    };

    const expanded = {};
    const pendingTimers = {};
    const pendingMessages = {};
    const trashIcon = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M6 7h12"></path><path d="M10 7V5h4v2"></path><path d="M8 7l1 13h6l1-13"></path></svg>';
    const editIcon = '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';
    let dirtyWhileEditing = false;
    let selectedLayerId = "";
    let fxMenuOpen = false;
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

    const appEl = document.getElementById("app");
    const statusEl = document.getElementById("status");
    const contentEl = document.getElementById("content");
    const wrapBtn = document.getElementById("wrap");
    const detachBtn = document.getElementById("detach");
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
