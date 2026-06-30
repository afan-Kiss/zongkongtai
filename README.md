# 珠宝本地总控工作台

本地项目、Git、端口、Cookie、终端管理 — 纯本地单机版，无需云端登录。

## 功能

1. **本地项目管理** — 扫描 `E:\我的软件源码` 下的 `zhubo-control.manifest.json`
2. **Git 一键上传** — 基于本地路径，无需联网账号
3. **端口冲突处理** — 本地端口扫描与安全处理
4. **千帆 Cookie 本地同步** — 千帆客服台 → 千帆中转机器人 → 本地 Cookie 中心
5. **终端管理** — 内置多项目终端
6. **Web 页面快捷入口** — 打开各项目本地 Web 地址

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

## 本地 Cookie 中心

- 存储位置：`%APPDATA%\ZhuboDesktopControl\cookie-store.json`（加密保存）
- 千帆中转机器人地址：`http://127.0.0.1:9323`
- 本地读取 API：`http://127.0.0.1:4793/api/local-cookies/resolve?platform=qianfan&shopName=店铺名`

其他本地项目可通过 `@zhubo/control-client` 的 `createLocalControlClient()` 读取 Cookie。

## 常用命令

```bash
npm run format
npm run check
npm run build:desktop
npm run control:acceptance-local-only
npm run pack:desktop:clean
```

## 目录结构

```
apps/control-desktop/     # 桌面 EXE（主产品）
packages/control-shared/  # 共享类型与 manifest 工具
packages/control-client/  # 本地 Cookie SDK
archive/cloud-control/    # 已归档的云端总控代码（不参与日常构建）
```
