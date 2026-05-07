/* HRNova — script.js — Node.js version */
'use strict';

let CU    = null;  // current user object
let TOKEN = null;  // JWT token
let PAGE  = 'dashboard';

/* ══ TOAST ══════════════════════════════════ */
const toast = (msg, err = false) => {
  const t = document.getElementById('toast');
  t.textContent       = msg;
  t.style.background  = err ? 'var(--red)' : 'var(--green)';
  t.style.display     = 'block';
  clearTimeout(t._to);
  t._to = setTimeout(() => t.style.display = 'none', 3000);
};

/* ══ MODAL ═══════════════════════════════════ */
const closeModal = () => {
  const m = document.getElementById('modal');
  m.style.display = 'none';
  m.classList.remove('open');
};
window.closeModal = closeModal;

const openModal = (title, bodyHtml, onConfirm, confirmLabel = 'Confirm') => {
  document.getElementById('mTitle').textContent = title;
  document.getElementById('mBody').innerHTML   = bodyHtml;
  const btn = document.getElementById('mConfirm');
  btn.textContent = confirmLabel;
  const m = document.getElementById('modal');
  m.style.display = 'flex';
  m.classList.add('open');
  btn.onclick = () => { onConfirm(); closeModal(); };
};

document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

/* ══ API HELPER ══════════════════════════════ */
const api = async (ep, method = 'GET', body = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch('/api' + ep, opts);
  } catch (e) {
    throw new Error('Network error — is the server running?');
  }
  if (!res.ok) {
    let j = {};
    try { j = await res.json(); } catch {}
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return res.json();
};

/* ══ DATE BOX ════════════════════════════════ */
document.getElementById('dateBox').textContent =
  new Date().toLocaleDateString('en-IN', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

/* ══ LOGIN ═══════════════════════════════════ */
document.getElementById('loginBtn').onclick = async () => {
  const email = document.getElementById('lEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('lPass').value;
  const err   = document.getElementById('loginErr');
  err.style.display = 'none';
  if (!email || !pass) {
    err.textContent = 'Please enter email and password.';
    err.style.display = 'block';
    return;
  }
  if (!email.endsWith('@opseazy.com')) {
    err.textContent = 'Only @opseazy.com email addresses are allowed.';
    err.style.display = 'block';
    return;
  }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Invalid credentials');
    }
    CU    = await res.json();
    TOKEN = CU.token;
    if (CU.must_change_password) { showForceChangePassword(); return; }
    launchApp();
  } catch (e) {
    err.textContent   = e.message;
    err.style.display = 'block';
  }
};

function launchApp() {
  document.getElementById('loginPage').style.display  = 'none';
  document.getElementById('appPage').style.display    = 'block';
  updateSidebarAvatar();
  document.getElementById('sbName').textContent      = CU.name;
  document.getElementById('sbRoleLabel').textContent =
    CU.role === 'admin' ? 'Administrator' :
    CU.role === 'team_leader' ? 'Team Leader' : 'Employee';
  document.getElementById('sbRole').textContent =
    CU.role === 'admin' ? 'Admin Panel' :
    CU.role === 'team_leader' ? `Team: ${CU.team}` : 'My Workspace';
  buildNav();
  goPage('dashboard');
}

function showForceChangePassword() {
  const deadline = CU.change_deadline
    ? new Date(CU.change_deadline).toLocaleString('en-IN')
    : '2 days from account creation';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display   = 'none';
  const wrap = document.querySelector('.login-wrap');
  wrap.innerHTML = `
    <div class="login-brand">
      <div class="brand-icon">HR</div>
      <div><div class="brand-name">HRNova</div><div class="brand-tag">Intelligent HR Suite</div></div>
    </div>
    <div style="background:rgba(220,38,38,.08);border:1.5px solid rgba(220,38,38,.3);
      border-radius:10px;padding:14px;margin-bottom:18px;font-size:13px">
      <div style="font-weight:700;color:#dc2626;margin-bottom:4px">🔒 Password Change Required</div>
      <div>Your account was created by Admin. You must set a new personal password.</div>
      <div style="color:var(--muted);font-size:11px;margin-top:4px">Must be done by: ${deadline}</div>
    </div>
    <div id="cpErr" class="err-box"></div>
    <div class="field">
      <label>New Password</label>
      <input type="password" id="cpNew" placeholder="Min 6 characters" class="form-ctrl">
    </div>
    <div class="field">
      <label>Confirm New Password</label>
      <input type="password" id="cpConfirm" placeholder="Repeat new password" class="form-ctrl">
    </div>
    <button class="btn-primary w100" id="cpBtn">Set New Password →</button>
  `;
  document.getElementById('cpBtn').onclick = async () => {
    const np  = document.getElementById('cpNew').value;
    const cfm = document.getElementById('cpConfirm').value;
    const e   = document.getElementById('cpErr');
    e.style.display = 'none';
    if (!np || np.length < 6) { e.textContent = 'Min 6 characters'; e.style.display='block'; return; }
    if (np !== cfm)            { e.textContent = 'Passwords do not match'; e.style.display='block'; return; }
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: JSON.stringify({ new_password: np })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { e.textContent = j.error || 'Failed'; e.style.display='block'; return; }
      CU.must_change_password = false;
      toast('Password set successfully! Welcome 🎉');
      launchApp();
    } catch(err) { e.textContent = err.message; e.style.display='block'; }
  };
}

function updateSidebarAvatar() {
  const av = document.getElementById('sbAvatar');
  if (CU.photo) {
    av.innerHTML = `<img src="${CU.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="photo">`;
  } else {
    av.textContent = CU.name ? CU.name.charAt(0).toUpperCase() : '?';
  }
}

document.getElementById('lPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

// Password reset removed — admin manages passwords directly

document.getElementById('logoutBtn').onclick = () => {
  CU = null; TOKEN = null;
  document.getElementById('appPage').style.display   = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('lEmail').value = '';
  document.getElementById('lPass').value  = '';
};

/* ══ NAV CONFIG ══════════════════════════════ */
const NAV_META = {
  dashboard:    { title: 'Dashboard',       sub: 'Overview of your organisation today'    },
  employees:    { title: 'Employees',        sub: 'Manage your team members'               },
  attendance:   { title: 'Attendance',       sub: "Today's presence"                       },
  leaves:       { title: 'Leave Requests',   sub: 'Review and manage applications'          },
  holidays:     { title: 'Holidays',         sub: 'Manage company holidays'                 },
  leave_policy: { title: 'Leave Policy',     sub: 'Configure leave rules'                   },
  team_att:     { title: 'Team Attendance',  sub: 'Mark your team attendance'               },
  team_leaves:  { title: 'Team Leaves',      sub: 'Approve or reject team requests'         },
};

const buildNav = () => {
  const nav = document.getElementById('navLinks');
  let items = [];
  if (CU.role === 'admin') {
    items = [
      { id: 'dashboard',    ico: '📊', label: 'Dashboard'     },
      { id: 'employees',    ico: '👥', label: 'Employees'      },
      { id: 'attendance',   ico: '✅', label: 'Attendance'     },
      { id: 'leaves',       ico: '📝', label: 'Leave Requests', badge: true },
      { id: 'leave_policy', ico: '⚙️', label: 'Leave Policy'   },
      { id: 'holidays',     ico: '🎉', label: 'Holidays'       },
    ];
  } else if (CU.role === 'team_leader') {
    items = [
      { id: 'dashboard',   ico: '📊', label: 'Dashboard'       },
      { id: 'team_att',    ico: '✅', label: 'Team Attendance'  },
      { id: 'team_leaves', ico: '📝', label: 'Team Leaves', badge: true },
    ];
  } else {
    items = [{ id: 'dashboard', ico: '📊', label: 'My Dashboard' }];
  }

  nav.innerHTML = '<div class="nav-sec">Main</div>' +
    items.map(it => `
      <div class="nav-item" data-page="${it.id}">
        <span class="nav-ico">${it.ico}</span>
        ${it.label}
        ${it.badge
          ? `<span class="nav-badge" id="leavesBadge" style="display:none">0</span>`
          : ''}
      </div>`).join('');

  nav.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', () => goPage(el.dataset.page)));

  refreshBadge();
};

const goPage = (page) => {
  PAGE = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (el) el.classList.add('active');
  const m = NAV_META[page] || { title: page, sub: '' };
  document.getElementById('pageTitle').textContent = m.title;
  document.getElementById('pageSub').textContent   = m.sub;
  document.getElementById('pageContent').innerHTML = '<div class="loading">Loading…</div>';

  const pages = {
    dashboard:    loadDash,
    employees:    loadEmps,
    attendance:   loadAtt,
    leaves:       loadLeaves,
    leave_policy: loadPolicy,
    holidays:     loadHols,
    team_att:     loadTeamAtt,
    team_leaves:  loadTeamLeaves,
  };
  if (pages[page]) pages[page]();
};

window.goPage = goPage;

const refreshBadge = async () => {
  if (CU.role === 'employee') return;
  try {
    const rs = await api('/leave/requests');
    const n  = rs.filter(r => r.status === 'pending').length;
    const el = document.getElementById('leavesBadge');
    if (el) { el.textContent = n; el.style.display = n ? 'inline' : 'none'; }
  } catch {}
};

/* ══ HELPERS ══════════════════════════════════ */
const COLS = ['#2563eb','#7c3aed','#16a34a','#d97706','#0891b2','#dc2626'];
const DICO = {
  Laptop:'💻', Desktop:'🖥️', Monitor:'🖥️', Mouse:'🖱️',
  Keyboard:'⌨️', Headset:'🎧', Phone:'📱', Tablet:'📱',
  'Docking Station':'🔌', Other:'📦'
};

const statCard = (cls, ico, val, lbl, badge = '', badgeCls = 'badge-up') =>
  `<div class="stat ${cls}">
    <div class="stat-top">
      <div class="stat-ico ${cls}">${ico}</div>
      ${badge ? `<span class="stat-badge ${badgeCls}">${badge}</span>` : ''}
    </div>
    <div class="stat-val">${val}</div>
    <div class="stat-lbl">${lbl}</div>
  </div>`;

const buildCal = (attMap, holMap, leaveMap, clickFn) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const fd  = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  let h = ['Su','Mo','Tu','We','Th','Fr','Sa']
    .map(d => `<div class="cal-hd">${d}</div>`).join('');
  for (let i = 0; i < fd; i++) h += '<div></div>';
  for (let d = 1; d <= dim; d++) {
    const ds  = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = attMap[ds];
    const hol = holMap[ds];
    const ls  = leaveMap[ds];
    let cls = 'cal-day', lbl = '';
    if (d === now.getDate() && m === now.getMonth()) {
      cls += ' today';
    } else if (hol) {
      cls += ' holiday'; lbl = `<div class="day-lbl">${hol.substring(0,7)}</div>`;
    } else if (rec) {
      cls += ` ${rec.status}`; lbl = `<div class="day-lbl">${rec.status}</div>`;
    } else if (ls === 'pending') {
      cls += ' pending-leave';  lbl = '<div class="day-lbl">⏳</div>';
    } else if (ls === 'approved') {
      cls += ' approved-leave'; lbl = '<div class="day-lbl">✓</div>';
    } else if (ls === 'rejected') {
      cls += ' rejected-leave'; lbl = '<div class="day-lbl">✗</div>';
    }
    h += `<div class="${cls}" onclick="${clickFn}('${ds}')">
      <div class="day-n">${d}</div>${lbl}
    </div>`;
  }
  return h;
};

