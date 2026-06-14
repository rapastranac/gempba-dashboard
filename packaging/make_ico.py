"""Build a multi-size Windows .ico from a source PNG.

Used by the release workflow's Windows job; jpackage on Windows accepts only
.ico, so the branding PNG is converted on the fly. Requires Pillow.
"""
import sys

from PIL import Image

if len(sys.argv) != 3:
    raise SystemExit("usage: make_ico.py <source.png> <out.ico>")

source, out = sys.argv[1], sys.argv[2]
Image.open(source).save(out, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
