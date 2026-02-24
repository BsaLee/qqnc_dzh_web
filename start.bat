@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ================================
echo QQ 农场多账号挂机 - Docker 部署
echo ================================
echo.

REM 检查 Docker 是否安装
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: Docker 未安装
    echo 请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM 检查 Docker Compose 是否可用
docker compose version >nul 2>&1
if errorlevel 1 (
    docker-compose --version >nul 2>&1
    if errorlevel 1 (
        echo ❌ 错误: Docker Compose 未安装
        pause
        exit /b 1
    )
    set COMPOSE_CMD=docker-compose
) else (
    set COMPOSE_CMD=docker compose
)

echo ✅ Docker 环境检查通过
echo.

REM 创建数据目录
if not exist "data" (
    echo 📁 创建数据目录...
    mkdir data
)

REM 检查是否需要自定义配置
if not exist ".env" (
    echo ⚙️  生成默认配置...
    (
        echo # 管理密码（建议修改）
        echo ADMIN_PASSWORD=admin
        echo.
        echo # 服务端口
        echo PORT=3000
        echo.
        echo # 时区
        echo TZ=Asia/Shanghai
    ) > .env
    echo ✅ 配置文件已生成: .env
    echo 💡 提示: 可以编辑 .env 文件修改配置
    echo.
)

REM 询问是否要修改端口
set /p use_default_port="是否使用默认端口 3000? (Y/n): "
if /i "!use_default_port!"=="n" (
    set /p custom_port="请输入要使用的端口号: "
    echo ✅ 端口已设置为: !custom_port!
)

echo.
echo 🚀 启动服务...
%COMPOSE_CMD% up -d --build

echo.
echo ⏳ 等待服务启动...
timeout /t 5 /nobreak >nul

REM 检查服务状态
%COMPOSE_CMD% ps | findstr "Up" >nul
if errorlevel 1 (
    echo.
    echo ❌ 服务启动失败，请查看日志:
    echo    %COMPOSE_CMD% logs
    pause
    exit /b 1
)

echo.
echo ================================
echo ✅ 服务启动成功！
echo ================================
echo.
echo 📱 访问地址:
echo    本机访问: http://localhost:3000
echo.
echo 📋 常用命令:
echo    查看日志: %COMPOSE_CMD% logs -f
echo    停止服务: %COMPOSE_CMD% down
echo    重启服务: %COMPOSE_CMD% restart
echo.
echo 📖 详细文档: 查看 DOCKER.md
echo.
pause
