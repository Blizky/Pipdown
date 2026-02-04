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
const menuRefresh = document.getElementById("menuRefresh");
const menuNewFile = document.getElementById("menuNewFile");
const menuNewFolder = document.getElementById("menuNewFolder");
const selectToggle = document.getElementById("selectToggle");
const shareBtn = document.getElementById("shareBtn");
const deleteBtn = document.getElementById("deleteBtn");
const undoBtn = document.getElementById("undoBtn");
const browserView = document.getElementById("browserView");
const editorView = document.getElementById("editorView");
const connectBtn = document.getElementById("connectBtn");

const TOKEN_KEY = "pipdown-token";
const CODE_VERIFIER_KEY = "pipdown-code-verifier";
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
  autosaveTimer: null,
  statusTimer: null,
  selectionMode: false,
  selectedFiles: new Map(),
  lastDeleted: [],
  showUndo: false,
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

function setTitle(text) {
  titleText.textContent = text || "Pipdown";
}

function setView(view) {
  state.view = view;
  browserView.classList.toggle("is-active", view === "list");
  editorView.classList.toggle("is-active", view === "editor");
  updateTopbar();
}

function updateTopbar() {
  if (state.view === "editor") {
    setTitle(state.currentFileName || "Untitled");
    selectToggle.classList.add("is-hidden");
    shareBtn.classList.add("is-hidden");
    deleteBtn.classList.add("is-hidden");
    undoBtn.classList.add("is-hidden");
  } else {
    const folderName = state.currentPath.split("/").filter(Boolean).pop();
    setTitle(folderName || "Pipdown");
    if (state.currentPath) {
      selectToggle.classList.remove("is-hidden");
    } else {
      selectToggle.classList.add("is-hidden");
    }
    updateSelectionUI();
  }

  const atRoot = !state.currentPath;
  backBtn.classList.toggle("is-disabled", state.view === "list" && atRoot);
}

function updateSelectionUI() {
  const hasSelection = state.selectedFiles.size > 0;
  fileList.classList.toggle("selection-mode", state.selectionMode);

  if (!state.currentPath) {
    shareBtn.classList.add("is-hidden");
    deleteBtn.classList.add("is-hidden");
    undoBtn.classList.add("is-hidden");
    return;
  }

  if (state.showUndo) {
    undoBtn.classList.remove("is-hidden");
    selectToggle.classList.remove("is-hidden");
    shareBtn.classList.add("is-hidden");
    deleteBtn.classList.add("is-hidden");
    selectToggle.querySelector(".select-text").textContent = "Select";
    return;
  }

  undoBtn.classList.add("is-hidden");
  if (state.selectionMode && hasSelection) {
    shareBtn.classList.remove("is-hidden");
    deleteBtn.classList.remove("is-hidden");
    selectToggle.classList.add("is-hidden");
  } else {
    shareBtn.classList.add("is-hidden");
    deleteBtn.classList.add("is-hidden");
    selectToggle.classList.remove("is-hidden");
    selectToggle.querySelector(".select-text").textContent = state.selectionMode ? "Done" : "Select";
  }
}

function clearSelection() {
  state.selectionMode = false;
  state.selectedFiles.clear();
  document.querySelectorAll(".file-item.is-selected").forEach((item) => item.classList.remove("is-selected"));
  updateSelectionUI();
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
    state.currentFile = null;
    state.currentFileName = "";
    const entries = (response.result.entries || []).filter((entry) => !entry.name.startsWith("."));
    renderFileList(entries);
    clearSelection();
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
  const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "file-item";
    empty.innerHTML = "<div class=\"icon\"></div><div class=\"label\">Empty folder</div>";
    fileList.appendChild(empty);
    return;
  }

  sorted.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.dataset.type = entry[".tag"];

    const check = document.createElement("div");
    check.className = "check";
    check.innerHTML = "<svg viewBox=\"0 0 24 24\"><path d=\"M5 13l4 4L19 7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";

    const icon = document.createElement("div");
    icon.className = "icon";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = entry.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    if (entry[".tag"] === "folder") {
      meta.textContent = "Folder";
    } else if (entry.name.toLowerCase().endsWith(".md")) {
      meta.textContent = "Markdown";
    } else {
      meta.textContent = "File";
    }

    item.appendChild(check);
    item.appendChild(icon);
    item.appendChild(label);
    item.appendChild(meta);

    item.addEventListener("click", () => handleEntry(entry, item));
    fileList.appendChild(item);
  });
}

