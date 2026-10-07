const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'enc-chat-secret-key-2024';
const JWT_EXPIRES_IN = '7d';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: '认证令牌无效或已过期' });
  }

  req.userId = payload.userId;
  next();
}

module.exports = {
  authenticate,
  generateToken,
  verifyToken,
};
