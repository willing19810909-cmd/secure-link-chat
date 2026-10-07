const express = require('express');
const { getDb, uuid, now } = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendToUser } = require('../websocket');

const router = express.Router();

function messageToItem(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    msgType: row.msg_type,
    encryptedContent: row.encrypted_content,
    iv: row.iv,
    status: row.status,
    createdAt: row.created_at,
    isRecalled: !!row.is_recalled,
    recalledAt: row.recalled_at,
  };
}

router.get('/:friendId', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const friendId = req.params.friendId;
  const cursor = req.query.cursor;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  const fsRow = db
    .prepare(
      'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?'
    )
    .get(userId, friendId);

  if (!fsRow) {
    return res.json({ items: [], hasMore: false });
  }

  const friendshipId = fsRow.id;
  const limitPlusOne = limit + 1;

  let rows;
  if (cursor) {
    const cursorMsg = db
      .prepare('SELECT created_at FROM messages WHERE id = ?')
      .get(cursor);
    if (cursorMsg) {
      rows = db
        .prepare(
          `SELECT * FROM messages
           WHERE friendship_id = ? AND created_at < ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(friendshipId, cursorMsg.created_at, limitPlusOne);
    } else {
      rows = db
        .prepare(
          `SELECT * FROM messages
           WHERE friendship_id = ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(friendshipId, limitPlusOne);
    }
  } else {
    rows = db
      .prepare(
        `SELECT * FROM messages
         WHERE friendship_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(friendshipId, limitPlusOne);
  }

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  res.json({
    items: items.map(messageToItem).reverse(),
    hasMore,
    nextCursor,
  });
});

router.post('/send', authenticate, (req, res) => {
  const db = getDb();
  const senderId = req.userId;
  const { receiverId, msgType, encryptedContent, iv } = req.body;

  if (!receiverId || !encryptedContent) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  const fsRow = db
    .prepare(
      'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?'
    )
    .get(senderId, receiverId);

  if (!fsRow) {
    return res.status(400).json({ error: '不是好友关系' });
  }

  const id = uuid();
  const ts = now();

  db.prepare(
    `INSERT INTO messages (id, friendship_id, sender_id, receiver_id, msg_type, encrypted_content, iv, status, is_recalled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', 0, ?, ?)`
  ).run(id, fsRow.id, senderId, receiverId, msgType || 'text', encryptedContent, iv || null, ts, ts);

  const msgRow = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  const message = messageToItem(msgRow);

  sendToUser(receiverId, 'message', message);

  res.json(message);
});

router.post('/:friendId/read', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const friendId = req.params.friendId;

  const fsRow = db
    .prepare(
      'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?'
    )
    .get(userId, friendId);

  if (!fsRow) {
    return res.json({ success: true });
  }

  const ts = now();
  db.prepare(
    `UPDATE messages SET status = 'read', updated_at = ?
     WHERE friendship_id = ? AND receiver_id = ? AND status != 'read'`
  ).run(ts, fsRow.id, userId);

  sendToUser(friendId, 'read_receipt', { friendId: userId });

  res.json({ success: true });
});

router.post('/recall', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const { messageId } = req.body;

  if (!messageId) {
    return res.status(400).json({ error: '缺少 messageId' });
  }

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) {
    return res.status(404).json({ error: '消息不存在' });
  }

  if (msg.sender_id !== userId) {
    return res.status(403).json({ error: '只能撤回自己发送的消息' });
  }

  if (msg.is_recalled) {
    return res.status(400).json({ error: '消息已被撤回' });
  }

  const timeDiff = Date.now() - new Date(msg.created_at).getTime();
  if (timeDiff >= 2 * 60 * 1000) {
    return res.status(400).json({ error: '超过撤回时限（2分钟）' });
  }

  const ts = now();
  db.prepare(
    `UPDATE messages SET is_recalled = 1, recalled_at = ?, updated_at = ? WHERE id = ?`
  ).run(ts, ts, messageId);

  const payload = { messageId, userId, createdAt: ts };
  sendToUser(msg.receiver_id, 'recall', payload);
  sendToUser(msg.sender_id, 'recall', payload);

  res.json({ success: true });
});

module.exports = router;
