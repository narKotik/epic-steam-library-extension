# Chrome Web Store Submission Checklist

## Before you start

- [ ] Create a Chrome Web Store developer account at https://chrome.google.com/webstore/devconsole  
  One-time $5 registration fee.
- [ ] Host the privacy policy. Easiest option:  
  Push this repo to GitHub and enable **GitHub Pages** on the `main` branch.  
  Your policy URL will be: `https://narkotik.github.io/already-own/store/privacy.html`

---

## Step 1 — Build the ZIP

Run from the repo root:
```
./build.sh
```
This creates `already-own-v1.4.0.zip` containing only the extension files (no store assets, no dev files).

---

## Step 2 — Take screenshots

Chrome Web Store requires **at least 1 screenshot** at exactly **1280×800** or **640×400** px.

Recommended shots (take in Chrome with DevTools closed):

| # | What to capture |
|---|----------------|
| 1 | Steam store page for a game you own on Epic — badge visible above buy button |
| 2 | Epic store page for a game you own on Steam — badge visible above buy button |
| 3 | Extension popup → Library tab showing games with source badges |
| 4 | Extension popup → Scan tab |

**How to get exactly 1280×800:**
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Set dimensions to 1280×800
4. Navigate to the store page
5. Take a full-page screenshot: DevTools → three-dot menu → "Capture screenshot"

---

## Step 3 — Create the listing

Go to https://chrome.google.com/webstore/devconsole → **New item** → upload the ZIP.

Fill in the fields:

| Field | Value |
|-------|-------|
| **Name** | Already Own? |
| **Short description** | Copy from `store/description.txt` (SHORT DESCRIPTION section) |
| **Detailed description** | Copy from `store/description.txt` (DETAILED DESCRIPTION section) |
| **Category** | Productivity |
| **Language** | English |
| **Privacy policy URL** | Your hosted `privacy.html` URL |

Upload assets:
- **Icon** — `icons/icon128.png` (already set in manifest, but the store also has an upload field)
- **Screenshots** — your 1280×800 shots from Step 2
- **Small promo tile** (optional, shown in search) — `store/promo-440x280.png`
- **Large promo tile** (optional) — `store/promo-920x680.png`

---

## Step 4 — Permissions justification

During submission Chrome will ask you to justify each permission. Use these:

| Permission | Justification |
|-----------|---------------|
| `storage` | Save the user's scanned game library and settings locally in their browser. No data is transmitted. |
| `scripting` | Inject an ownership badge onto Epic and Steam store pages when a match is found in the local library. |
| `tabs` | Open a temporary background tab on steamcommunity.com to scrape the user's game list during a Steam scan. The tab is closed immediately after the scan completes. |
| `cookies` | Read the user's existing Steam and Epic session cookies to authenticate API requests during library scanning. Cookies are read-only and are never stored or transmitted outside the browser. |

---

## Step 5 — Submit

Click **Submit for review**. Review typically takes **1–3 business days** for a new submission. You'll receive an email when it's approved or if changes are required.

---

## After approval

- Update the **Privacy policy URL** in the listing if you change hosting.
- For future updates: bump the version in the four places listed in `CLAUDE.md`, run `build.sh`, then upload the new ZIP via **Package** → **Upload new package** in the developer console.
