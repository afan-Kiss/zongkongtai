# 云端部署

## 正式入口

- Web：`http://8.137.126.18/control/`
- Health：`http://8.137.126.18/control/api/health`
- Agent WS：`ws://8.137.126.18/control/api/agent/ws`

域名未备案前**不要**使用 `xiangyuzhubao.xyz`、HTTPS 或 WSS。

## 服务器信息

| 项       | 值                                  |
| -------- | ----------------------------------- |
| 部署目录 | `/www/wwwroot/zhubo-control-center` |
| PM2 名称 | `zhubo-control-center`              |
| 内网端口 | `127.0.0.1:4790`（仅服务器本地）    |
| 公网     | Nginx 80 → `/control/` 反代到 4790  |

## 部署命令

```bash
set SSH_PASS=你的密码
npm run deploy:aliyun
```

## Token 保留策略

`deploy/aliyun/upload-and-deploy.py` 会：

1. 读取服务器现有 `.env`
2. **保留** `SERVICE_TOKEN`、`AGENT_TOKEN`、`ADMIN_PASSWORD`、`SESSION_SECRET`、`SECRET_ENCRYPTION_KEY`、`DATABASE_URL`
3. 仅在首次部署时生成缺失项
4. **不会**创建 4880 端口 Nginx
5. **不会**重置已跑通的千帆 Cookie 上传配置

## 验收

```bash
curl http://8.137.126.18/control/api/health
pm2 status | grep zhubo-control-center
```

## 注意

- 只允许重启 `zhubo-control-center`，不要重启 `zhubo-analysis` / nginx / x-ui
- 4790 / 4791 是本地开发端口，不是正式公网入口
