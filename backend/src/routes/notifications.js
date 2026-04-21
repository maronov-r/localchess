const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const result = await db.query(
    `SELECT * FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [req.userId, limit]
  );
  res.json(result.rows);
});

router.get('/unread-count', requireAuth, async (req, res) => {
  const result = await db.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
    [req.userId]
  );
  res.json({ count: parseInt(result.rows[0].count) });
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  await db.query(
    'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  res.json({ read: true });
});

router.patch('/read-all', requireAuth, async (req, res) => {
  await db.query(
    'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
    [req.userId]
  );
  res.json({ success: true });
});

module.exports = router;
