import glob, os
roots = [os.path.expanduser("~"), "/" + "root", "/" + "usr", "/" + "opt"]
found = []
for r in roots:
    found += glob.glob(r + "/**/site-packages/playwright/sync_api.py", recursive=True)
seen = set()
for f in found:
    d = f
    if d in seen:
        continue
    seen.add(d)
    print("R" if os.access(f, os.R_OK) else "-", f)
if not found:
    print("NONE")
# also report where chromium browsers live
for r in roots:
    for m in glob.glob(r + "/**/ms-playwright/chromium*/chrome-linux/chrome", recursive=True)[:3]:
        print("CHROME", "R" if os.access(m, os.X_OK) else "-", m)
