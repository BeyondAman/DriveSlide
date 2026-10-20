import * as pdfjsLib from "./vendor/pdf.min.mjs";
import { parseDriveId } from "./drive-id.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const setupCanvas = $("setupCanvas");
const setupCtx = setupCanvas.getContext("2d");

let pdf = null;
let page = 1;
let renderTask = null;
let pending = null;
let idleTimer = null;
let autoSecs = 0;
let autoTimer = null;
let toastTimer = null;
let startedAt = 0;
let laserOn = false;
let gridBuilt = false;
let zoomMode = "fit-screen";
let setupPage = 1;
let setupRenderTask = null;
let setupRenderToken = 0;
const pageSettings = new Map();

function settingsFor(n) {
  return pageSettings.get(n) || { rotation: 0, flipX: false, flipY: false };
}

function flipTransform(settings, width, height) {
  if (!settings.flipX && !settings.flipY) return undefined;
  return [settings.flipX ? -1 : 1, 0, 0, settings.flipY ? -1 : 1,
    settings.flipX ? width : 0, settings.flipY ? height : 0];
}

// When hosted in the Drive tab overlay, talk to the content script (parent) instead of owning fullscreen.
const embedded = window.top !== window.self;
const post = (driveslide) => { try { parent.postMessage({ driveslide }, "https://drive.google.com"); } catch {} };
if (embedded) {
  document.body.classList.add("embedded");
  post("alive");
  $("close").onclick = () => post("close");
}

function fail(msg) {
  const s = $("status");
  s.textContent = msg;
  s.className = "err";
}

// The PDF is fetched straight into an ArrayBuffer. It is never written to disk by us,
// and cache: "no-store" keeps it out of the HTTP cache as well.
async function load(id) {
  const url = "https://drive.usercontent.google.com/download?export=download&confirm=t&id=" + encodeURIComponent(id);
  const res = await fetch(url, { credentials: "include", cache: "no-store", referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error("Drive returned HTTP " + res.status + ". You may not have access to this file.");
  const buf = await res.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(1024, buf.byteLength)));
  if (!head.includes("%PDF-")) {
    throw new Error(
      "This file did not come back as a PDF. Make sure it is a PDF, that you are signed in to Google in this browser, " +
      "and that you have access (files with downloading disabled by the owner cannot be presented)."
    );
  }
  return buf;
}

async function render(n) {
  if (renderTask) { pending = n; renderTask.cancel(); return; }
  const p = await pdf.getPage(n);
  const settings = settingsFor(n);
  const rotation = (p.rotate + settings.rotation) % 360;
  const base = p.getViewport({ scale: 1, rotation });
  const dpr = window.devicePixelRatio || 1;
  const stage = $("stage");
  const style = getComputedStyle(stage);
  const width = Math.max(1, stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  const height = Math.max(1, stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
  const fitWidth = width / base.width;
  const fitHeight = height / base.height;
  const scale = zoomMode === "fit-width" ? fitWidth
    : zoomMode === "fit-height" ? fitHeight
    : zoomMode === "fit-screen" ? Math.min(fitWidth, fitHeight)
    : Number(zoomMode) / 100;
  const vp = p.getViewport({ scale: scale * dpr, rotation });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = Math.floor(vp.width / dpr) + "px";
  canvas.style.height = Math.floor(vp.height / dpr) + "px";
  renderTask = p.render({ canvasContext: ctx, viewport: vp, transform: flipTransform(settings, canvas.width, canvas.height) });
  try {
    await renderTask.promise;
  } catch (e) {
    if (e.name !== "RenderingCancelledException") throw e;
  }
  renderTask = null;
  p.cleanup();
  if (pending !== null) { const q = pending; pending = null; await render(q); }
}

function go(n) {
  n = Math.max(1, Math.min(pdf.numPages, n));
  page = n;
  $("counter").textContent = n + " / " + pdf.numPages;
  $("scrub").value = n;
  if (gridBuilt) [...$("grid").children].forEach((t, i) => t.classList.toggle("cur", i + 1 === n));
  render(n).catch(() => toast("Couldn't render this slide"));
  restartAuto();
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1400);
}

// ---- auto-advance: Up steps 2 -> 5 -> 10 s, Down steps 10 -> 5 -> 2 -> 1 s -> manual -------
function restartAuto() {
  clearTimeout(autoTimer);
  const bar = $("progress");
  bar.style.transition = "none";
  bar.style.width = "0";
  if (!autoSecs || !pdf) return;
  void bar.offsetWidth; // restart the CSS transition
  bar.style.transition = "width " + autoSecs + "s linear";
  bar.style.width = "100%";
  autoTimer = setTimeout(() => {
    if (page < pdf.numPages) go(page + 1);
    else setAuto(0, "Last slide: back to manual");
  }, autoSecs * 1000);
}

function setAuto(secs, msg) {
  autoSecs = secs;
  $("auto").textContent = secs ? "⏱ " + secs + " s" : "⏱ Manual";
  $("auto").classList.toggle("on", secs > 0);
  $("autoMenu").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.secs) === secs));
  restartAuto();
  toast(msg || (secs ? "Auto-advance every " + secs + " s" : "Manual"));
}