/* ═══════════════════════════════════════════
   DASHBOARD — role router
═══════════════════════════════════════════ */
const loadDash = () => {
  if      (CU.role === 'admin')       loadAdminDash();
  else if (CU.role === 'team_leader') loadLeaderDash();
  else                                loadEmpDash();
};

/* ── Admin Dashboard ── */
const loadAdminDash = async () => {
  try {
    const [emps, todayAtt, reqs, hols] = await Promise.all([
      api('/employees'),
      api('/attendance/today'),
      api('/leave/requests'),
      api('/holidays')
    ]);
    const pend    = reqs.filter(r => r.status === 'pending').length;
    const pres    = todayAtt.filter(a => a.status === 'present').length;
    const total   = emps.length || 1;
    const deptMap = {};
    emps.forEach(e => { deptMap[e.dept] = (deptMap[e.dept] || 0) + 1; });
    const depts   = Object.entries(deptMap);
    const circum  = 2 * Math.PI * 45;
    let off = 0;
    const segs = depts.map(([, cnt], i) => {
      const dash = (cnt / total) * circum;
      const s = `<circle cx="60" cy="60" r="45" fill="none"
        stroke="${COLS[i % COLS.length]}" stroke-width="13"
        stroke-dasharray="${dash.toFixed(1)} ${circum.toFixed(1)}"
        stroke-dashoffset="${(-off).toFixed(1)}"
        transform="rotate(-90 60 60)"/>`;
      off += dash; return s;
    }).join('');
    const holMap = {}; hols.forEach(h => holMap[h.date] = h.name);
    const calH   = buildCal({}, holMap, {}, 'adminNoop');

    document.getElementById('pageContent').innerHTML = `
    <div class="profile-card">
      <div class="prof-avatar">${CU.name.charAt(0)}</div>
      <div>
        <div style="font-size:15px;font-weight:700">${CU.name}
          <span class="role-admin">Admin</span></div>
        <div style="font-size:12px;color:var(--muted)">${CU.dept} · ID: ${CU.id.slice(-8)}</div>
      </div>
    </div>
    <div class="stats-row">
      ${statCard('blue',   '👥', emps.length, 'Total Employees', 'Active')}
      ${statCard('green',  '✅', pres, 'Present Today', `${Math.round(pres/total*100)}%`)}
      ${statCard('amber',  '📝', pend, 'Pending Leaves', pend > 0 ? 'Review now' : 'All clear', 'badge-warn')}
      ${statCard('purple', '🏢', depts.length, 'Departments', '')}
    </div>
    <div class="three-col">
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--green)"></div>Dept Attendance</div>
        </div>
        <div class="card-body">
          ${depts.map(([n,], i) => `
            <div class="att-row">
              <div class="att-name">${n}</div>
              <div class="att-bar-wrap">
                <div class="att-bar" style="width:${60 + i*8}%;background:${COLS[i%COLS.length]}"></div>
              </div>
              <div class="att-pct" style="color:${COLS[i%COLS.length]}">${60 + i*8}%</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--purple)"></div>Departments</div>
        </div>
        <div class="card-body">
          <div class="donut-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="45" fill="none" stroke="var(--surf2)" stroke-width="13"/>
              ${segs}
              <text x="60" y="56" text-anchor="middle" fill="var(--text)" font-size="16" font-weight="800">${total}</text>
              <text x="60" y="70" text-anchor="middle" fill="var(--muted)" font-size="9">employees</text>
            </svg>
          </div>
          <div class="dept-legend">
            ${depts.map(([n, cnt], i) => `
              <div class="dept-row">
                <div class="dept-dot" style="background:${COLS[i%COLS.length]}"></div>
                <div class="dept-name">${n}</div>
                <div style="font-weight:600">${cnt}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--amber)"></div>
            ${new Date().toLocaleString('default', {month:'long',year:'numeric'})}
          </div>
        </div>
        <div class="card-body">
          <div class="cal-grid">${calH}</div>
          <div class="cal-legend">
            <div class="leg-item"><div class="leg-dot" style="background:var(--primary)"></div>Today</div>
            <div class="leg-item"><div class="leg-dot" style="background:rgba(37,99,235,.4)"></div>Holiday</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--red)"></div>Pending Leaves</div>
          <div class="card-act" onclick="goPage('leaves')">View all →</div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>Action</th></tr></thead>
          <tbody>
            ${reqs.filter(r => r.status === 'pending').slice(0, 5).map(r => `
              <tr>
                <td style="font-weight:500">${r.employee_name}</td>
                <td><span class="pill teal">${r.type}</span></td>
                <td>${r.from_date}</td>
                <td>
                  <button class="btn-sm btn-green" onclick="qApprove('${r.id}')">✓</button>
                  <button class="btn-sm btn-red"   onclick="qReject('${r.id}')"  style="margin-left:4px">✗</button>
                </td>
              </tr>`).join('') ||
              '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:14px">No pending</td></tr>'}
          </tbody>
        </table></div>
      </div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};
window.adminNoop  = () => {};
window.qApprove   = async (id) => { await api(`/leave/approve/${id}`, 'PUT'); toast('Approved ✅'); loadAdminDash(); refreshBadge(); };
window.qReject = (id) => {
  openModal('Reject Leave Request',
    `<div class="field"><label>Reason for Rejection <span style="color:var(--red)">*</span></label>
       <textarea id="qRejReason" class="form-ctrl" rows="3" placeholder="e.g. Insufficient leave balance, project deadline…"></textarea>
       <div style="font-size:10px;color:var(--muted);margin-top:4px">Employee will see this reason.</div>
     </div>`,
    async () => {
      const reason = document.getElementById('qRejReason').value.trim();
      if (!reason) { toast('Please enter a rejection reason', true); return; }
      try { await api(`/leave/reject/${id}`, 'PUT', { reason }); toast('Rejected'); loadAdminDash(); refreshBadge(); }
      catch(e) { toast(e.message, true); }
    }, 'Reject Leave'
  );
};

/* ── Team Leader Dashboard ── */
const loadLeaderDash = async () => {
  try {
    const [emps, todayAtt, reqs] = await Promise.all([
      api('/employees'), api('/attendance/today'), api('/leave/requests')
    ]);
    const pres = todayAtt.filter(a => a.status === 'present').length;
    const pend = reqs.filter(r => r.status === 'pending').length;
    document.getElementById('pageContent').innerHTML = `
    <div class="profile-card">
      <div class="prof-avatar" style="background:linear-gradient(135deg,var(--teal),var(--primary))">
        ${CU.name.charAt(0)}
      </div>
      <div>
        <div style="font-size:15px;font-weight:700">${CU.name}
          <span class="role-leader">Team Leader</span></div>
        <div style="font-size:12px;color:var(--muted)">Team: ${CU.team} · ${emps.length} members</div>
      </div>
    </div>
    <div class="stats-row">
      ${statCard('blue',  '👥', emps.length, 'Team Size')}
      ${statCard('green', '✅', pres, 'Present Today', `${Math.round(pres/(emps.length||1)*100)}%`)}
      ${statCard('amber', '📝', pend, 'Pending Leaves', pend > 0 ? 'Review' : 'All clear', 'badge-warn')}
    </div>
    <div class="two-col">
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--green)"></div>Team Attendance Today</div>
          <div class="card-act" onclick="goPage('team_att')">Manage →</div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Status</th><th>In</th><th>Out</th></tr></thead>
          <tbody>
            ${todayAtt.map(a => `
              <tr>
                <td style="font-weight:500">${a.employee_name}</td>
                <td><span class="pill ${a.status === 'permission' ? 'late' : a.status}">${a.status}${a.permission_type ? ` (${a.permission_type})` : ''}</span></td>
                <td>${a.check_in  || '—'}</td>
                <td>${a.check_out || '—'}</td>
              </tr>`).join('') ||
              '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:14px">No records</td></tr>'}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--amber)"></div>Pending Requests</div>
          <div class="card-act" onclick="goPage('team_leaves')">View all →</div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Action</th></tr></thead>
          <tbody>
            ${reqs.filter(r => r.status === 'pending').slice(0, 5).map(r => `
              <tr>
                <td style="font-weight:500">${r.employee_name}</td>
                <td><span class="pill teal">${r.type}</span></td>
                <td style="font-size:11px;color:var(--muted)">${r.from_date} → ${r.to_date}</td>
                <td>
                  <button class="btn-sm btn-green" onclick="qApprove('${r.id}')">✓</button>
                  <button class="btn-sm btn-red"   onclick="qReject('${r.id}')"  style="margin-left:4px">✗</button>
                </td>
              </tr>`).join('') ||
              '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:14px">No pending</td></tr>'}
          </tbody>
        </table></div>
      </div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};

