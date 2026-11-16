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


draw(192, False).save(os.path.join(OUT, 'icon-192.png'))
draw(512, False).save(os.path.join(OUT, 'icon-512.png'))
draw(512, True, 0.72).save(os.path.join(OUT, 'icon-maskable-512.png'))  # zone sûre : le motif reste au centre
draw(180, True, 0.8).save(os.path.join(OUT, 'apple-touch-icon.png'))
draw(96, False, 1.0, badge=True).save(os.path.join(OUT, 'badge-96.png'))
print('icônes générées dans', os.path.abspath(OUT))