const autoSlower = () => setAuto([2, 5, 10].find((v) => v > autoSecs) ?? autoSecs);
const autoFaster = () => setAuto([10, 5, 2, 1, 0].find((v) => v < autoSecs) ?? 0);

function setZoom(mode) {
  zoomMode = mode;
  const labels = { "fit-screen": "Fit screen", "fit-height": "Fit height", "fit-width": "Fit width" };
  $("zoom").textContent = labels[mode] || `${mode}%`;
  $("zoomMenu").querySelectorAll("[data-zoom]").forEach((b) => b.classList.toggle("on", b.dataset.zoom === mode));
  $("zoomMenu").hidden = true;
  const stage = $("stage");
  stage.scrollTo(0, 0);
  render(page).catch(() => toast("Couldn't resize this slide"));
}

// ---- panels: overview grid, help, laser, clock ------------------------------------------
async function buildGrid() {
  if (gridBuilt) return;
  gridBuilt = true;
  const grid = $("grid");
  const thumbnails = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbnails.unobserve(entry.target);
      renderThumbnail(Number(entry.target.dataset.page));
    }
  }, { root: grid, rootMargin: "240px" });

  for (let i = 1; i <= pdf.numPages; i++) {
    const b = document.createElement("button");
    b.className = "thumb" + (i === page ? " cur" : "");
    b.dataset.page = i;
    const c = document.createElement("canvas");
    const l = document.createElement("span");
    l.textContent = i;
    b.append(c, l);
    b.onclick = () => { go(i); setOverview(false); };
    grid.appendChild(b);
    thumbnails.observe(b);
  }
}

async function renderThumbnail(n) {
  if (!pdf) return;
  let p;
  try {
    p = await pdf.getPage(n);
    const settings = settingsFor(n);
    const rotation = (p.rotate + settings.rotation) % 360;
    const base = p.getViewport({ scale: 1, rotation });
    const vp = p.getViewport({ scale: 280 / base.width, rotation });
    const c = $("grid").children[n - 1]?.firstChild;
    if (!c) return;
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    await p.render({ canvasContext: c.getContext("2d"), viewport: vp,
      transform: flipTransform(settings, c.width, c.height) }).promise;
  } catch { /* document closed or thumbnail render failed */ }
  finally { p?.cleanup(); }
}

function updateSetupControls() {
  const settings = settingsFor(setupPage);
  $("setupScrub").value = setupPage;
  $("setupNumber").textContent = setupPage;
  $("setupCount").textContent = `${setupPage} / ${pdf.numPages}`;
  $("rotationOptions").querySelectorAll("[data-rotation]").forEach((b) => {
    const selected = Number(b.dataset.rotation) === settings.rotation;
    b.classList.toggle("selected", selected);
    b.setAttribute("aria-pressed", String(selected));
  });
  for (const [id, key] of [["flipHorizontal", "flipX"], ["flipVertical", "flipY"]]) {
    const button = $(id);
    button.classList.toggle("selected", settings[key]);
    button.setAttribute("aria-pressed", String(settings[key]));
  }
}

