# Génère toutes les icônes de l'app dans public/ : icône « la tribu » (trois bouilles souriantes sur un
# dégradé), versions d'installation PNG, favicon, silhouette monochrome (barre d'état Android), icon.svg,
# et une icône par type de notification.  Usage : python scripts/make-icons.py   (Pillow requis)
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
BG = [(0, (109, 94, 252)), (0.55, (217, 70, 239)), (1, (255, 140, 66))]   # violet -> rose -> orange
INK = (60, 30, 90, 255)
BLUSH = (255, 150, 170, 255)
WHITE = (255, 255, 255, 255)
# La tribu : (x, y, rayon, couleur), dessinées de l'arrière vers l'avant sur une grille de 64.
FACES = [(19, 38, 11, (45, 212, 191, 255)), (45, 38, 11, (56, 189, 248, 255)), (32, 31, 15, (255, 210, 63, 255))]
SPARKLES = [(50, 13, 7, WHITE), (13, 17, 4, (255, 255, 255, 220))]


def gradient(size, stops):
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x * 0.4 + y * 0.6) / size
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t <= t1:
                    k = (t - t0) / (t1 - t0)
                    px[x, y] = tuple(round(a + (b - a) * k) for a, b in zip(c0, c1)) + (255,)
                    break
            else:
                px[x, y] = stops[-1][1] + (255,)
    return img


def rounded(img, radius_ratio=14 / 64):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=img.size[0] * radius_ratio, fill=255)
    img.putalpha(mask)
    return img


def sparkle_pts(cx, cy, r):
    return [(cx + (r if i % 2 == 0 else r * 0.32) * math.cos(math.pi / 4 * i - math.pi / 2),
             cy + (r if i % 2 == 0 else r * 0.32) * math.sin(math.pi / 4 * i - math.pi / 2)) for i in range(8)]


def tribe(d, S, scale=1.0, badge=False):
    """Dessine la tribu sur un canevas de S pixels. badge : silhouette blanche, traits en creux."""
    u = S / 64 * scale
    P = lambda x, y: (S / 2 + (x - 32) * u, S / 2 + (y - 32) * u)

    def disc(cx, cy, r, fill):
        x, y = P(cx, cy)
        d.ellipse([x - r * u, y - r * u, x + r * u, y + r * u], fill=fill)

    for cx, cy, r, color in FACES:
        feature = (0, 0, 0, 0) if badge else INK
        if not badge:
            disc(cx, cy, r + 1.6, WHITE)               # contour blanc
        disc(cx, cy, r, WHITE if badge else color)
        disc(cx - r * 0.36, cy - r * 0.15, r * 0.12, feature)
        disc(cx + r * 0.36, cy - r * 0.15, r * 0.12, feature)
        (x0, y0), (x1, y1) = P(cx - r * 0.5, cy - r * 0.35), P(cx + r * 0.5, cy + r * 0.55)
        d.arc([x0, y0, x1, y1], 25, 155, fill=feature, width=round(max(1.6, r * 0.14) * u))
        if not badge:
            disc(cx - r * 0.62, cy + r * 0.28, r * 0.15, BLUSH)
            disc(cx + r * 0.62, cy + r * 0.28, r * 0.15, BLUSH)
    for cx, cy, r, color in SPARKLES:
        d.polygon([P(x, y) for x, y in sparkle_pts(cx, cy, r)], fill=WHITE if badge else color)


def app_icon(size, full_bleed=False, scale=1.0, badge=False):
    k = 4  # sur-échantillonnage pour lisser les bords
    S = size * k
    if badge:
        img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    else:
        img = gradient(size, BG).resize((S, S), Image.BILINEAR)
        if not full_bleed:
            rounded(img)
    tribe(ImageDraw.Draw(img), S, scale, badge)
    return img.resize((size, size), Image.LANCZOS)


