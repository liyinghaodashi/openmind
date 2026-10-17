# MindNode 白色主节点验证

2026-10-12：仅修改 MindNode 独立 CSS，主节点采用白底深色文字、居中标题、16px 圆角和轻微阴影；选中及拖入反馈保留白底，颜色以底部细色色带显示。编辑框同步居中并使用深色文字。节点尺寸测量和 processon 文件未修改。

## 验证结果

- 前端逻辑测试：74 项通过。
- Go race 检查：通过。
- 真实文档服务与原生 WebKit 功能检查：420 项通过。
- MindNode 节点交互检查：256 项通过，包含选择、编辑、方向键、插入、输入法和延迟保存。
- 两种风格光标检查：各 144 项通过，覆盖根节点、缩放、混合文本、选择及输入法。
- MindNode 搜索检查：40 项通过。
- 浏览器确认：白色背景、深色文字、居中标题、透明边框、阴影、选中轮廓及折叠数字。

本轮合计 1004 项原生 WebKit 检查。截图位于本目录：`overview.png`、`detail.png`、`folded-selected.png`。

## 打包

`sh scripts/build-macos.sh` 构建成功；macOS arm64 应用的严格签名验证和 ZIP 完整性验证通过。确认新 CSS 已嵌入可执行文件，压缩包内可执行文件与本次构建字节一致。

产物：`build/bin/OpenMind.app`、`build/bin/OpenMind-macOS-arm64.zip`。
ZIP SHA-256：`447dbb3f3c06f9af240cb71c2742df54ab5c923f72d39514e1fb0d20871d7f4b`。
