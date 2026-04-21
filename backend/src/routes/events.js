const express = require('express');
const { body } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { nearbyWhere } = require('../services/geo');
const { createNotification } = require('../services/notifications');

const router = express.Router();

const eventValidation = [
  body('name').trim().isLength({ min: 3, max: 255 }),
  body('starts_at').isISO8601(),
  body('location_lat').isFloat({ min: -90, max: 90 }),
  body('location_lng').isFloat({ min: -180, max: 180 }),
  body('format').isIn(['casual', 'rapid', 'blitz', 'bullet', 'classical', 'tournament']),
];

router.post('/', requireAuth, eventValidation, validate, async (req, res) => {
  const {
    name, description, format, tournament_format, location_lat, location_lng,
    location_name, address, starts_at, ends_at, max_participants,
    rating_min, rating_max, entry_fee = 0,
  } = req.body;

  const result = await db.query(
    `INSERT INTO events (organizer_id, name, description, format, tournament_format,
       location_lat, location_lng, location_name, address, starts_at, ends_at,
       max_participants, rating_min, rating_max, entry_fee)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [req.userId, name, description, format, tournament_format,
     location_lat, location_lng, location_name, address, starts_at, ends_at,
     max_participants, rating_min, rating_max, entry_fee]
  );

  res.status(201).json(result.rows[0]);
});

router.get('/nearby', requireAuth, async (req, res) => {
  const viewerRes = await db.query(
    'SELECT location_lat, location_lng, search_radius_km FROM users WHERE id = $1',
    [req.userId]
  );
  const viewer = viewerRes.rows[0];
  if (!viewer?.location_lat) return res.status(400).json({ error: 'Set your location first' });

  const radius = parseInt(req.query.radius) || viewer.search_radius_km || 50;
  const { sql: nearbySql, params: nearbyParams } = nearbyWhere(
    viewer.location_lat, viewer.location_lng, radius,
    'e.location_lat', 'e.location_lng'
  );

  const result = await db.query(
    `SELECT e.*,
            u.username AS organizer_name,
            COUNT(es.id) AS signup_count,
            (SELECT COUNT(*) FROM event_signups es2
             WHERE es2.event_id = e.id AND es2.user_id = $9) > 0 AS is_signed_up,
            (
              6371 * 2 * ASIN(SQRT(
                POW(SIN(RADIANS(e.location_lat - $10) / 2), 2) +
                COS(RADIANS($11)) * COS(RADIANS(e.location_lat)) *
                POW(SIN(RADIANS(e.location_lng - $12) / 2), 2)
              ))
            ) AS distance_km
     FROM events e
     JOIN users u ON u.id = e.organizer_id
     LEFT JOIN event_signups es ON es.event_id = e.id
     WHERE e.status IN ('upcoming', 'active')
       AND e.starts_at > NOW()
       AND ${nearbySql}
     GROUP BY e.id, u.username
     ORDER BY e.starts_at ASC
     LIMIT 50`,
    [...nearbyParams, req.userId, viewer.location_lat, viewer.location_lat, viewer.location_lng]
  );

  res.json(result.rows);
});

router.get('/mine', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT e.*, COUNT(es.id) AS signup_count
     FROM events e
     LEFT JOIN event_signups es ON es.event_id = e.id
     WHERE e.organizer_id = $1
     GROUP BY e.id
     ORDER BY e.starts_at DESC`,
    [req.userId]
  );
  res.json(result.rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const eventRes = await db.query(
    `SELECT e.*, u.username AS organizer_name,
            (SELECT COUNT(*) FROM event_signups es WHERE es.event_id = e.id) AS signup_count,
            (SELECT COUNT(*) FROM event_signups es WHERE es.event_id = e.id AND es.user_id = $2) > 0 AS is_signed_up
     FROM events e
     JOIN users u ON u.id = e.organizer_id
     WHERE e.id = $1`,
    [req.params.id, req.userId]
  );

  if (!eventRes.rows.length) return res.status(404).json({ error: 'Event not found' });

  const signupsRes = await db.query(
    `SELECT u.id, u.username, u.rating, u.avatar_url, es.signed_up_at, es.status
     FROM event_signups es
     JOIN users u ON u.id = es.user_id
     WHERE es.event_id = $1
     ORDER BY es.signed_up_at ASC`,
    [req.params.id]
  );

  res.json({ ...eventRes.rows[0], participants: signupsRes.rows });
});

router.post('/:id/signup', requireAuth, async (req, res) => {
  const eventRes = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
  if (!eventRes.rows.length) return res.status(404).json({ error: 'Event not found' });

  const event = eventRes.rows[0];

  if (event.max_participants) {
    const countRes = await db.query(
      "SELECT COUNT(*) FROM event_signups WHERE event_id = $1 AND status = 'registered'",
      [event.id]
    );
    if (parseInt(countRes.rows[0].count) >= event.max_participants) {
      return res.status(409).json({ error: 'Event is full' });
    }
  }

  const userRes = await db.query('SELECT rating FROM users WHERE id = $1', [req.userId]);
  const user = userRes.rows[0];

  if (event.rating_min && user.rating < event.rating_min) {
    return res.status(403).json({ error: `Minimum rating ${event.rating_min} required` });
  }
  if (event.rating_max && user.rating > event.rating_max) {
    return res.status(403).json({ error: `Maximum rating ${event.rating_max} allowed` });
  }

  await db.query(
    `INSERT INTO event_signups (event_id, user_id) VALUES ($1, $2)
     ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'registered'`,
    [event.id, req.userId]
  );

  // Notify organizer
  const signerRes = await db.query('SELECT username FROM users WHERE id = $1', [req.userId]);
  await createNotification(
    event.organizer_id,
    'event_signup',
    'New event sign-up',
    `${signerRes.rows[0].username} signed up for ${event.name}`,
    { event_id: event.id, user_id: req.userId }
  );

  res.json({ success: true });
});

router.delete('/:id/signup', requireAuth, async (req, res) => {
  await db.query(
    "UPDATE event_signups SET status = 'cancelled' WHERE event_id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  res.json({ success: true });
});

router.put('/:id', requireAuth, async (req, res) => {
  const check = await db.query(
    'SELECT organizer_id FROM events WHERE id = $1',
    [req.params.id]
  );
  if (!check.rows.length) return res.status(404).json({ error: 'Event not found' });
  if (check.rows[0].organizer_id !== req.userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const allowed = [
    'name', 'description', 'starts_at', 'ends_at', 'location_name', 'address',
    'max_participants', 'status', 'entry_fee',
  ];
  const updates = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (key in req.body) {
      updates.push(`${key} = $${i++}`);
      values.push(req.body[key]);
    }
  }

  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
  values.push(req.params.id);

  const result = await db.query(
    `UPDATE events SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  res.json(result.rows[0]);
});

module.exports = router;
