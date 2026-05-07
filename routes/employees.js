'use strict';
const router = require('express').Router();
const { getDb, sdoc, slist, ObjectId } = require('../db');
const { requireAuth, requireAdmin }    = require('../middleware/auth');

const ALLOWED_DOMAIN = 'opseazy.com';

function checkDomain(email) {
  if (!email || !email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`))
    return `Only @${ALLOWED_DOMAIN} email addresses are allowed`;
  return null;
}

// GET /api/employees
router.get('/', requireAuth, async (req, res) => {
  try {
    const db  = getDb();
    const u   = req.user;
    let cursor;
    if      (u.role === 'admin')       cursor = db.collection('employees').find();
    else if (u.role === 'team_leader') cursor = db.collection('employees').find({ team: u.team });
    else                               cursor = db.collection('employees').find({ _id: new ObjectId(u.id) });
    const emps = slist(await cursor.toArray());
    emps.forEach(e => { delete e.password; });
    res.json(emps);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/employees/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const db  = getDb();
    const emp = await db.collection('employees').findOne({ _id: new ObjectId(req.params.id) });
    if (!emp) return res.status(404).json({ error: 'Not found' });
    const out = sdoc(emp); delete out.password;
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/employees — admin only, sets initial password
router.post('/', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const d  = req.body || {};
    if (!d.name || !d.email) return res.status(400).json({ error: 'Name and email required' });

    const domErr = checkDomain(d.email);
    if (domErr) return res.status(400).json({ error: domErr });

    const email = d.email.toLowerCase().trim();
    if (await db.collection('employees').findOne({ email }))
      return res.status(409).json({ error: 'Email already exists' });

    if (!d.password || d.password.length < 6)
      return res.status(400).json({ error: 'Initial password required (min 6 characters)' });

    const p = await db.collection('leave_policy').findOne({}) || {};
    const joinDate = d.join_date || new Date().toISOString().slice(0,10);
    const now = new Date();

    // Validate employee_id if provided (alphanumeric, e.g. op203)
    let empId = (d.employee_id || '').trim().toUpperCase();
    if (empId) {
      if (!/^[A-Z0-9]{2,10}$/.test(empId))
        return res.status(400).json({ error: 'Employee ID must be 2–10 alphanumeric characters (e.g. OP203)' });
      if (await db.collection('employees').findOne({ employee_id: empId }))
        return res.status(409).json({ error: `Employee ID ${empId} already exists` });
    }

    const ne = {
      name:                 d.name,
      employee_id:          empId || null,
      dept:                 d.dept   || '',
      role:                 d.role   || 'employee',
      email,
      phone:                d.phone  || '',
      join_date:            joinDate,
      status:               'active',
      password:             d.password,
      must_change_password: true,
      password_set_at:      now.toISOString(),
      created_at:           now.toISOString(),
      team:                 d.team   || d.dept || '',
      is_ceo:               false,
      devices:              [],
      photo:                null,
    };
    const r   = await db.collection('employees').insertOne(ne);
    const eid = r.insertedId;

    const jd  = new Date(joinDate);
    const mos = Math.max(1, (now.getFullYear()-jd.getFullYear())*12 + (now.getMonth()-jd.getMonth()) + 1);
    const cpm = p.casual_per_month || 1;
    const mc  = p.max_casual_carry || 12;
    await db.collection('leave_balances').insertOne({
      employee_id:     eid,
      casual_accrued:  Math.min(mos*cpm, mc),
      casual_used:     0,
      sick_this_month: p.sick_per_month || 1,
      sick_used_month: 0,
      sick_month:      now.toISOString().slice(0,7),
      wfh_available:   p.wfh_per_month || 0,
      wfh_used:        0,
      last_accrual:    now.toISOString().slice(0,7),
    });

    const out = { ...ne, id: eid.toString() };
    delete out._id; delete out.password;
    res.status(201).json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/employees/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const d  = req.body || {};
    const allowed = ['name','email','dept','role','phone','join_date','team','is_ceo','status','devices','employee_id'];
    const fs = {};
    allowed.forEach(f => { if (f in d) fs[f] = d[f]; });
    await db.collection('employees').updateOne({ _id: new ObjectId(req.params.id) }, { $set: fs });
    const emp = sdoc(await db.collection('employees').findOne({ _id: new ObjectId(req.params.id) }));
    delete emp.password;
    res.json(emp);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/employees/:id/photo
router.put('/:id/photo', requireAuth, async (req, res) => {
  try {
    const db  = getDb();
    const u   = req.user;
    const tid = req.params.id;
    if (u.role !== 'admin' && u.id !== tid)
      return res.status(403).json({ error: 'You can only update your own photo' });
    const { photo } = req.body || {};
    if (!photo) return res.status(400).json({ error: 'photo (base64 data URL) required' });
    if (!photo.startsWith('data:image/'))
      return res.status(400).json({ error: 'Invalid image format' });
    if (photo.length > 2800000)
      return res.status(413).json({ error: 'Image too large (max ~2MB)' });
    await db.collection('employees').updateOne(
      { _id: new ObjectId(tid) },
      { $set: { photo } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/employees/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const db  = getDb();
    const oid = new ObjectId(req.params.id);
    await db.collection('employees').deleteOne({ _id: oid });
    await db.collection('attendance').deleteMany({ employee_id: oid });
    await db.collection('leave_balances').deleteOne({ employee_id: oid });
    await db.collection('leave_requests').deleteMany({ employee_id: oid });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/employees/admin/promote/:id
router.put('/admin/promote/:id', requireAdmin, async (req, res) => {
  try {
    const db   = getDb();
    const d    = req.body || {};
    const role = d.role || 'employee';
    if (!['admin','team_leader','employee'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });
    const upd = { role };
    if (d.team) upd.team = d.team;
    await db.collection('employees').updateOne({ _id: new ObjectId(req.params.id) }, { $set: upd });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/employees/admin/reset-password/:id
router.put('/admin/reset-password/:id', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const d  = req.body || {};
    if (!d.new_password || d.new_password.length < 6)
      return res.status(400).json({ error: 'New password required (min 6 characters)' });
    await db.collection('employees').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: {
          password:             d.new_password,
          must_change_password: true,
          password_set_at:      new Date().toISOString(),
        }
      }
    );
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;