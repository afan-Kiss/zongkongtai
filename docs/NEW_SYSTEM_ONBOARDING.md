# 新系统接入总控台（大白话版）

本文说明如何把**新软件**或**还在开发中的项目**纳入珠宝总控台，避免每个项目都重新摸索一遍。

## 一、你要准备什么

1. 项目在本机的路径，例如 `E:\我的软件源码\新项目`
2. 一个**唯一的英文 code**，例如 `jade-warehouse`
3. 知道怎么启动（`npm run dev` / `npm start` / 某个 `.exe`）
4. 主要端口（Web、API 各多少）
5. Git 仓库地址（有的话）

## 二、必须放的文件

在项目**根目录**创建：

```
zhubo-control.manifest.json
```

可复制模板：

```
docs/templates/new-system/zhubo-control.manifest.template.json
```

或用命令自动生成（推荐）：

```bash
cd E:\我的软件源码\总控台
npm run control:init-project -- --path "E:\我的软件源码\新项目" --name "新项目" --code "new-project" --category "工具服务"
```

生成后**务必人工核对**端口和启动命令，脚本只能猜个大概。

## 三、manifest 里怎么写

### 启动命令

- `desktopStartCommand`：给本地 EXE 一键启动用，优先写 dev 命令，例如 `npm run dev`
- `services[]`：多服务（server + web + worker）时，每个服务一条，EXE 会为每个服务开 terminal session

### Web 地址

- 本地开发：`http://127.0.0.1:端口`
- 已部署到云端：`publicUrl` 写 `http://8.137.126.18/xxx/`（**不要写域名**）
- 没有 Web 页面：`localWebUrl` 留空

### health 地址

- 有 HTTP 后端：尽量提供 `GET /api/health`，地址写到 `localHealthUrl`
- 参考示例：`docs/templates/new-system/health-node-express.example.js`
- 纯 GUI / Electron：`healthType: "process"`，不写 health URL，EXE 用进程是否存活判断
- health 只返回 `ok/service/time/uptime/env`，**不要**返回 Cookie、Token、密码

### 端口

- 全部写在 `ports` 数组里
- 总控会检测冲突；新端口尽量选 47xx / 3xxx 等同项目未占用的段
- 开发端口 4790/4791 仅总控 monorepo 本地 dev 用，不要当别的项目正式入口

### Cookie

| cookieMode | 含义                              |
| ---------- | --------------------------------- |
| `none`     | 不需要千帆/小红书 Cookie          |
| `pending`  | 以后可能要接，本次只登记          |
| `control`  | 已从总控读取 Cookie（如主播分析） |

**不要**在 manifest 里写真实 Cookie 或 Token。

## 四、开发中还没写完的项目

可以**先登记**，不急着能启动：

1. 写好 manifest，`control.enabled: true`
2. 在 `control.notes` 写：`开发中，先登记 manifest，待功能完成后再验收启动`
3. EXE 里能看到卡片，但启动可能失败——这是正常的
4. 等功能稳定后再补 health、核对端口

## 五、接入总控的两种方式

### 方式 A：EXE「从 manifest 导入」

1. 打开「珠宝本地总控工作台」
2. 进入「项目」页
3. 点 **从 manifest 导入**
4. 再点 **刷新项目清单**

### 方式 B：Agent 扫描 E 盘

1. 确保本地 Agent 在线（EXE 顶栏显示绿色）
2. 点 **重新扫描 E 盘项目**
3. Agent 会读 manifest 并合并端口/命令到云端

两种方式的合并规则：

- **code 相同** → 更新，不重复创建
- **name 相同、code 不同** → 提示疑似重复，需人工确认
- 已有手动的 `startCommand` / `deployCommand` **不会被覆盖**

## 六、验收清单（新项目）

- [ ] 项目根有 `zhubo-control.manifest.json`
- [ ] manifest 已提交 Git（无 .env / Cookie）
- [ ] 总控后台「项目」列表能看到
- [ ] EXE 项目列表能看到，分组正确
- [ ] 启动前端口未被其他项目占用
- [ ] 启动后 health 返回 `ok: true`（或有进程检测）
- [ ] Web 地址能打开
- [ ] 终端有日志，且日志不含完整 Cookie/Token
- [ ] 停止后进程干净退出

## 七、风险分级（不要乱启动）

| 级别 | 项目类型                                | 建议                                      |
| ---- | --------------------------------------- | ----------------------------------------- |
| 低   | 辅助出库、祥钰、扫码枪、记账            | 可在 EXE 真实启停验收                     |
| 中   | 千帆机器人、抖店机器人、AI 客服、Ollama | 只做运行检测或人工确认                    |
| 高   | 云端总控、主播分析、nginx、x-ui         | **不要**从 EXE 随便重启，只查 health/状态 |

## 八、正式地址（域名未备案前）

| 用途            | 地址                                     |
| --------------- | ---------------------------------------- |
| 总控 Web        | `http://8.137.126.18/control/`           |
| Agent WebSocket | `ws://8.137.126.18/control/api/agent/ws` |

禁止使用：`xiangyuzhubao.xyz`、`https://` 域名、`wss://` 域名、4880 作为新正式入口。

## 九、相关文档

- 模板目录：`docs/templates/new-system/`
- 桌面 EXE：`docs/DESKTOP.md`
- Agent：`docs/AGENT.md`
- Cookie 中心（后续单独接）：`docs/COOKIE_CENTER.md`

## 十、常见问题

**Q：没有 Git 仓库怎么办？**  
A：`gitRemote` 留空即可，manifest 仍要提交到你能管理的备份方式。

**Q：monorepo 多个服务怎么写？**  
A：在 `services` 里写 server/web/worker，EXE 会为每个服务开 terminal session。

**Q：导入后端口不对？**  
A：改 manifest 后重新「从 manifest 导入」，或 Agent 重新扫描。

**Q：health 一直失败？**  
A：确认服务已启动且代码里已有 `/api/health`；改代码后需重启**该业务**，不是重启 nginx。
