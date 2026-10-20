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
  function openOverlay(id, mode = "present") {
    if (document.getElementById("driveslide-overlay")) return;
    const host = document.createElement("div");
    host.id = "driveslide-overlay";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#000";
    const frame = document.createElement("iframe");
    const viewerUrl = new URL(chrome.runtime.getURL("viewer.html"));
    viewerUrl.searchParams.set("mode", mode);
    viewerUrl.hash = encodeURIComponent(id);
    frame.src = viewerUrl.href;
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
      try { chrome.runtime.sendMessage({ type: "present", id, mode }); } catch { /* reload the Drive tab */ }
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
      openOverlay(id, "present");
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
    .launcher { position: fixed; right: 20px; bottom: 20px; opacity: 0; transform: translateY(12px); pointer-events: none;
      z-index: 2147483646; transition: opacity .18s, transform .18s; }
    .launcher.show { opacity: 1; transform: none; pointer-events: auto; }
    .pill { display: flex; align-items: center; gap: 8px;
      padding: 11px 18px; border: 0; border-radius: 999px; background: #1a73e8; color: #fff;
      font: 600 14px system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
    .pill:hover { background: #1765cc; }
    .menu { position: absolute; right: 0; bottom: calc(100% + 8px); width: 220px; padding: 6px;
      border: 1px solid #ffffff24; border-radius: 12px; background: #202124; box-shadow: 0 8px 28px #0008;
      opacity: 0; visibility: hidden; transform: translateY(5px); transition: opacity .14s, transform .14s, visibility .14s; }
    .launcher:hover .menu, .launcher:focus-within .menu, .launcher.open .menu { opacity: 1; visibility: visible; transform: none; }
    .choice { display: block; width: 100%; padding: 11px 12px; border: 0; border-radius: 8px; background: transparent;
      color: #fff; font: 500 13px system-ui, sans-serif; text-align: left; cursor: pointer; }
    .choice:hover, .choice:focus-visible { background: #ffffff18; outline: none; }
    .choice small { display: block; margin-top: 3px; color: #bdc5d4; font-size: 11px; }
  `);
  root.adoptedStyleSheets = [sheet];

  const launcher = document.createElement("div");
  launcher.className = "launcher";
  const pill = document.createElement("button");
  pill.className = "pill";
  pill.type = "button";
  pill.setAttribute("aria-haspopup", "true");
  pill.setAttribute("aria-expanded", "false");
  pill.textContent = "▶ Present PDF";
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");
  const present = document.createElement("button");
  present.className = "choice";
  present.type = "button";
  present.setAttribute("role", "menuitem");
  const presentLabel = document.createElement("span");
  presentLabel.textContent = "Present PDF";
  const presentHint = document.createElement("small");
  presentHint.textContent = "Start the slideshow right away";
  present.append(presentLabel, presentHint);
  const advanced = document.createElement("button");
  advanced.className = "choice";
  advanced.type = "button";
  advanced.setAttribute("role", "menuitem");
  const advancedLabel = document.createElement("span");
  advancedLabel.textContent = "Advanced present PDF";
  const advancedHint = document.createElement("small");
  advancedHint.textContent = "Set rotation and flips per slide";
  advanced.append(advancedLabel, advancedHint);
  menu.append(present, advanced);
  launcher.append(pill, menu);
  root.append(launcher);

  // Show the pill only while a single PDF is selected or open. Drive is a single-page app, so watch
  // selection attributes and URL/title changes, debounced.
  let selectedId = null;
  let timer = 0;
  function refresh() {
    timer = 0;
    selectedId = currentId();
    launcher.classList.toggle("show", !!selectedId);
  }
  function schedule() { if (!timer) timer = setTimeout(refresh, 120); }
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ["aria-selected"], childList: true,
  });
  addEventListener("popstate", schedule);
  setInterval(() => { if (!document.hidden) refresh(); }, 1500); // safety net for URL/title changes Drive makes without DOM events
  refresh();

  pill.addEventListener("click", () => {
    const expanded = launcher.classList.toggle("open");
    pill.setAttribute("aria-expanded", String(expanded));
  });
  const choose = (mode) => {
    if (!selectedId) return;
    launcher.classList.remove("open");
    pill.setAttribute("aria-expanded", "false");
    openOverlay(selectedId, mode);
  };
  present.addEventListener("click", () => choose("present"));
  advanced.addEventListener("click", () => choose("advanced"));
  document.addEventListener("pointerdown", (e) => {
    if (!host.contains(e.target)) {
      launcher.classList.remove("open");
      pill.setAttribute("aria-expanded", "false");
    }
  });
  // Note: nothing read here (selection, title, row markup) is stored or sent anywhere.

  document.documentElement.appendChild(host);
})();
