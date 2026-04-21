const K_PROVISIONAL = 40;
const K_STANDARD = 20;
const K_EXPERIENCED = 10;
const PROVISIONAL_THRESHOLD = 30;
const EXPERIENCED_THRESHOLD = 2400;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function kFactor(rating, gamesPlayed) {
  if (gamesPlayed < PROVISIONAL_THRESHOLD) return K_PROVISIONAL;
  if (rating >= EXPERIENCED_THRESHOLD) return K_EXPERIENCED;
  return K_STANDARD;
}

function calculateRatingChange(playerRating, opponentRating, result, gamesPlayed) {
  const k = kFactor(playerRating, gamesPlayed);
  const expected = expectedScore(playerRating, opponentRating);
  let score;
  if (result === 'win') score = 1;
  else if (result === 'loss') score = 0;
  else score = 0.5;

  return Math.round(k * (score - expected));
}

function calculateGameRatings(player1, player2, result) {
  const p1Change = calculateRatingChange(
    player1.rating, player2.rating,
    result === 'player1' ? 'win' : result === 'draw' ? 'draw' : 'loss',
    player1.games_played
  );
  const p2Change = calculateRatingChange(
    player2.rating, player1.rating,
    result === 'player2' ? 'win' : result === 'draw' ? 'draw' : 'loss',
    player2.games_played
  );

  return {
    player1RatingChange: p1Change,
    player2RatingChange: p2Change,
    player1NewRating: Math.max(100, player1.rating + p1Change),
    player2NewRating: Math.max(100, player2.rating + p2Change),
  };
}

function estimateRatingFromCalibration(results) {
  // results: array of { botLevel, result } where botLevel maps to ~rating
  // bot levels: 1=600, 2=800, 3=1000, 4=1200, 5=1400, 6=1600, 7=1800, 8=2000
  const botRatings = { 1: 600, 2: 800, 3: 1000, 4: 1200, 5: 1400, 6: 1600, 7: 1800, 8: 2000 };
  let rating = 1200;

  for (const { botLevel, result } of results) {
    const botRating = botRatings[botLevel] || 1200;
    const change = calculateRatingChange(rating, botRating, result, 0);
    rating = Math.max(100, rating + change);
  }

  return Math.round(rating);
}

function ratingToSkillBadge(rating) {
  if (rating < 800) return { label: 'Beginner', color: '#CD7F32' };
  if (rating < 1000) return { label: 'Bronze', color: '#CD7F32' };
  if (rating < 1200) return { label: 'Silver', color: '#C0C0C0' };
  if (rating < 1400) return { label: 'Gold', color: '#FFD700' };
  if (rating < 1600) return { label: 'Platinum', color: '#E5E4E2' };
  if (rating < 1800) return { label: 'Diamond', color: '#B9F2FF' };
  if (rating < 2000) return { label: 'Master', color: '#9B59B6' };
  return { label: 'Grandmaster', color: '#E74C3C' };
}

module.exports = {
  calculateGameRatings,
  estimateRatingFromCalibration,
  ratingToSkillBadge,
};