/* ── Employee Dashboard ── */
const loadEmpDash = async () => {
  try {
    const [emp, bal, att, reqs, hols] = await Promise.all([
      api(`/employees/${CU.id}`),
      api(`/leave/balance/${CU.id}`),
      api(`/attendance/${CU.id}`),
      api('/leave/requests'),
      api('/holidays')
    ]);
    const attMap = {};   att.forEach(a  => attMap[a.date]  = a);
    const holMap = {};   hols.forEach(h => holMap[h.date]  = h.name);
    const leaveMap = {};
    reqs.filter(r => r.employee_id === CU.id).forEach(l => {
      const s = new Date(l.from_date), en = new Date(l.to_date);
      for (let d = new Date(s); d <= en; d.setDate(d.getDate() + 1))
        leaveMap[d.toISOString().slice(0, 10)] = l.status;
    });
    const myLeaves = reqs.filter(r => r.employee_id === CU.id);
    const devs     = emp.devices || [];
    const thisMonth = new Date().toISOString().slice(0, 7);
    const daysPresent = att.filter(a => a.date.startsWith(thisMonth) && a.status === 'present').length;

    // Photo display (if exists, show img, else initial)
    const photoHtml = emp.photo
      ? `<img src="${emp.photo}" style="width:52px;height:52px;border-radius:14px;object-fit:cover;flex-shrink:0;" alt="photo">`
      : `<div class="prof-avatar">${emp.name.charAt(0)}</div>`;

    const devHtml = devs.length ? `
      <div style="margin-top:10px;padding-top:10px;border-top:1.5px solid var(--border)">
        <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">
          Company Assets
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${devs.map(d => `
            <div style="display:flex;align-items:center;gap:7px;background:var(--surf2);border:1.5px solid var(--border);border-radius:8px;padding:6px 10px;font-size:11px">
              <span style="font-size:15px">${DICO[d.type] || '📦'}</span>
              <div>
                <div style="font-weight:600">${d.name || d.type}</div>
                <div style="color:var(--muted);font-size:10px">
                  ${d.type}${d.serial ? ' · ' + d.serial : ''} ·
                  <span style="color:${d.condition==='Good'?'var(--green)':d.condition==='Needs Repair'?'var(--red)':'var(--amber)'}">
                    ${d.condition}
                  </span>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : '';

    document.getElementById('pageContent').innerHTML = `
    <div class="profile-card" style="flex-direction:column;align-items:flex-start">
      <div style="display:flex;align-items:center;gap:14px;width:100%;justify-content:space-between;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:14px">
          ${photoHtml}
          <div>
            <div style="font-size:15px;font-weight:700">${emp.name}
              <span class="role-employee">Employee</span>
            </div>
            <div style="margin-top:4px;margin-bottom:2px">
              <span style="background:rgba(37,99,235,.12);color:var(--primary);padding:4px 12px;border-radius:6px;font-size:12px;font-weight:800;letter-spacing:1px;display:inline-flex;align-items:center;gap:5px">
                🪪 <span style="font-family:monospace">${emp.employee_id || 'ID not assigned'}</span>
              </span>
            </div>
            <div style="font-size:12px;color:var(--muted)">
              ${emp.dept} · Team: ${emp.team || '—'} · Joined ${emp.join_date}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-sm btn-blue" onclick="uploadMyPhoto()" style="white-space:nowrap">
            📷 ${emp.photo ? 'Change Photo' : 'Upload Photo'}
          </button>
          <button class="btn-sm btn-amber" onclick="changeMyPassword()" style="white-space:nowrap">
            🔑 Change Password
          </button>
        </div>
      </div>
      ${devHtml}
    </div>
    <div class="bal-grid">
      <div class="bal-card">
        <div style="font-size:18px">🏖️</div>
        <div class="bal-val" style="color:var(--green)">${bal.casual_available}</div>
        <div class="bal-lbl">Casual Leave Left</div>
        <div class="bal-sub">${bal.casual_used} used · carries forward</div>
      </div>
      <div class="bal-card">
        <div style="font-size:18px">🤒</div>
        <div class="bal-val" style="color:var(--amber)">${bal.sick_available}</div>
        <div class="bal-lbl">Sick This Month</div>
        <div class="bal-sub">${bal.sick_used_month} used of ${bal.sick_this_month} · resets monthly</div>
      </div>
      <div class="bal-card">
        <div style="font-size:18px">📅</div>
        <div class="bal-val" style="color:var(--primary)">${daysPresent}</div>
        <div class="bal-lbl">Days Present</div>
        <div class="bal-sub">This month</div>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--amber)"></div>
            ${new Date().toLocaleString('default',{month:'long',year:'numeric'})} — Click date to apply leave
          </div>
        </div>
        <div class="card-body">
          <div class="cal-grid">${buildCal(attMap, holMap, leaveMap, 'applyLeave')}</div>
          <div class="cal-legend">
            <div class="leg-item"><div class="leg-dot" style="background:rgba(22,163,74,.5)"></div>Present</div>
            <div class="leg-item"><div class="leg-dot" style="background:rgba(220,38,38,.4)"></div>Absent</div>
            <div class="leg-item"><div class="leg-dot" style="background:rgba(217,119,6,.4)"></div>Late/Pending</div>
            <div class="leg-item"><div class="leg-dot" style="background:rgba(37,99,235,.4)"></div>Holiday/Approved</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="card-title"><div class="cdot" style="background:var(--primary)"></div>My Leave History</div>
          <span class="pill pending">${myLeaves.filter(l => l.status === 'pending').length} pending</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Remarks</th><th>Doc</th></tr></thead>
          <tbody>
            ${myLeaves.length
              ? myLeaves.slice(0, 8).map(l => `
                  <tr>
                    <td><span class="pill teal">${l.type}</span></td>
                    <td>${l.from_date}</td><td>${l.to_date}</td>
                    <td><span class="pill ${l.status}">${l.status}</span></td>
                    <td style="font-size:11px;max-width:120px">
                      ${l.status === 'rejected' && l.rejection_reason
                        ? `<span style="color:var(--red)" title="${l.rejection_reason}">❌ ${l.rejection_reason.length > 30 ? l.rejection_reason.slice(0,30)+'…' : l.rejection_reason}</span>`
                        : l.status === 'approved'
                          ? `<span style="color:var(--green)">✅ Approved by ${l.approved_by || 'Admin'}</span>`
                          : '<span style="color:var(--muted)">—</span>'}
                    </td>
                    <td>${l.has_medical_file ? '📎' : '—'}</td>
                  </tr>`).join('')
              : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:18px">No requests yet</td></tr>'}
          </tbody>
        </table></div>
      </div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};

/* ── Photo upload (employee self) ── */
window.uploadMyPhoto = () => {
  openModal('Upload Your Photo',
    `<div style="text-align:center">
      <p style="font-size:12px;color:var(--muted);margin-bottom:12px">
        JPG or PNG · max 2MB · square crop recommended
      </p>
      <input type="file" id="photoInput" accept="image/jpeg,image/png,image/webp"
        style="display:none" onchange="previewPhoto(this)">
      <div id="photoPreviewWrap" style="margin-bottom:12px">
        <div id="photoPreview" style="width:100px;height:100px;border-radius:14px;
          background:var(--surf2);border:2px dashed var(--border);
          display:flex;align-items:center;justify-content:center;
          font-size:28px;margin:0 auto;overflow:hidden;">
          📷
        </div>
      </div>
      <button class="btn-ghost" onclick="document.getElementById('photoInput').click()">
        Choose Photo
      </button>
    </div>`,
    async () => {
      const b64 = window._photoB64;
      if (!b64) { toast('Please choose a photo first', true); return; }
      try {
        await api(`/employees/${CU.id}/photo`, 'PUT', { photo: b64 });
        CU.photo = b64;
        updateSidebarAvatar();
        toast('Photo updated ✅');
        loadEmpDash();
      } catch (e) {
        toast(e.message, true);
      }
    }, 'Save Photo'
  );
};

window.previewPhoto = (input) => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Image must be under 2MB', true); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    window._photoB64 = ev.target.result;
    const prev = document.getElementById('photoPreview');
    if (prev) {
      prev.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
    }
  };
  reader.readAsDataURL(file);
};

/* ── Change own password (employee) ── */
window.changeMyPassword = () => {
  openModal('Change Password',
    `<div class="field">
       <label>Current Password</label>
       <input type="password" id="cpCur" class="form-ctrl" placeholder="Your current password">
     </div>
     <div class="field">
       <label>New Password</label>
       <input type="password" id="cpNew2" class="form-ctrl" placeholder="Min 6 characters">
     </div>
     <div class="field">
       <label>Confirm New Password</label>
       <input type="password" id="cpCfm2" class="form-ctrl" placeholder="Repeat new password">
     </div>`,
    async () => {
      const cur = document.getElementById('cpCur').value;
      const np  = document.getElementById('cpNew2').value;
      const cfm = document.getElementById('cpCfm2').value;
      if (!cur)          { toast('Enter your current password', true); return; }
      if (!np || np.length < 6) { toast('New password must be at least 6 characters', true); return; }
      if (np !== cfm)    { toast('Passwords do not match', true); return; }
      if (np === cur)    { toast('New password must be different', true); return; }
      try {
        await api('/auth/change-password', 'POST', {
          current_password: cur,
          new_password:     np,
        });
        toast('Password changed successfully ✅');
      } catch (e) {
        toast(e.message, true);
      }
    }, 'Change Password'
  );
};

/* ── Apply Leave (employee, with optional medical file) ── */
window.applyLeave = (dateStr) => {
  openModal('Apply for Leave', `
    <div class="field"><label>From Date</label>
      <input type="date" id="fl_from" value="${dateStr}" class="form-ctrl"></div>
    <div class="field"><label>To Date</label>
      <input type="date" id="fl_to" value="${dateStr}" class="form-ctrl"></div>
    <div class="field"><label>Leave Type</label>
      <select id="fl_type" class="form-ctrl">
        <option value="casual">🏖️ Casual Leave</option>
        <option value="sick">🤒 Sick Leave</option>
        <option value="wfh">🏠 Work From Home</option>
      </select>
    </div>
    <div class="field"><label>Reason</label>
      <textarea id="fl_reason" class="form-ctrl" rows="3" placeholder="Brief reason…"></textarea></div>
    <div class="field">
      <label>Medical / Proof Document <span style="color:var(--muted);font-weight:400;text-transform:none">(optional)</span></label>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <input type="file" id="fl_medInput" accept="image/*,application/pdf"
          style="display:none" onchange="handleMedFile(this)">
        <button class="btn-ghost" style="padding:7px 14px;font-size:12px"
          onclick="document.getElementById('fl_medInput').click()">
          📎 Attach File
        </button>
        <span id="fl_medName" style="font-size:11px;color:var(--muted)">No file chosen</span>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">
        JPG, PNG or PDF · max 5MB · not mandatory
      </div>
    </div>
    <p style="font-size:11px;color:var(--amber);margin-top:6px">
      📧 Notification will be sent to HR, CEO and your Team Leader
    </p>`,
  async () => {
    const from = document.getElementById('fl_from').value;
    const to   = document.getElementById('fl_to').value;
    if (!from || !to)              { toast('Select both dates', true);          return; }
    if (new Date(to) < new Date(from)) { toast('To date cannot be before From date', true); return; }
    try {
      await api('/leave/request', 'POST', {
        type:         document.getElementById('fl_type').value,
        from_date:    from,
        to_date:      to,
        reason:       document.getElementById('fl_reason').value,
        medical_file: window._medFileB64 || null,
      });
      window._medFileB64 = null;
      toast('Leave request submitted ✅');
      loadEmpDash();
    } catch (e) {
      toast(e.message, true);
    }
  });
};

window.handleMedFile = (input) => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('File must be under 5MB', true); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    window._medFileB64 = ev.target.result;
    const lbl = document.getElementById('fl_medName');
    if (lbl) lbl.textContent = file.name;
  };
  reader.readAsDataURL(file);
};

/* ═══════════════════════════════════════════
   ADMIN — EMPLOYEES (with full detail panel)
═══════════════════════════════════════════ */
let _devState = {};

const loadEmps = async () => {
  try {
    const emps = await api('/employees');
    _devState  = {};
    emps.forEach(e => { _devState[e.id] = JSON.parse(JSON.stringify(e.devices || [])); });

    const rows = emps.map((e, i) => {
      const devs = e.devices || [];
      const dIco = devs.slice(0, 3).map(d => `<span title="${d.name||d.type}">${DICO[d.type]||'📦'}</span>`).join('')
        + (devs.length > 3 ? `<sup style="font-size:9px;color:var(--muted)">+${devs.length-3}</sup>` : '');

      // Photo thumb
      const thumbHtml = e.photo
        ? `<img src="${e.photo}" style="width:28px;height:28px;border-radius:7px;object-fit:cover;flex-shrink:0;">`
        : `<div class="emp-thumb" style="background:${COLS[i%COLS.length]}20;color:${COLS[i%COLS.length]}">${e.name.charAt(0)}</div>`;

      return `
      <tr id="er-${e.id}" style="cursor:pointer" onclick="toggleEmpDetail('${e.id}')">
        <td><div class="emp-cell">
          ${thumbHtml}
          <div>
            <div style="font-weight:500">${e.name}</div>
            <div style="font-size:10px;color:var(--muted)">${e.email}</div>
          </div>
        </div></td>
        <td>
          ${e.employee_id
            ? `<span style="background:rgba(37,99,235,.10);color:var(--primary);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.5px;white-space:nowrap">${e.employee_id}</span>`
            : '<span style="color:var(--muted);font-size:11px">—</span>'}
        </td>
        <td style="color:var(--muted)">${e.dept}</td>
        <td style="color:var(--muted)">${e.team || '—'}</td>
        <td><span class="pill ${e.role}">${e.role}</span></td>
        <td>${e.join_date}</td>
        <td>
          <div style="display:flex;align-items:center;gap:5px;font-size:15px">
            ${dIco || '<span style="color:var(--muted);font-size:11px">None</span>'}
          </div>
        </td>
        <td onclick="event.stopPropagation()">
          <button class="btn-sm btn-blue"  onclick="changeRole('${e.id}','${e.name.replace(/'/g,"\\'")}')">Role</button>
          <button class="btn-sm btn-amber" onclick="resetPass('${e.id}')"  style="margin-left:4px">Pass</button>
          <button class="btn-sm btn-red"   onclick="delEmp('${e.id}')"    style="margin-left:4px">Del</button>
        </td>
      </tr>
      <tr id="dp-${e.id}" style="display:none">
        <td colspan="7" style="padding:0;background:var(--surf2)">
          <div id="dpContent-${e.id}" class="dev-panel">
            <div style="text-align:center;color:var(--muted);font-size:12px;padding:10px">Loading…</div>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('pageContent').innerHTML = `
    <div class="add-row">
      <button class="btn-primary" onclick="showAddEmp()">+ Add Employee</button>
    </div>
    <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
      💡 Click any row to see full employee details, leave history and manage devices
    </p>
    <div class="card">
      <div class="card-head">
        <div class="card-title">
          <div class="cdot" style="background:var(--primary)"></div>All Employees (${emps.length})
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead>
          <tr><th>Employee</th><th>Emp ID</th><th>Dept</th><th>Team</th><th>Role</th><th>Joined</th><th>Devices</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:22px">No employees</td></tr>'}</tbody>
      </table></div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};

/* ── Employee Full Detail Panel (admin click) ── */
window.toggleEmpDetail = async (eid) => {
  const p = document.getElementById(`dp-${eid}`);
  const r = document.getElementById(`er-${eid}`);
  if (!p) return;
  const isOpen = p.style.display !== 'none';

  // Close all
  document.querySelectorAll('[id^="dp-"]').forEach(x => x.style.display = 'none');
  document.querySelectorAll('[id^="er-"]').forEach(x => x.style.background = '');

  if (isOpen) return; // was open, just close

  p.style.display    = '';
  r.style.background = 'rgba(37,99,235,.04)';

  // Load data
  const panel = document.getElementById(`dpContent-${eid}`);
  try {
    const [emp, bal, att, leaveReqs] = await Promise.all([
      api(`/employees/${eid}`),
      api(`/leave/balance/${eid}`),
      api(`/attendance/${eid}`),
      api('/leave/requests'),
    ]);

    const empLeaves = leaveReqs.filter(l => l.employee_id === eid);
    const devs      = emp.devices || [];

    // Attendance summary
    const thisMonth    = new Date().toISOString().slice(0, 7);
    const attThisMonth = att.filter(a => a.date.startsWith(thisMonth));
    const presCount    = attThisMonth.filter(a => a.status === 'present').length;
    const lateCount    = attThisMonth.filter(a => a.status === 'late').length;
    const absCount     = attThisMonth.filter(a => a.status === 'absent').length;
    const permCount    = attThisMonth.filter(a => a.status === 'permission').length;

    // Leave counts
    const pendLeaves   = empLeaves.filter(l => l.status === 'pending').length;
    const appLeaves    = empLeaves.filter(l => l.status === 'approved').length;
    const usedCasual   = empLeaves.filter(l => l.status === 'approved' && l.type === 'casual').length;
    const usedSick     = empLeaves.filter(l => l.status === 'approved' && l.type === 'sick').length;

    // Photo
    const photoHtml = emp.photo
      ? `<img src="${emp.photo}" style="width:60px;height:60px;border-radius:12px;object-fit:cover;flex-shrink:0;border:2px solid var(--border);">`
      : `<div style="width:60px;height:60px;border-radius:12px;background:linear-gradient(135deg,var(--primary),var(--purple));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;flex-shrink:0;">${emp.name.charAt(0)}</div>`;

    panel.innerHTML = `
      <div style="padding:16px 18px">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;flex-wrap:wrap">
          ${photoHtml}
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700">${emp.name}
              <span class="pill ${emp.role}" style="margin-left:6px">${emp.role}</span>
              ${emp.employee_id ? `<span style="background:rgba(37,99,235,.10);color:var(--primary);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-left:4px">${emp.employee_id}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${emp.email} · ${emp.phone || 'No phone'}</div>
            <div style="font-size:11px;color:var(--muted)">${emp.dept} · Team: ${emp.team || '—'} · Joined: ${emp.join_date}</div>
          </div>
          <button class="btn-sm" style="background:var(--surf3);color:var(--muted);border:1.5px solid var(--border)"
            onclick="toggleEmpDetail('${eid}')">✕ Close</button>
        </div>

        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          <div style="background:var(--surf3);border:1.5px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--green)">${bal.casual_available}</div>
            <div style="font-size:10px;color:var(--muted)">Casual Left</div>
          </div>
          <div style="background:var(--surf3);border:1.5px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--amber)">${bal.sick_available}</div>
            <div style="font-size:10px;color:var(--muted)">Sick Left</div>
          </div>
          <div style="background:var(--surf3);border:1.5px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--primary)">${pendLeaves}</div>
            <div style="font-size:10px;color:var(--muted)">Pending</div>
          </div>
          <div style="background:var(--surf3);border:1.5px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--purple)">${appLeaves}</div>
            <div style="font-size:10px;color:var(--muted)">Approved Total</div>
          </div>
        </div>

        <!-- Attendance this month -->
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">
            📅 Attendance This Month
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <span class="pill present">✅ ${presCount} Present</span>
            <span class="pill late">⏰ ${lateCount} Late</span>
            <span class="pill absent">❌ ${absCount} Absent</span>
            <span class="pill teal">🔑 ${permCount} Permission</span>
          </div>
          <div style="overflow-x:auto;max-height:180px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead><tr style="background:var(--surf2)">
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Date</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Status</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Details</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">In</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Out</th>
              </tr></thead>
              <tbody>
                ${att.slice(0, 20).map(a => `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:5px 8px">${a.date}</td>
                    <td style="padding:5px 8px"><span class="pill ${a.status === 'permission' ? 'teal' : a.status}">${a.status}</span></td>
                    <td style="padding:5px 8px;font-size:10px;color:var(--muted)">
                      ${a.status === 'permission' && a.permission_type
                        ? `${a.permission_type}${a.permission_type === 'hours' && a.permission_hours ? ` (${a.permission_hours}h)` : ''}`
                        : '—'}
                    </td>
                    <td style="padding:5px 8px;color:var(--muted)">${a.check_in  || '—'}</td>
                    <td style="padding:5px 8px;color:var(--muted)">${a.check_out || '—'}</td>
                  </tr>`).join('') ||
                  '<tr><td colspan="5" style="padding:10px;text-align:center;color:var(--muted)">No records</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Leave history -->
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">
            📝 Leave History (All Time)
          </div>
          <div style="overflow-x:auto;max-height:200px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead><tr style="background:var(--surf2)">
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Type</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">From</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">To</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Reason</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Status</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">Doc</th>
                <th style="padding:5px 8px;text-align:left;font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase">By</th>
              </tr></thead>
              <tbody>
                ${empLeaves.length
                  ? empLeaves.map(l => `
                      <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:5px 8px"><span class="pill teal">${l.type}</span></td>
                        <td style="padding:5px 8px">${l.from_date}</td>
                        <td style="padding:5px 8px">${l.to_date}</td>
                        <td style="padding:5px 8px;color:var(--muted);max-width:100px;font-size:10px">${l.reason || '—'}</td>
                        <td style="padding:5px 8px"><span class="pill ${l.status}">${l.status}</span></td>
                        <td style="padding:5px 8px">
                          ${l.has_medical_file
                            ? `<button class="btn-sm btn-blue" style="padding:2px 7px;font-size:10px" onclick="viewMedFile('${l.id}')">📎 View</button>`
                            : '—'}
                        </td>
                        <td style="padding:5px 8px;color:var(--muted);font-size:10px">${l.approved_by || l.rejected_by || '—'}</td>
                      </tr>`).join('')
                  : '<tr><td colspan="7" style="padding:10px;text-align:center;color:var(--muted)">No leave history</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Devices -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px">
              💻 Devices
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn-sm btn-green" onclick="addDev('${eid}')">+ Add</button>
              <button class="btn-sm btn-blue"  onclick="saveDev('${eid}')">💾 Save</button>
            </div>
          </div>
          <div id="drows-${eid}">${renderDevRows(eid)}</div>
        </div>
      </div>`;
  } catch (e) {
    panel.innerHTML = `<div style="padding:14px;color:var(--red);font-size:12px">Error: ${e.message}</div>`;
  }
};

