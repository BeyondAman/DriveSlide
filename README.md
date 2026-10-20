<div align="center">

# DriveSlide

### PDF Slideshow for Google Drive

**Your PDFs. One click. Fullscreen.**

Present a Drive PDF as a focused slideshow in Chrome. Start right away, or prepare individual slides first.

`Chrome Extension` &nbsp; `Manifest V3` &nbsp; `MIT License`

</div>

> DriveSlide is an independent project. It is not affiliated with or endorsed by Google. Google Drive is a trademark of Google LLC.

---

## Present a PDF your way

Select one PDF in Google Drive and use the **▶ Present PDF** launcher. Hover or focus it to choose a mode:

| Mode | What happens |
|---|---|
| **Present PDF** | Starts the slideshow immediately. |
| **Advanced present PDF** | Preview each page and set its rotation or horizontal/vertical flip before starting. |

The slideshow opens over the Drive tab. If the browser blocks the in-page viewer, DriveSlide opens it in a tab instead. You can also start from the extension toolbar, paste a Drive link, or use Drive's right-click menu.

## Features

- **Slide-by-slide viewing:** show one PDF page at a time, scaled to your screen.
- **Per-slide adjustments:** set 0°, 90°, 180° or 270° rotation; flip a page horizontally or vertically.
- **Fit and zoom:** fit to screen, height or width, or choose 10%, 25%, 50%, 75%, 100%, 125%, 150%, 175% or 200%.
- **Flexible navigation:** keyboard, click controls, hover arrows and a seek bar.
- **Presenter tools:** manual or timed advance (1, 2, 5 or 10 seconds), progress line, slide overview, laser pointer, black screen, timer and fullscreen.

### Keyboard controls

| Keys | Action |
|---|---|
| `→`, `Space` | Next slide |
| `←` | Previous slide |
| `↑` / `↓` | Change auto-advance speed |
| `Home` / `End` | First / last slide |
| `G` | Open slide overview |
| `L` / `B` | Laser pointer / black screen |
| `F` / `?` | Fullscreen / shortcut guide |
| `Esc` | Close the open panel, then the presentation |

## Privacy, in plain language

DriveSlide has no developer-operated server, account, analytics, telemetry or advertising. It does not send your PDF to the developer.

When you choose a file, DriveSlide reads the Drive page and selected file information locally so it can identify the PDF. To present it, the extension requests the PDF directly from Google using your existing signed-in browser session. The PDF is held in browser memory for rendering and is not saved to disk by DriveSlide. It is discarded when the viewer closes.

The extension does not read or store your Google password, cookies or sign-in tokens. It does not bypass Drive permissions: a file that Google will not let you download cannot be presented. A slideshow opened in its own tab contains the Drive file ID in that tab's URL and may appear in Chrome's local browsing history.

### Extension access

| Access | Why it is needed |
|---|---|
| `contextMenus` | Add a presentation action to Drive link context menus. |
| `drive.google.com` | Show the launcher on Drive and read the selected file's ID. |
| `drive.usercontent.google.com` | Fetch the PDF you chose into browser memory. |

The extension uses no storage, downloads, cookies, history, OAuth or API keys. Its PDF renderer is bundled locally; no remote scripts are loaded. See the full [privacy policy](store-listing/PRIVACY_POLICY.md) and [permission rationale](store-listing/PRIVACY_QUESTIONNAIRE.md).

## Install the development build

1. In Chrome, open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's `extension/` folder.
3. Open Google Drive, select one PDF, then choose **Present PDF** or **Advanced present PDF** from the launcher.

The extension's own install welcome screen is a separate page that appears after installation. This README is the repository overview and setup guide.

> A Chrome Web Store listing is not linked here. Add its URL after the extension is published.

## Limitations

- Only PDFs that your Google account can download are supported. Other Drive file types are not.
- Drive selection detection and the right-click menu depend on page markup that Google may change. If the launcher does not appear, reload the Drive tab or use the toolbar popup.
- The automated smoke test uses a simulated Drive page. Manual testing with a real Drive account is still needed; see the [release checklist](store-listing/PUBLISH_CHECKLIST.md).

## Development

Requirements: Python 3 for the audit/build, and Node.js 22 or newer plus Chrome for the end-to-end smoke test.

```sh
python3 build.py
node tests/e2e.mjs
```

`build.py` audits the Manifest V3 permissions, content security policy, bundled pdf.js hashes, file references and listing limits, then creates a Chrome Web Store package under `dist/`. The smoke test loads the unpacked extension in Chrome and uses fake Google Drive endpoints; it does not access a real account.

Project map:

```text
extension/       Chrome extension source and bundled PDF renderer
store-listing/   Store copy, privacy policy and release checklists
tests/e2e.mjs    Chrome end-to-end smoke test
build.py         Security/reference audit and store package builder
```

## Support DriveSlide

DriveSlide is free to use. If it becomes useful to you, you can leave an optional tip to support its development. **A donation link will be added here later.** Tips will never be required to use the extension.

For support or feedback, open an [issue in this repository](https://github.com/BeyondAman/DriveSlide/issues).

---

<div align="center">

Made independently for people who present PDFs.

</div>
