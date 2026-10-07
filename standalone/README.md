# 端到端加密即时通讯

一个完全独立部署的端到端加密即时通讯 Web 应用。所有消息在发送端加密、接收端解密，服务器仅存储密文，无法读取消息内容。

## 功能特性

- **端到端加密**：ECDH (P-256) 密钥交换 + AES-GCM (256位) 消息加密，每对好友独立密钥
- **身份编码**：注册自动生成 8 位身份编码，通过编码添加好友
- **好友系统**：好友请求、接受/拒绝、删除好友、修改备注
- **消息类型**：文字、图片、视频、语音消息
- **消息撤回**：发送后 2 分钟内可撤回
- **消息状态**：发送中 / 已送达 / 已读
- **群聊**：创建群组、邀请好友、移除成员、退出、解散
- **实时通信**：WebSocket 实时推送，自动重连
- **文件上传**：本地存储，支持大文件
- **响应式布局**：适配桌面、平板、手机
- **深色主题**：护眼深色界面
- **PWA 支持**：可安装到桌面/主屏幕

## 环境要求

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- 操作系统：Linux / macOS / Windows 均可

## 安装步骤

```bash
# 克隆或下载项目
cd encrypted-chat

# 安装后端依赖
npm install

# 安装前端依赖
cd frontend
npm install
cd ..

# 复制环境变量配置
cp .env.example .env

# 构建前端（生成静态文件到 public/）
cd frontend
npm run build
cd ..
```

## 启动方式

### 开发模式

```bash
# 终端 1：启动后端（端口 3000）
npm start

# 终端 2：启动前端开发服务器（端口 5173，自动代理 API 请求）
cd frontend
npm run dev
```

浏览器打开 `http://localhost:5173` 即可使用。

### 生产模式

```bash
# 构建前端静态文件
cd frontend && npm run build && cd ..

# 启动服务
npm start
```

浏览器打开 `http://localhost:3000` 即可使用。

### PM2 守护进程部署

```bash
# 全局安装 PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name encrypted-chat

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status              # 查看状态
pm2 logs encrypted-chat # 查看日志
pm2 restart encrypted-chat  # 重启
pm2 stop encrypted-chat     # 停止
```

## 环境变量

复制 `.env.example` 为 `.env` 并按需修改：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务监听端口 |
| JWT_SECRET | change-this-secret-in-production-2024 | JWT 签名密钥，**生产环境必须修改** |
| MAX_UPLOAD_SIZE | 104857600 | 上传文件大小限制（字节，默认 100MB） |

## 项目结构

```
encrypted-chat/
├── package.json          # 后端依赖
├── .env.example          # 环境变量示例
├── server.js             # 服务入口
├── src/
│   ├── db.js             # SQLite 数据库初始化与封装
│   ├── websocket.js      # WebSocket 实时通信服务
│   ├── middleware/
│   │   └── auth.js       # JWT 认证中间件
│   ├── routes/
│   │   ├── auth.js       # 注册/登录/用户信息
│   │   ├── friend.js     # 好友管理
│   │   ├── message.js    # 单聊消息
│   │   ├── group.js      # 群聊
│   │   └── upload.js     # 文件上传
│   └── utils/            # 工具函数
├── frontend/             # 前端源码（React + Vite）
│   ├── src/
│   ├── public/
│   └── package.json
├── public/               # 前端构建产物（运行时自动生成）
├── data/                 # SQLite 数据库文件（运行时生成）
├── uploads/              # 上传文件存储（运行时生成）
└── README.md
```

## API 接口

所有接口前缀为 `/api`。

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/register | 注册 |
| POST | /auth/login | 登录 |
| GET | /auth/me | 当前用户信息 |

### 好友

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /friends | 好友列表 |
| POST | /friends/request | 发送好友请求 |
| GET | /friends/requests | 收到的好友请求 |
| POST | /friends/requests/:id/accept | 接受请求 |
| POST | /friends/requests/:id/reject | 拒绝请求 |
| DELETE | /friends/:friendId | 删除好友 |
| PATCH | /friends/:friendId/remark | 修改备注 |

### 单聊消息

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /messages/:friendId | 消息列表（游标分页） |
| POST | /messages/send | 发送消息 |
| POST | /messages/:friendId/read | 标记已读 |
| POST | /message/recall | 撤回消息 |

### 群聊

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /group/create | 创建群组 |
| GET | /group/my-groups | 我的群组 |
| GET | /group/:id | 群组详情 |
| POST | /group/invite | 邀请成员 |
| POST | /group/remove | 移除成员 |
| POST | /group/leave | 退出群组 |
| DELETE | /group/:id | 解散群组 |
| GET | /group/messages/:groupId | 群消息列表 |
| POST | /group/send | 发送群消息 |
| POST | /group/recall | 撤回群消息 |

### 文件上传

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /upload | 上传文件（multipart/form-data，字段名 file） |

## WebSocket 协议

连接地址：`ws://<host>/ws?token=<jwt_token>`

消息格式：JSON `{ type, data }`

### 服务端推送

| type | 说明 | data |
|------|------|------|
| message | 新单聊消息 | 消息对象 |
| group_message | 新群消息 | 消息对象 |
| recall | 消息撤回 | { messageId, userId } |
| group_recall | 群消息撤回 | { groupId, messageId } |
| friend_request | 新好友请求 | 请求对象 |
| friend_accepted | 好友被接受 | 好友对象 |
| online_status | 好友在线状态 | { userId, online } |
| read_receipt | 已读回执 | { friendId } |

## Nginx 反向代理配置

支持 WebSocket 的 Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name chat.example.com;

    # 静态文件
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    # 上传文件（按需调大）
    client_max_body_size 100M;
}
```

## HTTPS 配置（推荐）

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 申请证书并自动配置 Nginx
certbot --nginx -d chat.example.com
```

配置后，WebSocket 连接会自动使用 `wss://` 协议。

## 数据备份

应用数据全部存储在以下两个目录中，定期备份即可：

- `data/` — SQLite 数据库文件
- `uploads/` — 用户上传的文件

### 备份脚本示例

```bash
#!/bin/bash
BACKUP_DIR="/backup/encrypted-chat"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 备份数据库（使用 SQLite 备份命令保证一致性）
sqlite3 data/chat.db ".backup '$BACKUP_DIR/chat_$DATE.db'"

# 备份上传文件
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" uploads/

# 保留最近 30 天备份
find "$BACKUP_DIR" -name "chat_*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +30 -delete
```

加入 crontab 每日自动备份：

```
0 3 * * * /path/to/backup.sh >> /var/log/chat-backup.log 2>&1
```

## 安全说明

- 所有消息内容在浏览器端加密后上传，服务器仅存储密文
- 加密密钥由 ECDH 密钥交换派生，服务器无法获取
- 私钥用用户密码加密后存储在服务器，登录后在浏览器解密
- 建议生产环境启用 HTTPS，防止传输层窃听
- 建议修改 `JWT_SECRET` 为强随机字符串

## 许可证

MIT License
