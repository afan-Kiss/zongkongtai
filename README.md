# Zhubo Control Center / 珠宝项目总控台

统一管理多个珠宝业务项目的端口、Cookie、启动命令与 Agent 扫描。

## 结构

- `apps/control-server` — 云端 API + WebSocket
- `apps/control-web` — React 管理后台
- `apps/control-agent` — Windows 本地扫描 Agent
- `apps/control-desktop` — 珠宝本地总控工作台（Electron EXE）
- `packages/control-shared` — 共享类型与端口识别
- `packages/control-client` — 其他项目读取 Cookie 的 SDK（含 `getQianfanCookie()`）

## 正式云端总控

- Web：`http://8.137.126.18/control/`
- 健康检查：`http://8.137.126.18/control/api/health`
- Agent WebSocket：`ws://8.137.126.18/control/api/agent/ws`

> 域名未备案前统一使用单 IP，不要使用 `xiangyuzhubao.xyz`、HTTPS 或 WSS。

## 本地开发

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

- Server：`http://127.0.0.1:4790`
- Web（Vite 开发前端）：`http://127.0.0.1:4791`（代理到 4790）
- 默认账号：`admin` / 见 `.env` 中 `ADMIN_PASSWORD`

## 本地 Agent 连接云端

```bash
npm run dev:agent
```

环境变量（见 `.env.example`）：

```env
CONTROL_SERVER_URL=http://8.137.126.18/control
AGENT_TOKEN=与云端 .env 中 AGENT_TOKEN 一致
```

WebSocket：`ws://8.137.126.18/control/api/agent/ws`

## 桌面 EXE

日常打包（推荐，固定输出目录，避免 pack2/pack3 堆积）：

```bash
npm run pack:desktop:clean
```

输出：`apps/control-desktop/dist-desktop-pack-current/win-unpacked/珠宝本地总控工作台.exe`

若旧 EXE 仍在运行，请先关闭窗口再打包。

开发调试：

```bash
npm run build:desktop
npm run pack:desktop
```

输出：`apps/control-desktop/dist-desktop/win-unpacked/珠宝本地总控工作台.exe`

## 部署阿里云

运维脚本公共配置：`deploy/aliyun/ops_config.py`（生产库路径 `apps/control-server/prod.db`）。

- `check-*` / `diagnose-*`：只读，不修改服务器
- `fix-*`：默认 dry-run，须加 `--execute` 才执行
- 路径冲突排查：`python deploy/aliyun/diagnose-db-path-conflict.py`

```bash
set SSH_PASS=你的密码
npm run deploy:aliyun
```

- 部署目录：`/www/wwwroot/zhubo-control-center`
- PM2 名称：`zhubo-control-center`
- 服务器内网：`127.0.0.1:4790`（仅服务器本地）
- 公网入口：`http://8.137.126.18/control/`（Nginx 80 端口 `/control/`）

部署验收：

```bash
curl http://8.137.126.18/control/api/health
```

## 脚本

| 命令                    | 说明                       |
| ----------------------- | -------------------------- |
| `npm run format`        | Prettier 格式化源码        |
| `npm run check`         | 格式化检查 + 构建          |
| `npm run build`         | 构建 shared / web / server |
| `npm run build:desktop` | 构建桌面端                 |
| `npm run pack:desktop`  | 打包绿色版 EXE             |

## 文档

- [docs/DEPLOY.md](docs/DEPLOY.md) — 云端部署
- [docs/DESKTOP.md](docs/DESKTOP.md) — 桌面 EXE
- [docs/AGENT.md](docs/AGENT.md) — 本地 Agent
- [docs/COOKIE_CENTER.md](docs/COOKIE_CENTER.md) — 千帆 Cookie

## 安全说明

- `.env` 含密码与加密密钥，**切勿提交 Git**
- Cookie 使用 AES-256-GCM 加密存储
- 项目启动只允许白名单命令
- `/api/secrets/resolve` 需 `x-service-token` 请求头
