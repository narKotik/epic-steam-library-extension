// popup.js v1.3.0

const STORAGE_KEY = "epicOwnedGames";
const IGNORE_KEY  = "epicIgnoredGames";

const btnScan      = document.getElementById("btn-scan");
const btnClear     = document.getElementById("btn-clear");
const btnAddGame   = document.getElementById("btn-add-game");
const btnCopyLog   = document.getElementById("btn-copy-log");
const btnClearLog  = document.getElementById("btn-clear-log");
const scanSpinner  = document.getElementById("scan-spinner");
const scanLabel    = document.getElementById("scan-label");
const statusEl     = document.getElementById("status");
const statScan     = document.getElementById("stat-scan");
const gamesList    = document.getElementById("games-list");
const libCount     = document.getElementById("lib-count");
const libSearch    = document.getElementById("lib-search");
const libAddInput  = document.getElementById("lib-add-input");
const logContainer    = document.getElementById("log-container");
const chkDebugLogs    = document.getElementById("chk-debug-logs");
const libSearchClear  = document.getElementById("lib-search-clear");
const btnExport       = document.getElementById("btn-export");
const btnImport       = document.getElementById("btn-import");
const importFile      = document.getElementById("import-file");
const libIoStatus     = document.getElementById("lib-io-status");

let allGames   = [];
let allIgnored = [];
let storedLogs = [];
let hasAuth    = false;
let initialLoad = true;

const normKey = s => s.replace(/[™®©]/g, "").toLowerCase().trim();
const preferRicher = (a, b) => (/[™®©]/.test(b) && !/[™®©]/.test(a)) ? b : a;
function deduplicateList(arr) {
  const seen = new Map();
  for (const g of arr) {
    const k = normKey(g);
    seen.set(k, seen.has(k) ? preferRicher(seen.get(k), g) : g);
  }
  return [...seen.values()];
}

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

function switchTab(name) {
  document.querySelector(`[data-tab="${name}"]`).click();
}

// ── Helpers ───────────────────────────────────────────────────────────────
function setStatus(msg, type = "") { statusEl.textContent = msg; statusEl.className = type; }

function timeAgo(ts) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

// ── Library ───────────────────────────────────────────────────────────────
function loadData() {
  chrome.storage.local.get([STORAGE_KEY, IGNORE_KEY, "epicLastScan"], (result) => {
    const rawGames   = result[STORAGE_KEY] || [];
    const rawIgnored = result[IGNORE_KEY]  || [];
    allGames   = deduplicateList(rawGames);
    allIgnored = deduplicateList(rawIgnored);
    // Persist cleanup if dedup removed anything
    if (allGames.length !== rawGames.length || allIgnored.length !== rawIgnored.length) {
      chrome.storage.local.set({ [STORAGE_KEY]: allGames, [IGNORE_KEY]: allIgnored });
    }
    statScan.textContent = timeAgo(result.epicLastScan);
    renderLibrary(libSearch.value);
    renderIgnored();
    if (initialLoad) {
      initialLoad = false;
      if (allGames.length === 0) switchTab("scan");
    }
  });
}

function renderLibrary(filter = "") {
  const q = filter.toLowerCase().trim();
  const filtered = q ? allGames.filter(g => g.toLowerCase().includes(q)) : allGames;
  const sorted = filtered.slice().sort((a, b) => a.localeCompare(b));
  libCount.textContent = `${allGames.length} game${allGames.length !== 1 ? "s" : ""}`;

  if (allGames.length === 0) {
    gamesList.innerHTML = `<div class="empty-state">No games saved yet.<br>Go to Scan tab to import your library.</div>`;
    return;
  }
  if (sorted.length === 0) {
    gamesList.innerHTML = `<div class="empty-state">No games match "${filter}"</div>`;
    return;
  }
  gamesList.innerHTML = "";
  sorted.forEach(g => {
    const item = document.createElement("div");
    item.className = "game-item";
    const dot = document.createElement("div");
    dot.className = "game-dot";
    const name = document.createElement("span");
    name.className = "game-name";
    name.title = g;
    name.textContent = g;
    const ign = document.createElement("button");
    ign.className = "game-ignore";
    ign.title = "Move to ignore list";
    ign.textContent = "✕";
    ign.addEventListener("click", () => ignoreGame(g));
    item.append(dot, name, ign);
    gamesList.appendChild(item);
  });
}

