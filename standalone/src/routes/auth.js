const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, uuid, now, camelCase, generateIdCode } = require('../db');
const { authenticate, generateToken } = require('../middleware/auth');

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

router.post('/register', (req, res) => {
  const db = getDb();
  const { username, password, publicKey, encryptedPrivateKey } = req.body;

  if (!username || !password || !publicKey || !encryptedPrivateKey) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度至少 6 位' });
  }

  let idCode;
  let attempts = 0;
  const checkStmt = db.prepare('SELECT id FROM chat_users WHERE id_code = ?');
  while (attempts < 10) {
    idCode = generateIdCode(8);
    const existing = checkStmt.get(idCode);
    if (!existing) break;
    attempts++;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const id = uuid();
  const ts = now();

  const insertStmt = db.prepare(`
    INSERT INTO chat_users (id, id_code, username, password_hash, public_key, encrypted_private_key, online_status, last_seen_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);

  try {
    insertStmt.run(id, idCode, username, passwordHash, publicKey, encryptedPrivateKey, ts, ts, ts);
  } catch (err) {
    return res.status(500).json({ error: '注册失败' });
  }

  const userRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(id);
  const token = generateToken(id);

  res.json({
    token,
    user: userToPublic(userRow),
  });
});

router.post('/login', (req, res) => {
  const db = getDb();
  const { idCode, password } = req.body;

  if (!idCode || !password) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  const userRow = db
    .prepare('SELECT * FROM chat_users WHERE id_code = ?')
    .get(idCode.toUpperCase());

  if (!userRow) {
    return res.status(401).json({ error: '用户不存在' });
  }

  if (!bcrypt.compareSync(password, userRow.password_hash)) {
    return res.status(401).json({ error: '密码错误' });
  }

  const token = generateToken(userRow.id);

  res.json({
    token,
    user: userToPublic(userRow),
    encryptedPrivateKey: userRow.encrypted_private_key,
  });
});

router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const userRow = db.prepare('SELECT * FROM chat_users WHERE id = ?').get(req.userId);
  if (!userRow) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json(userToPublic(userRow));
});

module.exports = router;
