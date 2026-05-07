'use strict';
const router = require('express').Router();
const { getDb, sdoc, ObjectId } = require('../db');
const { requireAuth, requireAdmin, requireLeaderOrAdmin } = require('../middleware/auth');
const XLSX = require('xlsx');

// GET /api/attendance/today
router.get('/today', requireAuth, async (req, res) => {
  try {
    const db    = getDb();
    const u     = req.user;
    const today = new Date().toISOString().slice(0, 10);

    let empQuery = { status: 'active' };
    if (u.role === 'employee')         empQuery = { _id: new ObjectId(u.id) };
    else if (u.role === 'team_leader') empQuery = { team: u.team, status: 'active' };
    const emps = await db.collection('employees').find(empQuery).toArray();

    const eids    = emps.map(e => e._id);
    const records = await db.collection('attendance').find({
      date: today,
      employee_id: { $in: eids }
    }).toArray();
    const recMap = {};
    records.forEach(r => { recMap[r.employee_id.toString()] = r; });

    const result = emps.map(emp => {
      const r = recMap[emp._id.toString()];
      return {
        employee_id:      emp._id.toString(),
        employee_code:    emp.employee_id || null,
        employee_name:    emp.name,
        team:             emp.team || '',
        status:           r ? (r.status || 'absent') : 'absent',
        permission_type:  r ? (r.permission_type  || null) : null,
        permission_hours: r ? (r.permission_hours || null) : null,
        check_in:         r ? (r.check_in  || null) : null,
        check_out:        r ? (r.check_out || null) : null,
      };
    });

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/attendance/mark
// status options: present | absent | permission
router.post('/mark', requireLeaderOrAdmin, async (req, res) => {
  try {
    const db  = getDb();
    const u   = req.user;
    const d   = req.body || {};
    if (!d.employee_id) return res.status(400).json({ error: 'employee_id required' });

    const VALID_STATUSES = ['present', 'absent', 'permission'];
    if (d.status && !VALID_STATUSES.includes(d.status))
      return res.status(400).json({ error: `Invalid status. Use: ${VALID_STATUSES.join(', ')}` });

    const oid = new ObjectId(d.employee_id);
    if (u.role === 'team_leader') {
      const emp = await db.collection('employees').findOne({ _id: oid });
      if (!emp || emp.team !== u.team)
        return res.status(403).json({ error: 'Not your team' });
    }
    const today   = new Date().toISOString().slice(0, 10);
    const now     = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const setFields = {
      status:    d.status    || 'present',
      check_in:  d.check_in  || timeStr,
      check_out: d.check_out || null,
    };

    if (d.status === 'permission') {
      setFields.permission_type  = d.permission_type  || null;
      setFields.permission_hours = d.permission_hours || null;
    } else {
      setFields.permission_type  = null;
      setFields.permission_hours = null;
    }

    await db.collection('attendance').updateOne(
      { employee_id: oid, date: today },
      { $set: setFields },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/attendance/:id  — history for one employee
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const db      = getDb();
    const oid     = new ObjectId(req.params.id);
    const records = await db.collection('attendance').find({ employee_id: oid })
                            .sort({ date: -1 }).toArray();
    const result  = records.map(r => ({
      id:               r._id.toString(),
      employee_id:      r.employee_id.toString(),
      date:             r.date,
      status:           r.status,
      permission_type:  r.permission_type  || null,
      permission_hours: r.permission_hours || null,
      check_in:         r.check_in  || null,
      check_out:        r.check_out || null,
    }));
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/attendance/export/:year/:month  — download monthly Excel (admin only)
router.get('/export/:year/:month', requireAdmin, async (req, res) => {
  try {
    const db    = getDb();
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12)
      return res.status(400).json({ error: 'Invalid year or month' });

    const monthStr  = `${year}-${String(month).padStart(2, '0')}`;
    const monthName = new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(year, month, 0).getDate();

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      return `${monthStr}-${d}`;
    });

    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    const emps    = await db.collection('employees').find({ status: 'active' }).sort({ dept: 1, name: 1 }).toArray();
    const records = await db.collection('attendance').find({ date: { $regex: `^${monthStr}` } }).toArray();

    const attMap = {};
    records.forEach(r => {
      const eid = r.employee_id.toString();
      if (!attMap[eid]) attMap[eid] = {};
      attMap[eid][r.date] = r;
    });

    const statusLabel = r => {
      if (!r || r.status === 'absent')  return 'A';
      if (r.status === 'present')       return 'P';
      if (r.status === 'permission') {
        if (r.permission_type === 'half_day') return 'HD';
        if (r.permission_type === 'sick')     return 'SP';
        if (r.permission_type === 'hours')    return `PH${r.permission_hours || ''}h`;
        return 'PM';
      }
      return 'A';
    };

    const wb = XLSX.utils.book_new();
    const ws_data = [];

    // ── Row 1: Title ──────────────────────────────────────────────────
    ws_data.push([`Attendance Report — ${monthName}`]);

    // ── Row 2: blank ─────────────────────────────────────────────────
    ws_data.push([]);

    // ── Row 3: Sub-headers — day names ────────────────────────────────
    const dayNameRow = ['', '', '', '', ...days.map(d => DAY_NAMES[new Date(d).getDay()]),'','','',''];
    ws_data.push(dayNameRow);

    // ── Row 4: Main header ────────────────────────────────────────────
    const headerRow = [
      'Emp ID', 'Employee', 'Department', 'Team',
      ...days.map(d => parseInt(d.slice(8))),
      'Present', 'Absent', 'Permission', 'Working Days'
    ];
    ws_data.push(headerRow);

    // ── Data rows ─────────────────────────────────────────────────────
    for (const emp of emps) {
      const eid    = emp._id.toString();
      const empAtt = attMap[eid] || {};
      let pCount = 0, aCount = 0, permCount = 0, workdays = 0;

      const dayCells = days.map(dateStr => {
        const dow = new Date(dateStr).getDay();
        if (dow === 0 || dow === 6) return '-'; // weekend
        workdays++;
        const rec = empAtt[dateStr];
        const lbl = statusLabel(rec);
        if (lbl === 'P')                        pCount++;
        else if (lbl === 'A')                   aCount++;
        else                                    permCount++;
        return lbl;
      });

      ws_data.push([
        emp.employee_id || '—',
        emp.name,
        emp.dept  || '',
        emp.team  || '',
        ...dayCells,
        pCount,
        aCount,
        permCount,
        workdays,
      ]);
    }

    // ── Summary row ───────────────────────────────────────────────────
    ws_data.push([]);
    ws_data.push(['TOTAL EMPLOYEES: ' + emps.length]);

    // ── Legend ────────────────────────────────────────────────────────
    ws_data.push([]);
    ws_data.push(['Legend:']);
    ws_data.push(['P = Present', '', 'A = Absent', '', 'HD = Half Day Permission']);
    ws_data.push(['SP = Sick Permission', '', 'PHnh = Hours Permission (n hrs)', '', '- = Weekend']);

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // ── Column widths ─────────────────────────────────────────────────
    const totalCols = 3 + daysInMonth + 4;
    ws['!cols'] = [
      { wch: 8  },  // Emp ID
      { wch: 22 },  // Employee
      { wch: 16 },  // Dept
      { wch: 16 },  // Team
      ...Array(daysInMonth).fill({ wch: 4 }),  // day columns — narrow
      { wch: 9  },  // Present
      { wch: 9  },  // Absent
      { wch: 11 },  // Permission
      { wch: 13 },  // Working Days
    ];

    // ── Row heights ───────────────────────────────────────────────────
    ws['!rows'] = [
      { hpt: 28 }, // title
      { hpt: 6  }, // blank
      { hpt: 16 }, // day names
      { hpt: 20 }, // header
    ];

    // ── Merge title across all columns ────────────────────────────────
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(totalCols - 1, 20) } }
    ];

    XLSX.utils.book_append_sheet(wb, ws, monthName.split(' ')[0]);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${monthStr}.xlsx"`);
    res.send(buf);
  } catch (e) {
    console.error('[EXPORT]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;