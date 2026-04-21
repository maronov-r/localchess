require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const { registerClient, unregisterClient } = require('./services/notifications');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/events', require('./routes/events'));
app.use('/api/games', require('./routes/games'));
app.use('/api/calibration', require('./routes/calibration'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// WebSocket server for real-time notifications
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Token required');
    return;
  }

  let userId;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    userId = payload.userId;
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }

  registerClient(userId, ws);

  ws.on('close', () => unregisterClient(userId, ws));
  ws.on('error', () => unregisterClient(userId, ws));

  // Heartbeat
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch {
      // ignore
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`LocalChess API running on port ${PORT}`);
});
