// content_steam.js — Runs on Steam store app pages
// Checks if current game is in your Epic library and injects a badge

(function () {
  "use strict";

  const STORAGE_KEY   = "epicOwnedGames";
  const DISMISSED_KEY = "epicDismissedMatches";

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // ── Normalize title for fuzzy comparison ──────────────────────────────────
  function normalize(title) {
    return title
      .toLowerCase()
      .replace(/[™®©]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ── Check similarity between two normalized strings ───────────────────────
  // Keep words >2 chars OR pure numbers — numbers distinguish sequels ("Fallout 3" vs "Fallout 1").
  function sigWords(s) { return s.split(" ").filter(w => w.length > 2 || /^\d+$/.test(w)); }

  // Rank by quality: exact wins over partial wins over fuzzy.
  // Scan ALL titles so a later exact match beats an earlier partial/fuzzy hit.
  function isMatch(steamTitle, epicTitles) {
    const sn = normalize(steamTitle);
    const sWords = new Set(sigWords(sn));
    const RANK = { exact: 3, partial: 2, fuzzy: 1 };
    let best = null;

    for (const et of epicTitles) {
      const en = normalize(et);
      let confidence = null;

      if (sn === en) {
        confidence = "exact";
      } else if (sn.includes(en) || en.includes(sn)) {
        confidence = "partial";
      } else {
        const eWords = sigWords(en);
        if (eWords.length > 0) {
          const overlap = eWords.filter(w => sWords.has(w)).length;
          if (overlap / Math.max(sWords.size, eWords.length) >= 0.75) confidence = "fuzzy";
        }
      }

      if (confidence && (!best || RANK[confidence] > RANK[best.confidence])) {
        best = { match: true, epicTitle: et, confidence };
        if (confidence === "exact") break; // can't do better
      }
    }

    return best || { match: false };
  }

  // ── Get current Steam game title ──────────────────────────────────────────
  function getSteamTitle() {
    return (
      document.querySelector("#appHubAppName")?.innerText?.trim() ||
      document.querySelector(".apphub_AppName")?.innerText?.trim() ||
      document.querySelector('[itemprop="name"]')?.innerText?.trim() ||
      document.title?.replace("on Steam", "").replace("Save ", "").trim()
    );
  }

  // ── Inject the "You own this on Epic" badge ───────────────────────────────
  function injectBadge(appId, steamTitle, epicTitle, confidence) {
    if (document.getElementById("els-epic-badge")) return;

    // Find the buy/add-to-cart area
    const buyArea =
      document.querySelector(".game_purchase_action") ||
      document.querySelector(".game_area_purchase_game") ||
      document.querySelector("#game_area_purchase") ||
      document.querySelector(".leftcol");

    if (!buyArea) return;

    const badge = document.createElement("div");
    badge.id = "els-epic-badge";

    const confidenceLabel =
      confidence === "exact"
        ? "Exact match"
        : confidence === "partial"
        ? "Title match"
        : "Likely match";

    const confidenceColor =
      confidence === "exact"
        ? "#00c853"
        : confidence === "partial"
        ? "#00b0ff"
        : "#ff9800";

    badge.innerHTML = `
      <div id="els-badge-inner">
        <div id="els-badge-logo">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2z" fill="#0078f2"/>
            <path d="M10 11h12v2.5H13v2h8v2.5h-8v2H22V22.5H10V11z" fill="white"/>
          </svg>
        </div>
        <div id="els-badge-text">
          <span id="els-badge-title">You already own this on Epic!</span>
          <span id="els-badge-sub">"${escHtml(epicTitle)}" · <span style="color:${confidenceColor}">${escHtml(confidenceLabel)}</span></span>
        </div>
        <div id="els-badge-close" title="Dismiss">✕</div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #els-epic-badge {
        margin: 12px 0;
        padding: 0;
        font-family: 'Motiva Sans', Arial, sans-serif;
        animation: elsBadgeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
      }
      @keyframes elsBadgeIn {
        from { opacity: 0; transform: scale(0.92) translateY(-6px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      #els-badge-inner {
        display: flex;
        align-items: center;
        gap: 12px;
        background: linear-gradient(135deg, #0d1b2a 0%, #1a2d45 100%);
        border: 1px solid #0078f2;
        border-left: 4px solid #0078f2;
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 2px 16px rgba(0,120,242,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
        position: relative;
      }
      #els-badge-logo {
        flex-shrink: 0;
        filter: drop-shadow(0 0 6px rgba(0,120,242,0.5));
      }
      #els-badge-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      #els-badge-title {
        color: #ffffff;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      #els-badge-sub {
        color: #8ba3be;
        font-size: 11px;
        font-weight: 400;
      }
      #els-badge-close {
        color: #4a6580;
        font-size: 12px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        flex-shrink: 0;
        transition: color 0.2s, background 0.2s;
        line-height: 1;
      }
      #els-badge-close:hover {
        color: #fff;
        background: rgba(255,255,255,0.1);
      }
    `;
    document.head.appendChild(style);

    badge.querySelector("#els-badge-close").addEventListener("click", () => {
      if (appId) {
        chrome.storage.local.get(DISMISSED_KEY, (r) => {
          const list = r[DISMISSED_KEY] || [];
          if (!list.some(d => d.appId === appId)) {
            list.push({ appId, steamTitle, epicTitle });
            chrome.storage.local.set({ [DISMISSED_KEY]: list });
          }
        });
      }
      badge.style.transition = "opacity 0.3s, transform 0.3s";
      badge.style.opacity = "0";
      badge.style.transform = "scale(0.95)";
      setTimeout(() => badge.remove(), 300);
    });

    buyArea.insertAdjacentElement("beforebegin", badge);
  }

  // ── Main: load library and check current game ─────────────────────────────
  function run() {
    const appId = location.pathname.match(/\/app\/(\d+)/)?.[1] || null;
    chrome.storage.local.get([STORAGE_KEY, DISMISSED_KEY], (result) => {
      const epicGames = result[STORAGE_KEY];
      if (!epicGames || epicGames.length === 0) return;

      const dismissed = result[DISMISSED_KEY] || [];
      if (appId && dismissed.some(d => d.appId === appId)) return;

      const steamTitle = getSteamTitle();
      if (!steamTitle) return;

      const { match, epicTitle, confidence } = isMatch(steamTitle, epicGames);
      if (match) injectBadge(appId, steamTitle, epicTitle, confidence);
    });
  }

  // Run after page is fully loaded (some Steam elements lazy-render)
  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run);
  }

  // Also listen for manual refresh from popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "refreshSteamCheck") run();
  });
})();
