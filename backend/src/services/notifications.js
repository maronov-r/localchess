const db = require('../db');
const { nearbyWhere } = require('./geo');

// WebSocket clients: Map<userId, Set<ws>>
const wsClients = new Map();

function registerClient(userId, ws) {
  if (!wsClients.has(userId)) wsClients.set(userId, new Set());
  wsClients.get(userId).add(ws);
}

function unregisterClient(userId, ws) {
  const clients = wsClients.get(userId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) wsClients.delete(userId);
  }
}

function sendToUser(userId, data) {
  const clients = wsClients.get(userId);
  if (!clients) return;
  const message = JSON.stringify(data);
  for (const ws of clients) {
    try {
      if (ws.readyState === 1) ws.send(message);
    } catch {
      clients.delete(ws);
    }
  }
}

async function createNotification(userId, type, title, message, data = null) {
  const result = await db.query(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, title, message, data ? JSON.stringify(data) : null]
  );
  const notification = result.rows[0];
  sendToUser(userId, { type: 'notification', notification });
  return notification;
}

async function notifyNearbyUsers(post, poster) {
  const { location_lat, location_lng, rating_min, rating_max } = post;

  // Find users within notification radius who match rating range
  const { sql: nearbySql, params: nearbyParams } = nearbyWhere(
    location_lat, location_lng, 50, // max 50km for notifications
    'u.location_lat', 'u.location_lng'
  );

  const result = await db.query(
    `SELECT u.id, u.notification_radius_km, u.notify_nearby_posts,
            u.quiet_hours_start, u.quiet_hours_end, u.rating
     FROM users u
     WHERE u.id != $9
       AND u.notify_nearby_posts = true
       AND u.location_lat IS NOT NULL
       AND u.rating BETWEEN $10 AND $11
       AND ${nearbySql}`,
    [...nearbyParams, post.user_id, rating_min, rating_max]
  );

  const now = new Date();
  const currentHour = now.getHours();

  for (const user of result.rows) {
    // Respect quiet hours
    if (user.quiet_hours_start != null && user.quiet_hours_end != null) {
      const inQuiet =
        user.quiet_hours_start <= user.quiet_hours_end
          ? currentHour >= user.quiet_hours_start && currentHour < user.quiet_hours_end
          : currentHour >= user.quiet_hours_start || currentHour < user.quiet_hours_end;
      if (inQuiet) continue;
    }

    await createNotification(
      user.id,
      'nearby_post',
      'Player looking for a game nearby',
      `${poster.username} (${poster.rating}) is looking for a ${post.format} game near you`,
      { post_id: post.id, poster_id: post.user_id }
    );
  }
}

async function notifyEventReminder(event) {
  const signups = await db.query(
    'SELECT user_id FROM event_signups WHERE event_id = $1 AND status = $2',
    [event.id, 'registered']
  );

  for (const { user_id } of signups.rows) {
    await createNotification(
      user_id,
      'event_reminder',
      `Reminder: ${event.name}`,
      `Your event starts soon at ${event.location_name || 'the venue'}`,
      { event_id: event.id }
    );
  }
}

module.exports = {
  registerClient,
  unregisterClient,
  sendToUser,
  createNotification,
  notifyNearbyUsers,
  notifyEventReminder,
};
