const statusText = document.getElementById("statusText");
const fileList = document.getElementById("fileList");
const titleText = document.getElementById("titleText");
const editorWysiwyg = document.getElementById("editorWysiwyg");
const backBtn = document.getElementById("backBtn");
const editorCode = document.getElementById("editorCode");
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const menuConnect = document.getElementById("menuConnect");
const menuDisconnect = document.getElementById("menuDisconnect");
const newFileBtn = document.getElementById("newFileBtn");
const newFolderBtn = document.getElementById("newFolderBtn");
const previewToggle = document.getElementById("previewToggle");
const editUndoBtn = null;
// redo removed
const statusToggle = document.getElementById("statusToggle");
const deletedToggle = document.getElementById("deletedToggle");
const menuTrashAction = document.getElementById("menuTrashAction");
const menuCopy = document.getElementById("menuCopy");
const deleteUndoBtn = null;
const undoBtn = document.getElementById("undoBtn");
const browserView = document.getElementById("browserView");
const editorView = document.getElementById("editorView");
const connectBtn = document.getElementById("connectBtn");
const editorPreview = document.getElementById("editorPreview");
const wordCountEl = document.getElementById("wordCount");
const formatBar = document.getElementById("formatBar");
const formatButtons = Array.from(document.querySelectorAll(".format-btn"));

const TOKEN_KEY = "pipdown-token";
const CODE_VERIFIER_KEY = "pipdown-code-verifier";
const SETTINGS_KEY = "pipdown-settings";
const DROPBOX_APP_KEY = "zses7fnbivgrqgv";

const memoryStore = new Map();
const sessionStore = new Map();

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return memoryStore.get(key) || null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    memoryStore.set(key, value);
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    memoryStore.delete(key);
  }
}

function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    return sessionStore.get(key) || null;
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch (error) {
    sessionStore.set(key, value);
  }
}

function safeSessionRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    sessionStore.delete(key);
  }
}

const state = {
  dbx: null,
  currentPath: "",
  currentFile: null,
  currentFileName: "",
  view: "list",
  mode: "edit",
  autosaveTimer: null,
  statusTimer: null,
  showDeleted: false,
  deletedSet: new Set(),
  undoStack: [],
  canUndo: false,
  lastSavedContent: "",
  undoTimer: null,
  rawMarkdown: "",
};

function setStatus(message, timeout = 0) {
  statusText.textContent = message;
  statusText.classList.toggle("is-hidden", !message);
  if (state.statusTimer) {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }
  if (timeout) {
    state.statusTimer = setTimeout(() => {
      statusText.textContent = "";
      statusText.classList.add("is-hidden");
    }, timeout);
  }
}

function loadSettings() {
  const saved = JSON.parse(safeGet(SETTINGS_KEY) || "{}");
  const showStatus = saved.showStatus !== false;
  statusToggle.checked = showStatus;
  document.querySelector(".status-footer").classList.toggle("is-hidden", !showStatus);
  state.showDeleted = Boolean(saved.showDeleted);
  if (deletedToggle) {
    deletedToggle.checked = state.showDeleted;
  }
}

function saveSettings() {
  const settings = {
    showStatus: statusToggle.checked,
    showDeleted: state.showDeleted,
  };
  safeSet(SETTINGS_KEY, JSON.stringify(settings));
}

function setTitle(text) {
  if (titleText) {
    titleText.textContent = "Pipdown";
  }
}

function setView(view) {
  state.view = view;
  browserView.classList.toggle("is-active", view === "list");
  editorView.classList.toggle("is-active", view === "editor");
  if (view === "list") {
    editorCode.readOnly = false;
    state.canUndo = false;
    updateMenuUndoState();
  }
  updateTopbar();
  updateTrashMenuLabel();
  updateWordCount();
  updateFormatBarVisibility(false);
}

function updateTopbar() {
  if (state.view === "editor") {
    setTitle(state.currentFileName || "Untitled");
  } else {
    const folderName = state.currentPath.split("/").filter(Boolean).pop();
    setTitle(folderName || "Pipdown");
  }

  const atRoot = !state.currentPath;
  backBtn.classList.toggle("is-disabled", state.view === "list" && atRoot);
  updateToolbarState();
}

