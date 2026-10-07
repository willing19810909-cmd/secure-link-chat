const express = require('express');
const { getDb, uuid, now } = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendToUser } = require('../websocket');

const router = express.Router();

function userToPublic(row) {
  return {
    id: row.id,
    idCode: row.id_code,
    username: row.username,
    publicKey: row.public_key,
    onlineStatus: !!row.online_status,
    lastSeenAt: row.last_seen_at || now(),
  };
}

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;

  const friendships = db
    .prepare(
      `SELECT f.id, f.friend_id, f.remark_name
       FROM friendships f
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`
    )
    .all(userId);

  const items = friendships.map((f) => {
    const friendRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(f.friend_id);
    return {
      id: f.id,
      friendId: f.friend_id,
      friend: friendRow ? userToPublic(friendRow) : null,
      remarkName: f.remark_name,
    };
  });

  res.json(items);
});

router.post('/request', authenticate, (req, res) => {
  const db = getDb();
  const senderId = req.userId;
  const { idCode } = req.body;

  if (!idCode) {
    return res.status(400).json({ error: '缺少 idCode' });
  }

  const receiver = db
    .prepare('SELECT * FROM chat_users WHERE id_code = ?')
    .get(idCode.toUpperCase());

  if (!receiver) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (receiver.id === senderId) {
    return res.status(400).json({ error: '不能添加自己为好友' });
  }

  const existingFriend = db
    .prepare(
      'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?'
    )
    .get(senderId, receiver.id);

  if (existingFriend) {
    return res.status(400).json({ error: '已经是好友了' });
  }

  const existingReq = db
    .prepare(
      `SELECT id, status FROM friend_requests
       WHERE sender_id = ? AND receiver_id = ?`
    )
    .get(senderId, receiver.id);

  if (existingReq && existingReq.status === 'pending') {
    return res.status(400).json({ error: '好友请求已发送，等待对方确认' });
  }

  const id = uuid();
  const ts = now();

  if (existingReq) {
    db.prepare(
      `UPDATE friend_requests SET status = 'pending', updated_at = ? WHERE id = ?`
    ).run(ts, existingReq.id);
  } else {
    db.prepare(
      `INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`
    ).run(id, senderId, receiver.id, ts, ts);
  }

  const reqId = existingReq ? existingReq.id : id;
  const senderRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(senderId);
  const receiverRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(receiver.id);

  const result = {
    id: reqId,
    sender: userToPublic(senderRow),
    receiver: userToPublic(receiverRow),
    status: 'pending',
    createdAt: ts,
  };

  sendToUser(receiver.id, 'friend_request', result);

  res.json(result);
});

router.get('/requests', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;

  const reqs = db
    .prepare(
      `SELECT * FROM friend_requests
       WHERE receiver_id = ? AND status = 'pending'
       ORDER BY created_at DESC`
    )
    .all(userId);

  const items = reqs.map((r) => {
    const senderRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(r.sender_id);
    return {
      id: r.id,
      sender: senderRow ? userToPublic(senderRow) : null,
      status: r.status,
      createdAt: r.created_at,
    };
  });

  res.json(items);
});

router.post('/requests/:id/accept', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const requestId = req.params.id;

  const request = db
    .prepare('SELECT * FROM friend_requests WHERE id = ?')
    .get(requestId);

  if (!request || request.receiver_id !== userId) {
    return res.status(404).json({ error: '请求不存在' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: '请求已处理' });
  }

  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?`
    ).run(ts, requestId);

    const insertFs = db.prepare(
      `INSERT INTO friendships (id, user_id, friend_id, remark_name, shared_secret, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?)`
    );

    insertFs.run(uuid(), request.sender_id, request.receiver_id, ts, ts);
    insertFs.run(uuid(), request.receiver_id, request.sender_id, ts, ts);
  });

  tx();

  const senderRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(request.sender_id);
  const receiverRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(request.receiver_id);

  sendToUser(request.sender_id, 'friend_accepted', {
    friend: userToPublic(receiverRow),
  });

  res.json({ success: true });
});

router.post('/requests/:id/reject', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const requestId = req.params.id;

  const request = db
    .prepare('SELECT * FROM friend_requests WHERE id = ?')
    .get(requestId);

  if (!request || request.receiver_id !== userId) {
    return res.status(404).json({ error: '请求不存在' });
  }

  const ts = now();
  db.prepare(
    `UPDATE friend_requests SET status = 'rejected', updated_at = ? WHERE id = ?`
  ).run(ts, requestId);

  res.json({ success: true });
});

router.delete('/:friendId', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const friendId = req.params.friendId;

  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM friendships WHERE user_id = ? AND friend_id = ?'
    ).run(userId, friendId);
    db.prepare(
      'DELETE FROM friendships WHERE user_id = ? AND friend_id = ?'
    ).run(friendId, userId);
  });

  tx();
  res.json({ success: true });
});

router.patch('/:friendId/remark', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const friendId = req.params.friendId;
  const { remarkName } = req.body;

  const ts = now();
  const result = db.prepare(
    `UPDATE friendships SET remark_name = ?, updated_at = ?
     WHERE user_id = ? AND friend_id = ?`
  ).run(remarkName || null, ts, userId, friendId);

  if (result.changes === 0) {
    return res.status(404).json({ error: '好友不存在' });
  }

  res.json({ success: true });
});

module.exports = router;
