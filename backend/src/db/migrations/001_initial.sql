CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200,
  rating_deviation INTEGER NOT NULL DEFAULT 350,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  is_provisional BOOLEAN NOT NULL DEFAULT true,
  bio TEXT,
  avatar_url VARCHAR(500),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_name VARCHAR(255),
  search_radius_km INTEGER NOT NULL DEFAULT 25,
  availability JSONB NOT NULL DEFAULT '[]',
  preferred_formats TEXT[] NOT NULL DEFAULT '{}',
  notify_nearby_posts BOOLEAN NOT NULL DEFAULT true,
  notify_messages BOOLEAN NOT NULL DEFAULT true,
  notify_events BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start INTEGER,
  quiet_hours_end INTEGER,
  notification_radius_km INTEGER NOT NULL DEFAULT 25,
  is_business BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(500),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  website VARCHAR(500),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  location_name VARCHAR(255),
  rating_min INTEGER NOT NULL DEFAULT 0,
  rating_max INTEGER NOT NULL DEFAULT 9999,
  available_from TIMESTAMPTZ NOT NULL,
  available_until TIMESTAMPTZ NOT NULL,
  format VARCHAR(50) NOT NULL DEFAULT 'casual',
  time_control VARCHAR(50),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_expires_at ON posts(expires_at);
CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(location_lat, location_lng);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  format VARCHAR(50) NOT NULL DEFAULT 'casual',
  tournament_format VARCHAR(50),
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  location_name VARCHAR(255),
  address VARCHAR(500),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  max_participants INTEGER,
  rating_min INTEGER,
  rating_max INTEGER,
  entry_fee DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE TABLE IF NOT EXISTS event_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'registered',
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player1_id UUID NOT NULL REFERENCES users(id),
  player2_id UUID NOT NULL REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  result VARCHAR(20),
  format VARCHAR(50) NOT NULL DEFAULT 'casual',
  time_control VARCHAR(50),
  event_id UUID REFERENCES events(id),
  post_id UUID REFERENCES posts(id),
  player1_rating_before INTEGER,
  player2_rating_before INTEGER,
  player1_rating_change INTEGER DEFAULT 0,
  player2_rating_change INTEGER DEFAULT 0,
  notes TEXT,
  pgn TEXT,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_games_player1 ON games(player1_id);
CREATE INDEX IF NOT EXISTS idx_games_player2 ON games(player2_id);
CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);

CREATE TABLE IF NOT EXISTS calibration_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_level INTEGER NOT NULL,
  result VARCHAR(10) NOT NULL,
  pgn TEXT,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibration_user ON calibration_games(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
