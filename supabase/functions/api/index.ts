import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// In-memory calibration sessions (in production, use Redis)
const activeSessions = new Map<string, any>();

// Bot configuration
const BOT_LEVELS: Record<number, { depth: number; randomness: number }> = {
  1: { depth: 1, randomness: 0.9 },
  2: { depth: 1, randomness: 0.6 },
  3: { depth: 2, randomness: 0.4 },
  4: { depth: 2, randomness: 0.2 },
  5: { depth: 3, randomness: 0.1 },
  6: { depth: 3, randomness: 0.05 },
  7: { depth: 4, randomness: 0.02 },
  8: { depth: 4, randomness: 0 },
};

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function evaluateBoard(chess: Chess) {
  let score = 0;
  const board = chess.board();
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] || 0;
      score += sq.color === "w" ? val : -val;
    }
  }
  return score;
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
  if (depth === 0 || chess.isGameOver()) {
    if (chess.isCheckmate()) return isMaximizing ? -1000 : 1000;
    if (chess.isDraw()) return 0;
    return evaluateBoard(chess);
  }

  const moves = chess.moves();
  if (isMaximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBotMove(fen: string, level: number = 4): string | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;

  const config = BOT_LEVELS[level] || BOT_LEVELS[4];
  const moves = chess.moves();
  if (!moves.length) return null;

  if (Math.random() < config.randomness) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const isWhite = chess.turn() === "w";
  let bestMove: string | null = null;
  let bestScore = isWhite ? -Infinity : Infinity;

  for (const move of moves) {
    chess.move(move);
    const score = minimax(chess, config.depth - 1, -Infinity, Infinity, !isWhite);
    chess.undo();

    if (isWhite ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove || moves[0];
}

function applyMove(fen: string, move: string) {
  const chess = new Chess(fen);
  try {
    chess.move(move);
    return {
      fen: chess.fen(),
      pgn: chess.pgn(),
      isGameOver: chess.isGameOver(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      isCheck: chess.inCheck(),
      turn: chess.turn(),
    };
  } catch {
    return null;
  }
}

function getGameResult(fen: string): string | null {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "black" : "white";
  }
  return "draw";
}

// ELO calculations
function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function kFactor(rating: number, gamesPlayed: number) {
  if (gamesPlayed < 30) return 40;
  if (rating >= 2400) return 10;
  return 20;
}

function calculateRatingChange(playerRating: number, opponentRating: number, result: string, gamesPlayed: number) {
  const k = kFactor(playerRating, gamesPlayed);
  const expected = expectedScore(playerRating, opponentRating);
  let score: number;
  if (result === "win") score = 1;
  else if (result === "loss") score = 0;
  else score = 0.5;
  return Math.round(k * (score - expected));
}

function ratingToSkillBadge(rating: number) {
  if (rating < 800) return { label: "Beginner", color: "#CD7F32" };
  if (rating < 1000) return { label: "Bronze", color: "#CD7F32" };
  if (rating < 1200) return { label: "Silver", color: "#C0C0C0" };
  if (rating < 1400) return { label: "Gold", color: "#FFD700" };
  if (rating < 1600) return { label: "Platinum", color: "#E5E4E2" };
  if (rating < 1800) return { label: "Diamond", color: "#B9F2FF" };
  if (rating < 2000) return { label: "Master", color: "#9B59B6" };
  return { label: "Grandmaster", color: "#E74C3C" };
}

function estimateRatingFromCalibration(results: { botLevel: number; result: string }[]) {
  const botRatings: Record<number, number> = { 1: 600, 2: 800, 3: 1000, 4: 1200, 5: 1400, 6: 1600, 7: 1800, 8: 2000 };
  let rating = 1200;
  for (const { botLevel, result } of results) {
    const botRating = botRatings[botLevel] || 1200;
    const change = calculateRatingChange(rating, botRating, result, 0);
    rating = Math.max(100, rating + change);
  }
  return Math.round(rating);
}

// Auth helper
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// JSON response helper
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Error response helper
function error(message: string, status = 400) {
  return json({ error: message }, status);
}

// Route handlers
async function handleAuthSignup(req: Request) {
  const body = await req.json();
  const { email, password, username, rating, isBusiness } = body;

  if (!email || !password || !username) {
    return error("Missing required fields");
  }

  // Check if user exists
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .or(`email.eq.${email},username.eq.${username}`)
    .maybeSingle();

  if (existing) {
    return error("Email or username already taken", 409);
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return error(authError?.message || "Failed to create user", 400);
  }

  // Create profile
  const initialRating = rating ? Math.min(3000, Math.max(100, parseInt(rating))) : 1200;

  const { data: user, error: profileError } = await supabase
    .from("users")
    .insert({
      id: authData.user.id,
      email,
      username,
      password_hash: "", // Not needed with Supabase Auth
      rating: initialRating,
      is_business: !!isBusiness,
    })
    .select()
    .single();

  if (profileError) {
    return error("Failed to create profile", 500);
  }

  return json({ token: authData.session?.access_token, user }, 201);
}

async function handleAuthLogin(req: Request) {
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return error("Missing email or password");
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return error("Invalid credentials", 401);
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, email, username, rating, is_provisional, is_business, games_played, wins, losses, draws, avatar_url, bio, location_lat, location_lng, location_name, search_radius_km")
    .eq("id", authData.user.id)
    .single();

  return json({ token: authData.session.access_token, user });
}

async function handleAuthMe(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: user } = await supabase
    .from("users")
    .select("id, email, username, rating, is_provisional, is_business, games_played, wins, losses, draws, avatar_url, bio, location_lat, location_lng, location_name, search_radius_km, availability, preferred_formats, notify_nearby_posts, notify_messages, notify_events, notification_radius_km, quiet_hours_start, quiet_hours_end, created_at")
    .eq("id", userId)
    .single();

  if (!user) return error("User not found", 404);
  return json(user);
}

async function handleAuthUpdateMe(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const allowed = [
    "bio", "avatar_url", "location_lat", "location_lng", "location_name",
    "search_radius_km", "availability", "preferred_formats",
    "notify_nearby_posts", "notify_messages", "notify_events",
    "notification_radius_km", "quiet_hours_start", "quiet_hours_end",
  ];

  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return error("No valid fields to update");
  }

  const { data: user } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  return json(user);
}

