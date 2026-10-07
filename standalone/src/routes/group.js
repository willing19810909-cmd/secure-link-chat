const express = require('express');
const { getDb, uuid, now, generateIdCode } = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendToGroup } = require('../websocket');

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

function groupToPublic(row) {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    groupCode: row.group_code,
    ownerId: row.owner_id,
    memberCount: row.member_count,
    createdAt: row.created_at,
  };
}

function groupMessageToItem(row) {
  const senderRow = getDb()
    .prepare('SELECT username FROM chat_users WHERE id = ?')
    .get(row.sender_id);
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    senderUsername: senderRow ? senderRow.username : '',
    msgType: row.msg_type,
    encryptedContent: row.encrypted_content,
    iv: row.iv,
    status: row.status,
    createdAt: row.created_at,
    isRecalled: !!row.is_recalled,
    recalledAt: row.recalled_at,
  };
}

router.post('/create', authenticate, (req, res) => {
  const db = getDb();
  const ownerId = req.userId;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '群组名称不能为空' });
  }

  let groupCode;
  let attempts = 0;
  const checkStmt = db.prepare('SELECT id FROM chat_groups WHERE group_code = ?');
  while (attempts < 10) {
    groupCode = generateIdCode(8);
    if (!checkStmt.get(groupCode)) break;
    attempts++;
  }

  const groupId = uuid();
  const ts = now();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO chat_groups (id, name, avatar_url, group_code, owner_id, member_count, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 1, ?, ?)`
    ).run(groupId, name.trim(), groupCode, ownerId, ts, ts);

    const memberId = uuid();
    db.prepare(
      `INSERT INTO group_members (id, group_id, user_id, role, nickname, joined_at, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', NULL, ?, ?, ?)`
    ).run(memberId, groupId, ownerId, ts, ts, ts);
  });

  tx();

  const groupRow = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
  res.json(groupToPublic(groupRow));
});

router.get('/my-groups', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;

  const memberships = db
    .prepare('SELECT group_id FROM group_members WHERE user_id = ?')
    .all(userId);

  if (memberships.length === 0) {
    return res.json([]);
  }

  const groupIds = memberships.map((m) => m.group_id);
  const placeholders = groupIds.map(() => '?').join(',');
  const groups = db
    .prepare(`SELECT * FROM chat_groups WHERE id IN (${placeholders})`)
    .all(...groupIds);

  const items = groups.map((g) => {
    const lastMsg = db
      .prepare(
        `SELECT encrypted_content, created_at, is_recalled
         FROM group_messages
         WHERE group_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(g.id);

    const unreadRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM group_messages
         WHERE group_id = ? AND sender_id != ? AND status = 'sent'`
      )
      .get(g.id, userId);

    return {
      group: groupToPublic(g),
      lastMessage: lastMsg && !lastMsg.is_recalled ? lastMsg.encrypted_content : undefined,
      lastMessageTime: lastMsg ? lastMsg.created_at : undefined,
      unreadCount: unreadRow ? unreadRow.count : 0,
    };
  });

  res.json(items);
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const groupId = req.params.id;

  const membership = db
    .prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);

  if (!membership) {
    return res.status(403).json({ error: '您不是该群成员' });
  }

  const groupRow = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
  if (!groupRow) {
    return res.status(404).json({ error: '群组不存在' });
  }

  const members = db
    .prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY role DESC')
    .all(groupId);

  const userIds = members.map((m) => m.user_id);
  const placeholders = userIds.map(() => '?').join(',');
  const users = userIds.length > 0
    ? db.prepare(`SELECT * FROM chat_users WHERE id IN (${placeholders})`).all(...userIds)
    : [];

  const userMap = new Map();
  for (const u of users) userMap.set(u.id, u);

  const memberItems = members.map((m) => ({
    id: m.id,
    groupId: m.group_id,
    userId: m.user_id,
    user: userMap.has(m.user_id) ? userToPublic(userMap.get(m.user_id)) : null,
    role: m.role,
    nickname: m.nickname,
    joinedAt: m.joined_at,
  }));

  res.json({
    group: groupToPublic(groupRow),
    members: memberItems,
  });
});

router.post('/invite', authenticate, (req, res) => {
  const db = getDb();
  const inviterId = req.userId;
  const { groupId, friendIds } = req.body;

  if (!groupId || !Array.isArray(friendIds) || friendIds.length === 0) {
    return res.status(400).json({ error: '参数错误' });
  }

  const membership = db
    .prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, inviterId);

  if (!membership) {
    return res.status(403).json({ error: '您不是该群成员，无法邀请' });
  }

  const validFriends = [];
  for (const fid of friendIds) {
    const fs = db
      .prepare(
        'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?'
      )
      .get(inviterId, fid);
    if (fs) validFriends.push(fid);
  }

  if (validFriends.length === 0) {
    return res.status(400).json({ error: '没有可邀请的好友' });
  }

  const existingMembers = db
    .prepare(
      `SELECT user_id FROM group_members WHERE group_id = ? AND user_id IN (${validFriends.map(() => '?').join(',')})`
    )
    .all(groupId, ...validFriends);

  const existingSet = new Set(existingMembers.map((m) => m.user_id));
  const newUserIds = validFriends.filter((uid) => !existingSet.has(uid));

  if (newUserIds.length === 0) {
    return res.json({ success: true, added: 0 });
  }

  const ts = now();
  const tx = db.transaction(() => {
    const insertStmt = db.prepare(
      `INSERT INTO group_members (id, group_id, user_id, role, nickname, joined_at, created_at, updated_at)
       VALUES (?, ?, ?, 'member', NULL, ?, ?, ?)`
    );
    for (const uid of newUserIds) {
      insertStmt.run(uuid(), groupId, uid, ts, ts, ts);
    }

    db.prepare(
      `UPDATE chat_groups SET member_count = member_count + ?, updated_at = ? WHERE id = ?`
    ).run(newUserIds.length, ts, groupId);
  });

  tx();

  for (const uid of newUserIds) {
    sendToGroup(groupId, 'group_member_joined', { userId: uid }, null);
  }

  res.json({ success: true, added: newUserIds.length });
});

