document.getElementById("open-drive").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://drive.google.com/" });
});
