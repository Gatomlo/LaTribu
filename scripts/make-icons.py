# Génère les icônes d'installation (PNG) à partir du dessin de public/icon.svg : une maison blanche
# sur fond violet dégradé. Usage : python scripts/make-icons.py   (Pillow requis)
import os
from PIL import Image, ImageDraw

C1, C2 = (109, 94, 252), (167, 139, 250)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public')


def gradient(size):
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(C1, C2)) + (255,)
    return img


def house(d, S, scale, fill, hole):
    # Dessin sur une grille de 64 : toit, corps, porte ; mis à l'échelle autour du centre.
    def p(x, y):
        return (S / 2 + (x - 32) * S / 64 * scale, S / 2 + (y - 32) * S / 64 * scale)
    d.polygon([p(32, 11), p(9, 32), p(55, 32)], fill=fill)
    d.rectangle([p(16, 31), p(48, 53)], fill=fill)
    d.rectangle([p(27, 38), p(37, 53)], fill=hole)


def draw(size, full_bleed, glyph=1.0, badge=False):
    k = 4  # sur-échantillonnage pour lisser les bords
    S = size * k
    if badge:  # silhouette blanche sur fond transparent (petite icône de notification Android)
        img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        house(ImageDraw.Draw(img), S, glyph, (255, 255, 255, 255), (0, 0, 0, 0))
    else:
        img = gradient(S)
        if not full_bleed:
            mask = Image.new('L', (S, S), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 14 / 64, fill=255)
            img.putalpha(mask)
        house(ImageDraw.Draw(img), S, glyph, (255, 255, 255, 255), (139, 123, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


# ---------- Icônes de notification : une par type d'événement, même famille que l'icône de l'app ----------
TONES = {  # type : (couleur haut-gauche, couleur bas-droite)
    'reminder': ((109, 94, 252), (167, 139, 250)),   # rappel de tâche
    'ok': ((18, 163, 106), (61, 214, 140)),          # mission validée
    'reward': ((245, 158, 11), (251, 191, 36)),      # récompense : demande, remise
    'review': ((59, 130, 246), (99, 102, 241)),      # à valider (parents)
    'alert': ((239, 68, 68), (249, 115, 22)),        # refus, à refaire
}


def tile(S, c1, c2):
    img = Image.new('RGBA', (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * (S - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(c1, c2)) + (255,)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 14 / 64, fill=255)
    img.putalpha(mask)
    return img


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
        for i, y in enumerate((18, 32, 46)):
            d.ellipse([*P(12, y - 4), *P(20, y + 4)], fill=ink)
            d.rounded_rectangle([*P(26, y - 3), *P(52, y + 3)], radius=3 * u, fill=ink)
    elif kind == 'alert':       # point d'exclamation
        d.rounded_rectangle([*P(27, 12), *P(37, 40)], radius=5 * u, fill=ink)
        d.ellipse([*P(26, 45), *P(38, 57)], fill=ink)


def notif_icon(kind, size=192):
    k = 4
    S = size * k
    c1, c2 = TONES[kind]
    img = tile(S, c1, c2)
    glyph(kind, ImageDraw.Draw(img), S, (255, 255, 255, 255), c2 + (255,))
    return img.resize((size, size), Image.LANCZOS)


for kind in TONES:
    notif_icon(kind).save(os.path.join(OUT, f'notif-{kind}.png'))
draw(32, False).save(os.path.join(OUT, 'favicon-32.png'))

draw(192, False).save(os.path.join(OUT, 'icon-192.png'))
draw(512, False).save(os.path.join(OUT, 'icon-512.png'))
draw(512, True, 0.72).save(os.path.join(OUT, 'icon-maskable-512.png'))  # zone sûre : le motif reste au centre
draw(180, True, 0.8).save(os.path.join(OUT, 'apple-touch-icon.png'))
draw(96, False, 1.0, badge=True).save(os.path.join(OUT, 'badge-96.png'))
print('icônes générées dans', os.path.abspath(OUT))
