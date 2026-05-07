'use strict';
const router = require('express').Router();
const { getDb, sdoc, slist, ObjectId } = require('../db');
const { requireAuth, requireAdmin, requireLeaderOrAdmin } = require('../middleware/auth');
const { sendEmail } = require('../email');

function monthStr() { return new Date().toISOString().slice(0,7); }

function monthsBetween(joinDateStr) {
  const jd  = new Date(joinDateStr || '2024-01-01');
  const now = new Date();
  return Math.max(1, (now.getFullYear()-jd.getFullYear())*12 + (now.getMonth()-jd.getMonth()) + 1);
}

async function runAccrual(db, eidOid) {
  const p   = await db.collection('leave_policy').findOne({}) || {};
  const cpm = p.casual_per_month || 1;
  const spm = p.sick_per_month   || 1;
  const mc  = p.max_casual_carry || 12;
  const ym  = monthStr();
  const bal = await db.collection('leave_balances').findOne({ employee_id: eidOid });
  if (!bal) return;
  if ((bal.last_accrual || '') !== ym) {
    const carry  = Math.max(0, (bal.casual_accrued||0) - (bal.casual_used||0));
    const newAcc = Math.min(carry + cpm, mc);
    await db.collection('leave_balances').updateOne(
      { _id: bal._id },
      { $set: {
          casual_accrued:  newAcc + (bal.casual_used||0),
          sick_this_month: spm,
          sick_used_month: 0,
          sick_month:      ym,
          last_accrual:    ym,
        }
      }
    );
  }
}

