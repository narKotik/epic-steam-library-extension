// content_epic.js v1.2.8
// Runs on epicgames.com pages.
// Its ONLY job: extract auth tokens/account ID from the page and send to background.
// All network calls happen in background.js (no CORS there).

(function () {
  "use strict";

  // ── Extract auth token from page context ──────────────────────────────────
  // Epic stores auth in Redux state, window globals, localStorage, or sessionStorage.
  function extractAuth() {
    const result = { authToken: null, accountId: null, source: [] };

    function scanStorage(storage, label) {
      try {
        const keys = Object.keys(storage);
        for (const key of keys) {
          try {
            const val = storage.getItem(key);
            if (!val) continue;
            // Epic's current EG1 token format
            if (val.startsWith("EG1~") && !result.authToken) {
              result.authToken = val;
              result.source.push(`${label} EG1:${key}`);
              continue;
            }
            // Raw token strings by key name — require >50 chars to skip expiry timestamps and other short date/flag values
            if ((key.toLowerCase().includes("token") || key.toLowerCase().includes("auth") || key.toLowerCase().includes("bearer")) && val.length > 50) {
              result.authToken = result.authToken || val;
              result.source.push(`${label}:${key}`);
            }
            // Account ID
            if ((key.toLowerCase().includes("account") || key.toLowerCase().includes("user")) && val.length === 32) {
              result.accountId = result.accountId || val;
              result.source.push(`accountId from ${label}:${key}`);
            }
            // Try JSON
            if (val.startsWith("{")) {
              const obj = JSON.parse(val);
              if (obj.access_token && !result.authToken) { result.authToken = obj.access_token; result.source.push(`JSON ${label}:${key}.access_token`); }
              if (obj.token && !result.authToken) { result.authToken = obj.token; result.source.push(`JSON ${label}:${key}.token`); }
              if (obj.accountId && !result.accountId) { result.accountId = obj.accountId; result.source.push(`JSON ${label}:${key}.accountId`); }
              if (obj.id && !result.accountId && typeof obj.id === "string" && obj.id.length === 32) { result.accountId = obj.id; }
            }
          } catch (e) { /* ignore parse errors */ }
        }
      } catch (e) { /* storage may be unavailable */ }
    }

    // 1. Check localStorage and sessionStorage
    scanStorage(localStorage, "localStorage");
    scanStorage(sessionStorage, "sessionStorage");

    // 2. Check window globals Epic might set
    try {
      const w = window;
      if (w.__epic_auth?.access_token) { result.authToken = result.authToken || w.__epic_auth.access_token; result.source.push("window.__epic_auth"); }
      if (w.EpicGames?.user?.accessToken) { result.authToken = result.authToken || w.EpicGames.user.accessToken; result.source.push("window.EpicGames.user"); }
      if (w.__REDUX_STATE__?.auth?.accessToken) { result.authToken = result.authToken || w.__REDUX_STATE__.auth.accessToken; result.source.push("window.__REDUX_STATE__"); }
      if (w.__store__) {
        const state = w.__store__.getState?.();
        if (state?.auth?.accessToken) { result.authToken = result.authToken || state.auth.accessToken; result.source.push("Redux store"); }
        if (state?.user?.accountId) { result.accountId = result.accountId || state.user.accountId; }
      }
      // Next.js apps expose initial server-side props here
      if (w.__NEXT_DATA__) {
        const nd = w.__NEXT_DATA__;
        const token = nd?.props?.pageProps?.accessToken ||
                      nd?.props?.pageProps?.authToken ||
                      nd?.props?.initialState?.auth?.accessToken;
        if (token && !result.authToken) { result.authToken = token; result.source.push("window.__NEXT_DATA__"); }
        const acctId = nd?.props?.pageProps?.accountId || nd?.props?.pageProps?.userId;
        if (acctId && !result.accountId) { result.accountId = acctId; }
      }
    } catch (e) { /* ignore */ }

    // 3. Check cookies accessible from JS (httpOnly ones are not, background gets those)
    try {
      const cookies = document.cookie.split(";").map(c => c.trim());
      for (const c of cookies) {
        const [name, ...rest] = c.split("=");
        const val = rest.join("=");
        if (val.startsWith("EG1~") && !result.authToken) {
          result.authToken = val;
          result.source.push(`js-cookie EG1:${name}`);
        } else if ((name.toUpperCase().includes("TOKEN") || name.toUpperCase().includes("BEARER")) && val.length > 20) {
          result.authToken = result.authToken || val;
          result.source.push(`js-cookie:${name}`);
        }
      }
    } catch (e) { /* ignore */ }

    return result;
  }

  // ── Show toast ────────────────────────────────────────────────────────────
  function showToast(message, color = "#4CAF50") {
    document.getElementById("els-toast")?.remove();
    const s = document.createElement("style");
    s.textContent = `@keyframes elsFadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(s);
    const t = document.createElement("div");
    t.id = "els-toast";
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${color};color:#fff;font-family:'Segoe UI',sans-serif;font-size:13px;font-weight:600;padding:12px 18px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:999999;display:flex;align-items:center;gap:8px;animation:elsFadeIn .3s ease;max-width:340px;`;
    t.innerHTML = `<span style="font-size:18px">🎮</span><span>${message}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  // ── Listen for scan trigger from popup ────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "scanEpicLibrary") {
      const auth = extractAuth();

      // Forward to background service worker which can make cross-origin requests
      chrome.runtime.sendMessage(
        { action: "doScan", authToken: auth.authToken, accountId: auth.accountId },
        (response) => {
          sendResponse(response);
          if (response?.success) {
            showToast(
              response.games?.length === 0
                ? "⚠️ Scan ran but found 0 games"
                : `✅ ${response.total} games saved via ${response.method}`,
              response.games?.length === 0 ? "#e67e22" : "#4CAF50"
            );
          } else {
            showToast("❌ Scan failed — check Logs tab", "#e74c3c");
          }
        }
      );
      return true; // async
    }
  });

  console.log("[ELS] v1.2.8 content script ready on", location.hostname);
})();