function updateToolbarState() {
  const connected = Boolean(ensureDropbox());
  const inEditor = state.view === "editor";
  previewToggle.classList.toggle("is-disabled", !inEditor);
  newFileBtn.classList.toggle("is-disabled", !connected || inEditor);
  newFolderBtn.classList.toggle("is-disabled", !connected || inEditor);
}

function updateMenuAuth() {
  const connected = Boolean(ensureDropbox());
  menuConnect.style.display = connected ? "none" : "flex";
  menuDisconnect.style.display = connected ? "flex" : "none";
}

function updateTrashMenuLabel() {
  if (!menuTrashAction) return;
  const label = menuTrashAction.querySelector("span");
  if (!label) return;
  if (state.view === "editor") {
    label.textContent = "Delete File";
    menuTrashAction.style.display = "flex";
  } else {
    menuTrashAction.style.display = "none";
  }
  if (menuCopy) {
    menuCopy.style.display = state.view === "editor" ? "flex" : "none";
  }
}

function toggleMenu(open) {
  const willOpen = typeof open === "boolean" ? open : !menuPanel.classList.contains("is-open");
  menuPanel.classList.toggle("is-open", willOpen);
  menuPanel.setAttribute("aria-hidden", String(!willOpen));
}

function clearAuth() {
  safeRemove(TOKEN_KEY);
  state.dbx = null;
}

function ensureDropbox() {
  const token = safeGet(TOKEN_KEY);
  if (!token) {
    return null;
  }
  if (!state.dbx) {
    state.dbx = new Dropbox.Dropbox({ accessToken: token });
  }
  return state.dbx;
}

async function listFolder(path = "") {
  const dbx = ensureDropbox();
  if (!dbx) {
    setStatus("Connect Dropbox to browse files.");
    fileList.innerHTML = "";
    connectBtn.classList.remove("is-hidden");
    setView("list");
    return;
  }

  connectBtn.classList.add("is-hidden");
  try {
    setStatus("Loading...");
    const response = await dbx.filesListFolder({ path });
    state.currentPath = path;
    await loadDeletedSet(path);
    state.currentFile = null;
    state.currentFileName = "";
    const entries = (response.result.entries || []).filter((entry) => {
      if (entry.name.startsWith(".")) return false;
      if (entry[".tag"] === "folder") return true;
      return entry.name.toLowerCase().endsWith(".md");
    });
    const visible = state.showDeleted ? entries : entries.filter((entry) => !state.deletedSet.has(entry.name));
    renderFileList(visible);
    setView("list");
    setStatus("");
  } catch (error) {
    console.error(error);
    if (error?.status === 401 || error?.error?.error?.[".tag"] === "invalid_access_token") {
      clearAuth();
      setStatus("Session expired. Connect Dropbox again.");
      connectBtn.classList.remove("is-hidden");
    } else {
      setStatus("Failed to load files.");
    }
    console.error(error);
  }
}

