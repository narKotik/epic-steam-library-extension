// background.js v1.2.0
// ALL network requests happen here — service workers are not subject to CORS.
// The content script just grabs auth tokens from the page and sends them here.

const STORAGE_KEY = "epicOwnedGames";
const VERSION = "1.2.8";

// ── Logger ────────────────────────────────────────────────────────────────
const logs = [];
function log(level, msg, data) {
  const entry = {
    time: new Date().toISOString().slice(11, 23),
    level,
    msg,
    data: data !== undefined ? String(JSON.stringify(data)).slice(0, 400) : undefined,
  };
  logs.push(entry);
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  data !== undefined ? fn(`[ELS BG ${level.toUpperCase()}]`, msg, data) : fn(`[ELS BG ${level.toUpperCase()}]`, msg);
}
const info  = (m, d) => log("info",  m, d);
const warn  = (m, d) => log("warn",  m, d);
const error = (m, d) => log("error", m, d);

// ── Get Epic auth token from cookies via chrome.cookies API ───────────────
async function getEpicAuthFromCookies() {
  info("Reading Epic cookies via chrome.cookies API");
  const cookieDomains = [
    { url: "https://store.epicgames.com", name: "EPIC_BEARER_TOKEN" },
    { url: "https://www.epicgames.com",   name: "EPIC_BEARER_TOKEN" },
    { url: "https://store.epicgames.com", name: "EPIC_EG1" },
    { url: "https://www.epicgames.com",   name: "EPIC_EG1" },
    { url: "https://store.epicgames.com", name: "EPIC_SSO_TOKEN" },
    { url: "https://www.epicgames.com",   name: "EPIC_SSO_TOKEN" },
    { url: "https://store.epicgames.com", name: "EPIC_EOS_TOKEN" },
    { url: "https://store.epicgames.com", name: "epic_access_token" },
    { url: "https://www.epicgames.com",   name: "epic_access_token" },
  ];

  for (const { url, name } of cookieDomains) {
    try {
      const cookie = await chrome.cookies.get({ url, name });
      if (cookie?.value) {
        info(`Found auth cookie: ${name} (${cookie.value.length} chars)`);
        return cookie.value;
      }
    } catch (e) {
      warn(`Cookie read failed for ${name}`, e.message);
    }
  }

  // List ALL epicgames cookies so we can debug what's actually there
  try {
    const all = await chrome.cookies.getAll({ domain: ".epicgames.com" });
    info(`All .epicgames.com cookies (${all.length} total)`, all.map(c => c.name).join(", "));

    // Epic's current token format: value starts with "EG1~"
    const eg1Cookie = all.find(c => c.value?.startsWith("EG1~"));
    if (eg1Cookie) {
      info(`Found EG1 token in cookie: ${eg1Cookie.name}`);
      return eg1Cookie.value;
    }

    // Try to find anything that looks like a token by name
    const tokenCookie = all.find(c =>
      c.name.toLowerCase().includes("token") ||
      c.name.toLowerCase().includes("auth") ||
      c.name.toLowerCase().includes("bearer") ||
      c.name.toLowerCase().includes("session")
    );
    if (tokenCookie) {
      info(`Using fallback cookie: ${tokenCookie.name}`);
      return tokenCookie.value;
    }

    // Last resort: any long-value cookie (>100 chars) that looks like a JWT or token
    const longCookie = all.find(c => (c.value?.length || 0) > 100 && !c.name.startsWith("_"));
    if (longCookie) {
      info(`Using long-value cookie as token: ${longCookie.name}`);
      return longCookie.value;
    }
  } catch (e) {
    warn("Could not list cookies", e.message);
  }

  return null;
}

// ── Save games ────────────────────────────────────────────────────────────
async function saveGames(newGames) {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const existing = result[STORAGE_KEY] || [];
  const existingSet = new Set(existing.map(g => g.toLowerCase().trim()));
  const toAdd = newGames.filter(g => !existingSet.has(g.toLowerCase().trim()));
  const merged = [...existing, ...toAdd];
  await chrome.storage.local.set({ [STORAGE_KEY]: merged, epicLastScan: Date.now() });
  return { total: merged.length, added: toAdd.length };
}

// ── Shared request headers ────────────────────────────────────────────────
const BASE_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://store.epicgames.com/",
  "Origin": "https://store.epicgames.com",
};

