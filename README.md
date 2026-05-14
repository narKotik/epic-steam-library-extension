# Epic Library on Steam — Chrome Extension

Shows your Epic Games library directly on Steam store pages so you never accidentally buy a game you already own.

## Features

- **📚 Epic Library Scanner** — Reads your owned games from the Epic Games Store library page
- **🏷️ Steam Badges** — Shows a "You already own this on Epic!" badge near the buy button on Steam app pages
- **🔍 Fuzzy Matching** — Handles title differences (subtitles, punctuation, etc.)
- **🔒 100% Local** — All data stored on your device via `chrome.storage.local`. No servers, no tracking.

## Installation (Developer Mode)

1. Clone or download this repo — you'll get a folder called `epic-steam-library-extension`
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked**
5. Select the `epic-steam-library-extension` folder
6. The extension icon appears in your toolbar ✅

## How to Use

### Step 1 — Scan your Epic library
1. Click the extension icon in Chrome
2. Click **"Open Epic Library"** (or navigate there manually)
3. Log into Epic Games Store if needed
4. Wait for your library games to load on screen (scroll down to load more)
5. Click **"🎮 Scan Epic Library"** in the popup
6. Your games are saved locally — you'll see the count in the popup

### Step 2 — Browse Steam
Just visit any game on the Steam store (`store.steampowered.com/app/...`). If you own the game on Epic, a blue badge appears **above the buy button** automatically.

## Tips

- **Scroll your Epic library** before scanning to load all games (Epic uses lazy loading)
- Re-scan periodically when you add new Epic games
- The badge shows match confidence: **Exact match**, **Title match**, or **Likely match**
- Click the ✕ on the badge to dismiss it for that page session

## How Title Matching Works

The extension normalizes titles (removes punctuation, symbols, extra spaces) and uses three levels of matching:
1. **Exact** — normalized titles are identical
2. **Partial** — one title contains the other (handles "Game Name: Subtitle" vs "Game Name")
3. **Fuzzy** — 75%+ word overlap between titles

## File Structure

```
epic-steam-library-extension/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker
├── content_epic.js     # Runs on epicgames.com — scans library
├── content_steam.js    # Runs on steampowered.com — injects badge
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Managing your library

The scan reads Epic's API and **may include games you don't fully own** — DLC routes, cross-compatible content, or internal catalog entries you can't actually play as standalone games. It may also **miss some titles** that Epic's API doesn't expose.

You can correct the list at any time from the **Library tab**:

- **Add** games the scan missed using the "Add game manually…" field
- **Ignore** false positives — click ✕ next to a game to move it to the ignore list. Ignored games are skipped on future scans and won't reappear automatically.
- **Restore** an ignored game back to your library from the Ignored section, or delete it from the ignore list entirely to let the next scan decide.

## Limitations

- Free games claimed from Epic (weekly giveaways) appear in your library and will be detected
- Games with very different names on Epic vs Steam may not be matched (e.g. regional title differences)
- Some games in Epic's API may be DLC entitlements or compatibility records rather than owned base games

## Privacy

No data ever leaves your computer. The extension only uses `chrome.storage.local` to persist your game list between browser sessions.
