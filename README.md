# DriveSlide

## PDF Slideshow for Google Drive

*Your PDFs. One click. Fullscreen.*

> Independent tool, not affiliated with or endorsed by Google. Google Drive is a trademark of Google LLC.

Turn Google Drive PDFs into instant slideshows with one click. No downloading or extra tabs. DriveSlide is a Chrome extension with no server or analytics, and it collects no data.

## Features
- **Present from Drive.** A **▶ Present PDF** button appears when exactly one PDF is selected (or open in Drive's preview). There is also a **Present as slideshow** item in Drive's right-click menu.
- **In the same tab.** The slideshow opens as a fullscreen overlay on the Drive tab. Esc or ✕ closes it. If the page blocks the overlay, it falls back to a normal tab.
- **Prepare each slide.** Before starting, preview pages and set an independent 0°/90°/180°/270° rotation or horizontal/vertical flip for each one.
- **Other entry points.** The toolbar popup presents the current Drive PDF tab or any pasted Drive link, and a right-click on a Drive link also works.
- **Controls.** Hover arrows, keyboard, click and a seek bar. Auto-advance (1/2/5/10 s) with a progress line, `↑ ↓` to change speed, an overview grid (`G`), laser pointer (`L`), black screen (`B`), presentation timer, fullscreen (`F`) and a shortcuts panel (`?`).
- **Zoom.** Fit screen, fit height or fit width, or choose 10%, 25%, 50%, 75%, 100%, 125%, 150%, 175% or 200%.

## Install (development build)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and select the `extension/` folder (not `dist/`).
3. Open Google Drive, click a PDF, then click **▶ Present PDF**.

For the Web Store build run `python build.py` and upload `dist/driveslide-<version>.zip`. See `store-listing/PUBLISH_CHECKLIST.md`.

## Usage
| Key | Action |
|---|---|
| → / Space / click right | Next slide |
| ← / click left third | Previous slide |
| ↑ | Auto-advance slower: 2 → 5 → 10 s |
| ↓ | Auto-advance faster: 10 → 5 → 2 → 1 s → manual |
| G / L / B / F / ? | Overview / laser / black screen / fullscreen / help |
| Home / End | First / last slide |
| Esc | Close the open panel, then the slideshow |

## Development
Requirements: Python 3 for the build, and Node 22+ plus Google Chrome for the end-to-end test.

```
extension/        the extension (manifest, scripts, viewer, bundled pdf.js in vendor/)
store-listing/    store copy, privacy policy and questionnaire draft, asset and publish checklists
tests/e2e.mjs     real-Chrome smoke test with faked Google endpoints
build.py          audit + reference checks + zip packaging
```

| Command | What it does |
|---|---|
| `python build.py` | Audits permissions, CSP, pinned pdf.js hashes, forbidden APIs, file references and listing limits, then writes `dist/driveslide-<version>.zip`. |
| `node tests/e2e.mjs` | Loads the unpacked extension in Chrome via the DevTools pipe, fakes the Drive page and PDF download, and runs 27 UI checks. |

The audit fails the build if the extension asks for more than `contextMenus` and the two Google hosts, if the content security policy widens, if the pdf.js hashes change, or if first-party code uses `eval`, `innerHTML`, XHR, sockets, storage, cookies or any other URL.

## Permissions (and why)
- `contextMenus`: right-click item on Drive links.
- Host `https://drive.google.com/*`: the content script that shows the button and menu item, and reading the file ID from Drive URLs.
- Host `https://drive.usercontent.google.com/*`: fetching the PDF you chose, into memory.
- Web-accessible resource `viewer.html`, exposed to `drive.google.com` only, for the in-tab overlay.

No `tabs`, `storage`, `cookies`, `history`, `downloads` or `activeTab`. The full privacy statement is in `store-listing/PRIVACY_POLICY.md`.

## Security and privacy model
- No backend, analytics or telemetry. The CSP allows network access to the two Google hosts only.
- The PDF is fetched into memory (`cache: "no-store"`), never written to disk, and discarded when the viewer closes.
- No OAuth or API keys. It uses your existing Drive browser session.
- The content script reads the page URL, title and the selected item's file ID and markup, only to decide whether and what to present, and stores or sends none of it.
- The background worker accepts messages only from its own content script on a real `drive.google.com` tab, and every file ID is validated.
- pdf.js 4.4.168 is bundled (`extension/vendor/`, SHA-256 pinned in `build.py`) and no remote code is loaded.

## Troubleshooting
- **No Present button:** select exactly one PDF and reload the Drive tab. It hides for folders, other file types and multi-selections.
- **"Did not come back as a PDF":** sign in to Google in this Chrome profile, and check that you can download the file.
- **Right-click item missing:** it depends on Drive's markup. Use the button or toolbar icon.
- **After reloading the extension:** reload open Drive tabs.

## Known limitations
- Files whose owner disabled downloading for viewers can't be presented (Drive refuses them, and DriveSlide doesn't work around that).
- Selection detection and the right-click item rely on Drive's undocumented page markup, which Google can change without notice. They fail silently and the URL-based paths keep working.
- The end-to-end test uses a fake Drive page. It has not been run against real Drive.
- Not yet manually tested in Chrome with a real Google account. See `store-listing/PUBLISH_CHECKLIST.md`.
- Icons are draft artwork.

## If the session-based fetch proves fragile
Switch to `chrome.identity` with the `drive.readonly` scope (Drive API `alt=media`). That is more robust but needs a Google Cloud OAuth client and Google's verification of a restricted scope.
