import { parseDriveId, viewerUrl } from "./drive-id.js";

function present(id, mode = "present") {
  if (!id) return;
  const url = new URL(viewerUrl(id));
  url.searchParams.set("mode", mode === "advanced" ? "advanced" : "present");
  chrome.tabs.create({ url: url.href });
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: "driveslide-present",
    title: "Present PDF as slideshow (DriveSlide)",
    contexts: ["link"],
    targetUrlPatterns: ["https://drive.google.com/file/d/*", "https://drive.google.com/open*"],
  });
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "driveslide-present") present(parseDriveId(info.linkUrl));
});

// Only accept messages from our own content script / pages.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  // Only our content script, running on a real Drive tab, may request a slideshow.
  let host = "";
  try { host = new URL(sender.tab && sender.tab.url).hostname; } catch { return; }
  if (host !== "drive.google.com") return;
  if (msg && msg.type === "present" && typeof msg.id === "string") {
    present(parseDriveId(msg.id), msg.mode);
  }
});
