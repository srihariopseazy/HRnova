'use strict';
const { getDb, ObjectId } = require('./db');

function monthStr() { return new Date().toISOString().slice(0, 7); }

function monthsBetween(joinDateStr) {
  const jd  = new Date(joinDateStr);
  const now = new Date();
  return Math.max(1, (now.getFullYear() - jd.getFullYear()) * 12 + (now.getMonth() - jd.getMonth()) + 1);
}

function randomStatus() {
  // No 'late' — only present / absent
  const opts = ['present','present','present','present','absent'];
  return opts[Math.floor(Math.random() * opts.length)];
}

async function initDb() {
  const db  = getDb();
  const POL = db.collection('leave_policy');
  const EMP = db.collection('employees');
  const HOL = db.collection('holidays');
  const BAL = db.collection('leave_balances');
  const ATT = db.collection('attendance');

  // ── Leave Policy ──────────────────────────────────────────────────────
  const polCount = await POL.countDocuments();
  if (polCount === 0) {
    await POL.insertOne({
      casual_per_month: 1, casual_per_year:  12,
      sick_per_month:   1, sick_per_year:    12,
      wfh_per_month:    0, max_casual_carry: 12,
      max_consecutive:  5, notice_days:       1,
    });
    console.log('[INIT] Leave policy created');
  } else {
    const p   = await POL.findOne({});
    const upd = {};
    if (!('casual_per_year' in p)) upd.casual_per_year = (p.casual_per_month || 1) * 12;
    if (!('sick_per_year'   in p)) upd.sick_per_year   = (p.sick_per_month   || 1) * 12;
    if (Object.keys(upd).length)   await POL.updateOne({}, { $set: upd });
  }

  // ── Demo Employees — INSERT if empty, MIGRATE if existing ─────────────
  const empCount = await EMP.countDocuments();

  if (empCount === 0) {
    await EMP.insertMany([
      { name:'Priya Sharma',  employee_id:'OP001', dept:'HR',         role:'admin',       email:'admin@opseazy.com',
        phone:'+91 98400 11111', join_date:'2021-03-15', status:'active',
        password:'admin123',    team:'HR',         is_ceo:true,  devices:[],
        must_change_password: false, created_at: new Date().toISOString() },
      { name:'Ravi Chandran', employee_id:'OP002', dept:'Sales',       role:'team_leader', email:'leader@opseazy.com',
        phone:'+91 98400 22222', join_date:'2020-07-01', status:'active',
        password:'leader123',   team:'Sales',      is_ceo:false, devices:[],
        must_change_password: false, created_at: new Date().toISOString() },
      { name:'Arun Kumar',    employee_id:'OP003', dept:'Engineering', role:'employee',    email:'employee@opseazy.com',
        phone:'+91 98400 33333', join_date:'2022-01-10', status:'active',
        password:'employee123', team:'Engineering',is_ceo:false, devices:[],
        must_change_password: false, created_at: new Date().toISOString() },
      { name:'Meena Raj',     employee_id:'OP004', dept:'Engineering', role:'employee',    email:'meena@opseazy.com',
        phone:'+91 98400 44444', join_date:'2023-05-20', status:'active',
        password:'meena123',    team:'Engineering',is_ceo:false, devices:[],
        must_change_password: false, created_at: new Date().toISOString() },
      { name:'Vikram Nair',   employee_id:'OP005', dept:'Sales',       role:'employee',    email:'vikram@opseazy.com',
        phone:'+91 98400 55555', join_date:'2021-11-08', status:'active',
        password:'vikram123',   team:'Sales',      is_ceo:false, devices:[],
        must_change_password: false, created_at: new Date().toISOString() },
    ]);
    console.log('[INIT] Demo employees created');
  } else {
    // ── ALWAYS MIGRATE existing employees on every server start ──────────
    // Map known demo emails to their IDs
    const DEMO_IDS = {
      'admin@opseazy.com':    'OP001',
      'admin@company.com':    'OP001',
      'leader@opseazy.com':   'OP002',
      'leader@company.com':   'OP002',
      'employee@opseazy.com': 'OP003',
      'employee@company.com': 'OP003',
      'meena@opseazy.com':    'OP004',
      'meena@company.com':    'OP004',
      'vikram@opseazy.com':   'OP005',
      'vikram@company.com':   'OP005',
    };

    let migrated = 0;
    for await (const emp of EMP.find()) {
      const fixes = {};

      // Fix @company.com → @opseazy.com
      if (emp.email && emp.email.endsWith('@company.com')) {
        fixes.email = emp.email.replace('@company.com', '@opseazy.com');
      }

      // Assign employee_id to demo employees if missing or null
      if (!emp.employee_id) {
        const demoId = DEMO_IDS[emp.email] || DEMO_IDS[(fixes.email || '')];
        if (demoId) fixes.employee_id = demoId;
        else if (!('employee_id' in emp)) fixes.employee_id = null;
      }

      // Add missing fields
      if (!('must_change_password' in emp)) fixes.must_change_password = false;
      if (!emp.created_at)                  fixes.created_at = new Date().toISOString();
      if (!('photo' in emp))                fixes.photo = null;

      if (Object.keys(fixes).length > 0) {
        await EMP.updateOne({ _id: emp._id }, { $set: fixes });
        migrated++;
      }
    }
    if (migrated > 0) console.log(`[INIT] Migrated ${migrated} employee record(s) ✅`);
  }

  // ── Fix attendance — replace any 'late' records with 'present' ────────
  const lateCount = await ATT.countDocuments({ status: 'late' });
  if (lateCount > 0) {
    await ATT.updateMany({ status: 'late' }, { $set: { status: 'present' } });
    console.log(`[INIT] Converted ${lateCount} 'late' records → 'present'`);
  }

  // ── Holidays ──────────────────────────────────────────────────────────
  const holCount = await HOL.countDocuments();
  if (holCount === 0) {
    await HOL.insertMany([
      { date:'2026-01-01', name:'New Year'         },
      { date:'2026-01-26', name:'Republic Day'     },
      { date:'2026-04-14', name:'Tamil New Year'   },
      { date:'2026-05-01', name:'Labour Day'       },
      { date:'2026-08-15', name:'Independence Day' },
      { date:'2026-10-02', name:'Gandhi Jayanti'   },
    ]);
    console.log('[INIT] Holidays created');
  }

  // ── Leave Balances & Attendance per employee ──────────────────────────
  const p = await POL.findOne({});
  for await (const emp of EMP.find()) {
    const eid = emp._id;

    const hasBalance = await BAL.countDocuments({ employee_id: eid });
    if (!hasBalance) {
      const mos = monthsBetween(emp.join_date || '2024-01-01');
      const cpm = p.casual_per_month || 1;
      const acc = Math.min(mos * cpm, p.max_casual_carry || 12);
      await BAL.insertOne({
        employee_id:     eid,
        casual_accrued:  acc,
        casual_used:     0,
        sick_this_month: p.sick_per_month || 1,
        sick_used_month: 0,
        sick_month:      monthStr(),
        wfh_available:   p.wfh_per_month || 0,
        wfh_used:        0,
        last_accrual:    monthStr(),
      });
    }

    const hasAtt = await ATT.countDocuments({ employee_id: eid });
    if (!hasAtt) {
      const records = [];
      for (let i = 1; i <= 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const st = randomStatus();
        records.push({
          employee_id: eid,
          date:        d.toISOString().slice(0, 10),
          status:      st,
          check_in:    st === 'present' ? '09:00' : null,
          check_out:   st === 'present' ? '18:00' : null,
        });
      }
      if (records.length) await ATT.insertMany(records);
    }
  }

  console.log('[INIT] Database ready ✅');
}

module.exports = { initDb };