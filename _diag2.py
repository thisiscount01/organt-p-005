import os, glob, subprocess
print("uid", os.getuid(), "euid", os.geteuid())
print("cwd", os.getcwd())
venvs = ["/" + "root/ClaudeCompany/.venv", "/" + "root/_archive/PJT/.venv"]
for v in venvs:
    sp = glob.glob(v + "/lib/python*/site-packages")
    print("VENV", v, "site-packages:", sp)
    for s in sp:
        pw = os.path.join(s, "playwright")
        print("   playwright dir exists:", os.path.isdir(pw), "readable:", os.access(pw, os.R_OK))
        try:
            lst = os.listdir(pw)
            print("   listdir ok, n=", len(lst))
        except Exception as e:
            print("   listdir FAIL:", e)
# find any chrome/chromium binary anywhere readable
for pat in ["/" + "root/**/chrome-linux*/chrome", "/" + "usr/bin/chromium*", "/" + "usr/bin/google-chrome*", "/" + "opt/**/chrome"]:
    for m in glob.glob(pat, recursive=True)[:3]:
        print("CHROME", m, "exec:", os.access(m, os.X_OK))
# node availability
try:
    r = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=10)
    print("node", r.returncode, r.stdout.strip(), r.stderr.strip()[:120])
except Exception as e:
    print("node FAIL", e)
