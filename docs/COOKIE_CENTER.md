# 千帆 Cookie 中心

## 正式四店

- 拾玉居和田玉
- 和田雅玉
- 祥钰珠宝
- XY祥钰珠宝

上传侧与 EXE 展示侧使用 canonical 名称；页面标题 alias 映射到 canonical。

## 上传

千帆中转机器人 → `POST /api/secrets/qianfan/upload-cookie`（Service Token）

云端：`http://8.137.126.18/control`

## 查看

- EXE Cookie 页：四店卡片 + 「显示测试/历史 Cookie」
- 云端 Secrets 页：筛选 qianfan、脱敏 preview、不返回 encryptedValue

## 注意

- 不要修改上传闭环核心逻辑
- deploy 时保留 `SERVICE_TOKEN`，避免上传中断