function renderIgnored() {
  const toggleRow = document.getElementById("ignored-toggle-row");
  const section   = document.getElementById("ignored-section");
  const countEl   = document.getElementById("ignored-count");
  const chevron   = document.getElementById("ignored-chevron");
  const list      = document.getElementById("ignored-list");

  countEl.textContent = allIgnored.length;

  if (allIgnored.length === 0) {
    toggleRow.style.display = "none";
    section.style.display   = "none";
    return;
  }
  toggleRow.style.display = "block";

  const sorted = allIgnored.slice().sort((a, b) => a.localeCompare(b));
  list.innerHTML = "";
  sorted.forEach(g => {
    const item = document.createElement("div");
    item.className = "game-item";
    const dot = document.createElement("div");
    dot.className = "game-dot-muted";
    const name = document.createElement("span");
    name.className = "game-name";
    name.title = g;
    name.textContent = g;
    const restore = document.createElement("button");
    restore.className = "game-restore";
    restore.title = "Restore to library";
    restore.textContent = "↩";
    restore.addEventListener("click", () => restoreGame(g));
    const del = document.createElement("button");
    del.className = "game-del";
    del.title = "Remove from ignore list";
    del.textContent = "✕";
    del.addEventListener("click", () => deleteFromIgnored(g));
    item.append(dot, name, restore, del);
    list.appendChild(item);
  });
}

document.getElementById("btn-ignored-toggle").addEventListener("click", () => {
  const section = document.getElementById("ignored-section");
  const chevron = document.getElementById("ignored-chevron");
  const open = section.style.display === "flex";
  section.style.display = open ? "none" : "flex";
  chevron.textContent   = open ? "▸" : "▾";
});

function ignoreGame(name) {
  allGames = allGames.filter(x => x !== name);
  if (!allIgnored.some(x => normKey(x) === normKey(name))) allIgnored.push(name);
  chrome.storage.local.set({ [STORAGE_KEY]: allGames, [IGNORE_KEY]: allIgnored }, () => loadData());
}

function restoreGame(name) {
  allIgnored = allIgnored.filter(x => x !== name);
  if (!allGames.some(x => normKey(x) === normKey(name))) allGames.push(name);
  chrome.storage.local.set({ [STORAGE_KEY]: allGames, [IGNORE_KEY]: allIgnored }, () => loadData());
}

function deleteFromIgnored(name) {
  allIgnored = allIgnored.filter(x => x !== name);
  chrome.storage.local.set({ [IGNORE_KEY]: allIgnored }, () => loadData());
}

function addGame() {
  const name = libAddInput.value.trim();
  if (!name) { libAddInput.value = ""; return; }
  const lower = normKey(name);
  if (allGames.some(x => normKey(x) === lower)) { libAddInput.value = ""; return; }
  // If the game is currently ignored, restore it instead of adding a duplicate
  if (allIgnored.some(x => normKey(x) === lower)) {
    allIgnored = allIgnored.filter(x => normKey(x) !== lower);
    allGames.push(name);
    chrome.storage.local.set({ [STORAGE_KEY]: allGames, [IGNORE_KEY]: allIgnored }, () => { loadData(); libAddInput.value = ""; });
    return;
  }
  allGames.push(name);
  chrome.storage.local.set({ [STORAGE_KEY]: allGames }, () => { loadData(); libAddInput.value = ""; });
}

btnAddGame.addEventListener("click", addGame);
libAddInput.addEventListener("keydown", e => { if (e.key === "Enter") addGame(); });
libSearch.addEventListener("input", () => {
  libSearchClear.style.display = libSearch.value ? "block" : "none";
  renderLibrary(libSearch.value);
});
libSearchClear.addEventListener("click", () => {
  libSearch.value = "";
  libSearchClear.style.display = "none";
  renderLibrary("");
  libSearch.focus();
});
const clearConfirm = document.getElementById("clear-confirm");
btnClear.addEventListener("click", () => clearConfirm.classList.add("visible"));
document.getElementById("btn-clear-no").addEventListener("click", () => clearConfirm.classList.remove("visible"));
document.getElementById("btn-clear-yes").addEventListener("click", () => {
  clearConfirm.classList.remove("visible");
  chrome.storage.local.remove([STORAGE_KEY, "epicLastScan"], () => { allGames = []; loadData(); });
});

// ── Export / Import ───────────────────────────────────────────────────────
function setLibStatus(msg, type = "", duration = 3000) {
  libIoStatus.textContent = msg;
  libIoStatus.className = type;
  if (duration) setTimeout(() => { libIoStatus.textContent = ""; libIoStatus.className = ""; }, duration);
}

