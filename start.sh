#!/bin/bash

# QQ 农场 Docker 快速启动脚本

set -e

echo "================================"
echo "QQ 农场多账号挂机 - Docker 部署"
echo "================================"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: Docker 未安装"
    echo "请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查 Docker Compose 是否可用
if ! docker compose version &> /dev/null; then
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ 错误: Docker Compose 未安装"
        echo "请先安装 Docker Compose"
        exit 1
    fi
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

echo "✅ Docker 环境检查通过"
echo ""

# 创建数据目录
if [ ! -d "data" ]; then
    echo "📁 创建数据目录..."
    mkdir -p data
fi

# 检查是否需要自定义配置
if [ ! -f ".env" ]; then
    echo "⚙️  生成默认配置..."
    cat > .env << EOF
# 管理密码（建议修改）
ADMIN_PASSWORD=admin

# 服务端口
PORT=3000

# 时区
TZ=Asia/Shanghai
EOF
    echo "✅ 配置文件已生成: .env"
    echo "💡 提示: 可以编辑 .env 文件修改配置"
    echo ""
fi

# 询问是否要修改端口
read -p "是否使用默认端口 3000? (Y/n): " use_default_port
if [[ $use_default_port =~ ^[Nn]$ ]]; then
    read -p "请输入要使用的端口号: " custom_port
    if [[ $custom_port =~ ^[0-9]+$ ]]; then
        sed -i.bak "s/PORT=.*/PORT=$custom_port/" .env
        sed -i.bak "s/\"[0-9]*:3000\"/\"$custom_port:3000\"/" docker-compose.yml
        echo "✅ 端口已设置为: $custom_port"
    else
        echo "⚠️  端口号无效，使用默认端口 3000"
    fi
fi

echo ""
echo "🚀 启动服务..."
$COMPOSE_CMD up -d --build

echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
if $COMPOSE_CMD ps | grep -q "Up"; then
    echo ""
    echo "================================"
    echo "✅ 服务启动成功！"
    echo "================================"
    echo ""
    
    # 获取端口
    PORT=$(grep "PORT=" .env | cut -d'=' -f2)
    
    echo "📱 访问地址:"
    echo "   本机访问: http://localhost:$PORT"
    echo "   局域网访问: http://$(hostname -I | awk '{print $1}'):$PORT"
    echo ""
    echo "📋 常用命令:"
    echo "   查看日志: $COMPOSE_CMD logs -f"
    echo "   停止服务: $COMPOSE_CMD down"
    echo "   重启服务: $COMPOSE_CMD restart"
    echo ""
    echo "📖 详细文档: 查看 DOCKER.md"
    echo ""
else
    echo ""
    echo "❌ 服务启动失败，请查看日志:"
    echo "   $COMPOSE_CMD logs"
    exit 1
fi
