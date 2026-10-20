import { parseDriveId, viewerUrl } from "./drive-id.js";

const $ = (id) => document.getElementById(id);

function open(id) {
  if (!id) { $("msg").textContent = "Not a valid Google Drive file link."; return; }
  chrome.tabs.create({ url: viewerUrl(id) });
  window.close();
}

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = parseDriveId(tab && tab.url);
  if (id) {
    $("current").hidden = false;
    $("current").onclick = () => open(id);
  }
})();

$("go").onclick = () => open(parseDriveId($("link").value));
$("link").addEventListener("keydown", (e) => { if (e.key === "Enter") $("go").click(); });
