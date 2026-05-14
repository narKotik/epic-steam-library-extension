// popup.js v1.2.0

const STORAGE_KEY = "epicOwnedGames";

const btnScan      = document.getElementById("btn-scan");
const btnOpenEpic  = document.getElementById("btn-open-epic");
const btnClear     = document.getElementById("btn-clear");
const btnAddGame   = document.getElementById("btn-add-game");
const btnCopyLog   = document.getElementById("btn-copy-log");
const btnClearLog  = document.getElementById("btn-clear-log");
const scanSpinner  = document.getElementById("scan-spinner");
const scanLabel    = document.getElementById("scan-label");
const statusEl     = document.getElementById("status");
const statCount    = document.getElementById("stat-count");
const statScan     = document.getElementById("stat-scan");
const gamesList    = document.getElementById("games-list");
const libCount     = document.getElementById("lib-count");
const libSearch    = document.getElementById("lib-search");
const libAddInput  = document.getElementById("lib-add-input");
const logContainer = document.getElementById("log-container");

let allGames = [];
let storedLogs = [];

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
  chrome.storage.local.get([STORAGE_KEY, "epicLastScan"], (result) => {
    allGames = result[STORAGE_KEY] || [];
    statCount.textContent = allGames.length;
    statScan.textContent = timeAgo(result.epicLastScan);
    renderLibrary();
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
    const del = document.createElement("button");
    del.className = "game-del";
    del.title = "Remove";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      allGames = allGames.filter(x => x !== g);
      chrome.storage.local.set({ [STORAGE_KEY]: allGames }, () => loadData());
    });
    item.append(dot, name, del);
    gamesList.appendChild(item);
  });
}

function addGame() {
  const name = libAddInput.value.trim();
  if (!name || allGames.includes(name)) { libAddInput.value = ""; return; }
  allGames.push(name);
  chrome.storage.local.set({ [STORAGE_KEY]: allGames }, () => { loadData(); libAddInput.value = ""; });
}

btnAddGame.addEventListener("click", addGame);
libAddInput.addEventListener("keydown", e => { if (e.key === "Enter") addGame(); });
libSearch.addEventListener("input", () => renderLibrary(libSearch.value));
const clearConfirm = document.getElementById("clear-confirm");
btnClear.addEventListener("click", () => clearConfirm.classList.add("visible"));
document.getElementById("btn-clear-no").addEventListener("click", () => clearConfirm.classList.remove("visible"));
document.getElementById("btn-clear-yes").addEventListener("click", () => {
  clearConfirm.classList.remove("visible");
  chrome.storage.local.remove([STORAGE_KEY, "epicLastScan"], () => { allGames = []; loadData(); });
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
btnOpenEpic.addEventListener("click", () => chrome.tabs.create({ url: "https://store.epicgames.com" }));

btnScan.addEventListener("click", async () => {
  btnScan.disabled = true;
  scanSpinner.style.display = "block";
  scanLabel.textContent = "Scanning…";
  setStatus("", "");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { setStatus("No active tab found.", "err"); resetScanBtn(); return; }

  if (!tab.url?.includes("epicgames.com")) {
    setStatus("Open an Epic Store page first, then scan.", "warn");
    resetScanBtn();
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: "scanEpicLibrary" }, (response) => {
    resetScanBtn();

    if (chrome.runtime.lastError) {
      const errMsg = chrome.runtime.lastError.message || "Unknown";
      setStatus("Could not reach content script — reload the Epic page.", "err");
      storedLogs = [{ time: new Date().toISOString().slice(11,23), level: "error", msg: "chrome.runtime error: " + errMsg }];
      renderLogs(storedLogs);
      switchTab("logs");
      return;
    }
    if (!response) {
      setStatus("No response received.", "err");
      return;
    }

    if (response.logs?.length) {
      storedLogs = response.logs;
      renderLogs(storedLogs);
    }

    if (!response.success) {
      setStatus(`❌ ${response.error}`, "err");
      switchTab("logs");
      return;
    }

    if (!response.games?.length) {
      setStatus("⚠️ Scan ran but found 0 games — check Logs tab.", "warn");
      switchTab("logs");
    } else {
      setStatus(`✅ ${response.total} games saved (${response.added} new) via ${response.method}`, "ok");
    }
    loadData();
  });
});

function resetScanBtn() {
  btnScan.disabled = false;
  scanSpinner.style.display = "none";
  scanLabel.textContent = "🎮 Scan Epic Library";
}

// ── Init ──────────────────────────────────────────────────────────────────
loadData();
setInterval(() => {
  chrome.storage.local.get("epicLastScan", r => { statScan.textContent = timeAgo(r.epicLastScan); });
}, 30000);