async function renderSetupPreview() {
  if (!pdf) return;
  const token = ++setupRenderToken;
  setupRenderTask?.cancel();
  let p;
  try {
    p = await pdf.getPage(setupPage);
    if (token !== setupRenderToken) return;
    const settings = settingsFor(setupPage);
    const rotation = (p.rotate + settings.rotation) % 360;
    const base = p.getViewport({ scale: 1, rotation });
    const preview = $("setupPreview");
    const width = Math.max(1, preview.clientWidth - 24);
    const height = Math.max(1, preview.clientHeight - 24);
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(width / base.width, height / base.height);
    const vp = p.getViewport({ scale: scale * dpr, rotation });
    setupCanvas.width = Math.floor(vp.width);
    setupCanvas.height = Math.floor(vp.height);
    setupCanvas.style.width = Math.floor(vp.width / dpr) + "px";
    setupCanvas.style.height = Math.floor(vp.height / dpr) + "px";
    const task = p.render({ canvasContext: setupCtx, viewport: vp,
      transform: flipTransform(settings, setupCanvas.width, setupCanvas.height) });
    setupRenderTask = task;
    try { await task.promise; }
    catch (e) { if (e.name !== "RenderingCancelledException") throw e; }
    finally { if (setupRenderTask === task) setupRenderTask = null; }
  } catch { /* Ignore a cancelled preview or a page closed during setup. */ }
  finally { p?.cleanup(); }
}

function bindSetupControls() {
  $("setupScrub").max = pdf.numPages;
  $("setupScrub").addEventListener("input", () => {
    setupPage = Number($("setupScrub").value);
    updateSetupControls();
    renderSetupPreview();
  });
  $("rotationOptions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rotation]");
    if (!b) return;
    pageSettings.set(setupPage, { ...settingsFor(setupPage), rotation: Number(b.dataset.rotation) });
    updateSetupControls();
    renderSetupPreview();
  });
  for (const [id, key] of [["flipHorizontal", "flipX"], ["flipVertical", "flipY"]]) {
    $(id).addEventListener("click", () => {
      pageSettings.set(setupPage, { ...settingsFor(setupPage), [key]: !settingsFor(setupPage)[key] });
      updateSetupControls();
      renderSetupPreview();
    });
  }
}

function setOverview(on) {
  $("overview").hidden = !on;
  $("gridBtn").classList.toggle("on", on);
  if (on) {
    buildGrid();
    const cur = $("grid").children[page - 1];
    if (cur) cur.scrollIntoView({ block: "center" });
  }
}

function setHelp(on) { $("help").hidden = !on; }

function setLaser(on) {
  laserOn = on;
  $("laser").hidden = !on;
  document.body.classList.toggle("laser", on);
  $("laserBtn").classList.toggle("on", on);
  toast(on ? "Laser pointer on (L to turn off)" : "Laser pointer off");
}

function tickClock() {
  if (!startedAt) return;
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(s / 60);
  $("clock").textContent = m + ":" + String(s % 60).padStart(2, "0");
}

// Closes the topmost transient panel; returns true if one was open.
function closePanels() {
  let any = false;
  for (const id of ["overview", "help", "autoMenu", "zoomMenu"]) {
    if (!$(id).hidden) { $(id).hidden = true; any = true; }
  }
  $("gridBtn").classList.remove("on");
  return any;
}

function toggleFs() {
  if (embedded) { post("fs"); return; }
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

function wake() {
  $("bar").classList.remove("hidden");
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if ($("bar").matches(":hover")) { wake(); return; }
    $("bar").classList.add("hidden");
    $("autoMenu").hidden = true;
    $("zoomMenu").hidden = true;
    document.body.classList.add("idle");
  }, 2200);
}

