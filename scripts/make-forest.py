# Genera public/backgrounds/bosque.svg: bosque de abetos con niebla (vectorial, sin fotos).
import random

random.seed(7)
W, H = 1600, 1000
FOG, DARK = (226, 232, 227), (16, 44, 30)


def mix(a, b, t):
    return '#%02x%02x%02x' % tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def fir(cx, base, h, w):
    tiers = 7
    right, left = [], []
    for k in range(1, tiers + 1):
        y = base - h + h * k / tiers
        hw = w / 2 * (k / tiers) ** 0.85 * random.uniform(0.85, 1.1)
        inner = hw * 0.5
        right += [(cx + hw, y), (cx + inner, y - h * 0.025)] if k < tiers else [(cx + hw, y)]
        left = ([(cx - inner, y - h * 0.025), (cx - hw, y)] if k < tiers else [(cx - hw, y)]) + left
    pts = [(cx, base - h)] + right + [(cx + 4, base + 60), (cx - 4, base + 60)] + left
    return 'M' + ' '.join(f'{x:.0f} {y:.0f}' for x, y in pts) + 'Z'


LAYERS = 7
out = []
for i in range(LAYERS):
    t = i / (LAYERS - 1)
    color = mix(FOG, DARK, 0.12 + 0.88 * t ** 1.15)
    base = 380 + i * 100
    hmin, hmax = 140 + i * 35, 240 + i * 60
    paths, x = [], -80
    while x < W + 80:
        h = random.uniform(hmin, hmax)
        w = h * random.uniform(0.3, 0.4)
        paths.append(fir(x, base + random.uniform(-50, 50), h, w))
        x += w * random.uniform(0.35, 0.95)
    blur = f' filter="url(#b{i})"' if i < 3 else ''
    out.append(f'<g{blur}><path fill="{color}" d="{" ".join(paths)}"/><rect y="{base + 40}" width="{W}" height="{H}" fill="{color}"/></g>')
    if i < LAYERS - 1:
        # jirones de niebla entre capas
        wisps = ''.join(
            f'<ellipse cx="{random.uniform(0, W):.0f}" cy="{base + random.uniform(-60, 60):.0f}" rx="{random.uniform(160, 380):.0f}" ry="{random.uniform(30, 70):.0f}"/>'
            for _ in range(7)
        )
        out.append(f'<g fill="#f2f5f1" opacity="{0.75 - 0.08 * i:.2f}" filter="url(#fog)">{wisps}</g>')

defs = ''.join(f'<filter id="b{i}" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="{3 - i}"/></filter>' for i in range(3))
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice"><defs>'
    '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f5f1"/><stop offset="1" stop-color="#dfe6e0"/></linearGradient>'
    '<filter id="fog" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="28"/></filter>'
    f'{defs}</defs><rect width="{W}" height="{H}" fill="url(#s)"/>{"".join(out)}</svg>'
)
open('public/backgrounds/bosque.svg', 'w').write(svg)
print(len(svg), 'bytes')