function authHeaders(authToken) {
  const h = { ...BASE_HEADERS };
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

// ── Method 1: GraphQL (with Authorization header from cookie) ─────────────
async function fetchViaGraphQL(authToken) {
  // graphql.epicgames.com/graphql is decommissioned (404). Current endpoint is the store BFF.
  const GQL_URL = "https://store.epicgames.com/graphql";
  info("Method 1: GraphQL", GQL_URL);

  if (!authToken) {
    info("No auth token — attempting unauthenticated (will likely fail with 401)");
  } else {
    info("Using Bearer token", `present (${authToken.length} chars)`);
  }

  const headers = { ...authHeaders(authToken), "Content-Type": "application/json" };

  // Try the library query first (used by Epic's store web app), then fall back to entitlements
  const queries = [
    {
      // 'offers' was removed from OfferEntitlements type — query only namespace and title.
      name: "GetMyEntitlements",
      body: JSON.stringify({
        query: `{
          Launcher {
            entitledOfferItems {
              namespace
              title
            }
          }
        }`,
      }),
      extract: (json) => {
        const items = json?.data?.Launcher?.entitledOfferItems;
        if (!items?.length) return null;
        info("GraphQL OfferEntitlements sample", items[0]);
        const titles = items.map(i => i.title).filter(Boolean);
        return titles.length ? titles : null;
      },
    },
  ];

  for (const q of queries) {
    info(`GraphQL query: ${q.name}`);
    const resp = await fetch(GQL_URL, { method: "POST", headers, body: q.body, credentials: "include" });
    info(`GraphQL HTTP status (${q.name})`, resp.status);
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`HTTP ${resp.status}: Not authenticated — ensure you are logged in to the Epic Store`);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      info(`GraphQL non-ok (${q.name}), trying next`, text.slice(0, 200));
      continue;
    }
    const json = await resp.json();
    if (json.errors) {
      info(`GraphQL errors (${q.name})`, json.errors.map(e => e.message).join("; "));
      continue;
    }
    const titles = q.extract(json);
    if (titles === null) {
      info(`GraphQL unexpected shape (${q.name})`, json?.data);
      continue;
    }
    info(`GraphQL OK via ${q.name} — ${titles.length} titles`);
    return titles;
  }
  throw new Error("All GraphQL queries returned no data");
}

// ── Method 2: Account assets API ─────────────────────────────────────────
async function fetchViaAssetsAPI(authToken) {
  const URL = "https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows?label=Live";
  info("Method 2: Assets API", URL);

  const resp = await fetch(URL, { headers: authHeaders(authToken) });
  info(`Assets API HTTP status`, resp.status);
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`HTTP ${resp.status}: Not authenticated — this endpoint requires a launcher token`);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  if (!Array.isArray(json)) throw new Error(`Expected array, got ${typeof json}`);
  const names = json.map(a => a.appName).filter(Boolean);
  info(`Assets API OK — ${names.length} entries`);
  return names;
}

// ── Method 3: Library service API ────────────────────────────────────────
async function fetchViaLibraryAPI(authToken) {
  const BASE = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
  info("Method 3: Library Service API", BASE);

  const allRecords = [];
  let cursor = null;
  let page = 0;

  while (true) {
    const url = new URL(BASE);
    url.searchParams.set("includeMetadata", "true");
    url.searchParams.set("pageSize", "1000"); // request max per page; API will cap at its own limit
    if (cursor) url.searchParams.set("cursor", cursor);
    else if (page > 0) url.searchParams.set("start", allRecords.length); // offset fallback

    const resp = await fetch(url.toString(), { headers: authHeaders(authToken) });
    info(`Library API HTTP status (page ${page})`, resp.status);
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`HTTP ${resp.status}: Not authenticated`);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const json = await resp.json();
    const meta = json?.responseMetadata;
    if (page === 0) info("Library API responseMetadata", meta);

    const records = json?.records || json?.data || (Array.isArray(json) ? json : null);
    if (!records) throw new Error("Unexpected shape");

    info(`Library API page ${page}: ${records.length} records (total so far: ${allRecords.length + records.length})`);
    allRecords.push(...records);

    if (records.length === 0) break;

    // Cursor-based: keep going if a next cursor exists under any known field name
    cursor = meta?.nextCursor || meta?.cursor || meta?.nextToken || null;
    if (cursor) { page++; continue; }

    // Offset-based: keep going if total count says there's more
    const total = meta?.total ?? meta?.totalCount ?? null;
    if (total !== null && allRecords.length < total) { page++; continue; }

    // Last resort: if the page was full we might be mid-stream; stop if it looks partial
    if (records.length < 100) break;

    // Got a full page with no cursor and no total — try one more in case API is paginating silently
    page++;
    if (page > 100) { warn("Library API pagination safety limit reached"); break; }
  }

  info(`Library API total records (${page} page${page > 1 ? "s" : ""})`, allRecords.length);

  // sandboxName is usually the human-readable product title ("Borderlands 2"), but can also
  // be a UUID/hash for some titles. If it looks like a UUID, fall through to catalogItem.title.
  const isUUID = t => !t || /^[a-f0-9-]{32,}$/i.test(t);

  const rawTitles = allRecords.map(r => {
    const sandbox = isUUID(r.sandboxName) ? null : r.sandboxName;
    const catTitle = isUUID(r.catalogItem?.title) ? null : r.catalogItem?.title;
    const rootTitle = isUUID(r.title) ? null : r.title;
    return sandbox || catTitle || rootTitle || null;
  });

  const dropped = rawTitles.filter(t => !t).length;
  if (dropped > 0) info(`Library API: ${dropped} records with no usable title (all UUID/missing)`);

  const titles = rawTitles.filter(t => t && t.length > 1);
  const uniqueTitles = [...new Set(titles)];
  info(`Library API after dedup: ${titles.length} titles → ${uniqueTitles.length} unique`);
  info(`Library API OK — ${uniqueTitles.length} titles`);
  return uniqueTitles;
}

