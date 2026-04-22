-- wirachat-h5-starter 骨架表:只有 users + analytics_events。
-- 业务项目在此文件之后新增自己的 002_xxx.sql,按文件名顺序被 bootstrapDatabase 加载。
-- users.user_code 约定前缀:
--   phone:<E.164>     手机号登录
--   webview:<extId>   WebView 宿主派发的外部 id
--   业务可再扩展自己的前缀(例如 laboo:<uid>),落库前自行保证唯一。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_code VARCHAR(64) NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(512) DEFAULT NULL,
  gender ENUM('male', 'female', 'unknown') NOT NULL DEFAULT 'unknown',
  age TINYINT UNSIGNED DEFAULT NULL,
  bio VARCHAR(255) DEFAULT NULL,
  city VARCHAR(64) DEFAULT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_user_code (user_code),
  KEY idx_users_status_created_at (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 统一埋点事件表:前后端所有用户行为都落在这里。
-- 所有字段除主键、event_name、occurred_at 外都允许为空,
-- 业务不同事件挑选性填充;自由结构放在 properties JSON。
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_name VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  session_id VARCHAR(64) NULL,
  source VARCHAR(16) NULL,        -- 'client' | 'server'
  app_env VARCHAR(16) NULL,       -- 'production' | 'test' | 'development'
  client_platform VARCHAR(16) NULL,
  client_version VARCHAR(32) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  properties JSON NULL,
  occurred_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_event_occurred (event_name, occurred_at),
  KEY idx_user_occurred (user_id, occurred_at),
  KEY idx_occurred_at (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
