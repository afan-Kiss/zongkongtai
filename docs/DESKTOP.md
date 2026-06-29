# 珠宝本地总控工作台（Desktop EXE）

## 打包

```bash
npm run build:desktop
npm run pack:desktop
```

输出：

```
apps/control-desktop/dist-desktop/win-unpacked/珠宝本地总控工作台.exe
```

## 绿色包分发限制

当前 **本地 Agent 依赖本机 monorepo 源码树**（`扫描根目录/总控台/apps/control-agent`）。仅复制 `win-unpacked` 绿色包到其他电脑时，Agent 无法自动拉起，除非：

1. 目标机同样存在完整源码目录，或
2. 后续版本将 `control-agent` 打成独立 JS 包 / `zhubo-control-agent.exe` 随 EXE `extraResources` 携带（预留方案）

设置页会提示上述限制。

## 配置安全

- `config.json` 保存后限制为当前用户可读写（Windows icacls）
- 敏感字段优先使用 DPAPI（`safeStorage`）加密存储，兼容旧明文配置
- 界面与日志仅显示脱敏 Token

## 配置

首次启动配置写入：

```
%APPDATA%\ZhuboDesktopControl\config.json
```

默认云端地址：`http://8.137.126.18/control`

日志目录：

```
%APPDATA%\ZhuboDesktopControl\logs\
```

含 `app.log`、`agent.log`、终端日志等。

## 功能

- 连接云端总控，管理本地项目启动/停止
- 千帆 Cookie 四店状态卡片
- 千帆 + 总控窗口排列（native-helper）
- 本地 Agent 离线自动拉起
- 项目访问地址小卡片、按钮 Tooltip、动效

## 4790 / 4791

仅用于**本地开发**（`npm run dev`）。EXE 正式验收以云端 `http://8.137.126.18/control/` 为准。

端口页可识别并安全关闭本地 4791 遗留联调进程。
