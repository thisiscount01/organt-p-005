def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
def L(hexs):
    h = hexs.lstrip('#'); r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
def ratio(fg, bg):
    a, b = L(fg), L(bg); hi, lo = max(a, b), min(a, b)
    return round((hi + 0.05) / (lo + 0.05), 2)
bgs = {'surface': '#0D1117', 'bytecode': '#0B0E15', 'interpreter': '#0A0C12',
       'memory': '#08090D', 'code-bg': '#12161F'}
fgs = {'text-primary': '#E6EDF3', 'text-secondary': '#9DA7B3', 'text-tertiary': '#6E7A88',
       'accent(mint)': '#5EEAD4', 'accent-alt(cyan)': '#56D4DD', 'accent-amber': '#F2C55C',
       'kw': '#C792EA', 'str': '#7FDB8A', 'num': '#F78C6C', 'comment': '#6E7A88', 'func': '#82AAFF'}
for bn, bg in bgs.items():
    print(f'\n== on {bn} {bg} ==')
    for fn, fg in fgs.items():
        r = ratio(fg, bg)
        tag = 'AAA' if r >= 7 else ('AA' if r >= 4.5 else ('AA-large' if r >= 3 else 'FAIL'))
        print(f'  {fn:18} {fg}  {r:5}  {tag}')