// Esc and shortcuts work before and after the PDF loads.
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (closePanels()) { e.preventDefault(); return; }
    if (!$("blank").hidden) { $("blank").hidden = true; return; }
    if (embedded) post("close"); // Esc while fullscreen is consumed by the browser itself
    return;
  }
  if (!pdf || e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key) {
    case "ArrowRight": case "PageDown": case " ": case "Enter": go(page + 1); break;
    case "ArrowLeft": case "PageUp": case "Backspace": go(page - 1); break;
    case "ArrowUp": autoSlower(); break;
    case "ArrowDown": autoFaster(); break;
    case "Home": go(1); break;
    case "End": go(pdf.numPages); break;
    case "f": case "F": toggleFs(); break;
    case "b": case "B": case ".": $("blank").hidden = !$("blank").hidden; break;
    case "g": case "G": setOverview($("overview").hidden); break;
    case "l": case "L": setLaser(!laserOn); break;
    case "?": case "h": case "H": setHelp($("help").hidden); break;
    default: return;
  }
  e.preventDefault();
});

function bindControls() {
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  $("prev").onclick = stop(() => go(page - 1));
  $("next").onclick = stop(() => go(page + 1));
  $("zl").onclick = stop(() => go(page - 1));
  $("zr").onclick = stop(() => go(page + 1));
  $("fs").onclick = stop(toggleFs);
  $("laserBtn").onclick = stop(() => setLaser(!laserOn));
  $("gridBtn").onclick = stop(() => setOverview($("overview").hidden));
  $("helpBtn").onclick = stop(() => setHelp($("help").hidden));
  $("ovClose").onclick = stop(() => setOverview(false));
  $("clock").onclick = stop(() => { startedAt = Date.now(); tickClock(); toast("Timer reset"); });
  $("auto").onclick = stop(() => {
    $("zoomMenu").hidden = true;
    $("autoMenu").hidden = !$("autoMenu").hidden;
  });
  $("zoom").onclick = stop(() => {
    $("autoMenu").hidden = true;
    $("zoomMenu").hidden = !$("zoomMenu").hidden;
  });
  $("zoomMenu").onclick = (e) => {
    e.stopPropagation();
    const b = e.target.closest("[data-zoom]");
    if (b) setZoom(b.dataset.zoom);
  };
  $("autoMenu").onclick = (e) => {
    e.stopPropagation();
    const b = e.target.closest("button");
    if (b) { setAuto(Number(b.dataset.secs)); $("autoMenu").hidden = true; }
  };
  $("scrub").max = pdf.numPages;
  $("scrub").addEventListener("input", (e) => go(Number(e.target.value)));
  $("scrub").addEventListener("click", (e) => e.stopPropagation());
  $("overview").addEventListener("click", (e) => { if (e.target === $("overview")) setOverview(false); });
  $("help").addEventListener("click", () => setHelp(false));
  $("stage").addEventListener("click", (e) => { closePanels(); go(e.clientX < innerWidth / 3 ? page - 1 : page + 1); });
  $("blank").addEventListener("click", () => { $("blank").hidden = true; });

  document.addEventListener("mousemove", (e) => {
    wake();
    if (laserOn) $("laser").style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
  });
  addEventListener("resize", () => {
    if (!pdf) return;
    if ($("splash").classList.contains("gone")) render(page).catch(() => {});
    else renderSetupPreview();
  });
  setInterval(tickClock, 1000);

  // Drop the document from memory as soon as the tab goes away.
  addEventListener("pagehide", () => { if (pdf) pdf.destroy(); pdf = null; });
}

(async () => {
  const id = parseDriveId(location.hash.slice(1));
  if (!id) { fail("No valid Google Drive file id was provided."); return; }
  try {
    const data = await load(id);
    pdf = await pdfjsLib.getDocument({
      data,
      isEvalSupported: false,
      enableXfa: false,
      disableAutoFetch: true,
      disableStream: true,
    }).promise;
  } catch (e) {
    fail(e.message || String(e));
    return;
  }
  $("status").textContent = pdf.numPages + (pdf.numPages === 1 ? " slide ready" : " slides ready");
  bindControls();
  const begin = () => { startedAt = Date.now(); $("splash").classList.add("gone"); go(1); wake(); };
  const advanced = new URL(location.href).searchParams.get("mode") === "advanced";
  if (advanced) {
    $("setupPanel").hidden = false;
    bindSetupControls();
    updateSetupControls();
    renderSetupPreview();
    $("start").onclick = () => { if (!embedded) toggleFs(); begin(); };
    $("start").focus();
  } else {
    begin();
  }
})();
