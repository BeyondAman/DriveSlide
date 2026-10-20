# Publication checklist

## Automated (run these first)
- [ ] `python build.py` passes, which means the audit, reference checks and listing limits are fine, and `dist/driveslide-<version>.zip` is built.
- [ ] `node tests/e2e.mjs` passes. It runs in real Chrome against a *fake* Drive page, so it is not proof against real Drive.

## Manual testing in real Chrome with a real Google account (not done yet)
- [ ] Load unpacked from `extension/`. `chrome://extensions` shows no errors for DriveSlide.
- [ ] An owned PDF: pill appears when selected, slideshow opens in the Drive tab, Esc and ✕ close it.
- [ ] A PDF shared with you.
- [ ] A large PDF (> 25 MB).
- [ ] A view-only file with downloading disabled: you get a clear error and no workaround.
- [ ] A non-PDF (docx, folder), multi-selection, and the preview page (`/file/d/<id>/view`): the pill hides or shows as expected.
- [ ] The right-click menu item appears. If not, check whether Drive's menu markup changed.
- [ ] The toolbar popup: present this tab and paste-a-link.
- [ ] Sign out of Google: a clear error appears.
- [ ] Check the DevTools console on Drive for errors from the extension.

## Listing
- [ ] Supply the URLs and email in `LISTING.md`, and in `PRIVACY_POLICY.md` ("Contact").
- [ ] Publish `PRIVACY_POLICY.md` at a public HTTPS URL and paste that URL into the dashboard.
- [ ] Capture screenshots and the promo tile (`ASSETS_CHECKLIST.md`). Confirm the final icon.
- [ ] Fill the Privacy practices tab from `PRIVACY_QUESTIONNAIRE.md`, resolving every **⚠ CONFIRM**.
- [ ] Category: Productivity. Language: English.

## Account and submission
- [ ] Register a Chrome Web Store developer account (one-time US$5 fee) with 2-step verification on.
- [ ] Upload `dist/driveslide-<version>.zip`.
- [ ] Choose distribution (Public / Unlisted / Private) and visibility. Consider **Unlisted** for a first release.
- [ ] Submit for review, and expect questions about the Drive content script and `drive.usercontent.google.com`.

## Every later release
- [ ] Bump `version` in `extension/manifest.json` (it must increase).
- [ ] Add an entry to `CHANGELOG.md`.
- [ ] If data behaviour or permissions changed, update `PRIVACY_POLICY.md` and `PRIVACY_QUESTIONNAIRE.md` first.
- [ ] Re-run the automated checks and re-test against current Drive, because its markup changes without notice.
