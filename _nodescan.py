import glob, os, subprocess
# global node modules
try:
    r = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=15)
    print("npm root -g:", r.stdout.strip(), r.stderr.strip()[:80])
except Exception as e:
    print("npm FAIL", e)
# search for playwright / puppeteer node packages readable
pats = [
  os.path.expanduser("~") + "/**/node_modules/playwright-core/package.json",
  "/" + "usr/**/node_modules/playwright*/package.json",
  "/" + "usr/lib/node_modules/**/package.json",
]
hits = []
for p in pats:
    hits += glob.glob(p, recursive=True)
for h in hits[:20]:
    print("NODEPKG", "R" if os.access(h, os.R_OK) else "-", h)
# any chromium anywhere the user can execute
for pat in ["/" + "usr/bin/chromium-browser", "/" + "usr/bin/chromium", "/" + "usr/bin/google-chrome",
            "/" + "snap/bin/chromium", "/" + "usr/lib/chromium*/chrome"]:
    for m in glob.glob(pat):
        print("CHROME", m, "exec:", os.access(m, os.X_OK))
# broad ms-playwright cache under /tmp or home
for m in glob.glob("/" + "tmp/**/chrome-linux/chrome", recursive=True)[:5]:
    print("TMPCHROME", m, os.access(m, os.X_OK))
print("done")
