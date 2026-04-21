const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const db = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const signupValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('username').isAlphanumeric().isLength({ min: 3, max: 30 }),
];

router.post('/signup', signupValidation, validate, async (req, res) => {
  const { email, password, username, rating, isBusiness } = req.body;

  const existing = await db.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email, username]
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Email or username already taken' });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const initialRating = rating ? Math.min(3000, Math.max(100, parseInt(rating))) : 1200;

  const result = await db.query(
    `INSERT INTO users (email, username, password_hash, rating, is_business)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, username, rating, is_business, created_at`,
    [email, username, password_hash, initialRating, !!isBusiness]
  );

  const user = result.rows[0];
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  res.status(201).json({ token, user });
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query(
    `SELECT id, email, username, password_hash, rating, is_business,
            games_played, wins, losses, draws, avatar_url, bio,
            location_lat, location_lng, location_name, search_radius_km
     FROM users WHERE email = $1`,
    [email]
  );

  if (!result.rows.length) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  delete user.password_hash;
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  res.json({ token, user });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT id, email, username, rating, is_provisional, is_business,
            games_played, wins, losses, draws, avatar_url, bio,
            location_lat, location_lng, location_name, search_radius_km,
            availability, preferred_formats, notify_nearby_posts,
            notify_messages, notify_events, notification_radius_km,
            quiet_hours_start, quiet_hours_end, created_at
     FROM users WHERE id = $1`,
    [req.userId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

router.put('/me', requireAuth, async (req, res) => {
  const allowed = [
    'bio', 'avatar_url', 'location_lat', 'location_lng', 'location_name',
    'search_radius_km', 'availability', 'preferred_formats',
    'notify_nearby_posts', 'notify_messages', 'notify_events',
    'notification_radius_km', 'quiet_hours_start', 'quiet_hours_end',
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

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(req.userId);
  const result = await db.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}
     RETURNING id, email, username, rating, is_provisional, bio, avatar_url,
               location_lat, location_lng, location_name, search_radius_km,
               availability, preferred_formats, notify_nearby_posts,
               notify_messages, notify_events, notification_radius_km`,
    values
  );

  res.json(result.rows[0]);
});

module.exports = router;
