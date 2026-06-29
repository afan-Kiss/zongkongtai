# Zhubo Control Center / 珠宝项目总控台

统一管理多个珠宝业务项目的端口、Cookie、启动命令与 Agent 扫描。

## 结构

- `apps/control-server` — 云端 API + WebSocket
- `apps/control-web` — React 管理后台
- `apps/control-agent` — Windows 本地扫描 Agent
- `packages/control-shared` — 共享类型与端口识别
- `packages/control-client` — 其他项目读取 Cookie 的 SDK（第二阶段）

## 本地开发

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

- 后台：http://127.0.0.1:4790
- 开发前端：http://127.0.0.1:4791（代理到 4790）
- 默认账号：`admin` / 见 `.env` 中 `ADMIN_PASSWORD`

## 启动本地 Agent

```bash
npm run dev:agent
```

Agent 主动 WebSocket 连接云端，扫描 `E:\我的软件源码` 并上报。

## 部署阿里云

```bash
set SSH_PASS=你的密码
npm run deploy:aliyun
```

- 部署目录：`/www/wwwroot/zhubo-control-center`
- PM2 名称：`zhubo-control-center`
- 内网端口：`127.0.0.1:4790`
- 公网访问：`http://8.137.126.18:4880`

## 安全说明

- `.env` 含密码与加密密钥，**切勿提交 Git**
- Cookie 使用 AES-256-GCM 加密存储
- 项目启动只允许白名单命令
- `/api/secrets/resolve` 需 `x-service-token` 请求头