def write_svg(path):
    """Même dessin en SVG (icône « any » du manifeste et favicon vectoriel)."""
    el = []
    for cx, cy, r, color in FACES:
        col = '#%02x%02x%02x' % color[:3]
        rx, ry, cy2 = r * 0.5, r * 0.45, cy + r * 0.1
        a1, a2 = math.radians(25), math.radians(155)
        smile = f'M{cx + rx * math.cos(a1):.2f} {cy2 + ry * math.sin(a1):.2f}A{rx:.2f} {ry:.2f} 0 0 1 {cx + rx * math.cos(a2):.2f} {cy2 + ry * math.sin(a2):.2f}'
        el += [f'<circle cx="{cx}" cy="{cy}" r="{r + 1.6}" fill="#fff"/>', f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/>',
               f'<circle cx="{cx - r * 0.36:.2f}" cy="{cy - r * 0.15:.2f}" r="{r * 0.12:.2f}" fill="#3c1e5a"/>',
               f'<circle cx="{cx + r * 0.36:.2f}" cy="{cy - r * 0.15:.2f}" r="{r * 0.12:.2f}" fill="#3c1e5a"/>',
               f'<path d="{smile}" fill="none" stroke="#3c1e5a" stroke-width="{max(1.6, r * 0.14):.2f}"/>',
               f'<circle cx="{cx - r * 0.62:.2f}" cy="{cy + r * 0.28:.2f}" r="{r * 0.15:.2f}" fill="#ff96aa"/>',
               f'<circle cx="{cx + r * 0.62:.2f}" cy="{cy + r * 0.28:.2f}" r="{r * 0.15:.2f}" fill="#ff96aa"/>']
    for cx, cy, r, color in SPARKLES:
        pts = ' '.join(f'{x:.2f},{y:.2f}' for x, y in sparkle_pts(cx, cy, r))
        opacity = '' if color[3] == 255 else ' fill-opacity=".86"'
        el.append(f'<polygon points="{pts}" fill="#fff"{opacity}/>')
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
           '  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset=".55" stop-color="#d946ef"/><stop offset="1" stop-color="#ff8c42"/></linearGradient></defs>\n'
           '  <rect width="64" height="64" rx="14" fill="url(#g)"/>\n  ' + '\n  '.join(el) + '\n</svg>\n')
    open(path, 'w', encoding='utf-8').write(svg)


# ---------- Icônes de notification : une par type d'événement, même famille de couleurs ----------
TONES = {  # type : (couleur haut-gauche, couleur bas-droite)
    'reminder': ((109, 94, 252), (167, 139, 250)),   # rappel de tâche
    'ok': ((18, 163, 106), (61, 214, 140)),          # mission validée
    'reward': ((245, 158, 11), (251, 191, 36)),      # récompense : demande, remise
    'review': ((59, 130, 246), (99, 102, 241)),      # à valider (parents)
    'alert': ((239, 68, 68), (249, 115, 22)),        # refus, à refaire
}


def glyph(kind, d, S, ink, bg):
    u = S / 64
    P = lambda x, y: (x * u, y * u)
    if kind == 'reminder':      # cloche
        d.ellipse([*P(20, 14), *P(44, 38)], fill=ink)
        d.polygon([P(20, 26), P(44, 26), P(50, 44), P(14, 44)], fill=ink)
        d.rounded_rectangle([*P(12, 42), *P(52, 48)], radius=3 * u, fill=ink)
        d.ellipse([*P(27, 47), *P(37, 55)], fill=ink)
        d.ellipse([*P(29, 8), *P(35, 14)], fill=ink)
    elif kind == 'ok':          # coche
        d.line([P(15, 34), P(27, 46), P(49, 20)], fill=ink, width=round(8 * u), joint='curve')
        for x, y in (P(15, 34), P(27, 46), P(49, 20)):
            d.ellipse([x - 4 * u, y - 4 * u, x + 4 * u, y + 4 * u], fill=ink)
    elif kind == 'reward':      # cadeau
        d.rectangle([*P(14, 28), *P(50, 52)], fill=ink)
        d.rectangle([*P(11, 22), *P(53, 30)], fill=ink)
        d.rectangle([*P(29, 22), *P(35, 52)], fill=bg)
        d.ellipse([*P(19, 10), *P(32, 22)], outline=ink, width=round(4 * u))
        d.ellipse([*P(32, 10), *P(45, 22)], outline=ink, width=round(4 * u))
    elif kind == 'review':      # liste à cocher
        for y in (18, 32, 46):
            d.ellipse([*P(12, y - 4), *P(20, y + 4)], fill=ink)
            d.rounded_rectangle([*P(26, y - 3), *P(52, y + 3)], radius=3 * u, fill=ink)
    elif kind == 'alert':       # point d'exclamation
        d.rounded_rectangle([*P(27, 12), *P(37, 40)], radius=5 * u, fill=ink)
        d.ellipse([*P(26, 45), *P(38, 57)], fill=ink)


def notif_icon(kind, size=192):
    k = 4
    S = size * k
    c1, c2 = TONES[kind]
    img = rounded(gradient(size, [(0, c1), (1, c2)]).resize((S, S), Image.BILINEAR))
    glyph(kind, ImageDraw.Draw(img), S, WHITE, c2 + (255,))
    return img.resize((size, size), Image.LANCZOS)


app_icon(192).save(os.path.join(OUT, 'icon-192.png'))
app_icon(512).save(os.path.join(OUT, 'icon-512.png'))
app_icon(512, True, 0.78).save(os.path.join(OUT, 'icon-maskable-512.png'))  # zone sûre : le motif reste au centre
app_icon(180, True, 0.86).save(os.path.join(OUT, 'apple-touch-icon.png'))
app_icon(48).resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, 'favicon-32.png'))
app_icon(96, badge=True).save(os.path.join(OUT, 'badge-96.png'))
write_svg(os.path.join(OUT, 'icon.svg'))
for kind in TONES:
    notif_icon(kind).save(os.path.join(OUT, f'notif-{kind}.png'))
print('icônes générées dans', os.path.abspath(OUT))
