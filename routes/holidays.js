'use strict';
const router = require('express').Router();
const { getDb, sdoc, slist } = require('../db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/holidays
router.get('/', async (req, res) => {
  try {
    const db   = getDb();
    const hols = await db.collection('holidays').find().toArray();
    res.json(slist(hols));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/holidays
router.post('/', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const d  = req.body || {};
    if (!d.date || !d.name) return res.status(400).json({ error: 'date and name required' });
    const r = await db.collection('holidays').insertOne({ date: d.date, name: d.name });
    res.status(201).json({ id: r.insertedId.toString(), date: d.date, name: d.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/holidays/:date
router.delete('/:date', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    await db.collection('holidays').deleteOne({ date: req.params.date });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;