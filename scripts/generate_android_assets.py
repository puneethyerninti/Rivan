from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
ANDROID_RES = ROOT / "frontend" / "android" / "app" / "src" / "main" / "res"

ICON_SOURCE = PUBLIC / "RivanRealtyLogo-icon.png"
SPLASH_SOURCE = PUBLIC / "RivanRealtyLogo-fast.png"

ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

SPLASH_SIZES = {
    "drawable": (1080, 1920),
    "drawable-port-mdpi": (720, 1280),
    "drawable-port-hdpi": (1080, 1920),
    "drawable-port-xhdpi": (1440, 2560),
    "drawable-port-xxhdpi": (1440, 2560),
    "drawable-port-xxxhdpi": (1440, 2560),
    "drawable-land-mdpi": (1280, 720),
    "drawable-land-hdpi": (1920, 1080),
    "drawable-land-xhdpi": (2560, 1440),
    "drawable-land-xxhdpi": (2560, 1440),
    "drawable-land-xxxhdpi": (2560, 1440),
}


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGBA")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    left = (size[0] - image.width) // 2
    top = (size[1] - image.height) // 2
    canvas.alpha_composite(image, (left, top))
    return canvas


def rounded_icon(size: int) -> Image.Image:
    source = Image.open(ICON_SOURCE).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), (246, 250, 244, 255))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, size, size), radius=int(size * 0.22), fill=(246, 250, 244, 255))
    mark = contain(source, (int(size * 0.74), int(size * 0.74)))
    canvas.alpha_composite(mark)
    return canvas


def splash(size: tuple[int, int]) -> Image.Image:
    source = Image.open(SPLASH_SOURCE).convert("RGBA")
    canvas = Image.new("RGB", size, (246, 250, 244))
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    radius = min(size) // 3
    center = (size[0] // 2, int(size[1] * 0.43))
    draw.ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius),
        fill=(223, 239, 217, 110),
    )
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay)
    logo = contain(source, (int(size[0] * 0.48), int(size[1] * 0.28)))
    canvas.alpha_composite(logo)
    return canvas.convert("RGB")


def main() -> None:
    if not ICON_SOURCE.exists() or not SPLASH_SOURCE.exists():
        raise FileNotFoundError("Missing Rivan logo assets in frontend/public")

    for folder, size in ICON_SIZES.items():
        out_dir = ANDROID_RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        icon = rounded_icon(size)
        icon.save(out_dir / "ic_launcher.png")
        icon.save(out_dir / "ic_launcher_round.png")
        icon.save(out_dir / "ic_launcher_foreground.png")

    for folder, size in SPLASH_SIZES.items():
        out_dir = ANDROID_RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        splash(size).save(out_dir / "splash.png", optimize=True)

    print("Generated Rivan Android launcher and splash assets.")


if __name__ == "__main__":
    main()
