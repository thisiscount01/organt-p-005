import re
css = open("public/tokens.css", encoding="utf-8").read()
def hexs(name):
    m = re.search(r'--%s:\s*(#[0-9A-Fa-f]{6})' % re.escape(name), css)
    return m.group(1) if m else None
def rgb(h):
    h=h.lstrip("#"); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lin(c):
    c/=255; return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def L(h):
    r,g,b=rgb(h); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def ratio(fg,bg):
    a,b=L(fg),L(bg); hi,lo=max(a,b),min(a,b); return (hi+0.05)/(lo+0.05)
pairs = [
 ("text-primary","bg-surface"),("text-secondary","bg-surface"),("text-tertiary","bg-surface"),
 ("text-tertiary","bg-memory"),("text-tertiary","bg-interpreter"),
 ("accent","bg-surface"),("accent","bg-memory"),
 ("text-secondary","surface-raised"),("code-func","surface-raised"),("code-str","surface-raised"),
]
print("=== WCAG contrast (computed from live tokens.css) ===")
worst=99
for fg,bg in pairs:
    r=ratio(hexs(fg),hexs(bg))
    tag = "AAA" if r>=7 else ("AA" if r>=4.5 else ("AA-large" if r>=3 else "FAIL"))
    print(f"  {fg:14s} on {bg:14s}: {r:5.2f}:1  {tag}")
    worst=min(worst,r)
print(f"WORST_NORMAL {worst:.2f} (AA needs >=4.5) ->", "OK" if worst>=4.5 else "SOME_BELOW_AA")
