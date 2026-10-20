"""Audit and package the extension for the Chrome Web Store.

Usage: python build.py
Fails (non-zero exit) if any security, reference or listing invariant is violated.
"""
import hashlib, json, re, shutil, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).parent
EXT = ROOT / "extension"
DIST = ROOT / "dist"
LISTING = ROOT / "store-listing"

PINNED = {  # pdf.js 4.4.168, taken from jsDelivr (npm: pdfjs-dist)
    "vendor/pdf.min.mjs": "895c72c332dbd608a07ae54003e5e42741c566ade52ddbd2a00c8e57ffa35d9d",
    "vendor/pdf.worker.min.mjs": "a7cf858ab0bbe21a00ef438c24a4ef5833c3d05935a294382c8d0773a8958f50",
}
ALLOWED_PERMS = {"contextMenus"}
ALLOWED_HOSTS = {"https://drive.google.com/*", "https://drive.usercontent.google.com/*"}
FORBIDDEN_CODE = [r"\beval\s*\(", r"new Function\(", r"innerHTML", r"document\.write", r"XMLHttpRequest",
                  r"https?://(?!drive\.google\.com|drive\.usercontent\.google\.com|www\.w3\.org/2000/svg)",
                  r"chrome\.(cookies|storage|history|downloads|webRequest|identity)", r"navigator\.sendBeacon",
                  r"WebSocket", r"localStorage", r"indexedDB", r"console\.(log|debug|info)"]
DISCLAIMER = "not affiliated with or endorsed by Google"

errors = []
def check(ok, msg):
    if not ok:
        errors.append(msg)

def read(p):
    return Path(p).read_text(encoding="utf-8")

# 1. pinned third-party code
for rel, want in PINNED.items():
    check(hashlib.sha256((EXT / rel).read_bytes()).hexdigest() == want, f"hash mismatch: {rel}")

# 2. manifest invariants
m = json.loads(read(EXT / "manifest.json"))
check(m.get("manifest_version") == 3, "manifest_version must be 3")
check(len(m["name"]) <= 75, "manifest name exceeds 75 chars")
check(len(m.get("short_name", "")) in range(1, 13), "short_name must be 1-12 chars")
check(len(m["description"]) <= 132, "manifest description exceeds the 132-char store limit")
check(re.fullmatch(r"\d+(\.\d+){0,3}", m["version"]) is not None, "version must be 1-4 dot-separated integers")
check(set(m.get("permissions", [])) <= ALLOWED_PERMS, f"unexpected permissions: {m.get('permissions')}")
check(set(m.get("host_permissions", [])) <= ALLOWED_HOSTS, "unexpected host_permissions")
check("optional_permissions" not in m and "externally_connectable" not in m, "forbidden manifest keys")
check(m.get("web_accessible_resources") == [{"resources": ["viewer.html"], "matches": ["https://drive.google.com/*"]}],
      "web_accessible_resources must expose only viewer.html to drive.google.com")
for cs in m.get("content_scripts", []):
    check(set(cs["matches"]) <= {"https://drive.google.com/*"}, "content script matches widened")
csp = m["content_security_policy"]["extension_pages"]
check("'unsafe-eval'" not in csp and "'unsafe-inline'" not in csp, "weak CSP")
check("default-src 'none'" in csp, "CSP must default-deny")
check(set(re.findall(r"https://[\w.]+", csp)) == {"https://drive.google.com", "https://drive.usercontent.google.com"}, "CSP connect-src drift")
for f in EXT.glob("*.html"):
    text = read(f)
    check(not re.search(r"<script(?![^>]*\bsrc=)", text), f"inline script in {f.name}")
    check("style=" not in text, f"inline style in {f.name}")

# 3. every file the manifest, HTML and JS refer to exists
refs = set()
def collect(v):
    if isinstance(v, str) and re.search(r"\.(png|js|html|css|mjs)$", v):
        refs.add(v)
    elif isinstance(v, dict):
        [collect(x) for x in v.values()]
    elif isinstance(v, list):
        [collect(x) for x in v]
for key in ("icons", "action", "background", "content_scripts", "web_accessible_resources"):
    collect(m.get(key, {}))
for f in EXT.glob("*.html"):
    refs.update(re.findall(r'(?:src|href)="([^"#]+)"', read(f)))
for f in EXT.glob("*.js"):
    text = read(f)
    refs.update(re.findall(r'from\s+"(\./[^"]+)"', text))
    refs.update(re.findall(r'getURL\("([^"#]+\.[a-z]+)', text))
for r in sorted(refs):
    check((EXT / r.removeprefix("./")).is_file(), f"referenced file missing: {r}")
for size in ("16", "32", "48", "128"):
    check((EXT / "icons" / f"{size}.png").is_file(), f"icon {size}.png missing")

# 4. first-party code must not contain risky APIs
for f in list(EXT.glob("*.js")) + list(EXT.glob("*.html")):
    text = read(f)
    for pat in FORBIDDEN_CODE:
        check(not re.search(pat, text), f"{f.name}: forbidden pattern {pat!r}")

# 5. JS syntax (needs Node; skipped with a notice if it isn't installed)
node = shutil.which("node")
if node:
    for f in list(EXT.glob("*.js")) + [ROOT / "tests" / "e2e.mjs"]:
        r = subprocess.run([node, "--check", str(f)], capture_output=True, text=True)
        check(r.returncode == 0, f"syntax error in {f.name}: {r.stderr.strip()[:200]}")
else:
    print("note: node not found, skipping JS syntax check")

# 6. listing, privacy docs and disclaimers
listing = read(LISTING / "LISTING.md")
title = re.search(r"\*\*Title:\*\*\s*(.+)", listing)
short = re.search(r"\*\*Short description:\*\*\s*(.+)", listing)
check(title and len(title.group(1).strip()) <= 75, "listing title missing or over 75 chars")
check(short and len(short.group(1).strip()) <= 132, "listing short description missing or over 132 chars")
for rel in ("store-listing/LISTING.md", "store-listing/PRIVACY_POLICY.md", "README.md"):
    check(DISCLAIMER in read(ROOT / rel), f"missing independence disclaimer in {rel}")
check(DISCLAIMER in read(EXT / "popup.html"), "missing disclaimer in popup")
for rel in ("PRIVACY_QUESTIONNAIRE.md", "ASSETS_CHECKLIST.md", "PUBLISH_CHECKLIST.md", "SUPPORT.md", "CHANGELOG_TEMPLATE.md"):
    check((LISTING / rel).is_file(), f"store-listing/{rel} missing")
check((ROOT / "CHANGELOG.md").is_file() and m["version"] in read(ROOT / "CHANGELOG.md"), "CHANGELOG.md missing the current version")

if errors:
    print("AUDIT FAILED:")
    [print(" -", e) for e in errors]
    sys.exit(1)
print("audit passed")

# 7. package (only the extension folder goes in the zip)
DIST.mkdir(exist_ok=True)
out = DIST / f"driveslide-{m['version']}.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted(EXT.rglob("*")):
        if p.is_file():
            z.write(p, p.relative_to(EXT).as_posix())
print("built", out, out.stat().st_size, "bytes")
