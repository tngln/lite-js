## 2026-01-04 #1

- orig/lite/src/renderer.h → src/platform/renderer.ts
- orig/lite/src/renderer.c → src/platform/renderer.ts

## 2026-01-04 #2

- orig/lite/src/rencache.h → src/platform/rencache.ts
- orig/lite/src/rencache.c → src/platform/rencache.ts
- src/main.ts（添加 rencache 动态演示）

## 2026-01-04 #3

- orig/lite/src/api/system.c → src/platform/api/system.ts
- src/platform/filesystem.ts（dummy 文件系统）
- src/main.ts（添加 system 事件/文件系统演示）
- 为了目录结构清楚，现在 src/platform/api 的所有内容被移动到 src/api/