router.post('/remove', authenticate, (req, res) => {
  const db = getDb();
  const operatorId = req.userId;
  const { groupId, userId } = req.body;

  if (!groupId || !userId) {
    return res.status(400).json({ error: '参数错误' });
  }

  const groupRow = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
  if (!groupRow) {
    return res.status(404).json({ error: '群组不存在' });
  }

  if (groupRow.owner_id !== operatorId) {
    return res.status(403).json({ error: '只有群主可以移除成员' });
  }

  if (userId === operatorId) {
    return res.status(400).json({ error: '不能移除自己' });
  }

  const ts = now();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    db.prepare(
      `UPDATE chat_groups SET member_count = member_count - 1, updated_at = ? WHERE id = ?`
    ).run(ts, groupId);
  });

  tx();

  sendToGroup(groupId, 'group_member_left', { userId }, null);

  res.json({ success: true });
});

router.post('/leave', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const { groupId } = req.body;

  if (!groupId) {
    return res.status(400).json({ error: '参数错误' });
  }

  const groupRow = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
  if (!groupRow) {
    return res.status(404).json({ error: '群组不存在' });
  }

  if (groupRow.owner_id === userId) {
    return res.status(400).json({ error: '群主不能退出群组，只能解散' });
  }

  const membership = db
    .prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);

  if (!membership) {
    return res.status(400).json({ error: '您不是该群成员' });
  }

  const ts = now();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    db.prepare(
      `UPDATE chat_groups SET member_count = member_count - 1, updated_at = ? WHERE id = ?`
    ).run(ts, groupId);
  });

  tx();

  sendToGroup(groupId, 'group_member_left', { userId }, null);

  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const groupId = req.params.id;

  const groupRow = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
  if (!groupRow) {
    return res.status(404).json({ error: '群组不存在' });
  }

  if (groupRow.owner_id !== userId) {
    return res.status(403).json({ error: '只有群主可以解散群组' });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM group_messages WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM chat_groups WHERE id = ?').run(groupId);
  });

  tx();

  res.json({ success: true });
});

router.get('/messages/:groupId', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const groupId = req.params.groupId;
  const cursor = req.query.cursor;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  const membership = db
    .prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);

  if (!membership) {
    return res.status(403).json({ error: '您不是该群成员' });
  }

  const limitPlusOne = limit + 1;
  let rows;

  if (cursor) {
    const cursorMsg = db
      .prepare('SELECT created_at FROM group_messages WHERE id = ?')
      .get(cursor);
    if (cursorMsg) {
      rows = db
        .prepare(
          `SELECT * FROM group_messages
           WHERE group_id = ? AND created_at < ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(groupId, cursorMsg.created_at, limitPlusOne);
    } else {
      rows = db
        .prepare(
          `SELECT * FROM group_messages
           WHERE group_id = ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(groupId, limitPlusOne);
    }
  } else {
    rows = db
      .prepare(
        `SELECT * FROM group_messages
         WHERE group_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(groupId, limitPlusOne);
  }

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  res.json({
    items: items.map(groupMessageToItem).reverse(),
    hasMore,
    nextCursor,
  });
});

router.post('/send', authenticate, (req, res) => {
  const db = getDb();
  const senderId = req.userId;
  const { groupId, msgType, encryptedContent, iv } = req.body;

  if (!groupId || !encryptedContent) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  const membership = db
    .prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, senderId);

  if (!membership) {
    return res.status(403).json({ error: '您不是该群成员' });
  }

  const id = uuid();
  const ts = now();

  db.prepare(
    `INSERT INTO group_messages (id, group_id, sender_id, msg_type, encrypted_content, iv, status, is_recalled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'sent', 0, ?, ?)`
  ).run(id, groupId, senderId, msgType || 'text', encryptedContent, iv || null, ts, ts);

  const msgRow = db.prepare('SELECT * FROM group_messages WHERE id = ?').get(id);
  const message = groupMessageToItem(msgRow);

  sendToGroup(groupId, 'group_message', message, senderId);

  res.json(message);
});

router.post('/recall', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.userId;
  const { groupId, messageId } = req.body;

  if (!groupId || !messageId) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  const membership = db
    .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);

  if (!membership) {
    return res.status(403).json({ error: '您不是该群成员' });
  }

  const msg = db.prepare('SELECT * FROM group_messages WHERE id = ?').get(messageId);
  if (!msg) {
    return res.status(404).json({ error: '消息不存在' });
  }

  if (msg.group_id !== groupId) {
    return res.status(400).json({ error: '消息不在该群中' });
  }

  const isOwner = membership.role === 'owner';
  if (msg.sender_id !== userId && !isOwner) {
    return res.status(403).json({ error: '只能撤回自己的消息' });
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
    `UPDATE group_messages SET is_recalled = 1, recalled_at = ?, updated_at = ? WHERE id = ?`
  ).run(ts, ts, messageId);

  const payload = { groupId, messageId, userId, createdAt: ts };
  sendToGroup(groupId, 'group_recall', payload, null);

  res.json({ success: true });
});

module.exports = router;
