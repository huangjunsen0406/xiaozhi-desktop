#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Usage
-----
python tools/gen_tray_icons.py \
  --input resources/icon.png \
  --out resources/tray

Outputs
- macOS template icons: iconTemplate.png (18x18), iconTemplate@2x.png (36x36)
- Windows ICO (multi-size): icon.ico (16/20/24/32/48/64/256)
- Linux PNGs: icon-24.png, icon-32.png

Notes
- Template PNG 将是白色前景+透明背景，适配 Electron image.setTemplateImage(true)
- 源图若非正方形，会被居中裁切为正方形（保持最大内切），并保留透明像素
"""

import argparse
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image, ImageOps, ImageChops


def read_image(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    return img


def center_square_rgba(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w == h:
        return img
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    right = left + side
    bottom = top + side
    return img.crop((left, top, right, bottom))


def resize_rgba(img: Image.Image, size: Tuple[int, int]) -> Image.Image:
    return img.resize(size, Image.LANCZOS)


def to_template_white(img: Image.Image, thresh: int = 180) -> Image.Image:
    """转为模板图标：白色前景 + 透明背景。
    - 使用亮度阈值 + 原 Alpha 共同确定前景
    - 结果适用于 setTemplateImage(true)
    """
    rgba = img.convert("RGBA")
    r, g, b, a = rgba.split()
    gray = ImageOps.grayscale(rgba)
    # 自动对比度提升，让蓝色 Logo 变得更分明
    gray = ImageOps.autocontrast(gray)
    # 阈值 -> 前景遮罩（0 或 255）
    mask_l = gray.point(lambda p: 255 if p >= thresh else 0)
    alpha_mask = a.point(lambda p: 255 if p > 0 else 0)
    # 兼容性更好的合并方式：用 multiply 实现 AND（0/255 情况下等价）
    mask = ImageChops.multiply(mask_l, alpha_mask)
    # 组装白色前景
    out = Image.new("RGBA", rgba.size, (255, 255, 255, 0))
    white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    out.paste(white, (0, 0), mask)
    return out


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG")
    print(f"✔ PNG  -> {path}")


def save_multi_size_ico(src_rgba: Image.Image, sizes: Iterable[int], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Pillow 支持从单图生成多尺寸 ICO
    base = src_rgba.convert("RGBA")
    size_list = [(s, s) for s in sizes]
    base.save(path, format="ICO", sizes=size_list)
    print(f"✔ ICO  -> {path} [{', '.join(map(str, sizes))}]")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="resources/icon.png", help="源图路径，建议 512x512 以上 PNG")
    parser.add_argument("--out", default="resources/tray", help="输出目录")
    parser.add_argument("--snap", type=int, default=18, help="macOS 模板基准 pt（默认 18）")
    args = parser.parse_args()

    src_path = Path(args.input)
    out_dir = Path(args.out)

    if not src_path.exists():
        raise SystemExit(f"✘ 源图不存在: {src_path}")

    src = read_image(src_path)
    src_sq = center_square_rgba(src)

    # macOS 模板图标（18pt & 36pt）
    base_pt = max(12, args.snap)
    mac_1x = resize_rgba(src_sq, (base_pt, base_pt))
    mac_2x = resize_rgba(src_sq, (base_pt * 2, base_pt * 2))

    tpl_1x = to_template_white(mac_1x)
    tpl_2x = to_template_white(mac_2x)

    save_png(tpl_1x, out_dir / "iconTemplate.png")
    save_png(tpl_2x, out_dir / "iconTemplate@2x.png")

    # Linux 常用 PNG（24/32）
    for sz in (24, 32):
        png_img = resize_rgba(src_sq, (sz, sz))
        save_png(png_img, out_dir / f"icon-{sz}.png")

    # Windows ICO（多尺寸）
    ico_sizes = [16, 20, 24, 32, 48, 64, 256]
    save_multi_size_ico(src_sq, ico_sizes, out_dir / "icon.ico")

    print("\n全部生成完成。将下列文件按平台配置到 Tray：")
    print(f"- macOS: {out_dir/'iconTemplate.png'}, {out_dir/'iconTemplate@2x.png'}")
    print(f"- Windows: {out_dir/'icon.ico'}")
    print(f"- Linux: {out_dir/'icon-24.png'} 或 {out_dir/'icon-32.png'}")


if __name__ == "__main__":
    main()