/* ── View medical file ── */
window.viewMedFile = async (reqId) => {
  try {
    const data = await api(`/leave/requests/${reqId}/medical`);
    const win = window.open();
    if (data.medical_file.startsWith('data:application/pdf')) {
      win.document.write(`<iframe src="${data.medical_file}" style="width:100%;height:100vh;border:none"></iframe>`);
    } else {
      win.document.write(`<img src="${data.medical_file}" style="max-width:100%;display:block;margin:auto">`);
    }
  } catch (e) {
    toast(e.message, true);
  }
};

const DEV_TYPES = ['Laptop','Desktop','Monitor','Mouse','Keyboard','Headset','Phone','Tablet','Docking Station','Other'];
const DEV_CONDS = ['Good','Fair','Needs Repair','Returned'];

function renderDevRows(eid) {
  const devs = _devState[eid] || [];
  if (!devs.length) return `
    <div style="text-align:center;color:var(--muted);font-size:12px;padding:12px">
      No devices. Click "+ Add" to assign one.
    </div>`;
  return `
    <div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse">
      <thead><tr style="background:var(--surf3)">
        <th style="padding:6px 8px;text-align:left;color:var(--muted);font-size:10px;text-transform:uppercase">Type</th>
        <th style="padding:6px 8px;text-align:left;color:var(--muted);font-size:10px;text-transform:uppercase">Device Name</th>
        <th style="padding:6px 8px;text-align:left;color:var(--muted);font-size:10px;text-transform:uppercase">Serial</th>
        <th style="padding:6px 8px;text-align:left;color:var(--muted);font-size:10px;text-transform:uppercase">Assigned</th>
        <th style="padding:6px 8px;text-align:left;color:var(--muted);font-size:10px;text-transform:uppercase">Condition</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${devs.map((d, i) => `
          <tr>
            <td style="padding:4px 6px">
              <select onchange="_devState['${eid}'][${i}].type=this.value"
                class="form-ctrl" style="padding:3px 6px;font-size:11px;width:auto">
                ${DEV_TYPES.map(t =>
                  `<option value="${t}" ${d.type===t?'selected':''}>${DICO[t]||'📦'} ${t}</option>`
                ).join('')}
              </select>
            </td>
            <td style="padding:4px 6px">
              <input value="${d.name||''}"
                onchange="_devState['${eid}'][${i}].name=this.value"
                class="form-ctrl" style="padding:3px 6px;font-size:11px" placeholder="e.g. Dell XPS">
            </td>
            <td style="padding:4px 6px">
              <input value="${d.serial||''}"
                onchange="_devState['${eid}'][${i}].serial=this.value"
                class="form-ctrl" style="padding:3px 6px;font-size:11px" placeholder="SN-001">
            </td>
            <td style="padding:4px 6px">
              <input type="date" value="${d.assigned_on||''}"
                onchange="_devState['${eid}'][${i}].assigned_on=this.value"
                class="form-ctrl" style="padding:3px 6px;font-size:11px">
            </td>
            <td style="padding:4px 6px">
              <select onchange="_devState['${eid}'][${i}].condition=this.value"
                class="form-ctrl" style="padding:3px 6px;font-size:11px;width:auto">
                ${DEV_CONDS.map(c =>
                  `<option value="${c}" ${d.condition===c?'selected':''}>${c}</option>`
                ).join('')}
              </select>
            </td>
            <td style="padding:4px 6px">
              <button class="btn-sm btn-red" onclick="rmDev('${eid}',${i})">✕</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;
}

