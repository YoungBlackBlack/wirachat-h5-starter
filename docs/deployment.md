# Deployment

模板的部署模式:**单台 VPS + PM2 + Nginx + 多环境**,test/prod 各自独立进程 + 独立 DB + 独立域名。

## 一次性准备

### 目标机器

1. Node ≥ 20 + PM2 + MySQL 8(本机或 RDS)+ Nginx
2. 创建 deploy 用户:`useradd -m -s /bin/bash deploy`
3. 应用目录:`mkdir -p /var/www/your-project && chown deploy:deploy /var/www/your-project`
4. `sudo -u deploy git clone <repo> /var/www/your-project`
5. `sudo -u deploy bash -c 'cd /var/www/your-project && npm ci'`

### 本地

```bash
cp .deploy.env.example .deploy.env
vim .deploy.env        # 填 DEPLOY_HOST / PM2_APP_* / PUBLIC_HEALTH_URL_* 等
```

`.deploy.env` 已经在 `.gitignore`。

### PM2 配置

创建 `/var/www/your-project/ecosystem.config.cjs`(模板没内置,按项目定):

```js
module.exports = {
  apps: [
    {
      name: "your-project-test",
      script: "server/index.js",
      cwd: "/var/www/your-project",
      node_args: "--env-file=.env.test --env-file=.env",
      env: { APP_ENV: "test", PORT: 3002 },
    },
    {
      name: "your-project-prod",
      script: "server/index.js",
      cwd: "/var/www/your-project",
      node_args: "--env-file=.env.production --env-file=.env",
      env: { APP_ENV: "production", PORT: 3001 },
    },
  ],
};
```

首次启动:`sudo -u deploy pm2 start ecosystem.config.cjs && sudo -u deploy pm2 save`。

### Nginx 反代

为每个环境一个 server{} 块:

```nginx
server {
  listen 443 ssl http2;
  server_name your-project.example.com;
  ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 日常发布

```bash
# 推代码到对应分支
git push origin test

# 本地一键部署
bash scripts/deploy.sh test
# 或
bash scripts/deploy.sh production
```

脚本会:
1. SSH 到目标机 → 切到 deploy 用户
2. `git fetch` + `reset --hard origin/<branch>`
3. `npm ci` + `npm run db:init:<env>`
4. `pm2 reload`
5. 本地 health check + 公网 health check

## 多环境 .env

后端按这个顺序加载(见 `server/env.js`):

1. `.env.{APP_ENV}.local` — 本机覆盖,不提交
2. `.env.{APP_ENV}` — 环境级,不提交(含 DB/COS/IM 密钥)
3. `.env.local` — 通用本地
4. `.env` — 仓库共享默认

生产机上只放 `.env.production` + `.env.test`;本地开发只放 `.env.local`。

## 灰度 / 回滚

- **灰度**: 先部署 test,手动/自动回归 → 再部署 production。
- **回滚**: `ssh deploy@host 'cd /var/www/your-project && git reset --hard <prev-sha> && pm2 reload ecosystem.config.cjs'`。
- **DB 回滚**: 没有自动机制;建议每次上线前 `mysqldump` 一份。

## 监控

模板内置:
- `/api/health` — 进程/DB/配置状态
- `/api/debug/dump` — 当前 env 扫描(不含密钥)
- 10% 抽样的 `api_request_completed` 埋点(存 `analytics_events`)

业务层额外接入 Sentry / 监控可自行扩展。
