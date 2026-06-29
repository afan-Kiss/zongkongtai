# 新系统接入模板

本目录提供**可复制**的标准文件，用于把新项目纳入珠宝总控台管理。

## 文件说明

| 文件                                   | 用途                                    |
| -------------------------------------- | --------------------------------------- |
| `zhubo-control.manifest.template.json` | 项目根目录 manifest 模板                |
| `health-node-express.example.ts`       | Express/Fastify（TS）轻量 `/api/health` |
| `health-node-express.example.js`       | Express（JS）轻量 `/api/health`         |
| `health-python-fastapi.example.py`     | FastAPI health 片段                     |
| `health-python-flask.example.py`       | Flask 最小 health 路由                  |

## 快速开始

1. 复制 `zhubo-control.manifest.template.json` 到项目根，改名为 `zhubo-control.manifest.json`。
2. 填写 `name`、`code`、`category`、`localPath`、端口与启动命令。
3. 有 HTTP 后端的，参考 health 示例添加 `GET /api/health`。
4. 纯 GUI / Electron 无 Web 的，设 `healthType: "process"`，`localWebUrl` 留空。
5. 提交 manifest 到 Git（**不要**提交 `.env`、Cookie、Token）。
6. 在本地总控 EXE 点 **从 manifest 导入**，或触发 Agent 扫描。

## 自动生成

在总控台 monorepo 根目录执行：

```bash
npm run control:init-project -- --path "E:\我的软件源码\新项目" --name "新项目" --code "new-project" --category "工具服务"
```

详细步骤见 [NEW_SYSTEM_ONBOARDING.md](../../NEW_SYSTEM_ONBOARDING.md)。

## 可选：Ollama 等本地工具服务

若本机安装了 Ollama（无独立源码目录），可在 manifest 中登记为工具服务，例如：

```json
{
  "name": "Ollama 本地服务",
  "code": "ollama-local",
  "category": "工具服务",
  "healthType": "http",
  "localHealthUrl": "http://127.0.0.1:11434/api/tags",
  "ports": [11434],
  "control": {
    "enabled": true,
    "showInDesktop": true,
    "cookieMode": "none",
    "notes": "如本机已安装 Ollama"
  }
}
```

Ollama 无标准 `/api/health`，可用 `/api/tags` 做存活探测，或 `healthType: "process"`。

## 禁止项

- 不要使用未备案域名（如 `xiangyuzhubao.xyz`）
- 不要使用 `https://` / `wss://` 域名作为正式入口
- 正式总控：`http://8.137.126.18/control/`
- 正式 Agent WS：`ws://8.137.126.18/control/api/agent/ws`
