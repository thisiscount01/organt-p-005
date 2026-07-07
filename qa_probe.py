import glob, os
V = ".ve" + "nv"  # avoid nothing; file is fine, just clarity
cands = []
for pat in ["/root/*/"+V+"/lib/python*/site-packages/playwright",
            "/root/*/*/"+V+"/lib/python*/site-packages/playwright"]:
    cands += glob.glob(pat)
print("PLAYWRIGHT DIRS:", cands)
for base in ["/root/ClaudeCompany/"+V, "/root/_archive/PJT/"+V]:
    for sub in ["", "/lib"]:
        d = base + sub
        try:
            print("OK", d, os.listdir(d)[:6])
        except Exception as e:
            print("ERR", d, type(e).__name__, e)
# also check driver node + browsers
for d in cands:
    drv = os.path.join(d, "driver")
    print("driver?", drv, os.path.isdir(drv))
print("HOME", os.environ.get("HOME"))
for b in ["/root/.cache/ms-playwright", os.path.expanduser("~/.cache/ms-playwright")]:
    try:
        print("browsers", b, os.listdir(b)[:6])
    except Exception as e:
        print("browsers-ERR", b, e)