// ── Method 4: Epic account owned items (newer endpoint) ───────────────────
async function fetchViaOwnedItems(authToken, accountIdFromPage) {
  if (!accountIdFromPage) {
    // Try to get account ID from cookie
    try {
      const all = await chrome.cookies.getAll({ domain: ".epicgames.com" });
      accountIdFromPage = all.find(c => c.name.toLowerCase().includes("account_id"))?.value;
      info("Account ID from cookie", accountIdFromPage ? accountIdFromPage.slice(0, 8) + "..." : "not found");
    } catch (e) { /* ignore */ }
  }
  if (!accountIdFromPage) throw new Error("No account ID available");

  const URL = `https://account-public-service-prod.ol.epicgames.com/account/api/public/account/${accountIdFromPage}`;
  info("Method 4: Account API", URL);
  const headers = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const resp = await fetch(URL, { headers });
  info(`Account API HTTP status`, resp.status);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  info("Account API response", Object.keys(json));
  // This returns account info, not library — but confirms auth works
  throw new Error("Account API confirms auth but doesn't list games — expected");
}

// ── Main scan ─────────────────────────────────────────────────────────────
async function doScan(authFromPage, accountIdFromPage) {
  logs.length = 0;
  info(`ELS v${VERSION} background scan started`);
  info("Auth token from page?", authFromPage ? `Yes (${authFromPage.length} chars)` : "No");
  info("Account ID from page?", accountIdFromPage ? accountIdFromPage.slice(0, 8) + "..." : "No");

  // Get auth from cookies as fallback/supplement
  const cookieToken = await getEpicAuthFromCookies();
  // Real auth tokens (JWT, EG1~) are always >100 chars. Short values from the page
  // extractor are often expiry timestamps or flags that matched a key name containing
  // "token". Prefer by format first, then by length.
  const authToken =
    (authFromPage?.startsWith("EG1~") ? authFromPage : null) ||
    (cookieToken?.startsWith("EG1~") ? cookieToken : null) ||
    ((authFromPage?.length || 0) >= 100 ? authFromPage : null) ||
    cookieToken ||
    authFromPage;
  if (!authToken) {
    warn("No auth token found from page or cookies. Make sure you are logged in to the Epic Store and try again.");
  } else {
    info("Final auth token", `${authToken.length} chars, EG1=${authToken.toLowerCase().startsWith("eg1~")}`);
  }

  const methods = [
    { name: "Library Service API", fn: () => fetchViaLibraryAPI(authToken) },
    { name: "GraphQL API",         fn: () => fetchViaGraphQL(authToken) },
    { name: "Assets API",          fn: () => fetchViaAssetsAPI(authToken) },
  ];

  for (const method of methods) {
    try {
      const titles = await method.fn();
      const games = [...new Set(titles)].filter(g => g && g.length > 1);
      info(`SUCCESS via ${method.name} — ${games.length} unique games`);
      const { total, added } = await saveGames(games);
      return { games, total, added, method: method.name, logs: [...logs] };
    } catch (e) {
      error(`FAILED — ${method.name}: ${e.message}`);
    }
  }

  error("All methods failed");
  throw { message: "All API methods failed — see Logs tab for details.", logs: [...logs] };
}

// ── Message listener ──────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log(`ELS v${VERSION} installed`);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "doScan") {
    doScan(msg.authToken || null, msg.accountId || null)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message || String(err), logs: err.logs || logs }));
    return true; // async
  }

  if (msg.action === "getStats") {
    chrome.storage.local.get([STORAGE_KEY, "epicLastScan"], result => {
      sendResponse({ count: result[STORAGE_KEY]?.length || 0, lastScan: result.epicLastScan || null });
    });
    return true;
  }
});
