# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-10-20
### Added
- Fullscreen slideshow of Google Drive PDFs fetched into memory only, rendered with bundled pdf.js 4.4.168.
- In-tab overlay on Drive, with a **Present PDF** button shown only when exactly one PDF is selected, and a right-click menu item.
- Toolbar popup (present current tab or pasted link) and right-click on Drive links.
- Controls: hover arrows, seek bar, auto-advance (1/2/5/10 s) with progress line, overview grid, laser pointer, black screen, timer, shortcuts panel.
- Store listing pack, privacy policy, build audit and a real-Chrome end-to-end test.

### Permissions / data handling
- `contextMenus` plus host access to `drive.google.com` and `drive.usercontent.google.com`. No data collected, stored or sent.