async function handleUsersNearby(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: viewer } = await supabase
    .from("users")
    .select("location_lat, location_lng, search_radius_km")
    .eq("id", userId)
    .single();

  if (!viewer?.location_lat) {
    return error("Set your location first", 400);
  }

  const url = new URL(req.url);
  const radius = parseInt(url.searchParams.get("radius") || "") || viewer.search_radius_km || 25;
  const ratingMin = parseInt(url.searchParams.get("rating_min") || "0");
  const ratingMax = parseInt(url.searchParams.get("rating_max") || "9999");

  // Get all users with location and filter by distance
  const { data: users } = await supabase
    .from("users")
    .select("id, username, rating, is_provisional, bio, avatar_url, location_lat, location_lng, location_name, games_played, wins, losses, draws, preferred_formats, availability")
    .not("location_lat", "is", null)
    .not("location_lng", "is", null)
    .neq("id", userId)
    .gte("rating", ratingMin)
    .lte("rating", ratingMax);

  // Calculate distances and filter
  const usersWithDistance = (users || [])
    .map((u: any) => {
      const distanceKm = calculateDistance(
        viewer.location_lat,
        viewer.location_lng,
        u.location_lat,
        u.location_lng
      );
      return { ...u, distance_km: distanceKm.toFixed(1), skill_badge: ratingToSkillBadge(u.rating) };
    })
    .filter((u: any) => parseFloat(u.distance_km) <= radius)
    .sort((a: any, b: any) => parseFloat(a.distance_km) - parseFloat(b.distance_km))
    .slice(0, 50);

  return json(usersWithDistance);
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function handleUserGet(req: Request, id: string) {
  const userId = await getUserId(req);

  const { data: user } = await supabase
    .from("users")
    .select("id, username, rating, is_provisional, bio, avatar_url, location_name, games_played, wins, losses, draws, preferred_formats, availability, created_at")
    .eq("id", id)
    .single();

  if (!user) return error("User not found", 404);

  const userWithBadge = { ...user, skill_badge: ratingToSkillBadge(user.rating) };

  // Get recent games
  const { data: games } = await supabase
    .from("games")
    .select("id, result, format, played_at, player1_rating_change, player2_rating_change, player1_id, player2_id")
    .or(`player1_id.eq.${id},player2_id.eq.${id}`)
    .not("confirmed_at", "is", null)
    .order("played_at", { ascending: false })
    .limit(20);

  return json({ ...userWithBadge, recent_games: games || [] });
}

