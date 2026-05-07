'use strict';
const router  = require('express').Router();
const { getDb, sdoc, ObjectId } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const ALLOWED_DOMAIN = 'opseazy.com';

function checkDomain(email) {
  if (!email || !email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`))
    return `Only @${ALLOWED_DOMAIN} email addresses are allowed`;
  return null;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const domErr = checkDomain(email);
    if (domErr) return res.status(403).json({ error: domErr });

    const db  = getDb();
    const emp = await db.collection('employees').findOne({ email: email.toLowerCase() });
    if (!emp || emp.password !== password)
      return res.status(401).json({ error: 'Invalid credentials' });

    if (emp.status === 'inactive')
      return res.status(403).json({ error: 'Account is inactive. Contact admin.' });

    // Check if password change is overdue (> 2 days after account creation)
    let mustChange = false;
    let changeDeadline = null;
    if (emp.must_change_password) {
      const setAt   = new Date(emp.password_set_at || emp.created_at || Date.now());
      const now     = new Date();
      const diffMs  = now - setAt;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      changeDeadline = new Date(setAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
      if (diffDays > 2) {
        // Lock account — overdue
        return res.status(403).json({
          error: `Password change overdue. Your account has been locked. Contact admin.`,
          overdue: true,
          deadline: changeDeadline,
        });
      }
      mustChange = true;
    }

    const user  = sdoc(emp);
    const token = signToken(user);
    const { password: _pw, ...safe } = user;

    return res.json({
      ...safe,
      token,
      must_change_password: mustChange,
      change_deadline: changeDeadline,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/change-password  (employee changes their own password)
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    const u  = req.user;
    const db = getDb();

    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const emp = await db.collection('employees').findOne({ _id: new ObjectId(u.id) });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // If not a forced-change, require current password verification
    if (!emp.must_change_password) {
      if (!current_password || emp.password !== current_password)
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (new_password === emp.password)
      return res.status(400).json({ error: 'New password must be different from current password' });

    await db.collection('employees').updateOne(
      { _id: new ObjectId(u.id) },
      { $set: {
          password:             new_password,
          must_change_password: false,
          password_set_at:      null,
          password_changed_at:  new Date().toISOString(),
        }
      }
    );
    res.json({ ok: true, message: 'Password changed successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/reset-password  (admin resets, or self-service)
router.post('/reset-password', async (req, res) => {
  try {
    const { email, new_password } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });
    const db = getDb();
    const r  = await db.collection('employees').updateOne(
      { email: email.toLowerCase() },
      { $set: { password: new_password || 'newpass123' } }
    );
    if (r.matchedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;