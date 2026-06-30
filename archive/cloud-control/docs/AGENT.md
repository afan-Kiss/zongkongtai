# 本地 Agent

## 正式连接

```env
CONTROL_SERVER_URL=http://8.137.126.18/control
AGENT_TOKEN=与云端 .env 一致
SCAN_ROOT=E:\我的软件源码
```

WebSocket：`ws://8.137.126.18/control/api/agent/ws`

不要使用 4790、4791、域名或 wss。

## HTTP 注册

`POST /api/agents/register` 需要 **Service Token**（推荐 `Authorization: Bearer <SERVICE_TOKEN>`）或管理员登录 Session。

Agent 进程会从环境变量 `SERVICE_TOKEN` 携带 Bearer 头；WebSocket 仍使用 `AGENT_TOKEN` 连接 `/api/agent/ws`。

## 手动启动

```bash
npm run dev:agent
```

## EXE 自愈

珠宝本地总控工作台 EXE 会：

1. 启动时检查云端 Agent 列表
2. 若本机离线，后台拉起 Agent（`windowsHide: true`）
3. 日志：`%APPDATA%\ZhuboDesktopControl\logs\agent.log`
4. 设置页：检查 / 启动 / 重启 / 打开日志

## 离线原因提示

| 提示                                | 含义                   |
| ----------------------------------- | ---------------------- |
| 本地 Agent 没运行                   | 进程未启动             |
| Agent Token 不对                    | Token 与云端不一致     |
| 连接地址不是云端 /control           | URL 配置错误           |
| WebSocket 连接失败                  | 网络或云端不可用       |
| 云端能打开，但本机 Agent 没上报心跳 | Agent 未连上或扫描失败 |