async function handlePostsCreate(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const { location_lat, location_lng, location_name, rating_min = 0, rating_max = 9999, available_from, available_until, format = "casual", time_control, description } = body;

  // Expire existing active posts
  await supabase
    .from("posts")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: post } = await supabase
    .from("posts")
    .insert({
      user_id: userId,
      location_lat,
      location_lng,
      location_name,
      rating_min,
      rating_max,
      available_from,
      available_until,
      format,
      time_control,
      description,
    })
    .select()
    .single();

  return json(post, 201);
}

async function handlePostsNearby(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: viewer } = await supabase
    .from("users")
    .select("location_lat, location_lng, rating, search_radius_km")
    .eq("id", userId)
    .single();

  if (!viewer?.location_lat) {
    return error("Set your location first", 400);
  }

  const url = new URL(req.url);
  const radius = parseInt(url.searchParams.get("radius") || "") || viewer.search_radius_km || 25;

  const { data: posts } = await supabase
    .from("posts")
    .select("*, users(username, rating, avatar_url)")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .neq("user_id", userId)
    .lte("rating_min", viewer.rating)
    .gte("rating_max", viewer.rating);

  // Filter by distance
  const postsWithDistance = (posts || [])
    .map((p: any) => {
      const distanceKm = calculateDistance(
        viewer.location_lat,
        viewer.location_lng,
        p.location_lat,
        p.location_lng
      );
      return { ...p, distance_km: distanceKm.toFixed(1), poster_rating: p.users?.rating, username: p.users?.username, avatar_url: p.users?.avatar_url };
    })
    .filter((p: any) => parseFloat(p.distance_km) <= radius)
    .sort((a: any, b: any) => parseFloat(a.distance_km) - parseFloat(b.distance_km))
    .slice(0, 50);

  return json(postsWithDistance);
}

async function handlePostsMine(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: posts } = await supabase
    .from("posts")
    .select("*, users(username)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return json(posts || []);
}

async function handlePostsUpdateStatus(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const { status } = body;

  if (!["active", "expired", "played"].includes(status)) {
    return error("Invalid status");
  }

  const { data: post } = await supabase
    .from("posts")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (!post) return error("Post not found", 404);
  return json(post);
}

async function handlePostsDelete(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { error: delError } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (delError) return error("Post not found", 404);
  return json({ deleted: true });
}

async function handleEventsCreate(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const { name, description, format, tournament_format, location_lat, location_lng, location_name, address, starts_at, ends_at, max_participants, rating_min, rating_max, entry_fee = 0 } = body;

  const { data: event } = await supabase
    .from("events")
    .insert({
      organizer_id: userId,
      name,
      description,
      format,
      tournament_format,
      location_lat,
      location_lng,
      location_name,
      address,
      starts_at,
      ends_at,
      max_participants,
      rating_min,
      rating_max,
      entry_fee,
    })
    .select()
    .single();

  return json(event, 201);
}

async function handleEventsNearby(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: viewer } = await supabase
    .from("users")
    .select("location_lat, location_lng, search_radius_km")
    .eq("id", userId)
    .single();

  if (!viewer?.location_lat) {
    return error("Set your location first", 400);
  }

  const url = new URL(req.url);
  const radius = parseInt(url.searchParams.get("radius") || "") || viewer.search_radius_km || 50;

  const { data: events } = await supabase
    .from("events")
    .select("*, users!events_organizer_id_fkey(username)")
    .in("status", ["upcoming", "active"])
    .gt("starts_at", new Date().toISOString());

  // Filter by distance
  const eventsWithDistance = (events || [])
    .map((e: any) => {
      const distanceKm = calculateDistance(
        viewer.location_lat,
        viewer.location_lng,
        e.location_lat,
        e.location_lng
      );
      return { ...e, distance_km: distanceKm.toFixed(1), organizer_name: e.users?.username };
    })
    .filter((e: any) => parseFloat(e.distance_km) <= radius)
    .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 50);

  return json(eventsWithDistance);
}

async function handleEventsMine(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", userId)
    .order("starts_at", { ascending: false });

  return json(events || []);
}

