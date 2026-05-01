function getSelection() {
  return figma.currentPage.selection.filter((node) => "clone" in node);
}

function getActiveAppearanceGroup() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (isAppearanceGroup(node)) return ensureFrameContainer(node);
  let parent = node.parent;
  while (parent && parent.type !== "PAGE") {
    if (isAppearanceGroup(parent)) return ensureFrameContainer(parent);
    parent = parent.parent;
  }
  return null;
}

function isAppearanceGroup(node) {
  return (node.type === "GROUP" || node.type === "FRAME") && node.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_GROUP;
}

function ensureFrameContainer(node) {
  if (node.type !== "GROUP") return node;
  if (!node.parent || node.parent.type === "DOCUMENT") return node;

  const parent = node.parent;
  const frame = figma.createFrame();
  const index = getChildIndex(parent, node);
  frame.name = node.name;
  frame.x = node.x;
  frame.y = node.y;
  frame.resizeWithoutConstraints(Math.max(0.01, node.width), Math.max(0.01, node.height));
  frame.clipsContent = false;
  frame.fills = [];
  frame.strokes = [];
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_STACK, node.getSharedPluginData(DATA_NAMESPACE, DATA_STACK));
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL, node.getSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL));
  parent.insertChild(index >= 0 ? index : parent.children.length, frame);

  for (const child of node.children.slice()) {
    const childX = child.x;
    const childY = child.y;
    frame.appendChild(child);
    child.x = childX;
    child.y = childY;
  }

  node.remove();
  figma.currentPage.selection = [frame];
  return frame;
}

function notifySelectAppearance() {
  figma.notify("Select an Appearance Stack group first.");
}

async function wrapSelection() {
  const selection = getSelection();
  if (selection.length !== 1) {
    figma.notify("Select one object to create an appearance stack.");
    return;
  }

  const node = selection[0];
  if (isAppearanceGroup(node)) {
    figma.notify("This object already has an appearance stack.");
    return;
  }

  if (!node.parent || node.parent.type === "DOCUMENT") {
    figma.notify("This object cannot be wrapped here.");
    return;
  }

  const parent = node.parent;
  const originalName = node.name;
  const stack = inferInitialStack(node);
  const group = createAppearanceFrame(node, parent, originalName);
  writeGlobalAppearance(group, createGlobalAppearance(node));
  node.name = `${originalName} base`;
  node.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BASE);
  if (group.type === "FRAME") {
    group.appendChild(node);
    node.x = 0;
    node.y = 0;
  }

  await renderAppearance(group, stack);
  figma.currentPage.selection = [group];
  figma.notify("Appearance stack created.");
}

function createAppearanceFrame(node, parent, originalName) {
  if ("width" in node && "height" in node) {
    const frame = figma.createFrame();
    const index = getChildIndex(parent, node);
    frame.name = `${originalName} Appearance`;
    frame.x = node.x;
    frame.y = node.y;
    frame.resizeWithoutConstraints(Math.max(0.01, node.width), Math.max(0.01, node.height));
    frame.clipsContent = false;
    frame.fills = [];
    frame.strokes = [];
    frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
    parent.insertChild(index >= 0 ? index : parent.children.length, frame);
    return frame;
  }

  const group = figma.group([node], parent);
  group.name = `${originalName} Appearance`;
  group.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
  return group;
}

function getChildIndex(parent, node) {
  return parent.children.findIndex((child) => child.id === node.id);
}

async function detachAppearance() {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();
  const base = findBase(group);
  if (!base || !group.parent) {
    figma.notify("Could not find the base object.");
    return;
  }

  const parent = group.parent;
  const baseX = base.x;
  const baseY = base.y;
  base.visible = true;
  base.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, "");
  base.name = base.name.replace(/\sbase$/, "");
  parent.appendChild(base);
  if (group.type === "FRAME") {
    base.x = group.x + baseX;
    base.y = group.y + baseY;
  } else {
    base.x = group.x;
    base.y = group.y;
  }
  group.remove();
  figma.currentPage.selection = [base];
  figma.notify("Appearance stack detached.");
}