window.addDev = (eid) => {
  if (!_devState[eid]) _devState[eid] = [];
  _devState[eid].push({
    type: 'Laptop', name: '', serial: '',
    assigned_on: new Date().toISOString().slice(0, 10),
    condition: 'Good'
  });
  document.getElementById(`drows-${eid}`).innerHTML = renderDevRows(eid);
};
window.rmDev = (eid, i) => {
  _devState[eid].splice(i, 1);
  document.getElementById(`drows-${eid}`).innerHTML = renderDevRows(eid);
};
window.saveDev = async (eid) => {
  try {
    await api(`/employees/${eid}`, 'PUT', { devices: _devState[eid] || [] });
    toast('Devices saved ✅');
    loadEmps();
  } catch (e) {
    toast(e.message, true);
  }
};
window.changeRole = (id, name) => {
  openModal(`Change Role — ${name}`, `
    <div class="field"><label>New Role</label>
      <select id="nr" class="form-ctrl">
        <option value="employee">👤 Employee — Dashboard only</option>
        <option value="team_leader">👑 Team Leader — Team attendance & leaves</option>
        <option value="admin">🔑 Admin — Full access</option>
      </select>
    </div>
    <div class="field"><label>Team</label>
      <input id="nt" class="form-ctrl" placeholder="e.g. Engineering">
    </div>`,
  async () => {
    const role = document.getElementById('nr').value;
    const team = document.getElementById('nt').value.trim();
    try {
      await api(`/employees/admin/promote/${id}`, 'PUT', { role, team: team || undefined });
      toast(`Role updated to ${role}`);
      loadEmps();
    } catch (e) {
      toast(e.message, true);
    }
  });
};
window.resetPass = (id) => {
  openModal('Reset Employee Password',
    `<div class="field">
       <label>New Password <span style="font-size:10px;color:var(--amber)">(min 6 chars — share with employee, they must change it within 2 days)</span></label>
       <input type="text" id="rpPw" class="form-ctrl" placeholder="e.g. Temp@1234">
     </div>`,
    async () => {
      const p = document.getElementById('rpPw').value;
      if (!p || p.length < 6) { toast('Min 6 characters', true); return; }
      try {
        await api(`/employees/admin/reset-password/${id}`, 'PUT', { new_password: p });
        toast('Password reset ✅ — share it with the employee');
      } catch (e) { toast(e.message, true); }
    }, 'Reset Password'
  );
};
window.delEmp = async (id) => {
  if (!confirm('Permanently delete this employee and all their records?')) return;
  try {
    await api(`/employees/${id}`, 'DELETE');
    toast('Employee deleted');
    loadEmps();
  } catch (e) {
    toast(e.message, true);
  }
};
window.showAddEmp = () => {
  openModal('Add New Employee', `
    <div class="field"><label>Full Name *</label>
      <input id="en" class="form-ctrl" placeholder="e.g. Ravi Kumar"></div>
    <div class="field"><label>Employee ID (Email) *</label>
      <div style="display:flex;align-items:center;gap:0">
        <input id="ee" class="form-ctrl" placeholder="ravi"
          style="border-radius:8px 0 0 8px;border-right:none;flex:1">
        <span style="background:var(--surf2);border:1.5px solid var(--border);border-left:none;
          border-radius:0 8px 8px 0;padding:0 10px;height:38px;display:flex;align-items:center;
          font-size:12px;color:var(--muted);white-space:nowrap">@opseazy.com</span>
      </div>
    </div>
    <div class="field">
      <label>Employee ID <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none">(e.g. OP203 — optional, alphanumeric)</span></label>
      <input id="eid2" class="form-ctrl" placeholder="e.g. OP203" style="text-transform:uppercase">
    </div>
    <div class="field"><label>Initial Password * <span style="font-size:10px;color:var(--amber)">(share this with employee — they must change it within 2 days)</span></label>
      <input id="epw" type="text" class="form-ctrl" placeholder="Min 6 characters"></div>
    <div class="field"><label>Department</label>
      <input id="ed" class="form-ctrl" placeholder="Engineering"></div>
    <div class="field"><label>Team</label>
      <input id="et" class="form-ctrl" placeholder="Engineering"></div>
    <div class="field"><label>Phone</label>
      <input id="ep" class="form-ctrl" placeholder="+91 98400 00000"></div>
    <div class="field"><label>Join Date</label>
      <input id="ej" type="date" class="form-ctrl" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>Role</label>
      <select id="er2" class="form-ctrl">
        <option value="employee">Employee</option>
        <option value="team_leader">Team Leader</option>
        <option value="admin">Admin</option>
      </select>
    </div>`,
  async () => {
    const name  = document.getElementById('en').value.trim();
    const email = document.getElementById('ee').value.trim();
    if (!name || !email) { toast('Name and email are required', true); return; }
    try {
      const username = document.getElementById('ee').value.trim().toLowerCase();
      const fullEmail = username.includes('@') ? username : username + '@opseazy.com';
      const initPass  = document.getElementById('epw').value;
      if (!initPass || initPass.length < 6) { toast('Initial password must be at least 6 characters', true); return; }
      await api('/employees', 'POST', {
        name,
        email:       fullEmail,
        password:    initPass,
        employee_id: document.getElementById('eid2').value.trim().toUpperCase() || null,
        dept:        document.getElementById('ed').value.trim(),
        team:        document.getElementById('et').value.trim() || document.getElementById('ed').value.trim(),
        phone:       document.getElementById('ep').value.trim(),
        join_date:   document.getElementById('ej').value || new Date().toISOString().slice(0,10),
        role:        document.getElementById('er2').value || 'employee'
      });
      toast('Employee added ✅');
      loadEmps();
    } catch (e) {
      toast(e.message, true);
    }
  });
};

