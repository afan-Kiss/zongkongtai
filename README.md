# 珠宝本地总控工作台

本地项目、Git、端口、终端管理 — **纯本地工具**，无需账号、密码、Token 或云端连接。

## 功能

1. **本地项目管理** — 扫描 `E:\我的软件源码` 下的 `zhubo-control.manifest.json`
2. **项目启停** — 仅使用 manifest 声明的启动命令；识别外部已运行项目
3. **Git 一键上传** — 基于本地路径（总览 Git 需手动检查）
4. **端口冲突处理** — 本地端口扫描与安全处理
5. **终端管理** — 内置多项目终端
6. **Web 页面快捷入口** — 打开各项目本地 Web 地址
7. **简单体检** — 纯本地检查，不含云端/Cookie

**Cookie 由千帆中转机器人项目独立处理。** 总控不保存、不上传、不显示 Cookie。

千帆中转机器人在总控里只是一张普通项目卡片：可启动/停止、打开目录、Git 上传。

## 启动

打包后打开：

```
apps/control-desktop/dist-desktop-pack-current/win-unpacked/珠宝本地总控工作台.exe
```

开发模式：

```bash
npm run dev:desktop
```

## 打包

```bash
npm run pack:desktop:clean
```

## 常用命令

```bash
npm run format
npm run check
npm run build:desktop
npm run control:acceptance-final-local-clean
npm run control:acceptance-minimal-local
npm run pack:desktop:clean
```

## 目录结构

```
apps/control-desktop/     # 桌面 EXE（主产品）
packages/control-shared/  # 共享类型与 manifest 工具
archive/cloud-control/    # 已归档的云端总控代码（不参与日常构建）
```
