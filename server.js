'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { connect } = require('./db');
const { initDb }  = require('./init');
const { authMiddleware } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));
app.use(authMiddleware); // attach req.user on every request

// ── Routes ────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/employees',  require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leave',      require('./routes/leave'));
app.use('/api/holidays',   require('./routes/holidays'));

// Convenience aliases (match old Flask URL patterns)
app.use('/api/admin/holidays',        require('./routes/holidays'));
app.put('/api/admin/promote/:id',     require('./routes/employees'));
app.put('/api/admin/reset-password/:id', require('./routes/employees'));

// ── Serve index.html for all non-API routes ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// ── Start ──────────────────────────────────────
async function start() {
  try {
    await connect();
    await initDb();
    app.listen(PORT, () => {
      console.log(`\n🚀 HRNova running at http://localhost:${PORT}`);
      console.log(`   Demo: admin@company.com / admin123`);
      console.log(`   Press Ctrl+C to stop\n`);
    });
  } catch (e) {
    console.error('[FATAL]', e.message);
    process.exit(1);
  }
}

start();