async function handleEntry(entry, item) {
  if (state.selectionMode && entry[".tag"] === "file") {
    const key = entry.path_lower;
    if (state.selectedFiles.has(key)) {
      state.selectedFiles.delete(key);
      item.classList.remove("is-selected");
    } else {
      state.selectedFiles.set(key, entry);
      item.classList.add("is-selected");
    }
    updateSelectionUI();
    return;
  }

  if (entry[".tag"] === "folder") {
    await listFolder(entry.path_lower);
    return;
  }
  if (!entry.name.toLowerCase().endsWith(".md")) {
    setStatus("Only .md files are supported.", 1500);
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
    setView("editor");
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus("Failed to open file.");
  }
}

async function ensureDeletedFolder() {
  const dbx = ensureDropbox();
  if (!dbx) return null;
  const base = state.currentPath || "";
  const deletedPath = `${base}/.deleted`.replace("//", "/");
  try {
    await dbx.filesCreateFolderV2({ path: deletedPath });
  } catch (error) {
    const tag = error?.error?.error?.[".tag"];
    if (tag !== "path" && tag !== "path/conflict") {
      console.error(error);
    }
  }
  return deletedPath;
}

async function deleteSelected() {
  const dbx = ensureDropbox();
  if (!dbx || state.selectedFiles.size === 0) {
    return;
  }
  const deletedPath = await ensureDeletedFolder();
  if (!deletedPath) return;

  const moves = [];
  for (const entry of state.selectedFiles.values()) {
    const toPath = `${deletedPath}/${entry.name}`.replace("//", "/");
    moves.push({ from_path: entry.path_lower, to_path: toPath });
  }

  const results = [];
  for (const move of moves) {
    try {
      const res = await dbx.filesMoveV2({ from_path: move.from_path, to_path: move.to_path, autorename: true });
      results.push({
        from: move.from_path,
        to: res.result.metadata.path_lower,
      });
    } catch (error) {
      console.error(error);
    }
  }

  state.lastDeleted = results;
  state.showUndo = results.length > 0;
  clearSelection();
  listFolder(state.currentPath || "");
  setStatus(results.length ? "Moved to .deleted" : "Delete failed.", 1200);
}

async function undoDelete() {
  const dbx = ensureDropbox();
  if (!dbx || !state.lastDeleted.length) {
    return;
  }
  for (const item of state.lastDeleted) {
    try {
      await dbx.filesMoveV2({ from_path: item.to, to_path: item.from, autorename: true });
    } catch (error) {
      console.error(error);
    }
  }
  state.lastDeleted = [];
  state.showUndo = false;
  listFolder(state.currentPath || "");
  setStatus("Restored.", 1200);
}

