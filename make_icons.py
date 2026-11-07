from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).parent / "dist"
for size in (180, 192, 512):
    scale = size / 512
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    def point(x, y):
        return (round(x * scale), round(y * scale))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(112 * scale), fill="#101b29")
    draw.line([point(119, 340), point(393, 340)], fill="#d9e9e4", width=round(24 * scale), joint="curve")
    draw.line([point(148, 300), point(249, 201), point(316, 259), point(376, 174)], fill="#99dfc7", width=round(30 * scale), joint="curve")
    draw.line([point(320, 174), point(376, 174), point(376, 230)], fill="#99dfc7", width=round(30 * scale), joint="curve")
    image.save(out / f"icon-{size}.png")
