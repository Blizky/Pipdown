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
const menuTrashAction = document.getElementById("menuTrashAction");
const menuCopy = document.getElementById("menuCopy");
const menuNewFile = document.getElementById("menuNewFile");
const menuNewFolder = document.getElementById("menuNewFolder");
const menuInsertImage = document.getElementById("menuInsertImage");
const deleteUndoBtn = null;
const undoBtn = document.getElementById("undoBtn");
const insertImageBtn = document.getElementById("insertImageBtn");
const imagePicker = document.getElementById("imagePicker");
const connectionSheet = document.getElementById("connectionSheet");
const reconnectBtn = document.getElementById("reconnectBtn");
const saveLocalBtn = document.getElementById("saveLocalBtn");
const deleteSheet = document.getElementById("deleteSheet");
const deleteYes = document.getElementById("deleteYes");
const deleteNo = document.getElementById("deleteNo");
const browserView = document.getElementById("browserView");
const editorView = document.getElementById("editorView");
const connectBtn = document.getElementById("connectBtn");
const editorPreview = document.getElementById("editorPreview");
const wordCountEl = document.getElementById("wordCount");

const TOKEN_KEY = "pipdown-token";
const CODE_VERIFIER_KEY = "pipdown-code-verifier";
const SETTINGS_KEY = "pipdown-settings";
const DROPBOX_APP_KEY = "zses7fnbivgrqgv";
const OFFLINE_DB = "pipdown-offline";
const OFFLINE_STORE = "tempFiles";

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
  undoStack: [],
  canUndo: false,
  lastSavedContent: "",
  undoTimer: null,
  rawMarkdown: "",
  connectionSheetOpen: false,
  tempRecoveryPath: null,
  deleteSheetOpen: false,
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
}


function saveSettings() {
  const settings = {
    showStatus: statusToggle.checked,
  };
  safeSet(SETTINGS_KEY, JSON.stringify(settings));
}

function setTitle(text) {
  if (titleText) {
    titleText.textContent = text || "Pipdown";
  }
}

function setView(view) {
  state.view = view;
  browserView.classList.toggle("is-active", view === "list");
  editorView.classList.toggle("is-active", view === "editor");
  if (view === "list") {
    editorCode.readOnly = false;
    closeConnectionSheet();
    closeDeleteSheet();
    state.canUndo = false;
    updateMenuUndoState();
  }
  updateTopbar();
  updateTrashMenuLabel();
  updateWordCount();
}

function updateTopbar() {
  if (state.view === "editor") {
    setTitle(state.currentFileName || "Untitled");
    const titleIcon = document.querySelector("#topbarTitle .topbar-icon");
    if (titleIcon) {
      titleIcon.src = "svg/file_line.svg";
    }
  } else {
    const folderName = state.currentPath.split("/").filter(Boolean).pop();
    setTitle(folderName || "Pipdown");
    const titleIcon = document.querySelector("#topbarTitle .topbar-icon");
    if (titleIcon) {
      titleIcon.src = "svg/folder_fill.svg";
    }
  }

  const atRoot = !state.currentPath;
  backBtn.classList.toggle("is-disabled", state.view === "list" && atRoot);
  updateToolbarState();
}

function updateToolbarState() {
  const connected = Boolean(ensureDropbox());
  const inEditor = state.view === "editor";
  const canEdit = inEditor && state.mode === "edit";
  previewToggle.classList.toggle("is-disabled", !inEditor);
  if (newFileBtn) {
    newFileBtn.classList.toggle("is-disabled", !connected || inEditor);
  }
  if (newFolderBtn) {
    newFolderBtn.classList.toggle("is-disabled", !connected || inEditor);
  }
  if (insertImageBtn) {
    insertImageBtn.classList.toggle("is-disabled", !connected || !canEdit);
  }
}

function sanitizeFileTitle(title) {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "";
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
  if (menuNewFile) {
    menuNewFile.style.display = state.view === "list" ? "flex" : "none";
    menuNewFile.classList.toggle("is-disabled", !ensureDropbox());
  }
  if (menuNewFolder) {
    menuNewFolder.style.display = state.view === "list" ? "flex" : "none";
    menuNewFolder.classList.toggle("is-disabled", !ensureDropbox());
  }
  if (menuInsertImage) {
    menuInsertImage.style.display = state.view === "editor" ? "flex" : "none";
    menuInsertImage.classList.toggle("is-disabled", !ensureDropbox());
  }
}

