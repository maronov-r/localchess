# LocalChess

A location-based chess opponent matching app. Find nearby players, post when you're looking for a game, join local events, and track your rating.

## Features

- **Authentication** – Email/password signup, JWT sessions
- **Rating Calibration** – Play 3-5 games against a bot to auto-determine your ELO rating, or enter manually
- **Player Discovery** – Browse nearby players on a map or list, filter by rating and game format
- **"Looking to Play" Posts** – Post availability with location, rating range, and time window; nearby players get real-time notifications
- **Events** – Businesses and organizers can create tournaments; players browse and sign up
- **Messaging** – Direct messages between players to arrange games
- **Game Tracking** – Report game results, confirm with opponent; ELO updates automatically
- **Real-time** – WebSocket notifications for posts, messages, and game confirmations
- **Dark Mode** – Dark-first design, mobile-responsive

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, Leaflet maps, react-chessboard |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Real-time | WebSocket (ws) |
| Chess engine | chess.js |
| Rating | ELO system |
| Auth | JWT + bcrypt |

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your database URL and JWT secret
npm install
npm run migrate
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173

## Database Setup

```sql
CREATE DATABASE localchess;
CREATE USER localchess WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE localchess TO localchess;
```

Then set `DATABASE_URL=postgresql://localchess:yourpassword@localhost:5432/localchess` in `backend/.env`.

## API Overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/signup` | Register |
| `POST /api/auth/login` | Login |
| `GET /api/users/nearby` | Find nearby players |
| `POST /api/posts` | Create "looking to play" post |
| `GET /api/posts/nearby` | Browse nearby posts |
| `GET /api/events/nearby` | Browse nearby events |
| `POST /api/events` | Create event |
| `POST /api/games` | Report game result |
| `POST /api/calibration/start` | Start bot calibration game |
| `POST /api/calibration/move` | Make move in calibration |
| `WS /ws?token=...` | Real-time notifications |

## Rating System

Uses ELO with K-factors that vary by experience:
- New players (< 30 games): K=40 (more volatile)
- Standard: K=20
- High-rated (2400+): K=10

Calibration plays 3-5 bot games at adjustable difficulty (levels 1-8 ≈ 600-2000 ELO) and estimates your rating from the results.