async function handleEventGet(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: event } = await supabase
    .from("events")
    .select("*, users!events_organizer_id_fkey(username)")
    .eq("id", id)
    .single();

  if (!event) return error("Event not found", 404);

  const { data: signups } = await supabase
    .from("event_signups")
    .select("id, user_id, status, signed_up_at, users(username, rating, avatar_url)")
    .eq("event_id", id)
    .order("signed_up_at", { ascending: true });

  const { count } = await supabase
    .from("event_signups")
    .select("*", { count: "exact", head: true })
    .eq("event_id", id);

  const { count: isSignedUp } = await supabase
    .from("event_signups")
    .select("*", { count: "exact", head: true })
    .eq("event_id", id)
    .eq("user_id", userId);

  return json({
    ...event,
    organizer_name: event.users?.username,
    signup_count: count || 0,
    is_signed_up: (isSignedUp || 0) > 0,
    participants: (signups || []).map((s: any) => ({
      id: s.users?.id,
      username: s.users?.username,
      rating: s.users?.rating,
      avatar_url: s.users?.avatar_url,
      signed_up_at: s.signed_up_at,
      status: s.status,
    })),
  });
}

async function handleEventSignup(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (!event) return error("Event not found", 404);

  // Check capacity
  if (event.max_participants) {
    const { count } = await supabase
      .from("event_signups")
      .select("*", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "registered");

    if ((count || 0) >= event.max_participants) {
      return error("Event is full", 409);
    }
  }

  // Check rating requirements
  const { data: user } = await supabase
    .from("users")
    .select("rating")
    .eq("id", userId)
    .single();

  if (event.rating_min && user?.rating < event.rating_min) {
    return error(`Minimum rating ${event.rating_min} required`, 403);
  }
  if (event.rating_max && user?.rating > event.rating_max) {
    return error(`Maximum rating ${event.rating_max} allowed`, 403);
  }

  await supabase
    .from("event_signups")
    .upsert({ event_id: id, user_id: userId, status: "registered" });

  return json({ success: true });
}

async function handleEventCancelSignup(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  await supabase
    .from("event_signups")
    .update({ status: "cancelled" })
    .eq("event_id", id)
    .eq("user_id", userId);

  return json({ success: true });
}

async function handleEventUpdate(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", id)
    .single();

  if (!event) return error("Event not found", 404);
  if (event.organizer_id !== userId) {
    return error("Not authorized", 403);
  }

  const body = await req.json();
  const allowed = ["name", "description", "starts_at", "ends_at", "location_name", "address", "max_participants", "status", "entry_fee"];

  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data: updated } = await supabase
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  return json(updated);
}

async function handleGamesReport(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const { opponent_id, result, format, time_control, notes, post_id, event_id } = body;

  if (opponent_id === userId) {
    return error("Cannot report a game against yourself");
  }

  const { data: players } = await supabase
    .from("users")
    .select("id, username, rating, games_played")
    .in("id", [userId, opponent_id]);

  if ((players || []).length < 2) {
    return error("Player not found", 404);
  }

  const reporter = players!.find((p: any) => p.id === userId);
  const opponent = players!.find((p: any) => p.id === opponent_id);

  // Calculate rating changes
  const p1Result = result === "player1" ? "win" : result === "draw" ? "draw" : "loss";
  const p1Change = calculateRatingChange(reporter.rating, opponent.rating, p1Result, reporter.games_played);
  const p2Change = calculateRatingChange(opponent.rating, reporter.rating, result === "player2" ? "win" : result === "draw" ? "draw" : "loss", opponent.games_played);

  const { data: game } = await supabase
    .from("games")
    .insert({
      player1_id: userId,
      player2_id: opponent_id,
      winner_id: result === "player1" ? userId : result === "player2" ? opponent_id : null,
      result,
      format,
      time_control,
      post_id,
      event_id,
      player1_rating_before: reporter.rating,
      player2_rating_before: opponent.rating,
      player1_rating_change: p1Change,
      player2_rating_change: p2Change,
      notes,
      reported_by: userId,
    })
    .select()
    .single();

  return json(game, 201);
}

