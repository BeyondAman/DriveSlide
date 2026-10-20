# DriveSlide: PDF Slideshow for Google Drive — Privacy Policy

_Last updated: 2026-10-20_ <!-- update this date whenever the policy or the extension's data behaviour changes -->

**DriveSlide collects no data.** It has no server, no account, no analytics, no telemetry and no advertising. The developer cannot see which files you open, because nothing is ever sent to the developer or to any third party.

DriveSlide is an independent tool for Google Drive. It is not affiliated with or endorsed by Google. Google Drive is a trademark of Google LLC.

## What the extension reads and does (all on your device)
- **Page information on drive.google.com.** To offer "Present" only when it makes sense, the extension reads, locally and temporarily: the page URL, the page title, and for the item(s) you have selected or right-clicked, the file ID and the item's page markup (which includes the file name) so it can tell whether the item is a PDF. This information is used in the moment, is never written to storage, and is never transmitted.
- **The PDF itself.** When you choose to present a PDF, the extension requests that file **directly from Google (`drive.usercontent.google.com`)** using your existing browser session with Google. The request contains the file ID. The file is held **in memory only** to render the slides. It is not saved to disk, is requested with caching disabled, and is discarded when you close the slideshow.
- **Access controls are respected.** The extension never bypasses Drive's access controls. It can only present files your Google account can already download. If an owner has disabled downloading for viewers, Drive refuses the request and the extension shows an error.
- **Credentials.** The extension does not read, store or transmit your Google credentials, cookies or tokens. Your browser attaches your existing session to the request, exactly as it does for any Drive page you open.
- **Browser history.** If a slideshow opens in its own tab (from the toolbar popup, a pasted link or the right-click menu on a link), that tab's address contains the Drive file ID, so Chrome records it in your local browsing history like any other page. The in-page overlay on Drive does not create such an entry.

## What the extension stores
Nothing. It does not use local storage, sync storage, cookies, IndexedDB or any remote database.

## Network access
The extension can contact only `drive.google.com` and `drive.usercontent.google.com`. This is enforced by its Content Security Policy. All code, including the PDF renderer (Mozilla pdf.js), is bundled in the package. No remote code is loaded and there are no third-party scripts.

## Third parties
Google serves the file to you under [Google's Privacy Policy](https://policies.google.com/privacy). No other third party receives any data.

## Children
The extension collects no data from anyone, including children.

## Changes
Any change will be published here and in the extension's release notes. The extension will never add data collection without this policy changing first.

## Contact
<<SUPPLY: support email address>>
