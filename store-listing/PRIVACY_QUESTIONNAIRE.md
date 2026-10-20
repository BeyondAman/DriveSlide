# Chrome Web Store "Privacy practices" tab: draft answers

Based on the verified behaviour of version 0.1.0 (see `PRIVACY_POLICY.md`). Items marked **⚠ CONFIRM** need your decision. Don't assume.

## Single purpose
Present PDF files from Google Drive as a fullscreen slideshow, without downloading them.

## Permission justifications
| Item | Justification to paste |
|---|---|
| `contextMenus` | Adds a right-click item "Present PDF as slideshow" on links to Google Drive files. |
| Host permission `https://drive.google.com/*` (also covers the content script) | Runs on Google Drive pages to show the "Present" button and menu item for a selected PDF. It reads the page URL, title, and the selected item's file ID and type, only to decide whether and what to present. Nothing is stored or sent. |
| Host permission `https://drive.usercontent.google.com/*` | Google's file-serving host. The extension requests the user-selected PDF from it, into memory, using the user's existing session. |
| Web-accessible resource `viewer.html` (drive.google.com only) | Lets the Drive tab show the slideshow viewer in an in-page overlay. |

No other permissions are requested (no `tabs`, `storage`, `cookies`, `history`, `downloads`, `activeTab` or `scripting`).

## Remote code
**No.** Every script (including pdf.js 4.4.168) ships inside the package, and the content security policy forbids anything else.

## Data usage (what is "collected")
Chrome's definition of "collect" is data transmitted off the user's device to the developer or a third party. Verified behaviour:
- Nothing is transmitted to the developer or to any third party. The only network requests go to Google (`drive.usercontent.google.com`), carrying the file ID the user chose.
- The PDF, file names, titles and IDs are processed locally and are not stored.

Suggested answers:

| Category | Suggested | Notes |
|---|---|---|
| Personally identifiable information | Not collected | |
| Health / Financial / Authentication / Personal communications / Location | Not collected | The extension never reads credentials or cookies. |
| Web history | Not collected | The only trace is Chrome's own local history entry for a slideshow tab URL. |
| User activity | Not collected | |
| Website content | **⚠ CONFIRM** | The extension processes PDF content and page text locally. I believe "not collected" is accurate because none of it leaves the device for us or anyone else. The conservative alternative is to tick it and describe it as local-only processing. Choose one. |

## Certifications (all true for 0.1.0)
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Things only you can answer
- **⚠ CONFIRM** The privacy policy URL, support email and homepage (see `LISTING.md`).
- **⚠ CONFIRM** Whether you publish as an individual or as an organisation (trader/non-trader status for EU listings).
- **⚠ CONFIRM** That you accept the Chrome Web Store Developer Program Policies and the Google Drive terms for your use. I can't give legal advice. The two points of exposure are injecting a script into drive.google.com and using Drive's download endpoint.
