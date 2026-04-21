const express = require('express');
const { body } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sendToUser } = require('../services/notifications');

const router = express.Router();

router.post('/', requireAuth, [
  body('recipient_id').isUUID(),
  body('content').trim().isLength({ min: 1, max: 2000 }),
], validate, async (req, res) => {
  const { recipient_id, content } = req.body;

  if (recipient_id === req.userId) {
    return res.status(400).json({ error: 'Cannot message yourself' });
  }

  // Check block
  const blocked = await db.query(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
    [req.userId, recipient_id]
  );
  if (blocked.rows.length) {
    return res.status(403).json({ error: 'Cannot send message' });
  }

  const result = await db.query(
    'INSERT INTO messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING *',
    [req.userId, recipient_id, content]
  );

  const msg = result.rows[0];
  const senderRes = await db.query('SELECT username, avatar_url FROM users WHERE id = $1', [req.userId]);

  // Notify recipient via WebSocket
  sendToUser(recipient_id, {
    type: 'message',
    message: { ...msg, sender: senderRes.rows[0] },
  });

  res.status(201).json(msg);
});

router.get('/conversations', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT DISTINCT ON (other_user)
       other_user,
       u.username, u.avatar_url, u.rating,
       m.content AS last_message,
       m.created_at AS last_message_at,
       m.sender_id,
       (SELECT COUNT(*) FROM messages
        WHERE recipient_id = $1 AND sender_id = other_user AND read = false) AS unread_count
     FROM (
       SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_user,
              id, content, created_at, sender_id
       FROM messages
       WHERE sender_id = $1 OR recipient_id = $1
     ) m
     JOIN users u ON u.id = m.other_user
     ORDER BY other_user, m.created_at DESC`,
    [req.userId]
  );
  res.json(result.rows);
});

router.get('/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const before = req.query.before;

  let query = `
    SELECT m.*,
           s.username AS sender_name, s.avatar_url AS sender_avatar
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    WHERE ((m.sender_id = $1 AND m.recipient_id = $2) OR
           (m.sender_id = $2 AND m.recipient_id = $1))
  `;
  const params = [req.userId, userId];

  if (before) {
    query += ` AND m.created_at < $3`;
    params.push(before);
  }

  query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);

  // Mark messages as read
  await db.query(
    'UPDATE messages SET read = true WHERE sender_id = $1 AND recipient_id = $2 AND read = false',
    [userId, req.userId]
  );

  res.json(result.rows.reverse());
});

router.post('/block/:userId', requireAuth, async (req, res) => {
  await db.query(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.userId, req.params.userId]
  );
  res.json({ blocked: true });
});

router.delete('/block/:userId', requireAuth, async (req, res) => {
  await db.query(
    'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [req.userId, req.params.userId]
  );
  res.json({ unblocked: true });
});

module.exports = router;
