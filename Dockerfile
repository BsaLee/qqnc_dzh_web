FROM node:20-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装生产依赖
RUN npm ci --omit=dev && npm cache clean --force

# 复制项目文件
COPY . .

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口（可通过环境变量覆盖）
EXPOSE 3000

# 启动应用
CMD ["node", "client.js"]
