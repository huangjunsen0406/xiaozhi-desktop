#!/bin/bash
# 修复 sherpa-onnx-node 在 macOS 上的动态库加载问题
# 将 @rpath 改为 @loader_path，使其从自己所在目录加载依赖

set -e

# 查找 sherpa-onnx-darwin-arm64 包的路径
SHERPA_DIR=$(find node_modules/.pnpm -type d -name "sherpa-onnx-darwin-arm64" | head -1)

if [ -z "$SHERPA_DIR" ]; then
  echo "错误: 未找到 sherpa-onnx-darwin-arm64 包"
  exit 1
fi

echo "找到 sherpa-onnx-darwin-arm64: $SHERPA_DIR"

NODE_FILE="$SHERPA_DIR/sherpa-onnx.node"
C_API_DYLIB="$SHERPA_DIR/libsherpa-onnx-c-api.dylib"
ONNX_DYLIB="$SHERPA_DIR/libonnxruntime.1.17.1.dylib"

# 检查文件是否存在
if [ ! -f "$NODE_FILE" ]; then
  echo "错误: sherpa-onnx.node 不存在"
  exit 1
fi

echo "开始修复动态库路径..."

# 修改 sherpa-onnx.node 的依赖路径
install_name_tool \
  -change @rpath/libsherpa-onnx-c-api.dylib @loader_path/libsherpa-onnx-c-api.dylib \
  -change @rpath/libonnxruntime.1.17.1.dylib @loader_path/libonnxruntime.1.17.1.dylib \
  "$NODE_FILE"

echo "✓ 修改 sherpa-onnx.node 依赖路径完成"

# 修改 libsherpa-onnx-c-api.dylib 的 ID（如果存在）
if [ -f "$C_API_DYLIB" ]; then
  install_name_tool \
    -id @loader_path/libsherpa-onnx-c-api.dylib \
    "$C_API_DYLIB"
  echo "✓ 修改 libsherpa-onnx-c-api.dylib ID 完成"
fi

# 修改 libonnxruntime.1.17.1.dylib 的 ID（如果存在）
if [ -f "$ONNX_DYLIB" ]; then
  install_name_tool \
    -id @loader_path/libonnxruntime.1.17.1.dylib \
    "$ONNX_DYLIB"
  echo "✓ 修改 libonnxruntime.1.17.1.dylib ID 完成"
fi

echo ""
echo "验证修复结果:"
otool -L "$NODE_FILE"

echo ""
echo "✅ sherpa-onnx rpath 修复完成！"
echo "现在可以重启应用测试唤醒词功能。"