/* ═══════════════════════════════════════════
   ADMIN — ATTENDANCE (with permission sub-types)
═══════════════════════════════════════════ */
const loadAtt = async () => {
  try {
    const att  = await api('/attendance/today');
    const pres = att.filter(a => a.status === 'present').length;
    const abs  = att.filter(a => a.status === 'absent').length;
    const late = att.filter(a => a.status === 'late').length;
    const perm = att.filter(a => a.status === 'permission').length;

    document.getElementById('pageContent').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="pill approved">✅ ${pres} Present</span>
        <span class="pill rejected">❌ ${abs} Absent</span>
        <span class="pill teal">🔑 ${perm} Permission</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <select id="dlMonth" class="form-ctrl" style="width:auto;padding:4px 10px;font-size:12px">
          ${Array.from({length:12},(_,i)=>{
            const d = new Date(); d.setMonth(d.getMonth()-i);
            const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0');
            const lbl = d.toLocaleString('default',{month:'long',year:'numeric'});
            return `<option value="${y}-${m}">${lbl}</option>`;
          }).join('')}
        </select>
        <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="downloadAttExcel()">
          📥 Download Excel
        </button>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">
          <div class="cdot" style="background:var(--green)"></div>
          All Employees — ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Employee</th><th>Emp ID</th><th>Team</th><th>Status</th><th>In</th><th>Out</th><th>Override</th></tr></thead>
        <tbody>
          ${att.map(a => `
            <tr>
              <td><div class="emp-cell">
                <div class="emp-thumb" style="background:rgba(37,99,235,.12);color:var(--primary)">
                  ${a.employee_name.charAt(0)}
                </div>
                <div style="font-weight:500">${a.employee_name}</div>
              </div></td>
              <td>
                ${a.employee_code
                  ? `<span style="background:rgba(37,99,235,.10);color:var(--primary);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.5px">${a.employee_code}</span>`
                  : '<span style="color:var(--muted);font-size:11px">—</span>'}
              </td>
              <td style="color:var(--muted)">${a.team || '—'}</td>
              <td>
                <span class="pill ${a.status === 'permission' ? 'teal' : a.status}">
                  ${a.status}${a.permission_type ? ` · ${a.permission_type}${a.permission_type === 'hours' && a.permission_hours ? ` (${a.permission_hours}h)` : ''}` : ''}
                </span>
              </td>
              <td>${a.check_in  || '—'}</td>
              <td>${a.check_out || '—'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <select id="as-${a.employee_id}" class="form-ctrl"
                    style="width:auto;padding:3px 7px;font-size:11px"
                    onchange="togglePermFields('${a.employee_id}')">
                    <option value="present"    ${a.status==='present'   ?'selected':''}>Present</option>
                    <option value="absent"     ${a.status==='absent'    ?'selected':''}>Absent</option>
                    <option value="permission" ${a.status==='permission'?'selected':''}>Permission</option>
                  </select>
                  <!-- Permission sub-fields (shown only when Permission is selected) -->
                  <span id="pf-${a.employee_id}" style="display:${a.status==='permission'?'flex':'none'};align-items:center;gap:5px;flex-wrap:wrap">
                    <select id="pt-${a.employee_id}" class="form-ctrl"
                      style="width:auto;padding:3px 7px;font-size:11px"
                      onchange="toggleHoursInput('${a.employee_id}')">
                      <option value="half_day" ${a.permission_type==='half_day'?'selected':''}>Half Day</option>
                      <option value="sick"     ${a.permission_type==='sick'    ?'selected':''}>Sick Permission</option>
                      <option value="hours"    ${a.permission_type==='hours'   ?'selected':''}>Hours Permission</option>
                    </select>
                    <input type="number" id="ph-${a.employee_id}" min="1" max="8"
                      value="${a.permission_hours || ''}"
                      placeholder="hrs"
                      class="form-ctrl"
                      style="width:60px;padding:3px 7px;font-size:11px;display:${a.permission_type==='hours'?'block':'none'}">
                  </span>
                  <button class="btn-sm btn-blue" onclick="updAtt('${a.employee_id}')" style="margin-left:2px">
                    Update
                  </button>
                </div>
              </td>
            </tr>`).join('') ||
            '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:22px">No attendance records for today</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};

window.togglePermFields = (eid) => {
  const st = document.getElementById(`as-${eid}`).value;
  const pf = document.getElementById(`pf-${eid}`);
  if (pf) pf.style.display = st === 'permission' ? 'flex' : 'none';
};

window.toggleHoursInput = (eid) => {
  const pt = document.getElementById(`pt-${eid}`).value;
  const ph = document.getElementById(`ph-${eid}`);
  if (ph) ph.style.display = pt === 'hours' ? 'block' : 'none';
};

window.updAtt = async (eid) => {
  const st  = document.getElementById(`as-${eid}`).value;
  const pt  = document.getElementById(`pt-${eid}`) ? document.getElementById(`pt-${eid}`).value : null;
  const phEl = document.getElementById(`ph-${eid}`);
  const ph  = phEl ? parseInt(phEl.value) || null : null;
  try {
    await api('/attendance/mark', 'POST', {
      employee_id:      eid,
      status:           st,
      permission_type:  st === 'permission' ? pt  : null,
      permission_hours: st === 'permission' && pt === 'hours' ? ph : null,
    });
    toast('Attendance updated ✅');
    loadAtt();
  } catch (e) {
    toast(e.message, true);
  }
};

/* ═══════════════════════════════════════════
   ADMIN — LEAVE REQUESTS
═══════════════════════════════════════════ */
const loadLeaves = async () => {
  try {
    const reqs = await api('/leave/requests');
    const uniq = [...new Set(reqs.map(r => r.employee_id).filter(Boolean))];
    const balMap = {};
    await Promise.all(uniq.map(async eid => {
      try { balMap[eid] = await api(`/leave/balance/${eid}`); } catch {}
    }));
    const pol = await api('/leave/policy');
    const cpm = pol.casual_per_month ?? 1;
    const spm = pol.sick_per_month   ?? 1;
    const pend = reqs.filter(r => r.status === 'pending');
    const all  = [...pend, ...reqs.filter(r => r.status !== 'pending')];
    const cc = n => n == null ? 'var(--muted)' : n <= 0 ? 'var(--red)' : n <= 2 ? 'var(--amber)' : 'var(--green)';

    const rows = all.map(r => {
      const b   = balMap[r.employee_id] || {};
      const ca  = b.casual_available ?? null;
      const sa  = b.sick_available   ?? null;
      const tot = (ca !== null && sa !== null) ? ca + sa : null;
      return `<tr>
        <td><div class="emp-cell">
          <div class="emp-thumb" style="background:rgba(37,99,235,.12);color:var(--primary)">
            ${r.employee_name.charAt(0)}
          </div>
          <div>
            <div style="font-weight:500">${r.employee_name}</div>
            <div style="font-size:10px;color:var(--muted)">${r.employee_team || ''}</div>
          </div>
        </div></td>
        <td><span class="pill teal">${r.type}</span></td>
        <td>${r.from_date}</td>
        <td>${r.to_date}</td>
        <td style="color:var(--muted);max-width:90px;font-size:11px">
          ${r.reason || '—'}
          ${r.rejection_reason ? `<div style="color:var(--red);font-size:10px;margin-top:2px">❌ ${r.rejection_reason}</div>` : ''}
        </td>
        <td style="text-align:center">
          ${r.has_medical_file
            ? `<button class="btn-sm btn-blue" style="padding:2px 8px;font-size:10px" onclick="viewMedFile('${r.id}')">📎 View</button>`
            : '<span style="color:var(--muted);font-size:11px">—</span>'}
        </td>
        <td style="text-align:center">
          <div style="font-size:14px;font-weight:700;color:var(--primary)">${cpm}</div>
          <div style="font-size:9px;color:var(--muted)">/month</div>
        </td>
        <td style="text-align:center">
          ${ca !== null
            ? `<div style="font-size:14px;font-weight:700;color:${cc(ca)}">${ca}</div>
               <div style="font-size:9px;color:var(--muted)">left</div>`
            : '—'}
        </td>
        <td style="text-align:center">
          <div style="font-size:14px;font-weight:700;color:var(--amber)">${spm}</div>
          <div style="font-size:9px;color:var(--muted)">/month</div>
        </td>
        <td style="text-align:center">
          ${sa !== null
            ? `<div style="font-size:14px;font-weight:700;color:${cc(sa)}">${sa}</div>
               <div style="font-size:9px;color:var(--muted)">left</div>`
            : '—'}
        </td>
        <td style="text-align:center">
          ${tot !== null
            ? `<div style="font-size:14px;font-weight:700;color:${cc(tot)}">${tot}</div>
               <div style="font-size:9px;color:var(--muted)">total</div>`
            : '—'}
        </td>
        <td><span class="pill ${r.status}">${r.status}</span></td>
        <td>
          ${r.status === 'pending'
            ? `<button class="btn-sm btn-green" onclick="appL('${r.id}')">Approve</button>
               <button class="btn-sm btn-red"   onclick="rejL('${r.id}')" style="margin-left:4px">Reject</button>`
            : '—'}
        </td>
      </tr>`;
    }).join('');

    document.getElementById('pageContent').innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="pill pending">${pend.length} Pending</span>
      <span class="pill approved">${reqs.filter(r=>r.status==='approved').length} Approved</span>
      <span class="pill rejected">${reqs.filter(r=>r.status==='rejected').length} Rejected</span>
      <span style="font-size:11px;color:var(--muted);margin-left:6px">
        <span style="color:var(--green)">■</span> 3+ &nbsp;
        <span style="color:var(--amber)">■</span> 1–2 &nbsp;
        <span style="color:var(--red)">■</span> 0 days remaining
      </span>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title"><div class="cdot" style="background:var(--amber)"></div>All Leave Requests</div>
        <span style="font-size:10px;color:var(--muted)">Policy: 🏖️ ${cpm}/mo · 🤒 ${spm}/mo</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Reason</th>
          <th style="text-align:center">📎 Doc</th>
          <th style="text-align:center"><div style="color:var(--primary);font-weight:700">C/Mo</div></th>
          <th style="text-align:center"><div style="color:var(--green);font-weight:700">C Left</div></th>
          <th style="text-align:center"><div style="color:var(--amber);font-weight:700">S/Mo</div></th>
          <th style="text-align:center"><div style="color:var(--amber);font-weight:700">S Left</div></th>
          <th style="text-align:center"><div style="color:var(--purple);font-weight:700">Total</div></th>
          <th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:22px">No requests</td></tr>'}</tbody>
      </table></div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};
window.appL = async (id) => { try { await api(`/leave/approve/${id}`, 'PUT'); toast('Approved ✅'); loadLeaves(); refreshBadge(); } catch(e){ toast(e.message,true); } };
window.rejL = (id) => {
  openModal('Reject Leave Request',
    `<div class="field"><label>Reason for Rejection <span style="color:var(--red)">*</span></label>
       <textarea id="rejReason" class="form-ctrl" rows="3" placeholder="e.g. Insufficient leave balance, project deadline…"></textarea>
       <div style="font-size:10px;color:var(--muted);margin-top:4px">Employee will see this reason.</div>
     </div>`,
    async () => {
      const reason = document.getElementById('rejReason').value.trim();
      if (!reason) { toast('Please enter a rejection reason', true); return; }
      try { await api(`/leave/reject/${id}`, 'PUT', { reason }); toast('Rejected'); loadLeaves(); refreshBadge(); }
      catch(e) { toast(e.message, true); }
    }, 'Reject Leave'
  );
};

/* ═══════════════════════════════════════════
   ADMIN — LEAVE POLICY
═══════════════════════════════════════════ */
const loadPolicy = async () => {
  try {
    const pol  = await api('/leave/policy');
    const cpm  = pol.casual_per_month ?? 1;
    const cpy  = pol.casual_per_year  ?? 12;
    const spm  = pol.sick_per_month   ?? 1;
    const spy  = pol.sick_per_year    ?? 12;
    const wpm  = pol.wfh_per_month    ?? 0;
    const mcc  = pol.max_casual_carry ?? 12;
    const maxc = pol.max_consecutive  ?? 5;
    const nd   = pol.notice_days      ?? 1;

    document.getElementById('pageContent').innerHTML = `
    <div class="card" style="max-width:620px">
      <div class="card-head">
        <div class="card-title"><div class="cdot" style="background:var(--primary)"></div>Leave Policy</div>
        <span class="pill approved">Applied to all employees</span>
      </div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="background:var(--surf2);border-radius:var(--rs);padding:12px;font-size:12px;
          color:var(--muted);border:1.5px solid var(--border);line-height:1.7">
          🏖️ <strong>Casual</strong> — earns monthly, <strong>carries forward</strong> (up to cap).<br>
          🤒 <strong>Sick</strong> — fresh allocation each month (<strong>lost if unused</strong>).<br>
          All values save exactly as entered. Changes apply to all employees immediately.
        </div>

        <div class="pol-section">
          <div class="pol-sec-head" style="background:rgba(22,163,74,.06);color:var(--green)">🏖️ Casual Leave</div>
          <div class="pol-sec-body">
            <div class="pol-field-row">
              <div class="pol-field">
                <label>Per Month (days)</label>
                <input type="number" id="p_cpm" value="${cpm}" min="0" max="31">
                <div class="hint">Days earned each month · carries forward</div>
              </div>
              <div class="pol-field">
                <label>Per Year (days)</label>
                <input type="number" id="p_cpy" value="${cpy}" min="0" max="365">
                <div class="hint">Total casual days allowed per year</div>
              </div>
            </div>
            <div class="pol-field" style="max-width:280px">
              <label>Max Carry Forward Cap</label>
              <input type="number" id="p_mcc" value="${mcc}" min="0" max="365">
              <div class="hint">Max casual days an employee can accumulate</div>
            </div>
          </div>
        </div>

        <div class="pol-section">
          <div class="pol-sec-head" style="background:rgba(217,119,6,.06);color:var(--amber)">🤒 Sick Leave</div>
          <div class="pol-sec-body">
            <div class="pol-field-row">
              <div class="pol-field">
                <label>Per Month (days)</label>
                <input type="number" id="p_spm" value="${spm}" min="0" max="31">
                <div class="hint">Resets every month — no carry forward</div>
              </div>
              <div class="pol-field">
                <label>Per Year (days)</label>
                <input type="number" id="p_spy" value="${spy}" min="0" max="365">
                <div class="hint">Total sick days allowed per year</div>
              </div>
            </div>
          </div>
        </div>

        <div class="pol-section">
          <div class="pol-sec-head" style="background:rgba(37,99,235,.06);color:var(--primary)">⚙️ Other Settings</div>
          <div class="pol-sec-body">
            <div class="pol-field-row">
              <div class="pol-field">
                <label>WFH Days / Month</label>
                <input type="number" id="p_wpm" value="${wpm}" min="0" max="31">
                <div class="hint">Resets monthly · 0 to disable</div>
              </div>
              <div class="pol-field">
                <label>Max Consecutive Days</label>
                <input type="number" id="p_maxc" value="${maxc}" min="1" max="30">
                <div class="hint">Max days in a single leave request</div>
              </div>
            </div>
            <div class="pol-field" style="max-width:280px">
              <label>Advance Notice (days)</label>
              <input type="number" id="p_nd" value="${nd}" min="0" max="30">
              <div class="hint">Minimum days ahead to apply for leave</div>
            </div>
          </div>
        </div>

        <button class="btn-primary" onclick="savePolicy()" style="max-width:280px">
          💾 Save & Apply to All Employees
        </button>
      </div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};

window.savePolicy = async () => {
  const gv = (id) => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const v = parseInt(el.value);
    return isNaN(v) ? 0 : v;
  };
  const data = {
    casual_per_month: gv('p_cpm'),
    casual_per_year:  gv('p_cpy'),
    sick_per_month:   gv('p_spm'),
    sick_per_year:    gv('p_spy'),
    wfh_per_month:    gv('p_wpm'),
    max_casual_carry: gv('p_mcc'),
    max_consecutive:  gv('p_maxc'),
    notice_days:      gv('p_nd'),
  };
  try {
    const r = await api('/leave/policy', 'PUT', data);
    toast(`✅ Saved — ${r.synced || 'all'} employee balances updated`);
    setTimeout(loadPolicy, 400);
  } catch (e) {
    toast('Error: ' + e.message, true);
  }
};

/* ═══════════════════════════════════════════
   ADMIN — HOLIDAYS
═══════════════════════════════════════════ */
const loadHols = async () => {
  try {
    const hols = await api('/holidays');
    document.getElementById('pageContent').innerHTML = `
    <div class="card" style="max-width:620px">
      <div class="card-head">
        <div class="card-title"><div class="cdot" style="background:var(--purple)"></div>Company Holidays</div>
        <span class="pill teal">${hols.length} configured</span>
      </div>
      <div class="card-body">
        <div class="holiday-form">
          <input type="date" id="hd" class="form-ctrl" style="flex:0 0 150px">
          <input type="text" id="hn" class="form-ctrl" placeholder="Holiday name e.g. Diwali">
          <button class="btn-primary" onclick="addHol()">+ Add</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Holiday</th><th>Day</th><th></th></tr></thead>
        <tbody>
          ${hols.sort((a, b) => a.date.localeCompare(b.date)).map(h => `
            <tr>
              <td style="font-weight:500">${h.date}</td>
              <td><div style="display:flex;align-items:center;gap:7px"><span>🎉</span>${h.name}</div></td>
              <td style="color:var(--muted)">
                ${new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', {weekday:'long'})}
              </td>
              <td>
                <button class="btn-sm btn-red" onclick="delHol('${h.date}')">Remove</button>
              </td>
            </tr>`).join('') ||
            '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px">No holidays added yet</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};
window.addHol = async () => {
  const d = document.getElementById('hd').value;
  const n = document.getElementById('hn').value.trim();
  if (!d || !n) { toast('Enter both date and holiday name', true); return; }
  try {
    await api('/holidays', 'POST', { date: d, name: n });
    toast('Holiday added 🎉');
    loadHols();
  } catch (e) { toast(e.message, true); }
};
window.delHol = async (ds) => {
  if (!confirm(`Remove holiday on ${ds}?`)) return;
  try {
    await api(`/holidays/${ds}`, 'DELETE');
    toast('Holiday removed');
    loadHols();
  } catch (e) { toast(e.message, true); }
};

/* ═══════════════════════════════════════════
   TEAM LEADER — ATTENDANCE (with permission sub-types)
═══════════════════════════════════════════ */
const loadTeamAtt = async () => {
  try {
    const att = await api('/attendance/today');
    document.getElementById('pageContent').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">
      <span class="pill approved">✅ ${att.filter(a=>a.status==='present').length} Present</span>
      <span class="pill late">⏰ ${att.filter(a=>a.status==='late').length} Late</span>
      <span class="pill rejected">❌ ${att.filter(a=>a.status==='absent').length} Absent</span>
      <span class="pill teal">🔑 ${att.filter(a=>a.status==='permission').length} Permission</span>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">
          <div class="cdot" style="background:var(--teal)"></div>
          Team: ${CU.team} — ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Employee</th><th>Emp ID</th><th>Status</th><th>In</th><th>Out</th><th>Override</th></tr></thead>
        <tbody>
          ${att.map(a => `
            <tr>
              <td><div class="emp-cell">
                <div class="emp-thumb" style="background:rgba(8,145,178,.12);color:var(--teal)">
                  ${a.employee_name.charAt(0)}
                </div>
                <div style="font-weight:500">${a.employee_name}</div>
              </div></td>
              <td>
                ${a.employee_code
                  ? `<span style="background:rgba(37,99,235,.10);color:var(--primary);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.5px">${a.employee_code}</span>`
                  : '<span style="color:var(--muted);font-size:11px">—</span>'}
              </td>
              <td>
                <span class="pill ${a.status === 'permission' ? 'teal' : a.status}">
                  ${a.status}${a.permission_type ? ` · ${a.permission_type}${a.permission_type === 'hours' && a.permission_hours ? ` (${a.permission_hours}h)` : ''}` : ''}
                </span>
              </td>
              <td>${a.check_in  || '—'}</td>
              <td>${a.check_out || '—'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <select id="ta-${a.employee_id}" class="form-ctrl"
                    style="width:auto;padding:3px 7px;font-size:11px"
                    onchange="toggleTeamPermFields('${a.employee_id}')">
                    <option value="present"    ${a.status==='present'   ?'selected':''}>Present</option>
                    <option value="absent"     ${a.status==='absent'    ?'selected':''}>Absent</option>
                    <option value="permission" ${a.status==='permission'?'selected':''}>Permission</option>
                  </select>
                  <span id="tpf-${a.employee_id}" style="display:${a.status==='permission'?'flex':'none'};align-items:center;gap:5px;flex-wrap:wrap">
                    <select id="tpt-${a.employee_id}" class="form-ctrl"
                      style="width:auto;padding:3px 7px;font-size:11px"
                      onchange="toggleTeamHoursInput('${a.employee_id}')">
                      <option value="half_day" ${a.permission_type==='half_day'?'selected':''}>Half Day</option>
                      <option value="sick"     ${a.permission_type==='sick'    ?'selected':''}>Sick Permission</option>
                      <option value="hours"    ${a.permission_type==='hours'   ?'selected':''}>Hours Permission</option>
                    </select>
                    <input type="number" id="tph-${a.employee_id}" min="1" max="8"
                      value="${a.permission_hours || ''}"
                      placeholder="hrs"
                      class="form-ctrl"
                      style="width:60px;padding:3px 7px;font-size:11px;display:${a.permission_type==='hours'?'block':'none'}">
                  </span>
                  <button class="btn-sm btn-blue" onclick="updTeamAtt('${a.employee_id}')" style="margin-left:2px">
                    Update
                  </button>
                </div>
              </td>
            </tr>`).join('') ||
            '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:18px">No team members found</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};

window.toggleTeamPermFields = (eid) => {
  const st  = document.getElementById(`ta-${eid}`).value;
  const pf  = document.getElementById(`tpf-${eid}`);
  if (pf) pf.style.display = st === 'permission' ? 'flex' : 'none';
};

window.toggleTeamHoursInput = (eid) => {
  const pt = document.getElementById(`tpt-${eid}`).value;
  const ph = document.getElementById(`tph-${eid}`);
  if (ph) ph.style.display = pt === 'hours' ? 'block' : 'none';
};

window.updTeamAtt = async (eid) => {
  const st  = document.getElementById(`ta-${eid}`).value;
  const ptEl = document.getElementById(`tpt-${eid}`);
  const phEl = document.getElementById(`tph-${eid}`);
  const pt  = ptEl ? ptEl.value : null;
  const ph  = phEl ? parseInt(phEl.value) || null : null;
  try {
    await api('/attendance/mark', 'POST', {
      employee_id:      eid,
      status:           st,
      permission_type:  st === 'permission' ? pt  : null,
      permission_hours: st === 'permission' && pt === 'hours' ? ph : null,
    });
    toast('Attendance updated ✅');
    loadTeamAtt();
  } catch (e) { toast(e.message, true); }
};

/* ═══════════════════════════════════════════
   TEAM LEADER — LEAVES
═══════════════════════════════════════════ */
const loadTeamLeaves = async () => {
  try {
    const reqs = await api('/leave/requests');
    const pend = reqs.filter(r => r.status === 'pending');
    const all  = [...pend, ...reqs.filter(r => r.status !== 'pending')];
    document.getElementById('pageContent').innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:4px">
      <span class="pill pending">${pend.length} Pending</span>
      <span class="pill approved">${reqs.filter(r=>r.status==='approved').length} Approved</span>
      <span class="pill rejected">${reqs.filter(r=>r.status==='rejected').length} Rejected</span>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">
          <div class="cdot" style="background:var(--amber)"></div>Team Leaves — ${CU.team}
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead>
          <tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Doc</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${all.map(r => `
            <tr>
              <td style="font-weight:500">${r.employee_name}</td>
              <td><span class="pill teal">${r.type}</span></td>
              <td>${r.from_date}</td>
              <td>${r.to_date}</td>
              <td style="color:var(--muted);font-size:11px">${r.reason || '—'}</td>
              <td>
                ${r.has_medical_file
                  ? `<button class="btn-sm btn-blue" style="padding:2px 7px;font-size:10px" onclick="viewMedFile('${r.id}')">📎</button>`
                  : '—'}
              </td>
              <td><span class="pill ${r.status}">${r.status}</span></td>
              <td>
                ${r.status === 'pending'
                  ? `<button class="btn-sm btn-green" onclick="tlApp('${r.id}')">Approve</button>
                     <button class="btn-sm btn-red"   onclick="tlRej('${r.id}')" style="margin-left:4px">Reject</button>`
                  : '—'}
              </td>
            </tr>`).join('') ||
            '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:22px">No leave requests</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="loading" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};
window.tlApp = async (id) => { try { await api(`/leave/approve/${id}`, 'PUT'); toast('Approved ✅'); loadTeamLeaves(); refreshBadge(); } catch(e){ toast(e.message,true); } };
window.tlRej = (id) => {
  openModal('Reject Leave Request',
    `<div class="field"><label>Reason for Rejection <span style="color:var(--red)">*</span></label>
       <textarea id="tlRejReason" class="form-ctrl" rows="3" placeholder="e.g. Insufficient leave balance, project deadline…"></textarea>
       <div style="font-size:10px;color:var(--muted);margin-top:4px">Employee will see this reason.</div>
     </div>`,
    async () => {
      const reason = document.getElementById('tlRejReason').value.trim();
      if (!reason) { toast('Please enter a rejection reason', true); return; }
      try { await api(`/leave/reject/${id}`, 'PUT', { reason }); toast('Rejected'); loadTeamLeaves(); refreshBadge(); }
      catch(e) { toast(e.message, true); }
    }, 'Reject Leave'
  );
};

/* ══ ATTENDANCE EXCEL DOWNLOAD ══════════════ */
window.downloadAttExcel = async () => {
  const val = document.getElementById('dlMonth');
  if (!val) { toast('Month selector not found', true); return; }
  const [year, month] = val.value.split('-');
  try {
    toast('Preparing download…');
    const res = await fetch(`/api/attendance/export/${year}/${month}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.error || 'Download failed', true); return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `attendance_${year}-${month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded ✅');
  } catch (e) {
    toast(e.message, true);
  }
};