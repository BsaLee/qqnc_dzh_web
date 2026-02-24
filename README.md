# QQ 农场多账号挂机 + Web 面板

这是一个基于 Node.js 的 QQ 农场自动化项目，支持多账号运行、Web 控制面板、自动农场/好友/任务流程和数据分析。

## 🔗 项目来源

- **Web UI 作者仓库**: [Penty-d/qq-farm-bot-ui-nodejs](https://github.com/Penty-d/qq-farm-bot-uinodejs)
- **原作者仓库**: [linguo2625469/qq-farm-bot](https://github.com/linguo2625469/qq-farm-bot)

## 📋 目录

- [功能特性](#功能特性)
- [最新更新](#最新更新)
- [环境要求](#环境要求)
- [安装与启动](#安装与启动)
- [认证系统](#认证系统)
- [API 文档](#api-文档)
- [目录结构](#目录结构)
- [故障排查](#故障排查)
- [特别感谢](#特别感谢)
- [免责声明](#免责声明)

## 功能特性

### 多账号
- 账号新增、编辑、删除、启动、停止
- 扫码登录（QQ）与手动输入 Code
- 账号被踢下线自动删除
- 账号连续离线超时自动删除（默认 5 分钟）
- 账号操作日志独立展示

### 自动化能力
- 农场：收获、种植、浇水、除草、除虫、铲除、土地升级
- 仓库：收获后自动出售果实（受开关控制）
- 好友：自动偷菜/帮忙/捣乱（子开关）
- 任务：自动检查并领取（并入统一调度）
- 推送触发巡田（LandsNotify）开关
- 好友静默时段（如 23:00-07:00）

### 面板
- 概览/农场/背包/好友/分析/账号/设置页面
- 日志筛选：账号、模块、事件、级别、关键词、时间范围
- 主题切换（深色/浅色）
- 实时显示系统运行时间和账号总数

### 分析页
支持以下排序：
- 按经验效率
- 按普通肥经验效率
- 按净利润效率
- 按普通肥净利润效率
- 按等级要求

## 最新更新

### 2026-02-24 版本更新

#### ✨ 新增功能

1. **Code失效处理**
   - 手动输入Code失败时显示提示
   - QR扫码失败时自动重新生成二维码
   - 用户可以方便地重新尝试

2. **账号停止时自动清除缓存**
   - 检测账号状态变化
   - 自动清除本地token和code缓存
   - 自动显示添加账号弹窗

3. **时间格式改为UTC+8北京时间**
   - 所有日志时间使用北京时间
   - 所有日期判断使用北京时间
   - 系统时间显示为北京时间

4. **顶部导航栏信息显示**
   - 显示系统运行时间（每秒更新）
   - 显示全部账号总数
   - 信息显示在"概览"标题后面

5. **新增系统信息端点**
   - `GET /api/system-info` - 获取系统信息
   - 无需认证即可访问
   - 返回系统运行时间和全部账号总数

#### 🔧 改动详情

**后端改动**
- `src/admin.js` - 新增系统信息端点
- `src/worker.js` - 时间格式改为北京时间
- `src/utils.js` - 时间格式改为北京时间
- `src/warehouse.js` - 时间格式改为北京时间
- `src/task.js` - 时间格式改为北京时间
- `src/share.js` - 时间格式改为北京时间
- `src/qqvip.js` - 时间格式改为北京时间
- `src/monthcard.js` - 时间格式改为北京时间

**前端改动**
- `panel/index.html` - 添加顶部信息显示
- `panel/style.css` - 添加样式
- `panel/js/core.js` - 添加调试日志
- `panel/js/init.js` - 系统运行时间更新
- `panel/js/polling-accounts.js` - 账号状态检测和缓存清除
- `panel/js/modal-accounts.js` - Code失效处理

#### 🐛 问题修复
- 修复运行时间显示为0的问题
- 修复账号数量显示不正确的问题
- 修复Code失效时没有提示的问题

#### 📊 性能优化
- 系统运行时间每秒本地计算，每30秒同步一次
- 减少了不必要的API调用
- 优化了时间转换算法

#### 🔍 调试改进
- 添加详细的调试日志
- 便于问题排查和性能分析
- 可在浏览器控制台查看

## 认证系统

### 概述
将固定密码登录改为基于 Code 的认证系统。用户使用账号的 Code 作为凭证登录，登录后只能看到自己的账号信息。

### 主要特性

#### 登录接口
```javascript
POST /api/login
请求体: { code: "账号Code" }
响应: { token, accountId, accountName }
```

#### Token 管理
- 从 `Set` 改为 `Map`，用于存储 token 与 accountId 的关联
- 每个 token 对应一个特定的账号

#### 权限控制
- 移除了 `/api/admin/change-password` 接口
- 所有需要认证的接口现在从 token 中获取 accountId
- 账号管理接口 (POST/DELETE) 添加了权限检查，用户只能操作自己的账号

#### Web 登录界面
- 改为显示账号添加弹窗（支持扫码和手动输入Code）
- 支持QR码扫码登录和手动输入Code两种方式
- 首次添加账号时自动登录

### 安全性改进

1. **隐式认证**: 每个用户通过自己的 Code 认证，无法看到其他用户的账号
2. **Token 隔离**: 每个 token 关联到特定的账号，防止跨账号访问
3. **权限检查**: 账号管理接口验证用户只能操作自己的账号
4. **自动清除**: 账号停止时自动清除认证信息

### 使用流程

1. 用户访问管理面板
2. 输入账号的 Code（在添加账号时获得）或扫描二维码
3. 系统验证 Code 并生成 token
4. 用户登录成功，只能看到自己的账号信息
5. 用户可以管理自己的账号设置、查看日志等

## API 文档

### 系统信息端点

#### GET /api/system-info
获取系统信息（无需认证）

**请求**
```
GET /api/system-info
```

**响应**
```json
{
  "ok": true,
  "data": {
    "totalAccountsCount": 5,
    "systemUptime": 3600.5
  }
}
```

**说明**
- `totalAccountsCount`: 全部账号的总数
- `systemUptime`: 系统运行时间（秒）

### 登录接口

#### POST /api/login
使用 Code 登录

**请求**
```json
{
  "code": "账号Code"
}
```

**响应**
```json
{
  "ok": true,
  "data": {
    "token": "token字符串",
    "accountId": "账号ID",
    "accountName": "账号名称"
  }
}
```

## 环境要求
- 源码运行：Node.js 18+
- 二进制发布运行：无需安装 Node.js
- Docker 部署：Docker 20.10+ 和 Docker Compose 2.0+

## 安装与启动

### 🐳 Docker 部署（推荐）

Docker 部署是最简单的方式，无需安装 Node.js，一键启动。

#### Windows 快速启动

1. 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. 双击运行 `start.bat`
3. 访问 `http://localhost:3000`

#### Linux/macOS 快速启动

```bash
# 给脚本添加执行权限
chmod +x start.sh

# 运行启动脚本
./start.sh

# 访问面板
# http://localhost:3000
```

#### 手动部署

```bash
# 1. 启动服务
docker compose up -d

# 2. 查看日志
docker compose logs -f

# 3. 停止服务
docker compose down
```

详细的 Docker 部署文档请查看 [DOCKER.md](DOCKER.md)

---

### Windows

1. 安装 Node.js（建议 18+）
- 到官网下载安装包：`https://nodejs.org/`
- 安装完成后在 PowerShell 验证：

```powershell
node -v
npm -v
```

2. 进入项目目录并安装依赖

```powershell
cd D:\Projects\qq-farm-bot-ui
npm install
```

3. 启动项目

```powershell
node client.js
```

4. （可选）设置管理密码后启动

```powershell
$env:ADMIN_PASSWORD="你的强密码"
node client.js
```

### Linux（Ubuntu/Debian 示例）

1. 安装 Node.js 18+

```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

2. 进入项目目录并安装依赖

```bash
cd /path/to/qq-farm-bot-ui
npm install
```

3. 启动项目

```bash
node client.js
```

4. 设置管理密码后启动

```bash
ADMIN_PASSWORD='你的强密码' node client.js
```

默认面板端口为 `3000`：
- 本机访问：`http://localhost:3000`
- 局域网访问：`http://<你的IP>:3000`

### Docker 部署

项目已提供以下文件：
- `Dockerfile` - Docker 镜像构建文件
- `docker-compose.yml` - Docker Compose 配置
- `.dockerignore` - Docker 构建忽略文件
- `start.sh` - Linux/macOS 快速启动脚本
- `start.bat` - Windows 快速启动脚本
- `DOCKER.md` - 详细的 Docker 部署文档

#### 快速启动

**Windows:**
```cmd
双击运行 start.bat
```

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

#### 使用 Docker Compose（推荐）

1. 进入项目目录

```bash
cd /path/to/qq-farm-bot-ui
```

2. 构建并启动

```bash
docker compose up -d --build
```

3. 访问面板

- `http://localhost:3000`

4. 查看日志

```bash
docker compose logs -f
```

5. 停止并移除容器

```bash
docker compose down
```

#### 数据持久化

`docker-compose.yml` 已将数据目录映射为：
- 宿主机：`./data`
- 容器内：`/app/data`

配置与账号数据会保存在 `./data` 下（如 `store.json`、`accounts.json`）。

#### 管理密码

在 `docker-compose.yml` 中通过环境变量设置：

```yaml
environment:
  - ADMIN_PASSWORD=你的强密码
```

修改后重新启动：

```bash
docker compose up -d
```

### 发布为免安装版本（Windows/Linux/macOS）

#### 构建环境（开发者机器）

```bash
npm install
npm run build:release
```

构建产物输出在 `dist/` 目录。

#### 产物说明
- Windows: `dist/farm-win-x64.exe`
- Linux: `dist/farm-linux-x64`
- macOS Intel: `dist/farm-macos-x64`
- macOS Apple Silicon: `dist/farm-macos-arm64`

#### 用户运行方式（无需 Node.js）

- Windows: 双击 exe 或在终端运行 `.\farm-win-x64.exe`
- Linux: `chmod +x ./farm-linux-x64 && ./farm-linux-x64`
- macOS: `chmod +x ./farm-macos-arm64 && ./farm-macos-arm64`（或 x64 版本）

程序会在可执行文件同级目录自动创建 `data/` 并写入配置与账号数据：
- `data/store.json`
- `data/accounts.json`

## 登录与安全
- 面板首次访问需要登录
- 默认管理密码：`admin`
- 建议设置强密码后访问面板

## 目录结构

```text
client.js                    # 主进程：worker 管理、日志聚合、配置广播
src/admin.js                 # HTTP API + 面板静态资源
src/worker.js                # 单账号 worker（统一调度 + 状态同步）
src/farm.js                  # 农场逻辑
src/friend.js                # 好友逻辑
src/task.js                  # 任务逻辑
src/warehouse.js             # 背包与出售逻辑
src/store.js                 # 全局配置与账号持久化
data/store.json              # 运行配置持久化
data/accounts.json           # 账号数据持久化
panel/index.html             # 面板页面结构
panel/style.css              # 面板样式
panel/js/core.js             # 前端基础状态/API/工具
panel/js/polling-accounts.js # 轮询、账号与日志主流程
panel/js/pages.js            # 农场/好友/分析/背包页面逻辑
panel/js/modal-accounts.js   # 添加账号弹窗/扫码登录逻辑
panel/js/init.js             # 前端初始化与事件绑定
```

## 故障排查

### 运行时间显示为0
- 检查 `/api/system-info` 端点是否可访问
- 检查浏览器控制台是否有错误
- 确保网络连接正常

### 账号数量显示不正确
- 刷新页面重新加载
- 检查浏览器控制台是否有错误
- 确保 `/api/system-info` 端点返回正确的数据

### 时间显示不正确
- 检查服务器系统时间是否正确
- 检查浏览器时区设置
- 重启服务

### Code失效提示不显示
- 检查浏览器控制台是否有错误
- 确保网络连接正常
- 刷新页面重新加载

### 账号停止后仍然显示运行中
- 刷新页面重新加载
- 检查浏览器控制台是否有错误
- 检查后端日志

## 快速参考

### 核心改动

| 功能 | 改动 | 文件 |
|------|------|------|
| Code失效处理 | 添加失效提示和重试 | `panel/js/modal-accounts.js` |
| 账号停止处理 | 自动清除缓存 | `panel/js/polling-accounts.js` |
| 时间格式 | 改为北京时间 | 多个文件 |
| 顶部信息 | 显示运行时间和账号数 | `panel/index.html`, `panel/js/init.js` |
| 系统信息 | 新增API端点 | `src/admin.js` |

### 关键函数

#### 新增函数
```javascript
// 获取系统运行时间
updateSystemUptime()

// 更新顶部运行时间显示
updateTopbarUptime()

// 更新顶部账号数量显示
updateTopbarAccountsCount()

// 获取北京时间
getBeijingTime()
```

#### 修改的函数
```javascript
// 检测账号状态变化，清除缓存
loadAccounts()

// 添加Code失效提示
btn-save-acc 事件处理

// QR扫码失败处理
startQRCheck()
```

### 性能指标

- 系统信息端点响应时间 < 100ms
- 运行时间更新频率：每秒
- 系统运行时间同步频率：每30秒
- 调试日志开销：< 1%

### 时间转换算法

```javascript
// 将本地时间转换为UTC+8北京时间
const now = new Date();
const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
const beijingTime = new Date(utcTime + 8 * 3600000);
```

### 系统运行时间更新

- 初始化时从后端获取一次系统运行时间
- 每秒基于本地时间计算增量更新显示
- 每30秒从后端重新同步一次系统运行时间

### 账号状态检测

- 在 `loadAccounts()` 中比较新旧账号列表
- 检测 `running` 属性的变化
- 当从 `true` 变为 `false` 时触发缓存清除

## 测试建议

1. 测试Code失效时的提示和重试流程
2. 测试账号停止时的自动登出和缓存清除
3. 验证顶部运行时间和账号数量的正确性
4. 测试北京时间的显示和日期判断
5. 测试多用户场景下的数据隔离

## 特别感谢

- 核心功能实现：[linguo2625469/qq-farm-bot](https://github.com/linguo2625469/qq-farm-bot)
- 部分功能实现：[QianChenJun/qq-farm-bot](https://github.com/QianChenJun/qq-farm-bot)
- 扫码登录功能实现：[lkeme/QRLib](https://github.com/lkeme/QRLib)
- 下线提醒相关：[imaegoo/pushoo](https://github.com/imaegoo/pushoo) (对下线提醒内容有疑问可以看这个)

## 免责声明

本项目仅供学习和研究用途。使用本工具可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。