async function handleGamesConfirm(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();

  if (!game) return error("Game not found", 404);
  if (game.player2_id !== userId) {
    return error("Only the opponent can confirm", 403);
  }
  if (game.confirmed_at) {
    return error("Already confirmed", 409);
  }

  // Get players
  const { data: players } = await supabase
    .from("users")
    .select("id, rating, games_played, wins, losses, draws, is_provisional")
    .in("id", [game.player1_id, game.player2_id]);

  const p1 = players!.find((p: any) => p.id === game.player1_id);
  const p2 = players!.find((p: any) => p.id === game.player2_id);

  // Update stats
  const p1Wins = game.result === "player1" ? 1 : 0;
  const p2Wins = game.result === "player2" ? 1 : 0;
  const isDraw = game.result === "draw" ? 1 : 0;

  const p1GamesNew = p1.games_played + 1;
  const p2GamesNew = p2.games_played + 1;

  await supabase
    .from("users")
    .update({
      rating: Math.max(100, p1.rating + game.player1_rating_change),
      games_played: p1GamesNew,
      wins: p1.wins + p1Wins,
      losses: p1.losses + p2Wins,
      draws: p1.draws + isDraw,
      is_provisional: p1GamesNew < 30,
    })
    .eq("id", p1.id);

  await supabase
    .from("users")
    .update({
      rating: Math.max(100, p2.rating + game.player2_rating_change),
      games_played: p2GamesNew,
      wins: p2.wins + p2Wins,
      losses: p2.losses + p1Wins,
      draws: p2.draws + isDraw,
      is_provisional: p2GamesNew < 30,
    })
    .eq("id", p2.id);

  await supabase
    .from("games")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", id);

  return json({ confirmed: true });
}

async function handleGamesHistory(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: games } = await supabase
    .from("games")
    .select("id, result, format, time_control, played_at, confirmed_at, player1_rating_before, player2_rating_before, player1_rating_change, player2_rating_change, player1_id, player2_id")
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order("played_at", { ascending: false })
    .limit(50);

  // Get usernames
  const playerIds = new Set<string>();
  (games || []).forEach((g: any) => {
    playerIds.add(g.player1_id);
    playerIds.add(g.player2_id);
  });

  const { data: users } = await supabase
    .from("users")
    .select("id, username")
    .in("id", Array.from(playerIds));

  const userMap = new Map((users || []).map((u: any) => [u.id, u.username]));

  const gamesWithNames = (games || []).map((g: any) => ({
    ...g,
    player1_name: userMap.get(g.player1_id),
    player2_name: userMap.get(g.player2_id),
  }));

  return json(gamesWithNames);
}

async function handleCalibrationStart(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const botLevel = body.botLevel || 4;

  if (botLevel < 1 || botLevel > 8) {
    return error("Bot level must be 1-8");
  }

  const sessionId = `${userId}-${Date.now()}`;
  activeSessions.set(sessionId, {
    userId,
    botLevel,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playerColor: "white",
    moves: [],
    startedAt: Date.now(),
  });

  return json({
    sessionId,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playerColor: "white",
    botLevel,
  });
}

async function handleCalibrationMove(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const { sessionId, move } = body;
  const session = activeSessions.get(sessionId);

  if (!session || session.userId !== userId) {
    return error("Session not found", 404);
  }

  // Apply player move
  const afterPlayer = applyMove(session.fen, move);
  if (!afterPlayer) return error("Invalid move");

  session.fen = afterPlayer.fen;
  session.moves.push(move);

  if (afterPlayer.isGameOver) {
    const winner = getGameResult(session.fen);
    const result = winner === "white" ? "win" : winner === "black" ? "loss" : "draw";
    await supabase.from("calibration_games").insert({
      user_id: userId,
      bot_level: session.botLevel,
      result,
      pgn: afterPlayer.pgn,
    });
    activeSessions.delete(sessionId);
    return json({ fen: afterPlayer.fen, gameOver: true, result, winner });
  }

  // Bot response
  const botMove = getBotMove(session.fen, session.botLevel);
  if (!botMove) {
    return json({ fen: afterPlayer.fen, gameOver: false });
  }

  const afterBot = applyMove(session.fen, botMove);
  if (!afterBot) return json({ fen: afterPlayer.fen, gameOver: false });

  session.fen = afterBot.fen;
  session.moves.push(botMove);

  if (afterBot.isGameOver) {
    const winner = getGameResult(session.fen);
    const result = winner === "black" ? "loss" : winner === "white" ? "win" : "draw";
    await supabase.from("calibration_games").insert({
      user_id: userId,
      bot_level: session.botLevel,
      result,
      pgn: afterBot.pgn,
    });
    activeSessions.delete(sessionId);
    return json({ fen: afterBot.fen, botMove, gameOver: true, result, winner });
  }

  return json({ fen: afterBot.fen, botMove, gameOver: false, isCheck: afterBot.isCheck });
}

