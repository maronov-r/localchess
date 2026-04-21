/*
  # LocalChess Initial Schema

  1. New Tables
    - `users`: Player profiles with ratings, location, preferences
    - `businesses`: Business accounts (chess clubs, cafes)
    - `posts`: Looking for games posts with location and time
    - `events`: Chess events and tournaments
    - `event_signups`: Event registrations
    - `games`: Game history with ratings
    - `calibration_games`: Bot games for rating calibration
    - `notifications`: User notifications
    - `messages`: Direct messages between users
    - `blocks`: User block list

  2. Security
    - Enable RLS on all tables
    - Users can only read/write their own data
    - Public profiles are readable by authenticated users
    - Messages are only accessible to sender/recipient

  3. Important Notes
    - Uses gen_random_uuid() for primary keys (Supabase default)
    - PostGIS extension for location queries
    - Triggers for updated_at timestamps
*/

-- Enable PostGIS for location queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  rating integer NOT NULL DEFAULT 1200,
  rating_deviation integer NOT NULL DEFAULT 350,
  games_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  is_provisional boolean NOT NULL DEFAULT true,
  bio text,
  avatar_url text,
  location_lat double precision,
  location_lng double precision,
  location_name text,
  search_radius_km integer NOT NULL DEFAULT 25,
  availability jsonb NOT NULL DEFAULT '[]',
  preferred_formats text[] NOT NULL DEFAULT '{}',
  notify_nearby_posts boolean NOT NULL DEFAULT true,
  notify_messages boolean NOT NULL DEFAULT true,
  notify_events boolean NOT NULL DEFAULT true,
  quiet_hours_start integer,
  quiet_hours_end integer,
  notification_radius_km integer NOT NULL DEFAULT 25,
  is_business boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- Businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  address text,
  location_lat double precision,
  location_lng double precision,
  website text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Posts table (looking for games)
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_lat double precision NOT NULL,
  location_lng double precision NOT NULL,
  location_name text,
  rating_min integer NOT NULL DEFAULT 0,
  rating_max integer NOT NULL DEFAULT 9999,
  available_from timestamptz NOT NULL,
  available_until timestamptz NOT NULL,
  format text NOT NULL DEFAULT 'casual',
  time_control text,
  description text,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_expires_at ON posts(expires_at);
CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(location_lat, location_lng);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  format text NOT NULL DEFAULT 'casual',
  tournament_format text,
  location_lat double precision NOT NULL,
  location_lng double precision NOT NULL,
  location_name text,
  address text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  max_participants integer,
  rating_min integer,
  rating_max integer,
  entry_fee decimal(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- Event signups
CREATE TABLE IF NOT EXISTS event_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'registered',
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid NOT NULL REFERENCES users(id),
  player2_id uuid NOT NULL REFERENCES users(id),
  winner_id uuid REFERENCES users(id),
  result text,
  format text NOT NULL DEFAULT 'casual',
  time_control text,
  event_id uuid REFERENCES events(id),
  post_id uuid REFERENCES posts(id),
  player1_rating_before integer,
  player2_rating_before integer,
  player1_rating_change integer DEFAULT 0,
  player2_rating_change integer DEFAULT 0,
  notes text,
  pgn text,
  played_at timestamptz NOT NULL DEFAULT now(),
  reported_by uuid REFERENCES users(id),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_games_player1 ON games(player1_id);
CREATE INDEX IF NOT EXISTS idx_games_player2 ON games(player2_id);
CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);

-- Calibration games
CREATE TABLE IF NOT EXISTS calibration_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_level integer NOT NULL,
  result text NOT NULL,
  pgn text,
  played_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_user ON calibration_games(user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at);

-- Blocks
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Posts policies
CREATE POLICY "Users can read active posts"
  ON posts FOR SELECT
  TO authenticated
  USING (status = 'active' OR user_id = auth.uid());

CREATE POLICY "Users can create posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Events policies
CREATE POLICY "Users can read events"
  ON events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Organizers can update events"
  ON events FOR UPDATE
  TO authenticated
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Organizers can delete events"
  ON events FOR DELETE
  TO authenticated
  USING (organizer_id = auth.uid());

-- Event signups policies
CREATE POLICY "Users can read event signups"
  ON event_signups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create signups"
  ON event_signups FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own signups"
  ON event_signups FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Games policies
CREATE POLICY "Players can read games"
  ON games FOR SELECT
  TO authenticated
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "Users can report games"
  ON games FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Players can update games"
  ON games FOR UPDATE
  TO authenticated
  USING (player1_id = auth.uid() OR player2_id = auth.uid())
  WITH CHECK (player1_id = auth.uid() OR player2_id = auth.uid());

-- Calibration games policies
CREATE POLICY "Users can read own calibration games"
  ON calibration_games FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create calibration games"
  ON calibration_games FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Notifications policies
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can create own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Messages policies
CREATE POLICY "Users can read sent and received messages"
  ON messages FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update received messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Blocks policies
CREATE POLICY "Users can read blocks involving them"
  ON blocks FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

CREATE POLICY "Users can block others"
  ON blocks FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "Users can unblock"
  ON blocks FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- Businesses policies
CREATE POLICY "Users can read businesses"
  ON businesses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Business owners can manage"
  ON businesses FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
