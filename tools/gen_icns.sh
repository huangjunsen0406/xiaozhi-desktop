#!/usr/bin/env bash
# 生成 macOS 应用图标 .icns（需要在 macOS 上运行）
# 用法：
#   bash tools/gen_icns.sh resources/icon.png build/icon.icns
set -euo pipefail

INPUT_PATH=${1:-}
OUTPUT_PATH=${2:-}

if [[ -z "$INPUT_PATH" || -z "$OUTPUT_PATH" ]]; then
  echo "用法: bash tools/gen_icns.sh <输入PNG> <输出ICNS>"
  echo "例如: bash tools/gen_icns.sh resources/icon.png build/icon.icns"
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "✘ 未找到 sips，请在 macOS 上运行。"
  exit 1
fi
if ! command -v iconutil >/dev/null 2>&1; then
  echo "✘ 未找到 iconutil，请在 macOS 上运行。"
  exit 1
fi

INPUT_ABS=$(cd "$(dirname "$INPUT_PATH")" && pwd)/"$(basename "$INPUT_PATH")"
OUTPUT_ABS=$(cd "$(dirname "$OUTPUT_PATH")" && pwd)/"$(basename "$OUTPUT_PATH")"

TMP_DIR=$(mktemp -d)
ICONSET_DIR="$TMP_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

# 生成各尺寸（Apple 推荐集合）
# 16, 32, 128, 256, 512 的 1x 与 2x（后者等于下一档 1x 尺寸）
function gen() {
  local size=$1
  local name=$2
  sips -z "$size" "$size" "$INPUT_ABS" --out "$ICONSET_DIR/$name"
}

echo "→ 生成 iconset..."
# 16
gen 16  icon_16x16.png
gen 32  icon_16x16@2x.png
# 32
gen 32  icon_32x32.png
gen 64  icon_32x32@2x.png
# 128
gen 128 icon_128x128.png
gen 256 icon_128x128@2x.png
# 256
gen 256 icon_256x256.png
gen 512 icon_256x256@2x.png
# 512
gen 512   icon_512x512.png
gen 1024  icon_512x512@2x.png

echo "→ 打包 icns..."
mkdir -p "$(dirname "$OUTPUT_ABS")"
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ABS"

echo "✔ 生成完成: $OUTPUT_ABS"
rm -rf "$TMP_DIR"
