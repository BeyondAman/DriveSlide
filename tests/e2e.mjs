// End-to-end smoke test: real Chrome, the real extension, and FAKED Google endpoints (no network, no account).
// Run: node tests/e2e.mjs            (needs Node 22+ and Google Chrome; override with CHROME_PATH=...)
// It loads the unpacked extension through Chrome's DevTools pipe (Extensions.loadUnpacked), serves a fake Drive
// list page plus a generated 3-page PDF by intercepting requests, and drives the UI. It cannot test real Drive markup.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(ROOT, "extension");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "driveslide-e2e-"));
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (!CHROME) { console.error("Chrome not found. Set CHROME_PATH."); process.exit(2); }

function makePdf(pages) {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`];
  const font = 3 + pages * 2;
  for (let i = 0; i < pages; i++) {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    const t = `BT /F1 96 Tf 80 250 Td (Slide ${i + 1}) Tj ET`;
    objs.push(`<< /Length ${t.length} >>\nstream\n${t}\nendstream`);
  }
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const PDF = makePdf(3).toString("base64");
const FILE = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
const LIST = `<!doctype html><title>My Drive - Google Drive</title><body>
<div id="r1" role="row" aria-selected="false" data-id="${FILE}"><img alt="PDF"> report.pdf</div>
<div id="r2" role="row" aria-selected="false" data-id="9ZyXwVuTsRqPoNmLkJiHgFeDcBa"><img alt="Word"> notes.docx</div></body>`;

const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
  "--no-first-run", "--user-data-dir=" + PROFILE, "--window-size=1280,800", "about:blank"],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
const [to, from] = [chrome.stdio[3], chrome.stdio[4]];
let n = 0, buf = ""; const pend = new Map();
from.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\0")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else onEvent(m); } });
const send = (method, params = {}, sessionId) => new Promise(r => { const id = ++n; pend.set(id, r);
  to.write(JSON.stringify({ id, method, params, sessionId }) + "\0"); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const problems = [];
const sessions = new Map();
const fetched = [];

function onEvent(m) {
  const p = m.params || {};
  if (m.method === "Target.attachedToTarget") {
    const sid = p.sessionId; sessions.set(sid, p.targetInfo);
    (async () => { await setup(sid); await send("Runtime.runIfWaitingForDebugger", {}, sid); })();
  } else if (m.method === "Fetch.requestPaused") {
    const u = p.request.url; fetched.push(u);
    if (u.startsWith("https://drive.usercontent.google.com/download")) send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/pdf" }], body: PDF }, m.sessionId);
    else if (u.startsWith("https://drive.google.com/")) send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html" }], body: Buffer.from(LIST).toString("base64") }, m.sessionId);
    else send("Fetch.continueRequest", { requestId: p.requestId }, m.sessionId);
  } else if (m.method === "Runtime.exceptionThrown") problems.push("exception: " + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  else if (m.method === "Runtime.consoleAPICalled" && p.type === "error") problems.push("console.error: " + p.args.map(a => a.value ?? a.description).join(" "));
  else if (m.method === "Log.entryAdded" && p.entry.level === "error") problems.push("log: " + p.entry.text + " " + (p.entry.url || ""));
}
async function setup(sid) {
  await send("Runtime.enable", {}, sid); await send("Log.enable", {}, sid);
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://drive.google.com/*" }, { urlPattern: "https://drive.usercontent.google.com/*" }] }, sid);
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
}
const ev = async (sid, expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sid);
  if (r.result?.exceptionDetails) return "EXC " + r.result.exceptionDetails.text; return r.result?.result?.value; };
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
async function newTab(url) {
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
  await setup(sessionId); await send("Page.enable", {}, sessionId); await send("DOM.enable", {}, sessionId);
  await send("Page.navigate", { url }, sessionId); await sleep(2500); return { targetId, sid: sessionId };
}
async function findLauncher(sid) {
  const { result: { root } } = await send("DOM.getDocument", { depth: -1, pierce: true }, sid);
  let hit = null; (function walk(nd) { if (!nd || hit) return; const a = nd.attributes || [];
    const i = a.indexOf("class"); if (i >= 0 && a[i + 1].split(" ").includes("launcher")) { hit = { id: nd.nodeId, cls: a[i + 1] }; return; }
    for (const c of [...(nd.children || []), ...(nd.shadowRoots || []), ...(nd.contentDocument ? [nd.contentDocument] : [])]) walk(c); })(root);
  return hit;
}
async function findAdvancedChoice(sid) {
  const { result: { root } } = await send("DOM.getDocument", { depth: -1, pierce: true }, sid);
  let hit = null; (function walk(nd) { if (!nd || hit) return;
    const a = nd.attributes || [], i = a.indexOf("class");
    const text = (node) => (node.nodeValue || "") + (node.children || []).map(text).join("");
    if (i >= 0 && a[i + 1].split(" ").includes("choice") && nd.nodeName === "BUTTON" && text(nd).includes("Advanced present PDF")) { hit = { id: nd.nodeId }; return; }
    for (const c of [...(nd.children || []), ...(nd.shadowRoots || []), ...(nd.contentDocument ? [nd.contentDocument] : [])]) walk(c); })(root);
  return hit;
}
const KC = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, Escape: 27 };
const key = async (sid, k) => {
  const base = { key: k, code: k.length === 1 ? "Key" + k.toUpperCase() : k, windowsVirtualKeyCode: KC[k] || k.toUpperCase().charCodeAt(0) };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...base, text: k.length === 1 ? k : undefined }, sid);
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sid);
};

try {
  const load = await send("Extensions.loadUnpacked", { path: EXT });
  const id = load.result?.id; check("extension loads (Extensions.loadUnpacked)", !!id, JSON.stringify(load.error || load.result));
  if (!id) throw new Error("not loaded");
  await sleep(1500);
  const { result: { targetInfos } } = await send("Target.getTargets");
  check("MV3 module service worker registered", targetInfos.some(t => t.type === "service_worker" && t.url === `chrome-extension://${id}/background.js`),
    targetInfos.filter(t => t.url.includes(id)).map(t => t.type + ":" + t.url).join(","));

  // standalone viewer renders a (faked) Drive PDF
  const v = await newTab(`chrome-extension://${id}/viewer.html#${FILE}`);
  check("viewer: PDF requested from drive.usercontent.google.com", fetched.some(u => u.includes("drive.usercontent.google.com/download") && u.includes(FILE)));
  const st = await ev(v.sid, "document.getElementById('status').textContent");
  check("viewer: 3 slides detected", st === "3 slides ready", st);
  check("viewer: pre-presentation setup is shown", (await ev(v.sid, "!document.getElementById('setupPanel').hidden")) === true);
  await ev(v.sid, "document.querySelector('[data-rotation=\"90\"]').click();document.getElementById('flipHorizontal').click();document.getElementById('setupScrub').value='2';document.getElementById('setupScrub').dispatchEvent(new Event('input'))");
  check("viewer: rotation and flip are independent per slide", (await ev(v.sid, "document.querySelector('[data-rotation=\"0\"]').classList.contains('selected') && document.getElementById('flipHorizontal').getAttribute('aria-pressed') === 'false'")) === true);
  await ev(v.sid, "document.getElementById('setupScrub').value='1';document.getElementById('setupScrub').dispatchEvent(new Event('input'))");
  check("viewer: slide-specific setup is retained", (await ev(v.sid, "document.querySelector('[data-rotation=\"90\"]').classList.contains('selected') && document.getElementById('flipHorizontal').getAttribute('aria-pressed') === 'true'")) === true);
  await ev(v.sid, "document.getElementById('start').click()"); await sleep(1200);
  check("viewer: start shows slide 1/3", (await ev(v.sid, "document.getElementById('counter').textContent")) === "1 / 3");
  check("viewer: rotated page preview has portrait dimensions", (await ev(v.sid, "Number(document.getElementById('canvas').style.height.replace('px','')) > Number(document.getElementById('canvas').style.width.replace('px',''))")) === true);
  check("viewer: zoom defaults to Fit screen", (await ev(v.sid, "document.getElementById('zoom').textContent")) === "Fit screen");
  await ev(v.sid, "document.getElementById('zoom').click();document.querySelector('[data-zoom=\"fit-height\"]').click()");
  check("viewer: fit-height mode can be selected", (await ev(v.sid, "document.getElementById('zoom').textContent")) === "Fit height");
  await ev(v.sid, "document.getElementById('zoom').click();document.querySelector('[data-zoom=\"fit-width\"]').click()");
  check("viewer: fit-width mode can be selected", (await ev(v.sid, "document.getElementById('zoom').textContent")) === "Fit width");
  await ev(v.sid, "document.getElementById('zoom').click();document.querySelector('[data-zoom=\"125\"]').click()");
  check("viewer: percentage zoom can be selected", (await ev(v.sid, "document.getElementById('zoom').textContent")) === "125%");
  const ink = await ev(v.sid, "(()=>{const c=document.getElementById('canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let k=0;for(let i=0;i<d.length;i+=4)if(d[i]<128)k++;return k})()");
  check("viewer: canvas rendered real text pixels", ink > 500, "dark pixels=" + ink);
  await key(v.sid, "ArrowRight"); await sleep(300);
  check("viewer: right-arrow goes to 2/3", (await ev(v.sid, "document.getElementById('counter').textContent")) === "2 / 3");
  await key(v.sid, "ArrowUp"); await sleep(200);
  check("viewer: up-arrow sets auto-advance 2 s", (await ev(v.sid, "document.getElementById('auto').textContent")).includes("2 s"));
  await sleep(2600);
  check("viewer: auto-advance moved to 3/3", (await ev(v.sid, "document.getElementById('counter').textContent")) === "3 / 3");
  await sleep(2600);
  check("viewer: auto-advance reverts to manual at last slide", (await ev(v.sid, "document.getElementById('auto').textContent")).includes("Manual"));
  await key(v.sid, "g"); await sleep(1500);
  check("viewer: overview builds 3 thumbnails", (await ev(v.sid, "document.getElementById('grid').children.length")) === 3);
  await key(v.sid, "Escape"); await key(v.sid, "l"); await sleep(200);
  check("viewer: laser toggles", (await ev(v.sid, "!document.getElementById('laser').hidden")) === true);
  await key(v.sid, "?"); await sleep(200);
  check("viewer: help opens", (await ev(v.sid, "!document.getElementById('help').hidden")) === true);
  await send("Target.closeTarget", { targetId: v.targetId });

  // popup
  const pop = await newTab(`chrome-extension://${id}/popup.html`);
  check("popup: loads", (await ev(pop.sid, "document.querySelector('h1').textContent")) === "DriveSlide");
  const msg = await ev(pop.sid, "(async()=>{document.getElementById('link').value='https://example.com/x';document.getElementById('go').click();await new Promise(r=>setTimeout(r,200));return document.getElementById('msg').textContent})()");
  check("popup: rejects a non-Drive link", msg !== "" && !String(msg).startsWith("EXC"), msg);
  const shortId = await ev(pop.sid, "(async()=>{document.getElementById('link').value='https://drive.google.com/open?id=bad';document.getElementById('go').click();await new Promise(r=>setTimeout(r,200));return document.getElementById('msg').textContent})()");
  check("popup: rejects a malformed Drive file id", shortId.includes("Not a valid"), shortId);
  await send("Target.closeTarget", { targetId: pop.targetId });

  // content script on a faked Drive page
  const d = await newTab("https://drive.google.com/drive/my-drive");
  check("drive page: pill hidden with nothing selected", (await findLauncher(d.sid))?.cls === "launcher", JSON.stringify(await findLauncher(d.sid)));
  await ev(d.sid, "document.getElementById('r1').setAttribute('aria-selected','true')"); await sleep(600);
  check("drive page: pill shows when one PDF is selected", !!(await findLauncher(d.sid))?.cls.includes("show"));
  await ev(d.sid, "document.getElementById('r1').setAttribute('aria-selected','false');document.getElementById('r2').setAttribute('aria-selected','true')"); await sleep(600);
  check("drive page: pill hides for a .docx", (await findLauncher(d.sid))?.cls === "launcher");
  await ev(d.sid, "document.getElementById('r1').setAttribute('aria-selected','true')"); await sleep(600);
  check("drive page: pill hides when 2 files are selected", (await findLauncher(d.sid))?.cls === "launcher");
  await ev(d.sid, "document.getElementById('r2').setAttribute('aria-selected','false')"); await sleep(600);

  await ev(d.sid, `(()=>{const r=document.getElementById('r1');r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
    const m=document.createElement('div');m.setAttribute('role','menu');
    ['Open with','Download','Rename','Make a copy','Share','Move to trash'].forEach((t,i)=>{const it=document.createElement('div');it.setAttribute('role','menuitem');
      if(i==0)it.setAttribute('aria-haspopup','true');const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('width','20');
      const sp=document.createElement('span');sp.textContent=t;it.append(s,sp);m.appendChild(it)});
    document.body.appendChild(m)})()`); await sleep(500);
  const mi = await ev(d.sid, "String((document.querySelector('[data-driveslide]')||{}).textContent)");
  check("drive page: context-menu item injected on right-click", mi === "Present as slideshow", mi);

  const pill = await findLauncher(d.sid);
  const bm = await send("DOM.getBoxModel", { nodeId: pill.id }, d.sid); const q = bm.result.model.content;
  const cx = (q[0] + q[4]) / 2, cy = (q[1] + q[5]) / 2;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy }, d.sid); await sleep(200);
  const choice = await findAdvancedChoice(d.sid);
  check("launcher: hover reveals the Advanced present PDF option", !!choice);
  const cb = await send("DOM.getBoxModel", { nodeId: choice.id }, d.sid); const cq = cb.result.model.content;
  const ccx = (cq[0] + cq[4]) / 2, ccy = (cq[1] + cq[5]) / 2;
  for (const t of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type: t, x: ccx, y: ccy, button: "left", clickCount: 1 }, d.sid);
  await sleep(4500);
  check("overlay: created in the Drive tab", (await ev(d.sid, "!!document.getElementById('driveslide-overlay')")) === true);
  const targets0 = (await send("Target.getTargets")).result.targetInfos;
  check("overlay: viewer iframe target exists with the extension URL (not blocked)", targets0.some(t => t.type === "iframe" && t.url.startsWith(`chrome-extension://${id}/viewer.html`)), JSON.stringify(targets0.filter(t => t.type === "iframe").map(t => t.url)));
  let cnt = "no iframe session";
  for (const [sid, t] of sessions) if (t.type === "iframe") { const c = await ev(sid, "document.getElementById('counter')&&document.getElementById('counter').textContent"); if (c) cnt = c; }
  const iframeSession = [...sessions].find(([, t]) => t.type === "iframe")?.[0];
  check("overlay: setup appears before the slideshow", (await ev(iframeSession, "!document.getElementById('setupPanel').hidden")) === true);
  await ev(iframeSession, "document.getElementById('start').click()"); await sleep(1200);
  cnt = await ev(iframeSession, "document.getElementById('counter').textContent");
  check("overlay: viewer inside iframe renders 1/3 after setup", cnt === "1 / 3", cnt);
  const tabs = (await send("Target.getTargets")).result.targetInfos;
  check("overlay: no fallback tab was opened", !tabs.some(t => t.type === "page" && t.url.startsWith(`chrome-extension://${id}/viewer.html`)));
  await key(d.sid, "Escape"); await sleep(500);
  check("overlay: Esc closes it", (await ev(d.sid, "!document.getElementById('driveslide-overlay')")) === true);

  const real = problems.filter(p => !/favicon|ERR_FILE_NOT_FOUND/.test(p));
  check("no console errors / exceptions / CSP violations", real.length === 0, "\n   " + real.join("\n   "));
  const external = fetched.filter(u => !/^https:\/\/drive\.(usercontent\.)?google\.com\//.test(u));
  check("no network requests outside Google Drive hosts", external.length === 0, external.join(","));
} catch (e) { console.log("ABORT", e.stack); fail++; }
console.log(`\n${pass} passed, ${fail} failed`);
chrome.kill(); setTimeout(() => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} process.exit(fail ? 1 : 0); }, 500);