// GET /api/leave/policy
router.get('/policy', async (req, res) => {
  try {
    const db = getDb();
    const p  = await db.collection('leave_policy').findOne({});
    if (!p) return res.json({ casual_per_month:1,casual_per_year:12,sick_per_month:1,sick_per_year:12,wfh_per_month:0,max_casual_carry:12,max_consecutive:5,notice_days:1 });
    res.json(sdoc(p));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/leave/policy
router.put('/policy', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const d  = req.body || {};
    const fields = ['casual_per_month','casual_per_year','sick_per_month','sick_per_year',
                    'wfh_per_month','max_casual_carry','max_consecutive','notice_days'];
    const upd = {};
    fields.forEach(f => {
      if (f in d && d[f] != null) {
        const v = parseInt(d[f]);
        if (!isNaN(v)) upd[f] = Math.max(0, v);
      }
    });
    await db.collection('leave_policy').updateOne({}, { $set: upd }, { upsert: true });
    const p   = await db.collection('leave_policy').findOne({});
    const cpm = p.casual_per_month || 1;
    const spm = p.sick_per_month   || 1;
    const wpm = p.wfh_per_month    || 0;
    const mc  = p.max_casual_carry || 12;
    const ym  = monthStr();
    let synced = 0;
    const bals = await db.collection('leave_balances').find({}).toArray();
    for (const bal of bals) {
      const sf = { sick_this_month: spm, wfh_available: wpm };
      if ((bal.sick_month || '') !== ym) { sf.sick_used_month = 0; sf.sick_month = ym; }
      const emp = await db.collection('employees').findOne({ _id: bal.employee_id });
      if (emp) {
        const mos = monthsBetween(emp.join_date);
        const acc = Math.min(mos * cpm, mc);
        sf.casual_accrued = Math.max(acc, bal.casual_used || 0);
      }
      await db.collection('leave_balances').updateOne({ _id: bal._id }, { $set: sf });
      synced++;
    }
    res.json({ ok: true, saved: upd, synced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leave/balance/:id
router.get('/balance/:id', requireAuth, async (req, res) => {
  try {
    const db  = getDb();
    const oid = new ObjectId(req.params.id);
    await runAccrual(db, oid);
    const b = await db.collection('leave_balances').findOne({ employee_id: oid });
    if (!b) return res.json({ casual_available:0,sick_available:0,wfh_available:0,casual_accrued:0,casual_used:0,sick_this_month:0,sick_used_month:0 });
    const p  = await db.collection('leave_policy').findOne({}) || {};
    const ca = Math.max(0, (b.casual_accrued||0) - (b.casual_used||0));
    const sm = b.sick_this_month ?? (p.sick_per_month||1);
    const sa = Math.max(0, sm - (b.sick_used_month||0));
    res.json({
      casual_available: ca, casual_accrued: b.casual_accrued||0, casual_used: b.casual_used||0,
      sick_available: sa,   sick_this_month: sm, sick_used_month: b.sick_used_month||0,
      wfh_available:  Math.max(0, (b.wfh_available||0) - (b.wfh_used||0)),
      wfh_used: b.wfh_used||0,
      casual: b.casual_accrued||0, sick: sm,
      used: { casual: b.casual_used||0, sick: b.sick_used_month||0, wfh: b.wfh_used||0 },
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/leave/balances
router.get('/balances', requireLeaderOrAdmin, async (req, res) => {
  try {
    const db   = getDb();
    const p    = await db.collection('leave_policy').findOne({}) || {};
    const bals = await db.collection('leave_balances').find({}).toArray();
    const result = {};
    for (const b of bals) {
      const eid = b.employee_id.toString();
      const ca  = Math.max(0, (b.casual_accrued||0) - (b.casual_used||0));
      const sa  = Math.max(0, (b.sick_this_month||(p.sick_per_month||1)) - (b.sick_used_month||0));
      result[eid] = {
        casual_available: ca, sick_available: sa,
        casual_per_month: p.casual_per_month||1,
        sick_per_month:   p.sick_per_month||1,
      };
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/leave/request
router.post('/request', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const u  = req.user;
    const d  = req.body || {};
    if (!d.from_date || !d.to_date || !d.type)
      return res.status(400).json({ error: 'from_date, to_date and type required' });

    let medicalFile = null;
    if (d.medical_file && d.medical_file.trim()) {
      if (!d.medical_file.startsWith('data:'))
        return res.status(400).json({ error: 'Invalid medical file format' });
      if (d.medical_file.length > 7000000)
        return res.status(413).json({ error: 'Medical file too large (max ~5MB)' });
      medicalFile = d.medical_file;
    }

    const record = {
      employee_id:   new ObjectId(u.id),
      employee_name: u.name,
      employee_team: u.team || '',
      type:          d.type,
      from_date:     d.from_date,
      to_date:       d.to_date,
      reason:        d.reason || '',
      medical_file:  medicalFile,
      status:        'pending',
      created_at:    new Date().toISOString(),
    };
    const r = await db.collection('leave_requests').insertOne(record);
    const out = {
      id:              r.insertedId.toString(),
      employee_id:     u.id,
      employee_name:   u.name,
      employee_team:   u.team || '',
      type:            d.type,
      from_date:       d.from_date,
      to_date:         d.to_date,
      reason:          d.reason || '',
      has_medical_file: !!medicalFile,
      status:          'pending',
      created_at:      record.created_at,
    };
    await notifyLeave(db, u, out);
    res.status(201).json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leave/requests
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const u  = req.user;
    const q  = {};
    if (u.role === 'employee') {
      q.employee_id = new ObjectId(u.id);
    } else if (u.role === 'team_leader') {
      const members = await db.collection('employees').find({ team: u.team }).toArray();
      q.employee_id = { $in: members.map(m => m._id) };
    }
    const reqs = await db.collection('leave_requests').find(q).sort({ created_at: -1 }).toArray();
    res.json(reqs.map(r => ({
      id:               r._id.toString(),
      employee_id:      r.employee_id.toString(),
      employee_name:    r.employee_name,
      employee_team:    r.employee_team || '',
      type:             r.type,
      from_date:        r.from_date,
      to_date:          r.to_date,
      reason:           r.reason || '',
      status:           r.status,
      created_at:       r.created_at,
      approved_by:      r.approved_by  || null,
      rejected_by:      r.rejected_by  || null,
      has_medical_file:  !!(r.medical_file),
      rejection_reason:  r.rejection_reason || null,
      rejected_at:       r.rejected_at      || null,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leave/requests/:id/medical  — fetch medical file (admin/leader only)
router.get('/requests/:id/medical', requireLeaderOrAdmin, async (req, res) => {
  try {
    const db = getDb();
    const r  = await db.collection('leave_requests').findOne({ _id: new ObjectId(req.params.id) });
    if (!r)               return res.status(404).json({ error: 'Not found' });
    if (!r.medical_file)  return res.status(404).json({ error: 'No medical file attached' });
    res.json({ medical_file: r.medical_file });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/leave/approve/:id
router.put('/approve/:id', requireLeaderOrAdmin, async (req, res) => {
  try {
    const db = getDb();
    const u  = req.user;
    const r  = await db.collection('leave_requests').findOne({ _id: new ObjectId(req.params.id) });
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (u.role === 'team_leader' && r.employee_team !== u.team)
      return res.status(403).json({ error: 'Not your team' });
    await db.collection('leave_requests').updateOne(
      { _id: r._id },
      { $set: { status: 'approved', approved_by: u.name } }
    );
    const from = new Date(r.from_date), to = new Date(r.to_date);
    const days = Math.round((to - from) / 86400000) + 1;
    const eid  = r.employee_id;
    if (r.type === 'casual') await db.collection('leave_balances').updateOne({ employee_id: eid }, { $inc: { casual_used:     days } });
    if (r.type === 'sick')   await db.collection('leave_balances').updateOne({ employee_id: eid }, { $inc: { sick_used_month: days } });
    if (r.type === 'wfh')    await db.collection('leave_balances').updateOne({ employee_id: eid }, { $inc: { wfh_used:        days } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /api/leave/reject/:id
router.put('/reject/:id', requireLeaderOrAdmin, async (req, res) => {
  try {
    const db = getDb();
    const u  = req.user;
    const d  = req.body || {};
    const r  = await db.collection('leave_requests').findOne({ _id: new ObjectId(req.params.id) });
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (u.role === 'team_leader' && r.employee_team !== u.team)
      return res.status(403).json({ error: 'Not your team' });
    if (!d.reason || !d.reason.trim())
      return res.status(400).json({ error: 'Rejection reason is required' });
    await db.collection('leave_requests').updateOne(
      { _id: r._id },
      { $set: {
          status:           'rejected',
          rejected_by:      u.name,
          rejection_reason: d.reason.trim(),
          rejected_at:      new Date().toISOString(),
        }
      }
    );
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

async function notifyLeave(db, reqUser, req) {
  try {
    const toSet = new Set();
    const admins  = await db.collection('employees').find({ role: 'admin'  }).toArray();
    const ceos    = await db.collection('employees').find({ is_ceo: true   }).toArray();
    admins.forEach(e => toSet.add(e.email));
    ceos.forEach(e => toSet.add(e.email));
    if (reqUser.team) {
      const leaders = await db.collection('employees').find({ role:'team_leader', team: reqUser.team }).toArray();
      leaders.forEach(e => toSet.add(e.email));
    }
    toSet.delete(reqUser.email);
    if (!toSet.size) return;

    // Get employee record for ID
    const empRecord = await db.collection('employees').findOne({ email: reqUser.email });
    const empId     = empRecord?.employee_id || '—';

    const typeEmoji = { casual:'🏖️', sick:'🤒', wfh:'🏠' }[req.type] || '📝';
    const from  = new Date(req.from_date);
    const to    = new Date(req.to_date);
    const days  = Math.round((to - from) / 86400000) + 1;

    const subj = `[HRNova] Leave Request — ${reqUser.name} (${req.type} leave, ${days} day${days>1?'s':''})`;

    const body = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f7fd;padding:24px;border-radius:12px">

      <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:20px 24px;color:#fff">
          <div style="font-size:20px;font-weight:800;letter-spacing:-.3px">HRNova</div>
          <div style="font-size:13px;opacity:.85;margin-top:2px">Leave Request Notification</div>
        </div>

        <!-- Body -->
        <div style="padding:24px">
          <div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:16px">
            ${typeEmoji} New leave request from <span style="color:#2563eb">${reqUser.name}</span>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr style="background:#f8fafc">
              <td style="padding:8px 12px;font-weight:600;color:#64748b;width:130px;border-bottom:1px solid #e2e8f0">Employee</td>
              <td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0">${reqUser.name}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Employee ID</td>
              <td style="padding:8px 12px;color:#2563eb;font-weight:700;border-bottom:1px solid #e2e8f0">${empId}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:8px 12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Team</td>
              <td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0">${reqUser.team || '—'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Leave Type</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">
                <span style="background:#eff6ff;color:#2563eb;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;text-transform:capitalize">
                  ${typeEmoji} ${req.type}
                </span>
              </td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:8px 12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">From</td>
              <td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0">${req.from_date}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">To</td>
              <td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0">${req.to_date}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:8px 12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Duration</td>
              <td style="padding:8px 12px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0">${days} day${days>1?'s':''}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Reason</td>
              <td style="padding:8px 12px;color:#475569;border-bottom:1px solid #e2e8f0">${req.reason || '—'}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:8px 12px;font-weight:600;color:#64748b">Medical File</td>
              <td style="padding:8px 12px">${req.has_medical_file
                ? '<span style="color:#16a34a;font-weight:600">✅ Attached</span>'
                : '<span style="color:#94a3b8">Not provided</span>'}</td>
            </tr>
          </table>

          <div style="margin-top:20px;padding:14px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e">
            ⏳ This request is <strong>pending approval</strong>. Please log in to HRNova to approve or reject.
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">
          HRNova · Automated notification · Do not reply to this email
        </div>
      </div>
    </div>`;

    await sendEmail([...toSet], subj, body);
    console.log(`[NOTIFY] Leave email sent to: ${[...toSet].join(', ')}`);
  } catch (e) { console.error('[NOTIFY]', e.message); }
}

module.exports = router;