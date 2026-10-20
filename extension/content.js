// Runs on Drive pages (top frame only). Reads only the page URL and the id of the selected file.
// Shows a small "Present" pill; presenting opens an in-page fullscreen overlay hosting the viewer.
(() => {
  const ID_RE = /^[A-Za-z0-9_-]{10,}$/;
  if (document.getElementById("driveslide-host")) return;

  // ---- find the file to present -------------------------------------------------------
  const NON_PDF_TITLE = /\.(docx?|xlsx?|pptx?|csv|txt|png|jpe?g|gif|webp|svg|mp[34]|mov|zip|rar)(?![a-z])/i;

  // Returns the file id only when exactly one PDF is selected / open; otherwise null.
  function currentId() {
    const m = location.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    if (m) return NON_PDF_TITLE.test(document.title) ? null : m[1];
    if (location.pathname.startsWith("/open")) {
      const q = new URL(location.href).searchParams.get("id");
      return q && ID_RE.test(q) && !NON_PDF_TITLE.test(document.title) ? q : null;
    }
    // Drive list/grid: selected items carry their file id in a data-id attribute.
    // Present only when exactly one file is selected and it is a PDF (a mixed multi-selection stays hidden).
    const selected = new Map(); // id -> isPdf
    for (const el of document.querySelectorAll('[aria-selected="true"]')) {
      const holder = el.hasAttribute("data-id") ? el : el.querySelector("[data-id]");
      const id = holder && holder.getAttribute("data-id");
      if (id && ID_RE.test(id)) selected.set(id, (selected.get(id) || false) || /pdf/i.test(el.outerHTML));
    }
    if (selected.size !== 1) return null;
    const [[id, isPdf]] = selected;
    return isPdf ? id : null;
  }

  // ---- in-page overlay ----------------------------------------------------------------
  function openOverlay(id) {
    if (document.getElementById("driveslide-overlay")) return;
    const host = document.createElement("div");
    host.id = "driveslide-overlay";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#000";
    const frame = document.createElement("iframe");
    frame.src = chrome.runtime.getURL("viewer.html") + "#" + encodeURIComponent(id);
    frame.allow = "fullscreen";
    frame.referrerPolicy = "no-referrer";
    frame.style.cssText = "border:0;width:100%;height:100%;display:block";
    host.appendChild(frame);
    document.documentElement.appendChild(host);
    host.requestFullscreen?.().catch(() => {}); // allowed: we are inside the click gesture

    const origin = new URL(frame.src).origin;
    let alive = false;
    const close = () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      if (document.fullscreenElement === host) document.exitFullscreen().catch(() => {});
      host.remove();
    };
    const onMsg = (e) => {
      if (e.origin !== origin || e.source !== frame.contentWindow) return;
      const t = e.data && e.data.driveslide;
      if (t === "alive") alive = true;
      else if (t === "close") close();
      else if (t === "fs") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else host.requestFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener("message", onMsg);
    frame.addEventListener("load", () => frame.focus());
    // If the page blocks the embedded viewer, fall back to a normal tab.
    const timer = setTimeout(() => {
      if (alive) return;
      close();
      // Fall back to a normal tab. Throws if the extension was reloaded while this page stayed open.
      try { chrome.runtime.sendMessage({ type: "present", id }); } catch { /* reload the Drive tab */ }
    }, 4000);
  }

  // ---- "Present as slideshow" entry in Drive's right-click menu -----------------------
  // Drive's menu is page DOM with obfuscated classes, so we clone a plain item and relabel it.
  const LABEL = "Present as slideshow";
  const SVG_NS = "http://www.w3.org/2000/svg";

  function playIcon(size) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M8 5v14l11-7z");
    svg.appendChild(path);
    return svg;
  }

  function addMenuItem(menu, id) {
    if (menu.querySelector("[data-driveslide]")) return true;
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    if (items.length < 5) return false; // submenus are small; the main file menu is long
    const model = items.find((el) => !el.hasAttribute("aria-haspopup") && el.getAttribute("aria-disabled") !== "true");
    if (!model) return false;

    const item = model.cloneNode(true);
    item.setAttribute("data-driveslide", "1");
    item.removeAttribute("id");
    item.removeAttribute("aria-label");
    item.removeAttribute("data-tooltip");
    // relabel: replace the text node that carries the label
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let labelled = false;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!labelled && n.textContent.trim()) { n.textContent = LABEL; labelled = true; }
      else if (labelled && n.textContent.trim()) n.textContent = ""; // drop shortcut hints
    }
    const oldIcon = item.querySelector("svg, img, i");
    if (oldIcon) oldIcon.replaceWith(playIcon(oldIcon.getAttribute("width") || 20));
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); // close Drive's menu
      openOverlay(id);
    });
    // place it right after the first entry ("Open with")
    items[0].after(item);
    return true;
  }

  document.addEventListener("contextmenu", (e) => {
    const row = e.target instanceof Element ? e.target.closest("[data-id]") : null;
    const id = row && row.getAttribute("data-id");
    if (!id || !ID_RE.test(id) || !/pdf/i.test(row.outerHTML)) return;

    const tryAdd = () => [...document.querySelectorAll('[role="menu"]')].some((m) => addMenuItem(m, id));
    if (tryAdd()) return;
    const obs = new MutationObserver(() => { if (tryAdd()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 1500);
  }, true);

  // ---- the pill UI (shadow DOM so Drive's CSS can't touch it) -------------------------
  const host = document.createElement("div");
  host.id = "driveslide-host";
  const root = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    .pill { position: fixed; right: 20px; bottom: 20px; opacity: 0; transform: translateY(12px); pointer-events: none;
      transition: opacity .18s, transform .18s; z-index: 2147483646; display: flex; align-items: center; gap: 8px;
      padding: 11px 18px; border: 0; border-radius: 999px; background: #1a73e8; color: #fff;
      font: 600 14px system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
    .pill.show { opacity: 1; transform: none; pointer-events: auto; }
    .pill:hover { background: #1765cc; }
  `);
  root.adoptedStyleSheets = [sheet];

  const pill = document.createElement("button");
  pill.className = "pill";
  pill.textContent = "▶ Present PDF";
  root.append(pill);

  // Show the pill only while a single PDF is selected or open. Drive is a single-page app, so watch
  // selection attributes and URL/title changes, debounced.
  let selectedId = null;
  let timer = 0;
  function refresh() {
    timer = 0;
    selectedId = currentId();
    pill.classList.toggle("show", !!selectedId);
  }
  function schedule() { if (!timer) timer = setTimeout(refresh, 120); }
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ["aria-selected"], childList: true,
  });
  addEventListener("popstate", schedule);
  setInterval(() => { if (!document.hidden) refresh(); }, 1500); // safety net for URL/title changes Drive makes without DOM events
  refresh();

  pill.addEventListener("click", () => { if (selectedId) openOverlay(selectedId); });
  // Note: nothing read here (selection, title, row markup) is stored or sent anywhere.

  document.documentElement.appendChild(host);
})();
