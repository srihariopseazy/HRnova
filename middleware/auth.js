'use strict';
const jwt = require('jsonwebtoken');
const { getDb, ObjectId, sdoc } = require('../db');

const SECRET = process.env.JWT_SECRET || 'hrnova_secret';

// Attach user to req.user from Bearer token
async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) { req.user = null; return next(); }
    const payload = jwt.verify(token, SECRET);
    const db  = getDb();
    const emp = await db.collection('employees').findOne({ _id: new ObjectId(payload.id) });
    req.user  = emp ? sdoc(emp) : null;
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin only' });
  next();
}

function requireLeaderOrAdmin(req, res, next) {
  if (!req.user || !['admin', 'team_leader'].includes(req.user.role))
    return res.status(403).json({ error: 'No access' });
  next();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id || user._id.toString(), email: user.email, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { authMiddleware, requireAuth, requireAdmin, requireLeaderOrAdmin, signToken };