function toggleMenu(open) {
  const willOpen = typeof open === "boolean" ? open : !menuPanel.classList.contains("is-open");
  menuPanel.classList.toggle("is-open", willOpen);
  menuPanel.setAttribute("aria-hidden", String(!willOpen));
  if (willOpen) {
    positionMenu();
  }
}

function positionMenu() {
  const rect = menuToggle.getBoundingClientRect();
  menuPanel.style.top = `${rect.bottom + 8}px`;
  const rightOffset = Math.max(12, window.innerWidth - rect.right);
  menuPanel.style.right = `${rightOffset}px`;
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
    state.currentFile = null;
    state.currentFileName = "";
    const entries = (response.result.entries || []).filter((entry) => {
      if (entry.name.startsWith(".")) return false;
      if (entry[".tag"] === "folder") return true;
      return entry.name.toLowerCase().endsWith(".md");
    });
    renderFileList(entries);
    setView("list");
    updateFooterFile();
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
    iconImg.src = entry[".tag"] === "folder" ? "svg/folder_fill.svg" : "svg/file_line.svg";
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
    const response = await dbx.filesDownload({ path: entry.path_lower });
    const blob = response.result.fileBlob;
    const text = await blob.text();
    state.currentFile = entry.path_lower;
    state.currentFileName = entry.name;
    setCurrentMarkdown(text);
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

async function deleteCurrentFile() {
  const dbx = ensureDropbox();
  if (!dbx || !state.currentFileName) {
    return;
  }
  try {
    await dbx.filesDeleteV2({ path: state.currentFile });
    setStatus("Deleted.", 1200);
    state.currentFile = null;
    state.currentFileName = "";
    setView("list");
    listFolder(state.currentPath || "");
  } catch (error) {
    console.error(error);
    setStatus("Could not delete file.");
  }
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
    listFolder(path);
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
  const trimmed = sanitizeFileTitle(name);
  if (!trimmed) return;
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

function openConnectionSheet() {
  if (!connectionSheet || state.connectionSheetOpen) return;
  state.connectionSheetOpen = true;
  connectionSheet.classList.add("is-open");
  connectionSheet.setAttribute("aria-hidden", "false");
}

function closeConnectionSheet() {
  if (!connectionSheet) return;
  state.connectionSheetOpen = false;
  connectionSheet.classList.remove("is-open");
  connectionSheet.setAttribute("aria-hidden", "true");
}

function openDeleteSheet() {
  if (!deleteSheet || state.deleteSheetOpen) return;
  state.deleteSheetOpen = true;
  deleteSheet.classList.add("is-open");
  deleteSheet.setAttribute("aria-hidden", "false");
}

function closeDeleteSheet() {
  if (!deleteSheet) return;
  state.deleteSheetOpen = false;
  deleteSheet.classList.remove("is-open");
  deleteSheet.setAttribute("aria-hidden", "true");
}

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: "path" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveTempFile(path, name, content) {
  if (!path) return;
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, "readwrite");
    tx.objectStore(OFFLINE_STORE).put({
      path,
      name,
      content,
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadTempFile(path) {
  if (!path) return null;
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, "readonly");
    const request = tx.objectStore(OFFLINE_STORE).get(path);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteTempFile(path) {
  if (!path) return;
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, "readwrite");
    tx.objectStore(OFFLINE_STORE).delete(path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function buildRecoveredName(name, suffix) {
  const base = name.replace(/\.md$/i, "");
  const tag = suffix > 1 ? `(recovered ${suffix}) ` : "(recovered) ";
  return `${tag}${base}.md`;
}

async function findAvailableRecoveredPath(folderPath, originalName) {
  const dbx = ensureDropbox();
  if (!dbx) return null;
  for (let i = 1; i < 50; i += 1) {
    const candidateName = buildRecoveredName(originalName, i);
    const candidatePath = `${folderPath}/${candidateName}`.replace("//", "/");
    try {
      await dbx.filesGetMetadata({ path: candidatePath });
    } catch (error) {
      const tag = error?.error?.error?.[".tag"];
      if (tag === "path" || tag === "path/not_found") {
        return { path: candidatePath, name: candidateName };
      }
    }
  }
  return null;
}

async function handleConnectionLost() {
  if (!state.currentFile) return;
  try {
    await saveTempFile(state.currentFile, state.currentFileName, getCurrentMarkdown());
    state.tempRecoveryPath = state.currentFile;
  } catch (error) {
    console.error(error);
  }
  setStatus("Connection lost.", 2000);
  openConnectionSheet();
}

async function attemptReconnect() {
  const temp = await loadTempFile(state.tempRecoveryPath || state.currentFile);
  if (!temp) {
    closeConnectionSheet();
    return;
  }
  const dbx = ensureDropbox();
  if (!dbx) {
    setStatus("Connect Dropbox first.");
    return;
  }
  try {
    const response = await dbx.filesDownload({ path: temp.path });
    const blob = response.result.fileBlob;
    const online = await blob.text();
    if (online === temp.content) {
      await deleteTempFile(temp.path);
      closeConnectionSheet();
      setStatus("Connection restored.", 1200);
      await openFileByPath(temp.path, temp.name);
      return;
    }
    const target = await findAvailableRecoveredPath(state.currentPath || "", temp.name);
    if (!target) {
      setStatus("Could not recover file.");
      return;
    }
    await dbx.filesUpload({
      path: target.path,
      contents: temp.content,
      mode: { ".tag": "add" },
    });
    await deleteTempFile(temp.path);
    closeConnectionSheet();
    const folderName = (state.currentPath || "").split("/").filter(Boolean).pop() || "root";
    setStatus(
      `Online version was different, the file has been saved as [${target.name}] on [${folderName}].`,
      3000
    );
    listFolder(state.currentPath || "");
  } catch (error) {
    console.error(error);
    setStatus("Reconnect failed.");
  }
}

function saveTempAsDownload() {
  const path = state.tempRecoveryPath || state.currentFile;
  if (!path) return;
  loadTempFile(path)
    .then((temp) => {
      if (!temp) return;
      const name = buildRecoveredName(temp.name, 1);
      const blob = new Blob([temp.content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      closeConnectionSheet();
      setStatus("Saved locally.", 1200);
    })
    .catch((error) => console.error(error));
}

async function openFileByPath(path, nameHint) {
  const dbx = ensureDropbox();
  if (!dbx || !path) return;
  try {
    const response = await dbx.filesDownload({ path });
    const blob = response.result.fileBlob;
    const text = await blob.text();
    state.currentFile = path;
    state.currentFileName = nameHint || path.split("/").pop() || "";
    setCurrentMarkdown(text);
    setMode("edit");
    setView("editor");
    updateFooterFile();
  } catch (error) {
    console.error(error);
  }
}

function updateFooterFile() {
  const el = document.getElementById("footerFile");
  if (!el) return;
  let path = "";
  if (state.view === "editor" && state.currentFileName) {
    path = `${state.currentPath || ""}/${state.currentFileName}`.replace("//", "/");
  } else {
    path = state.currentPath || "";
  }
  path = path.replace(/\/+$/, "");
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
  } else {
    editorPreview.style.display = "none";
    editorCode.style.display = "block";
    previewToggle.querySelector("img").src = "svg/book_6_line.svg";
    previewToggle.setAttribute("aria-label", "Preview");
  }
  updateToolbarState();
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
    await handleConnectionLost();
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


function insertMarkdownAtCursor(text) {
  const start = editorCode.selectionStart;
  const end = editorCode.selectionEnd;
  const value = editorCode.value;
  editorCode.value = value.slice(0, start) + text + value.slice(end);
  const nextPos = start + text.length;
  editorCode.selectionStart = editorCode.selectionEnd = nextPos;
  state.rawMarkdown = editorCode.value;
  updateWordCount();
  scheduleAutosave();
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try {
    if ("createImageBitmap" in window) {
      const bitmap = await createImageBitmap(file);
      return { bitmap, url };
    }
    const img = new Image();
    img.src = url;
    await img.decode();
    return { bitmap: img, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function compressWithWatermark(file) {
  const { bitmap, url } = await fileToImage(file);
  try {
    const maxWidth = 1600;
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    const scale = width > maxWidth ? maxWidth / width : 1;
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const fontSize = Math.max(14, Math.round(targetWidth * 0.02));
    ctx.font = `${fontSize}px system-ui, -apple-system, \"Segoe UI\", sans-serif`;
    ctx.fillStyle = "rgba(82, 101, 129, 0.75)";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(255, 255, 255, 0.6)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText("Pipdown", 10, targetHeight - 10);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82);
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sanitizeBaseName(name) {
  const base = name.replace(/\.[^/.]+$/, "");
  return base.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "image";
}

async function uploadImageBlob(blob, originalName) {
  const dbx = ensureDropbox();
  if (!dbx) {
    setStatus("Connect Dropbox first.");
    return null;
  }
  const base = sanitizeBaseName(originalName);
  const filename = `${base}.jpg`;
  const path = `${state.currentPath}/${filename}`.replace("//", "/");
  const response = await dbx.filesUpload({
    path,
    contents: blob,
    mode: { ".tag": "add" },
  });
  return response.result.name;
}

async function handleInsertImage(file) {
  if (!file || !state.currentFile) {
    return;
  }
  try {
    setStatus("Preparing image...");
    const blob = await compressWithWatermark(file);
    if (!blob) {
      setStatus("Image failed.");
      return;
    }
    setStatus("Uploading image...");
    const name = await uploadImageBlob(blob, file.name);
    if (!name) {
      setStatus("Image upload failed.");
      return;
    }
    const markdown = `![${name}](${name})\n`;
    insertMarkdownAtCursor(markdown);
    setStatus("Image inserted.", 1200);
  } catch (error) {
    console.error(error);
    setStatus("Image upload failed.");
  }
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
  if (newFileBtn) {
    newFileBtn.addEventListener("click", () => {
      createFile();
    });
  }
  if (newFolderBtn) {
    newFolderBtn.addEventListener("click", () => {
      createFolder();
    });
  }
  if (insertImageBtn && imagePicker) {
    insertImageBtn.addEventListener("click", () => {
      if (insertImageBtn.classList.contains("is-disabled")) {
        return;
      }
      imagePicker.value = "";
      imagePicker.click();
    });
    imagePicker.addEventListener("change", () => {
      const file = imagePicker.files && imagePicker.files[0];
      if (file) {
        handleInsertImage(file);
      }
    });
  }
  if (connectionSheet) {
    connectionSheet.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.getAttribute("data-close") === "true") {
        closeConnectionSheet();
      }
    });
  }
  if (deleteSheet) {
    deleteSheet.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.getAttribute("data-close") === "true") {
        closeDeleteSheet();
      }
    });
  }
  if (reconnectBtn) {
    reconnectBtn.addEventListener("click", () => {
      attemptReconnect();
    });
  }
  if (saveLocalBtn) {
    saveLocalBtn.addEventListener("click", () => {
      saveTempAsDownload();
    });
  }
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
      openDeleteSheet();
    }
  });
  if (deleteYes) {
    deleteYes.addEventListener("click", async () => {
      closeDeleteSheet();
      await deleteCurrentFile();
    });
  }
  if (deleteNo) {
    deleteNo.addEventListener("click", () => {
      closeDeleteSheet();
    });
  }
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
  if (menuNewFile) {
    menuNewFile.addEventListener("click", () => {
      toggleMenu(false);
      if (menuNewFile.classList.contains("is-disabled")) return;
      createFile();
    });
  }
  if (menuNewFolder) {
    menuNewFolder.addEventListener("click", () => {
      toggleMenu(false);
      if (menuNewFolder.classList.contains("is-disabled")) return;
      createFolder();
    });
  }
  if (menuInsertImage && imagePicker) {
    menuInsertImage.addEventListener("click", () => {
      toggleMenu(false);
      if (menuInsertImage.classList.contains("is-disabled")) return;
      imagePicker.value = "";
      imagePicker.click();
    });
  }
  statusToggle.addEventListener("change", () => {
    saveSettings();
    document.querySelector(".status-footer").classList.toggle("is-hidden", !statusToggle.checked);
  });
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
  window.addEventListener("resize", () => {
    if (menuPanel.classList.contains("is-open")) {
      positionMenu();
    }
  });

  editorCode.addEventListener("paste", handlePaste);
  editorCode.addEventListener("input", () => {
    state.rawMarkdown = editorCode.value;
    scheduleAutosave();
    updateWordCount();
    scheduleUndoSnapshot();
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
