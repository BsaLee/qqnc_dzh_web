.PHONY: help build up down restart logs ps clean backup restore

# 默认目标
help:
	@echo "QQ 农场 Docker 管理命令"
	@echo ""
	@echo "使用方法: make [命令]"
	@echo ""
	@echo "可用命令:"
	@echo "  build    - 构建 Docker 镜像"
	@echo "  up       - 启动服务（后台运行）"
	@echo "  down     - 停止服务"
	@echo "  restart  - 重启服务"
	@echo "  logs     - 查看实时日志"
	@echo "  ps       - 查看服务状态"
	@echo "  clean    - 清理容器和镜像"
	@echo "  backup   - 备份数据"
	@echo "  restore  - 恢复数据（需要指定备份文件）"
	@echo ""

# 构建镜像
build:
	docker compose build

# 启动服务
up:
	docker compose up -d
	@echo "服务已启动，访问 http://localhost:3000"

# 停止服务
down:
	docker compose down

# 重启服务
restart:
	docker compose restart

# 查看日志
logs:
	docker compose logs -f

# 查看服务状态
ps:
	docker compose ps

# 清理
clean:
	docker compose down -v
	docker rmi qq-farm-bot-ui:latest 2>/dev/null || true

# 备份数据
backup:
	@mkdir -p backups
	@tar -czf backups/backup-$$(date +%Y%m%d-%H%M%S).tar.gz data/
	@echo "备份完成: backups/backup-$$(date +%Y%m%d-%H%M%S).tar.gz"

# 恢复数据（使用方法: make restore FILE=backups/backup-20240224-120000.tar.gz）
restore:
	@if [ -z "$(FILE)" ]; then \
		echo "错误: 请指定备份文件"; \
		echo "使用方法: make restore FILE=backups/backup-20240224-120000.tar.gz"; \
		exit 1; \
	fi
	docker compose down
	tar -xzf $(FILE)
	docker compose up -d
	@echo "数据恢复完成"
