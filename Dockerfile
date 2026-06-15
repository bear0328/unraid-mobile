# 多阶段 build — 全部在本地开发机跑，unraid 端不跑 npm / 不装 node
#
# Stage 1: 装依赖 + 构建（node:22-alpine 基础镜像，本地 docker build）
# Stage 2: 只复制 dist 给 nginx alpine（unraid 端 docker load 进来就用）

# ========== Stage 1: 构建 React 应用 ==========
FROM --platform=linux/amd64 node:22-alpine AS builder

WORKDIR /app

# 装依赖（layer cache：package.json 没变就不重装）
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 复制源码 + build
COPY . .
RUN npm run build

# ========== Stage 2: nginx 运行静态文件 ==========
FROM --platform=linux/amd64 nginx:alpine

# 【续 50 D5】server 配置改走 envsubst 模板:容器启动时 ${UNRAID_UPSTREAM} 被替换
# (nginx:alpine ≥1.19 原生支持 /etc/nginx/templates/*.template → conf.d/*.conf)
COPY default.conf /etc/nginx/templates/default.conf.template

# unRAID GraphQL 上游(用户必须改成自己的 unRAID 地址;此默认只是占位)
ENV UNRAID_UPSTREAM=http://192.168.1.100:8001

# 【续 47 2026-07-19】主配置:worker 加 root 组(访问宿主 php-fpm.sock 需要)
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# 只复制 Stage 1 的 dist（不复制 node_modules / 源码）
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制配置目录(【续 49】settings.json 只存 serverUrl,不落 apiKey)
RUN mkdir -p /usr/share/nginx/html/config && \
    echo '{"serverUrl":""}' > /usr/share/nginx/html/config/settings.json

# 暴露端口
EXPOSE 80

# 健康检查
# 注意：必须用 127.0.0.1 不能用 localhost —— alpine 容器 /etc/hosts 把 localhost
# 同时映射到 ::1，busybox wget 优先走 IPv6，而 default.conf 只 listen IPv4，
# 导致 healthcheck 永远 connection refused（2026-07-17 排查，FailingStreak 14000+）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
