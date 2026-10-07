const WebSocket = require('ws');
const { verifyToken } = require('./middleware/auth');
const { getDb, now } = require('./db');

const PING_INTERVAL = 30000;
const PONG_TIMEOUT = 10000;

const userConnections = new Map();

function getConnections(userId) {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  return userConnections.get(userId);
}

function sendToUser(userId, type, data) {
  const conns = userConnections.get(userId);
  if (!conns || conns.size === 0) return;

  const message = JSON.stringify({ type, data });
  for (const ws of conns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function sendToGroup(groupId, type, data, excludeUserId) {
  const db = getDb();
  const members = db
    .prepare('SELECT user_id FROM group_members WHERE group_id = ?')
    .all(groupId);

  for (const m of members) {
    if (excludeUserId && m.user_id === excludeUserId) continue;
    sendToUser(m.user_id, type, data);
  }
}

function broadcastOnlineStatus(userId, online) {
  const db = getDb();
  const friends = db
    .prepare('SELECT friend_id FROM friendships WHERE user_id = ?')
    .all(userId);

  for (const f of friends) {
    const conns = userConnections.get(f.friend_id);
    if (conns && conns.size > 0) {
      sendToUser(f.friend_id, 'online_status', { userId, online });
    }
  }
}

function initWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(1008, '认证失败');
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      ws.close(1008, '令牌无效');
      return;
    }

    const userId = payload.userId;
    ws.userId = userId;
    ws.isAlive = true;

    const conns = getConnections(userId);
    const wasEmpty = conns.size === 0;
    conns.add(ws);

    if (wasEmpty) {
      const db = getDb();
      const ts = now();
      db.prepare(
        `UPDATE chat_users SET online_status = 1, last_seen_at = ?, updated_at = ? WHERE id = ?`
      ).run(ts, ts, userId);
      broadcastOnlineStatus(userId, true);
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      const userConns = userConnections.get(userId);
      if (userConns) {
        userConns.delete(ws);
        if (userConns.size === 0) {
          userConnections.delete(userId);
          const db = getDb();
          const ts = now();
          db.prepare(
            `UPDATE chat_users SET online_status = 0, last_seen_at = ?, updated_at = ? WHERE id = ?`
          ).run(ts, ts, userId);
          broadcastOnlineStatus(userId, false);
        }
      }
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          }
        }
      } catch (err) {
        // ignore malformed messages
      }
    });
  });

  const pingTimer = setInterval(() => {
    for (const [userId, conns] of userConnections) {
      for (const ws of conns) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (err) {
          ws.terminate();
        }
      }
    }
  }, PING_INTERVAL);

  wss.on('close', () => {
    clearInterval(pingTimer);
  });

  return wss;
}

module.exports = {
  initWebSocket,
  sendToUser,
  sendToGroup,
  userConnections,
};