async function shareSelected() {
  const dbx = ensureDropbox();
  if (!dbx || state.selectedFiles.size === 0) {
    return;
  }

  const links = [];
  for (const entry of state.selectedFiles.values()) {
    try {
      const res = await dbx.filesGetTemporaryLink({ path: entry.path_lower });
      links.push({ name: entry.name, url: res.result.link });
    } catch (error) {
      console.error(error);
    }
  }

  if (!links.length) {
    setStatus("Share failed.", 1200);
    return;
  }

  const text = links.map((item) => `${item.name}: ${item.url}`).join("\n");
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Pipdown files",
        text,
      });
    } catch (error) {
      console.error(error);
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    setStatus("Shared.", 1200);
  } else {
    alert(text);
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
    await dbx.filesUpload({
      path,
      contents: "",
      mode: { ".tag": "add" },
    });
    state.currentFile = path;
    state.currentFileName = fileName;
    setCurrentMarkdown("");
    setView("editor");
  } catch (error) {
    console.error(error);
    setStatus("Could not create file.");
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(text) {
  let result = escapeHtml(text);
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code><span class="md-token">&#96;</span>${escapeHtml(code)}<span class="md-token">&#96;</span></code>`;
  });
  result = result.replace(/\\*\\*([^*]+)\\*\\*/g, (_match, content) => {
    return `<strong><span class="md-token">**</span>${content}<span class="md-token">**</span></strong>`;
  });
  result = result.replace(/__([^_]+)__/g, (_match, content) => {
    return `<strong><span class="md-token">__</span>${content}<span class="md-token">__</span></strong>`;
  });
  result = result.replace(/\\*([^*]+)\\*/g, (_match, content) => {
    return `<em><span class="md-token">*</span>${content}<span class="md-token">*</span></em>`;
  });
  result = result.replace(/_([^_]+)_/g, (_match, content) => {
    return `<em><span class="md-token">_</span>${content}<span class="md-token">_</span></em>`;
  });
  result = result.replace(/\\[([^\\]]+)\\]\\(([^\\)]+)\\)/g, (_match, label, url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><span class="md-token">[</span>${label}<span class="md-token">]</span><span class="md-token">(</span>${escapeHtml(url)}<span class="md-token">)</span></a>`;
  });
  return result;
}

function renderMarkdown(md) {
  const lines = (md || "").split("\\n");
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  lines.forEach((line) => {
    if (!line.trim()) {
      closeList();
      html += "<p><br></p>";
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const token = headingMatch[1];
      const text = renderInline(headingMatch[2]);
      html += `<h${level}><span class="md-token">${token}</span> ${text}</h${level}>`;
      return;
    }

    const quoteMatch = line.match(/^>\\s?(.*)$/);
    if (quoteMatch) {
      closeList();
      html += `<blockquote><span class="md-token">&gt;</span> ${renderInline(quoteMatch[1])}</blockquote>`;
      return;
    }

    const listMatch = line.match(/^[-*+]\\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li><span class="md-token">-</span>${renderInline(listMatch[1])}</li>`;
      return;
    }

    closeList();
    html += `<p>${renderInline(line)}</p>`;
  });

  closeList();
  return html;
}

function getCurrentMarkdown() {
  return state.rawMarkdown || "";
}

function setCurrentMarkdown(md) {
  const text = md || "";
  state.rawMarkdown = text;
  editorCode.value = text;
  editorWysiwyg.innerHTML = renderMarkdown(text);
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

function getCaretOffset() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }
  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(editorWysiwyg);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function setCaretOffset(offset) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let current = 0;
  const walker = document.createTreeWalker(editorWysiwyg, NodeFilter.SHOW_TEXT, null);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent.length;
    if (current + length >= offset) {
      range.setStart(node, Math.max(0, offset - current));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    current += length;
    node = walker.nextNode();
  }
  range.selectNodeContents(editorWysiwyg);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handlePaste(event) {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain");
  document.execCommand("insertText", false, text);
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
}

function setupListeners() {
  backBtn.addEventListener("click", goBack);
  selectToggle.addEventListener("click", () => {
    state.showUndo = false;
    state.selectionMode = !state.selectionMode;
    if (!state.selectionMode) {
      state.selectedFiles.clear();
      document.querySelectorAll(".file-item.is-selected").forEach((item) => item.classList.remove("is-selected"));
    }
    updateSelectionUI();
  });
  shareBtn.addEventListener("click", () => {
    shareSelected();
  });
  deleteBtn.addEventListener("click", () => {
    deleteSelected();
  });
  undoBtn.addEventListener("click", () => {
    undoDelete();
  });
  connectBtn.addEventListener("click", connectDropbox);
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
  menuRefresh.addEventListener("click", () => {
    toggleMenu(false);
    listFolder(state.currentPath || "");
  });
  menuNewFile.addEventListener("click", () => {
    toggleMenu(false);
    createFile();
  });
  menuNewFolder.addEventListener("click", () => {
    toggleMenu(false);
    createFolder();
  });
  document.addEventListener("click", (event) => {
    if (!menuPanel.contains(event.target) && !menuToggle.contains(event.target)) {
      toggleMenu(false);
    }
  });

  editorWysiwyg.addEventListener("paste", handlePaste);
  editorWysiwyg.addEventListener("input", () => {
    const caret = getCaretOffset();
    const text = editorWysiwyg.innerText.replace(/\u00a0/g, " ");
    state.rawMarkdown = text;
    editorCode.value = text;
    editorWysiwyg.innerHTML = renderMarkdown(text);
    setCaretOffset(caret);
    scheduleAutosave();
  });
}

function init() {
  setView("list");
  setStatus("");
  setupListeners();
  handleAuthRedirect();

  const dbx = ensureDropbox();
  if (dbx) {
    setStatus("Connected.", 800);
    listFolder("");
  } else {
    listFolder("");
  }
}

init();
