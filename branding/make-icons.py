import io, os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image, ImageDraw

src = r"C:\Users\andres\OneDrive\Pictures\favicon.svg"
outdir = r"D:\repos\gempba-dashboard\src\main\resources\icons"
os.makedirs(outdir, exist_ok=True)
sizes = [16, 32, 48, 64, 128, 256]

for sz in sizes:
    d = svg2rlg(src)
    s = sz / d.width
    d.scale(s, s)
    d.width = d.height = sz
    png = renderPM.drawToString(d, fmt="PNG", bg=0xFFFFFF)
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    # Knock out the exterior white (outside the circle) to transparent by
    # flooding from the 4 corners; the interior white gem is enclosed by teal
    # so it is untouched.
    for seed in [(0, 0), (sz-1, 0), (0, sz-1), (sz-1, sz-1)]:
        ImageDraw.floodfill(im, seed, (0, 0, 0, 0), thresh=100)
    im.save(os.path.join(outdir, f"dashboard-{sz}.png"))
    print("wrote", sz)
