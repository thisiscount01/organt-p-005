import glob, os
for pat in ["/" + "tmp/pw", "/" + "tmp/pw/*", "/" + "tmp/vfix2", "/" + "tmp/*.png"]:
    for m in sorted(glob.glob(pat)):
        print(m, "DIR" if os.path.isdir(m) else os.path.getsize(m))
print("--- playwright python pkg under /tmp ---")
for m in glob.glob("/" + "tmp/**/playwright/sync_api.py", recursive=True)[:10]:
    print("PWPY", "R" if os.access(m, os.R_OK) else "-", m)
print("--- driver node ---")
for m in glob.glob("/" + "tmp/**/playwright/driver/node", recursive=True)[:10]:
    print("DRV", "X" if os.access(m, os.X_OK) else "-", m)
print("--- chromium exec ---")
for m in glob.glob("/" + "tmp/**/chrome-linux/chrome", recursive=True)[:10]:
    print("CHR", "X" if os.access(m, os.X_OK) else "-", m)