function renderFileList(entries) {
  fileList.innerHTML = "";
  const sorted = entries.sort((a, b) => {
    const aIsFolder = a[".tag"] === "folder";
    const bIsFolder = b[".tag"] === "folder";
    if (aIsFolder !== bIsFolder) {
      return aIsFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "empty-message";
    empty.innerHTML = "<img src=\"svg/warning_fill.svg\" alt=\"\" class=\"image-missing-icon\" /><span>This folder doesn't contain any markdown file</span>";
    fileList.appendChild(empty);
    return;
  }

  sorted.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.dataset.type = entry[".tag"];

    const icon = document.createElement("div");
    icon.className = "icon";
    const iconImg = document.createElement("img");
    iconImg.className = "icon-img";
    iconImg.alt = "";
    iconImg.src = entry[".tag"] === "folder" ? "svg/folder_2_line.svg" : "svg/file_line.svg";
    icon.appendChild(iconImg);

    const label = document.createElement("div");
    label.className = "label";
    if (entry[".tag"] === "file" && entry.name.toLowerCase().endsWith(".md")) {
      label.textContent = entry.name.replace(/\.md$/i, "");
    } else {
      label.textContent = entry.name;
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    if (entry[".tag"] === "folder") {
      meta.textContent = "Folder";
    } else if (entry.name.toLowerCase().endsWith(".md")) {
      meta.textContent = "Markdown";
    } else {
      meta.textContent = "File";
    }

    if (state.deletedSet.has(entry.name)) {
      item.classList.add("is-deleted");
    }
    item.appendChild(icon);
    item.appendChild(label);
    item.appendChild(meta);

    item.addEventListener("click", () => handleEntry(entry, item));
    fileList.appendChild(item);
  });
}

async function handleEntry(entry, item) {
  item.classList.add("is-opening");
  if (entry[".tag"] === "folder") {
    await listFolder(entry.path_lower);
    item.classList.remove("is-opening");
    return;
  }
  if (!entry.name.toLowerCase().endsWith(".md")) {
    setStatus("Only .md files are supported.", 1500);
    item.classList.remove("is-opening");
    return;
  }

  const dbx = ensureDropbox();
  try {
    setStatus("Opening...");
    if (state.showDeleted && state.deletedSet.has(entry.name)) {
      state.deletedSet.delete(entry.name);
      await saveDeletedSet(state.currentPath);
    }
    const response = await dbx.filesDownload({ path: entry.path_lower });
    const blob = response.result.fileBlob;
    const text = await blob.text();
    state.currentFile = entry.path_lower;
    state.currentFileName = entry.name;
    setCurrentMarkdown(text);
    editorCode.readOnly = false;
    setMode("edit");
    setView("editor");
    setStatus("");
    updateFooterFile();
    item.classList.remove("is-opening");
  } catch (error) {
    console.error(error);
    setStatus("Failed to open file.");
    item.classList.remove("is-opening");
  }
}

const DELETED_NOTE = ".pipdown_deleted.json";

function deletedNotePath(path) {
  return `${path || ""}/${DELETED_NOTE}`.replace("//", "/");
}

async function loadDeletedSet(path) {
  const dbx = ensureDropbox();
  if (!dbx) {
    state.deletedSet = new Set();
    return;
  }
  try {
    const response = await dbx.filesDownload({ path: deletedNotePath(path) });
    const blob = response.result.fileBlob;
    const text = await blob.text();
    const list = JSON.parse(text || "[]");
    state.deletedSet = new Set(Array.isArray(list) ? list : []);
  } catch (error) {
    const tag = error?.error?.error?.[".tag"];
    if (tag === "path" || tag === "path/not_found") {
      state.deletedSet = new Set();
    } else {
      console.error(error);
      state.deletedSet = new Set();
    }
  }
}

async function saveDeletedSet(path) {
  const dbx = ensureDropbox();
  if (!dbx) return;
  const list = Array.from(state.deletedSet);
  try {
    await dbx.filesUpload({
      path: deletedNotePath(path),
      contents: JSON.stringify(list),
      mode: { ".tag": "overwrite" },
    });
  } catch (error) {
    console.error(error);
  }
}

async function deleteCurrentFile() {
  const dbx = ensureDropbox();
  if (!dbx || !state.currentFileName) {
    return;
  }
  state.deletedSet.add(state.currentFileName);
  await saveDeletedSet(state.currentPath);
  setStatus("Deleted.", 1200);
  setView("list");
  listFolder(state.currentPath || "");
}

async function createFolder() {
  const name = prompt("Folder name?");
  if (!name) return;
  const dbx = ensureDropbox();
  if (!dbx) {
    setStatus("Connect Dropbox first.");
    return;
  }
  const path = `${state.currentPath}/${name}`.replace("//", "/");
  try {
    await dbx.filesCreateFolderV2({ path });
    listFolder(state.currentPath);
  } catch (error) {
    console.error(error);
    setStatus("Could not create folder.");
  }
}

async function createFile() {
  const name = prompt("File name?");
  if (!name) return;
  const dbx = ensureDropbox();
  if (!dbx) {
    setStatus("Connect Dropbox first.");
    return;
  }
  const trimmed = name.trim();
  const fileName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
  const path = `${state.currentPath}/${fileName}`.replace("//", "/");
  try {
    const title = trimmed.replace(/\.md$/i, "");
    const initial = `# ${title}\n\n`;
    await dbx.filesUpload({
      path,
      contents: initial,
      mode: { ".tag": "add" },
    });
    state.currentFile = path;
    state.currentFileName = fileName;
    setCurrentMarkdown(initial);
    setMode("edit");
    setView("editor");
    updateFooterFile();
    setTimeout(() => {
      editorCode.focus();
      editorCode.selectionStart = editorCode.selectionEnd = editorCode.value.length;
    }, 0);
  } catch (error) {
    console.error(error);
    setStatus("Could not create file.");
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(text) {
  return escapeHtml(text);
}

function renderMarkdown(md) {
  return renderInline(md || "");
}

function getCurrentMarkdown() {
  return state.rawMarkdown || "";
}

function setCurrentMarkdown(md) {
  const text = md || "";
  state.rawMarkdown = text;
  editorCode.value = text;
  editorWysiwyg.textContent = text;
  state.lastSavedContent = text;
  state.undoStack = [text];
  state.canUndo = false;
  updateMenuUndoState();
  updateFooterFile();
  updateWordCount();
}

function updateMenuUndoState() {
  if (!undoBtn) return;
  const enabled = state.view === "editor" && state.undoStack.length > 1;
  undoBtn.classList.toggle("is-disabled", !enabled);
}

function updateFooterFile() {
  const el = document.getElementById("footerFile");
  if (!el) return;
  if (!state.currentFileName) {
    el.textContent = "";
    return;
  }
  const rawPath = `${state.currentPath || ""}/${state.currentFileName}`.replace("//", "/");
  let path = rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
  if (path.startsWith("/")) {
    path = path.slice(1);
  }
  el.textContent = path;
  el.title = path;
}

function updateWordCount() {
  if (!wordCountEl) return;
  const text = (state.rawMarkdown || "").trim();
  if (!text) {
    wordCountEl.textContent = "0 Words";
    return;
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  wordCountEl.textContent = `${words} Words`;
}

function renderPreview() {
  if (!window.marked) {
    editorPreview.textContent = state.rawMarkdown || "";
    return;
  }
  editorPreview.innerHTML = window.marked.parse(state.rawMarkdown || "");
  enhancePreviewImages();
}

async function enhancePreviewImages() {
  const imgs = Array.from(editorPreview.querySelectorAll("img"));
  if (!imgs.length) {
    return;
  }
  const dbx = ensureDropbox();
  for (const img of imgs) {
    const raw = img.getAttribute("src") || "";
    const resolved = await resolveImagePath(dbx, raw);
    if (resolved) {
      img.src = resolved;
      img.style.width = "80%";
      img.style.display = "block";
      img.style.margin = "12px auto";
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "image-missing";
      placeholder.innerHTML = `<img src="svg/heart_crack_fill.svg" alt="" class="image-missing-icon" /><span>Image ${raw} not found</span>`;
      img.replaceWith(placeholder);
    }
  }
}

async function resolveImagePath(dbx, raw) {
  if (!raw) return "";
  const candidates = [];
  if (raw.startsWith("/")) {
    candidates.push(raw);
  } else {
    const base = state.currentPath || "";
    candidates.push(`${base}/${raw}`.replace("//", "/"));
    candidates.push(`/${raw}`.replace("//", "/"));
  }
  if (!dbx) {
    return "";
  }
  for (const path of candidates) {
    try {
      const res = await dbx.filesGetTemporaryLink({ path });
      return res.result.link;
    } catch (error) {
      // try next
    }
  }
  return "";
}

function setMode(mode) {
  state.mode = mode;
  if (mode === "preview") {
    renderPreview();
    editorCode.style.display = "none";
    editorPreview.style.display = "block";
    previewToggle.querySelector("img").src = "svg/edit_2_fill.svg";
    previewToggle.setAttribute("aria-label", "Edit");
    updateFormatBarVisibility(false);
  } else {
    editorPreview.style.display = "none";
    editorCode.style.display = "block";
    previewToggle.querySelector("img").src = "svg/book_6_line.svg";
    previewToggle.setAttribute("aria-label", "Preview");
    updateFormatBarVisibility(true);
  }
}
async function saveFile({ silent } = {}) {
  const dbx = ensureDropbox();
  if (!dbx || !state.currentFile) {
    return;
  }

  try {
    if (!silent) {
      setStatus("Saving...");
    }
    const content = getCurrentMarkdown();
    await dbx.filesUpload({
      path: state.currentFile,
      contents: content,
      mode: { ".tag": "overwrite" },
    });
    if (content !== state.lastSavedContent) {
      state.lastSavedContent = content;
      state.canUndo = true;
      updateMenuUndoState();
    }
    if (silent) {
      setStatus("Saved", 900);
    } else {
      setStatus("Saved", 1200);
    }
  } catch (error) {
    console.error(error);
    setStatus("Save failed.");
  }
}

function scheduleAutosave() {
  if (!state.currentFile) {
    return;
  }
  if (state.autosaveTimer) {
    clearTimeout(state.autosaveTimer);
  }
  state.autosaveTimer = setTimeout(() => {
    saveFile({ silent: true });
  }, 900);
}

function updateFormatBarVisibility(isEditing) {
  if (!formatBar) return;
  const shouldShow = state.view === "editor" && state.mode === "edit" && isEditing;
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  formatBar.classList.toggle("is-visible", shouldShow);
  formatBar.classList.toggle("is-mobile", shouldShow && isMobile);
  formatBar.classList.toggle("is-desktop", shouldShow && !isMobile);
  document.querySelector(".status-footer").classList.toggle("is-hidden", shouldShow && isMobile);
}

function applyInlineWrap(prefix, suffix = prefix) {
  const start = editorCode.selectionStart;
  const end = editorCode.selectionEnd;
  const value = editorCode.value;
  if (start === end) {
    const insert = `${prefix}${suffix}`;
    editorCode.value = value.slice(0, start) + insert + value.slice(end);
    editorCode.selectionStart = editorCode.selectionEnd = start + prefix.length;
  } else {
    const selected = value.slice(start, end);
    editorCode.value = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    editorCode.selectionStart = start + prefix.length;
    editorCode.selectionEnd = end + prefix.length;
  }
  state.rawMarkdown = editorCode.value;
  updateWordCount();
  scheduleAutosave();
}

function insertLinePrefix(prefix) {
  const value = editorCode.value;
  const start = editorCode.selectionStart;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  editorCode.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  editorCode.selectionStart = editorCode.selectionEnd = start + prefix.length;
  state.rawMarkdown = editorCode.value;
  updateWordCount();
  scheduleAutosave();
}

function insertCheckbox() {
  insertLinePrefix("- [ ] ");
}

function insertHeading(level) {
  const value = editorCode.value;
  const start = editorCode.selectionStart;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", start);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const line = value.slice(lineStart, end).replace(/^#{1,6}\s+/, "");
  const prefix = "#".repeat(level) + " ";
  editorCode.value = value.slice(0, lineStart) + prefix + line + value.slice(end);
  editorCode.selectionStart = editorCode.selectionEnd = lineStart + prefix.length + line.length;
  state.rawMarkdown = editorCode.value;
  updateWordCount();
  scheduleAutosave();
}

function pushUndoState(value) {
  const last = state.undoStack[state.undoStack.length - 1];
  if (value === last) {
    return;
  }
  state.undoStack.push(value);
  if (state.undoStack.length > 3) {
    state.undoStack.shift();
  }
  updateMenuUndoState();
}

function scheduleUndoSnapshot() {
  if (state.undoTimer) {
    clearTimeout(state.undoTimer);
  }
  state.undoTimer = setTimeout(() => {
    pushUndoState(editorCode.value);
  }, 400);
}

function goBack() {
  if (state.view === "editor") {
    listFolder(state.currentPath || "");
    return;
  }
  if (!state.currentPath) {
    return;
  }
  const parts = state.currentPath.split("/").filter(Boolean);
  parts.pop();
  const parent = "/" + parts.join("/");
  listFolder(parent === "/" ? "" : parent);
}

function handlePaste(event) {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain");
  const start = editorCode.selectionStart;
  const end = editorCode.selectionEnd;
  const current = editorCode.value;
  editorCode.value = current.slice(0, start) + text + current.slice(end);
  editorCode.selectionStart = editorCode.selectionEnd = start + text.length;
  state.rawMarkdown = editorCode.value;
  scheduleAutosave();
  updateWordCount();
}

async function handleAuthRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return;

  const redirectUri = window.location.origin + window.location.pathname;
  const auth = new Dropbox.DropboxAuth({ clientId: DROPBOX_APP_KEY });
  const verifier = safeSessionGet(CODE_VERIFIER_KEY);
  if (verifier) {
    auth.setCodeVerifier(verifier);
  }
  try {
    const tokenResponse = await auth.getAccessTokenFromCode(redirectUri, code);
    const accessToken = tokenResponse.result.access_token;
    safeSet(TOKEN_KEY, accessToken);
    safeSessionRemove(CODE_VERIFIER_KEY);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());
    state.dbx = new Dropbox.Dropbox({ accessToken });
    setStatus("Connected.", 1200);
    listFolder("");
    updateMenuAuth();
  } catch (error) {
    console.error(error);
    setStatus("Dropbox authentication failed.");
  }
}

function connectDropbox() {
  const redirectUri = window.location.origin + window.location.pathname;
  const auth = new Dropbox.DropboxAuth({ clientId: DROPBOX_APP_KEY });
  auth
    .getAuthenticationUrl(redirectUri, undefined, "code", "offline", undefined, "none", true)
    .then((url) => {
      safeSessionSet(CODE_VERIFIER_KEY, auth.getCodeVerifier());
      window.location.href = url;
    })
    .catch((error) => {
      console.error(error);
      setStatus("Could not start Dropbox auth.");
    });
}

function disconnectDropbox() {
  clearAuth();
  state.currentFile = null;
  state.currentFileName = "";
  setCurrentMarkdown("");
  setView("list");
  listFolder("");
  updateFooterFile();
  updateMenuAuth();
}

function setupListeners() {
  backBtn.addEventListener("click", goBack);
  connectBtn.addEventListener("click", connectDropbox);
  newFileBtn.addEventListener("click", () => {
    createFile();
  });
  newFolderBtn.addEventListener("click", () => {
    createFolder();
  });
  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });
  menuConnect.addEventListener("click", () => {
    toggleMenu(false);
    connectDropbox();
  });
  menuDisconnect.addEventListener("click", () => {
    toggleMenu(false);
    disconnectDropbox();
  });
  menuTrashAction.addEventListener("click", () => {
    toggleMenu(false);
    if (state.view === "editor") {
      deleteCurrentFile();
    }
  });
  if (menuCopy) {
    menuCopy.addEventListener("click", async () => {
      toggleMenu(false);
      if (!state.currentFile) {
        return;
      }
      const text = getCurrentMarkdown();
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Copied.", 1200);
      } catch (error) {
        console.error(error);
        setStatus("Copy failed.", 1200);
      }
    });
  }
  statusToggle.addEventListener("change", () => {
    saveSettings();
    document.querySelector(".status-footer").classList.toggle("is-hidden", !statusToggle.checked);
  });
  if (deletedToggle) {
    deletedToggle.addEventListener("change", () => {
      state.showDeleted = deletedToggle.checked;
      saveSettings();
      listFolder(state.currentPath || "");
    });
  }
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (state.undoStack.length <= 1) {
        return;
      }
      state.undoStack.pop();
      const next = state.undoStack[state.undoStack.length - 1] || "";
      state.rawMarkdown = next;
      editorCode.value = next;
      updateWordCount();
      updateMenuUndoState();
      editorCode.focus();
    });
  }
  document.addEventListener("click", (event) => {
    if (!menuPanel.contains(event.target) && !menuToggle.contains(event.target)) {
      toggleMenu(false);
    }
  });

  editorCode.addEventListener("paste", handlePaste);
  editorCode.addEventListener("input", () => {
    state.rawMarkdown = editorCode.value;
    scheduleAutosave();
    updateWordCount();
    scheduleUndoSnapshot();
  });
  editorCode.addEventListener("focus", () => updateFormatBarVisibility(true));
  editorCode.addEventListener("blur", () => updateFormatBarVisibility(false));
  window.addEventListener("resize", () => updateFormatBarVisibility(document.activeElement === editorCode));
  formatButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      switch (action) {
        case "bold":
          applyInlineWrap("**");
          break;
        case "italic":
          applyInlineWrap("_");
          break;
        case "code":
          applyInlineWrap("`");
          break;
        case "quote":
          insertLinePrefix("> ");
          break;
        case "checkbox":
          insertCheckbox();
          break;
        case "h1":
          insertHeading(1);
          break;
        case "h2":
          insertHeading(2);
          break;
        case "h3":
          insertHeading(3);
          break;
        default:
          break;
      }
    });
  });
  previewToggle.addEventListener("click", () => {
    setMode(state.mode === "edit" ? "preview" : "edit");
  });
}

function init() {
  setView("list");
  setStatus("");
  setupListeners();
  loadSettings();
  updateMenuUndoState();
  handleAuthRedirect();

  const dbx = ensureDropbox();
  if (dbx) {
    setStatus("Connected.", 800);
    listFolder("");
    updateMenuAuth();
  } else {
    listFolder("");
    updateMenuAuth();
  }
}

init();