btnExport.addEventListener("click", () => {
  const data = { version: 1, exported: new Date().toISOString(), games: allGames, ignored: allIgnored };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `epic-library-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setLibStatus(`Exported ${allGames.length} games, ${allIgnored.length} ignored`);
});

btnImport.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;
  importFile.value = "";
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.games) && !Array.isArray(data.ignored)) throw new Error();
      const newGames   = (data.games   || []).filter(g => typeof g === "string");
      const newIgnored = (data.ignored || []).filter(g => typeof g === "string");
      const mergedGames   = deduplicateList([...allGames,   ...newGames]);
      const mergedIgnored = deduplicateList([...allIgnored, ...newIgnored]);
      const ignoredKeys   = new Set(mergedIgnored.map(normKey));
      const finalGames    = mergedGames.filter(g => !ignoredKeys.has(normKey(g)));
      chrome.storage.local.set({ [STORAGE_KEY]: finalGames, [IGNORE_KEY]: mergedIgnored }, () => {
        loadData();
        setLibStatus(`Imported ${newGames.length} games, ${newIgnored.length} ignored`, "ok");
      });
    } catch {
      setLibStatus("Invalid file", "err");
    }
  };
  reader.readAsText(file);
});

// ── Logs ──────────────────────────────────────────────────────────────────
function renderLogs(logs) {
  if (!logs || logs.length === 0) {
    logContainer.innerHTML = `<div class="log-empty">No logs yet — run a scan first.</div>`;
    return;
  }
  const box = document.createElement("div");
  box.className = "log-box";
  logs.forEach(entry => {
    const el = document.createElement("div");
    el.className = `log-entry ${entry.level}`;
    const dataStr = entry.data ? ` → ${entry.data}` : "";
    el.innerHTML = `<span class="log-time">${entry.time}</span>${entry.msg}${dataStr}`;
    box.appendChild(el);
  });
  logContainer.innerHTML = "";
  logContainer.appendChild(box);
  setTimeout(() => { box.scrollTop = box.scrollHeight; }, 50);
}

btnCopyLog.addEventListener("click", () => {
  const text = storedLogs.map(e =>
    `[${e.time}] [${e.level.toUpperCase()}] ${e.msg}${e.data ? " → " + e.data : ""}`
  ).join("\n");
  navigator.clipboard.writeText(text || "(no logs)").then(() => {
    btnCopyLog.textContent = "Copied!";
    setTimeout(() => { btnCopyLog.textContent = "Copy"; }, 1500);
  });
});

btnClearLog.addEventListener("click", () => { storedLogs = []; renderLogs([]); });

// ── Scan ──────────────────────────────────────────────────────────────────
const scanDesc = document.getElementById("scan-desc");

function setAuthState(auth) {
  hasAuth = auth;
  btnScan.disabled = false;
  scanSpinner.style.display = "none";
  if (auth) {
    scanLabel.textContent = "🎮 Scan Epic Library";
    scanDesc.textContent = "Reads your owned games from Epic's API using your browser session.";
  } else {
    scanLabel.textContent = "🔗 Open Epic Store & Scan";
    scanDesc.textContent = "You're not signed in to Epic. Click to open the store, sign in, then scan.";
  }
}

// Check auth on popup open and set button state
chrome.runtime.sendMessage({ action: "checkAuth" }, (r) => setAuthState(!!r?.hasAuth));

btnScan.addEventListener("click", () => {
  if (!hasAuth) {
    chrome.tabs.create({ url: "https://store.epicgames.com" });
    setStatus("Sign in to Epic, then click Scan.", "warn");
    setAuthState(true);
    return;
  }

  btnScan.disabled = true;
  scanSpinner.style.display = "block";
  scanLabel.textContent = "Scanning…";
  setStatus("", "");

  chrome.runtime.sendMessage({ action: "doScan", authToken: null, accountId: null }, (response) => {
    if (chrome.runtime.lastError) {
      setAuthState(hasAuth);
      setStatus("Extension error — try reloading.", "err");
      return;
    }
    if (!response) {
      setAuthState(hasAuth);
      setStatus("No response received.", "err");
      return;
    }

    if (response.logs?.length) {
      storedLogs = response.logs;
      renderLogs(storedLogs);
    }

    if (!response.success) {
      const authErr = response.error?.includes("401") || response.error?.includes("403") || response.error?.includes("authenticated");
      if (authErr) {
        setAuthState(false);
        setStatus("Not signed in to Epic in Chrome — click the button to open the store and log in.", "warn");
      } else {
        setAuthState(true);
        setStatus(`❌ ${response.error}`, "err");
        switchTab("logs");
      }
      return;
    }

    setAuthState(true);
    if (!response.games?.length) {
      setStatus("⚠️ Scan ran but found 0 games — check Logs tab.", "warn");
      switchTab("logs");
    } else {
      setStatus(`✅ ${response.total} games saved (${response.added} new) via ${response.method}`, "ok");
      loadData();
      switchTab("library");
    }
  });
});

// ── Debug logs toggle (footer checkbox) ───────────────────────────────────
function applyDebugState(enabled) {
  const logsTabBtn = document.getElementById("tab-btn-logs");
  logsTabBtn.style.display = enabled ? "" : "none";
  if (!enabled && logsTabBtn.classList.contains("active")) switchTab("library");
}

chrome.storage.local.get("epicDebugLogs", (r) => {
  const enabled = !!r.epicDebugLogs;
  chkDebugLogs.checked = enabled;
  applyDebugState(enabled);
});

chkDebugLogs.addEventListener("change", () => {
  const enabled = chkDebugLogs.checked;
  chrome.storage.local.set({ epicDebugLogs: enabled });
  applyDebugState(enabled);
});

// ── Init ──────────────────────────────────────────────────────────────────
loadData();
setInterval(() => {
  chrome.storage.local.get("epicLastScan", r => { statScan.textContent = timeAgo(r.epicLastScan); });
}, 30000);
