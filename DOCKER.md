# Docker 部署指南

本文档详细说明如何使用 Docker 部署 QQ 农场多账号挂机项目。

## 📋 目录

- [快速开始](#快速开始)
- [环境要求](#环境要求)
- [部署方式](#部署方式)
- [配置说明](#配置说明)
- [常用命令](#常用命令)
- [数据持久化](#数据持久化)
- [故障排查](#故障排查)

## 快速开始

### 使用 Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/Penty-d/qq-farm-bot-uinodejs.git
cd qq-farm-bot-uinodejs

# 2. 启动服务
docker compose up -d

# 3. 访问面板
# 浏览器打开: http://localhost:3000
```

就这么简单！服务已经启动了。

## 环境要求

- Docker 20.10+
- Docker Compose 2.0+（或 docker-compose 1.29+）

### 安装 Docker

#### Ubuntu/Debian
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

#### CentOS/RHEL
```bash
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

#### Windows/macOS
下载并安装 [Docker Desktop](https://www.docker.com/products/docker-desktop)

## 部署方式

### 方式一：Docker Compose（推荐）

#### 1. 基础部署

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

#### 2. 自定义配置

编辑 `docker-compose.yml`：

```yaml
services:
  qq-farm-bot-ui:
    build: .
    container_name: qq-farm-bot-ui
    restart: unless-stopped
    ports:
      - "3000:3000"  # 修改左侧端口号可更改访问端口
    environment:
      - NODE_ENV=production
      - PORT=3000
      - ADMIN_PASSWORD=your_strong_password  # 修改管理密码
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/data
```

#### 3. 重新部署

```bash
# 修改配置后重新启动
docker compose up -d

# 强制重新构建
docker compose up -d --build
```

### 方式二：纯 Docker 命令

#### 1. 构建镜像

```bash
docker build -t qq-farm-bot-ui:latest .
```

#### 2. 运行容器

```bash
docker run -d \
  --name qq-farm-bot-ui \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e ADMIN_PASSWORD=admin \
  -e TZ=Asia/Shanghai \
  -v $(pwd)/data:/app/data \
  qq-farm-bot-ui:latest
```

#### 3. 管理容器

```bash
# 查看日志
docker logs -f qq-farm-bot-ui

# 停止容器
docker stop qq-farm-bot-ui

# 启动容器
docker start qq-farm-bot-ui

# 删除容器
docker rm -f qq-farm-bot-ui
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `NODE_ENV` | 运行环境 | `production` | 否 |
| `PORT` | 服务端口 | `3000` | 否 |
| `ADMIN_PASSWORD` | 管理密码 | `admin` | 否 |
| `TZ` | 时区 | `Asia/Shanghai` | 否 |

### 端口映射

```yaml
ports:
  - "宿主机端口:容器端口"
```

示例：
- `"3000:3000"` - 使用默认端口 3000
- `"8080:3000"` - 宿主机 8080 映射到容器 3000
- `"80:3000"` - 使用 80 端口访问

### 数据卷

```yaml
volumes:
  - ./data:/app/data  # 账号和配置数据
```

数据文件：
- `data/store.json` - 全局配置
- `data/accounts.json` - 账号信息

## 常用命令

### Docker Compose 命令

```bash
# 启动服务（后台运行）
docker compose up -d

# 启动服务（前台运行，查看日志）
docker compose up

# 停止服务
docker compose down

# 停止并删除数据卷
docker compose down -v

# 重启服务
docker compose restart

# 查看服务状态
docker compose ps

# 查看实时日志
docker compose logs -f

# 查看最近 100 行日志
docker compose logs --tail=100

# 进入容器
docker compose exec qq-farm-bot-ui sh

# 重新构建并启动
docker compose up -d --build

# 拉取最新代码并重新部署
git pull
docker compose up -d --build
```

### Docker 命令

```bash
# 查看运行中的容器
docker ps

# 查看所有容器
docker ps -a

# 查看镜像
docker images

# 删除镜像
docker rmi qq-farm-bot-ui:latest

# 清理未使用的资源
docker system prune -a

# 查看容器资源占用
docker stats qq-farm-bot-ui

# 导出镜像
docker save qq-farm-bot-ui:latest -o qq-farm-bot-ui.tar

# 导入镜像
docker load -i qq-farm-bot-ui.tar
```

## 数据持久化

### 数据目录结构

```
data/
├── store.json          # 全局配置
└── accounts.json       # 账号信息
```

### 备份数据

```bash
# 备份数据目录
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# 或使用 Docker 命令备份
docker compose exec qq-farm-bot-ui tar -czf /tmp/backup.tar.gz /app/data
docker compose cp qq-farm-bot-ui:/tmp/backup.tar.gz ./backup-$(date +%Y%m%d).tar.gz
```

### 恢复数据

```bash
# 停止服务
docker compose down

# 恢复数据
tar -xzf backup-20240224.tar.gz

# 启动服务
docker compose up -d
```

### 迁移到新服务器

```bash
# 在旧服务器上
docker compose down
tar -czf qq-farm-backup.tar.gz data/ docker-compose.yml

# 传输到新服务器
scp qq-farm-backup.tar.gz user@new-server:/path/to/project/

# 在新服务器上
tar -xzf qq-farm-backup.tar.gz
docker compose up -d
```

## 故障排查

### 容器无法启动

```bash
# 查看容器日志
docker compose logs

# 查看详细错误
docker compose logs --tail=50 qq-farm-bot-ui

# 检查容器状态
docker compose ps
```

### 端口被占用

```bash
# 查看端口占用
netstat -tlnp | grep 3000
# 或
lsof -i :3000

# 修改 docker-compose.yml 中的端口映射
ports:
  - "8080:3000"  # 改用 8080 端口
```

### 无法访问面板

1. 检查容器是否运行：
```bash
docker compose ps
```

2. 检查端口映射：
```bash
docker compose port qq-farm-bot-ui 3000
```

3. 检查防火墙：
```bash
# Ubuntu/Debian
sudo ufw allow 3000

# CentOS/RHEL
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

4. 测试连接：
```bash
curl http://localhost:3000/api/ping
```

### 数据丢失

确保数据卷正确挂载：

```bash
# 检查数据卷
docker compose exec qq-farm-bot-ui ls -la /app/data

# 检查宿主机数据
ls -la ./data
```

### 容器内存不足

```bash
# 查看资源使用
docker stats qq-farm-bot-ui

# 限制内存使用（在 docker-compose.yml 中）
services:
  qq-farm-bot-ui:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

### 重置所有数据

```bash
# 停止并删除容器和数据
docker compose down -v

# 删除数据目录
rm -rf data/

# 重新启动
docker compose up -d
```

## 高级配置

### 使用自定义网络

```yaml
services:
  qq-farm-bot-ui:
    networks:
      - farm-network

networks:
  farm-network:
    driver: bridge
```

### 配置日志

```yaml
services:
  qq-farm-bot-ui:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 健康检查

```yaml
services:
  qq-farm-bot-ui:
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/ping', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 多实例部署

```yaml
services:
  qq-farm-bot-ui-1:
    build: .
    container_name: qq-farm-bot-ui-1
    ports:
      - "3001:3000"
    volumes:
      - ./data1:/app/data

  qq-farm-bot-ui-2:
    build: .
    container_name: qq-farm-bot-ui-2
    ports:
      - "3002:3000"
    volumes:
      - ./data2:/app/data
```

## 生产环境建议

1. **修改默认密码**
   ```yaml
   environment:
     - ADMIN_PASSWORD=your_strong_password_here
   ```

2. **使用反向代理**（Nginx/Caddy）
   ```nginx
   server {
       listen 80;
       server_name farm.example.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

3. **配置 HTTPS**（使用 Let's Encrypt）

4. **定期备份数据**
   ```bash
   # 添加到 crontab
   0 2 * * * cd /path/to/project && tar -czf backup-$(date +\%Y\%m\%d).tar.gz data/
   ```

5. **监控容器状态**
   ```bash
   # 使用 Docker 健康检查
   docker compose ps
   ```

## 更新项目

```bash
# 1. 备份数据
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# 2. 停止服务
docker compose down

# 3. 拉取最新代码
git pull

# 4. 重新构建并启动
docker compose up -d --build

# 5. 查看日志确认启动成功
docker compose logs -f
```

## 卸载

```bash
# 停止并删除容器
docker compose down

# 删除镜像
docker rmi qq-farm-bot-ui:latest

# 删除数据（可选）
rm -rf data/

# 删除项目目录
cd ..
rm -rf qq-farm-bot-uinodejs
```

## 技术支持

- 项目地址：https://github.com/Penty-d/qq-farm-bot-uinodejs
- 原作者：https://github.com/linguo2625469/qq-farm-bot
- 问题反馈：提交 Issue 到 GitHub

## 许可证

本项目仅供学习和研究用途。