async function handleCalibrationResign(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const { sessionId } = body;
  const session = activeSessions.get(sessionId);

  if (!session || session.userId !== userId) {
    return error("Session not found", 404);
  }

  await supabase.from("calibration_games").insert({
    user_id: userId,
    bot_level: session.botLevel,
    result: "loss",
    pgn: null,
  });
  activeSessions.delete(sessionId);
  return json({ resigned: true });
}

async function handleCalibrationStatus(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: games } = await supabase
    .from("calibration_games")
    .select("*")
    .eq("user_id", userId)
    .order("played_at", { ascending: true });

  const completed = (games || []).length;
  const recommended = 5;

  let estimatedRating = null;
  if (completed >= 3) {
    const results = (games || []).map((g: any) => ({ botLevel: g.bot_level, result: g.result }));
    estimatedRating = estimateRatingFromCalibration(results);
  }

  return json({ completed, recommended, estimatedRating, games: games || [] });
}

async function handleCalibrationFinalize(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { data: games } = await supabase
    .from("calibration_games")
    .select("bot_level, result")
    .eq("user_id", userId);

  if ((games || []).length < 3) {
    return error("Complete at least 3 calibration games first");
  }

  const results = (games || []).map((g: any) => ({ botLevel: g.bot_level, result: g.result }));
  const rating = estimateRatingFromCalibration(results);

  await supabase
    .from("users")
    .update({ rating, is_provisional: true })
    .eq("id", userId);

  return json({ rating });
}

