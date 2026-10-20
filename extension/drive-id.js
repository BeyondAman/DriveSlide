// Extracts a Google Drive file id from a Drive URL (or a bare id). Pure function, no I/O.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;

export function parseDriveId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (DRIVE_ID_RE.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.hostname !== "drive.google.com") return null;
  const m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m && DRIVE_ID_RE.test(m[1])) return m[1];
  const id = u.searchParams.get("id");
  return id && DRIVE_ID_RE.test(id) ? id : null;
}

export function viewerUrl(id) {
  return chrome.runtime.getURL("viewer.html") + "#" + encodeURIComponent(id);
}