async function handleMessagesSend(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const body = await req.json();
  const { recipient_id, content } = body;

  if (recipient_id === userId) {
    return error("Cannot message yourself");
  }

  // Check block
  const { data: blocked } = await supabase
    .from("blocks")
    .select("*")
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${recipient_id}),and(blocker_id.eq.${recipient_id},blocked_id.eq.${userId})`)
    .maybeSingle();

  if (blocked) {
    return error("Cannot send message", 403);
  }

  const { data: msg } = await supabase
    .from("messages")
    .insert({ sender_id: userId, recipient_id, content })
    .select()
    .single();

  return json(msg, 201);
}

async function handleMessagesConversations(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  // Get all messages involving user
  const { data: messages } = await supabase
    .from("messages")
    .select("*, sender:users!messages_sender_id_fkey(id, username, avatar_url, rating)")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  // Group by other user
  const conversations = new Map<string, any>();
  (messages || []).forEach((m: any) => {
    const otherId = m.sender_id === userId ? m.recipient_id : m.sender_id;
    if (!conversations.has(otherId)) {
      const otherUser = m.sender_id === userId ? { id: m.recipient_id } : m.sender;
      conversations.set(otherId, {
        other_user: otherId,
        username: otherUser?.username,
        avatar_url: otherUser?.avatar_url,
        rating: otherUser?.rating,
        last_message: m.content,
        last_message_at: m.created_at,
        sender_id: m.sender_id,
      });
    }
  });

  return json(Array.from(conversations.values()));
}

async function handleMessagesThread(req: Request, otherUserId: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const before = url.searchParams.get("before");

  let query = supabase
    .from("messages")
    .select("*, sender:users!messages_sender_id_fkey(id, username, avatar_url)")
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: messages } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  // Mark as read
  await supabase
    .from("messages")
    .update({ read: true })
    .eq("sender_id", otherUserId)
    .eq("recipient_id", userId)
    .eq("read", false);

  return json((messages || []).reverse());
}

async function handleMessagesBlock(req: Request, otherUserId: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  await supabase
    .from("blocks")
    .upsert({ blocker_id: userId, blocked_id: otherUserId });

  return json({ blocked: true });
}

async function handleMessagesUnblock(req: Request, otherUserId: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", otherUserId);

  return json({ unblocked: true });
}

async function handleNotificationsList(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "20");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return json(notifications || []);
}

async function handleNotificationsUnreadCount(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  return json({ count: count || 0 });
}

async function handleNotificationsMarkRead(req: Request, id: string) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", userId);

  return json({ read: true });
}

async function handleNotificationsMarkAllRead(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return error("Unauthorized", 401);

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);

  return json({ success: true });
}

// Router
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace("/functions/v1/api", "");
  const method = req.method;

  // Auth routes
  if (path === "/auth/signup" && method === "POST") return handleAuthSignup(req);
  if (path === "/auth/login" && method === "POST") return handleAuthLogin(req);
  if (path === "/auth/me" && method === "GET") return handleAuthMe(req);
  if (path === "/auth/me" && method === "PUT") return handleAuthUpdateMe(req);

  // Users routes
  if (path === "/users/nearby" && method === "GET") return handleUsersNearby(req);
  if (path.match(/^\/users\/[\w-]+$/) && method === "GET") {
    const id = path.split("/")[2];
    return handleUserGet(req, id);
  }

  // Posts routes
  if (path === "/posts" && method === "POST") return handlePostsCreate(req);
  if (path === "/posts/nearby" && method === "GET") return handlePostsNearby(req);
  if (path === "/posts/mine" && method === "GET") return handlePostsMine(req);
  if (path.match(/^\/posts\/[\w-]+\/status$/) && method === "PATCH") {
    const id = path.split("/")[2];
    return handlePostsUpdateStatus(req, id);
  }
  if (path.match(/^\/posts\/[\w-]+$/) && method === "DELETE") {
    const id = path.split("/")[2];
    return handlePostsDelete(req, id);
  }

  // Events routes
  if (path === "/events" && method === "POST") return handleEventsCreate(req);
  if (path === "/events/nearby" && method === "GET") return handleEventsNearby(req);
  if (path === "/events/mine" && method === "GET") return handleEventsMine(req);
  if (path === "/events/signup" && method === "POST") {
    const body = await req.clone().json();
    return handleEventSignup(req, body.event_id);
  }
  if (path.match(/^\/events\/[\w-]+$/) && method === "GET") {
    const id = path.split("/")[2];
    return handleEventGet(req, id);
  }
  if (path.match(/^\/events\/[\w-]+\/signup$/) && method === "POST") {
    const id = path.split("/")[2];
    return handleEventSignup(req, id);
  }
  if (path.match(/^\/events\/[\w-]+\/signup$/) && method === "DELETE") {
    const id = path.split("/")[2];
    return handleEventCancelSignup(req, id);
  }
  if (path.match(/^\/events\/[\w-]+$/) && method === "PUT") {
    const id = path.split("/")[2];
    return handleEventUpdate(req, id);
  }

  // Games routes
  if (path === "/games" && method === "POST") return handleGamesReport(req);
  if (path === "/games/history" && method === "GET") return handleGamesHistory(req);
  if (path.match(/^\/games\/[\w-]+\/confirm$/) && method === "POST") {
    const id = path.split("/")[2];
    return handleGamesConfirm(req, id);
  }

  // Calibration routes
  if (path === "/calibration/start" && method === "POST") return handleCalibrationStart(req);
  if (path === "/calibration/move" && method === "POST") return handleCalibrationMove(req);
  if (path === "/calibration/resign" && method === "POST") return handleCalibrationResign(req);
  if (path === "/calibration/status" && method === "GET") return handleCalibrationStatus(req);
  if (path === "/calibration/finalize" && method === "POST") return handleCalibrationFinalize(req);

  // Messages routes
  if (path === "/messages" && method === "POST") return handleMessagesSend(req);
  if (path === "/messages/conversations" && method === "GET") return handleMessagesConversations(req);
  if (path.match(/^\/messages\/block\/[\w-]+$/) && method === "POST") {
    const id = path.split("/")[3];
    return handleMessagesBlock(req, id);
  }
  if (path.match(/^\/messages\/block\/[\w-]+$/) && method === "DELETE") {
    const id = path.split("/")[3];
    return handleMessagesUnblock(req, id);
  }
  if (path.match(/^\/messages\/[\w-]+$/) && method === "GET") {
    const id = path.split("/")[2];
    return handleMessagesThread(req, id);
  }

  // Notifications routes
  if (path === "/notifications" && method === "GET") return handleNotificationsList(req);
  if (path === "/notifications/unread-count" && method === "GET") return handleNotificationsUnreadCount(req);
  if (path === "/notifications/read-all" && method === "PATCH") return handleNotificationsMarkAllRead(req);
  if (path.match(/^\/notifications\/[\w-]+\/read$/) && method === "PATCH") {
    const id = path.split("/")[2];
    return handleNotificationsMarkRead(req, id);
  }

  return error("Not found", 404);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("Error:", err);
    return error("Internal server error", 500);
  }
});
