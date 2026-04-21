const { Chess } = require('chess.js');

// Bot difficulty levels map to approximate ELO targets
const BOT_LEVELS = {
  1: { depth: 1, randomness: 0.9 },   // ~600
  2: { depth: 1, randomness: 0.6 },   // ~800
  3: { depth: 2, randomness: 0.4 },   // ~1000
  4: { depth: 2, randomness: 0.2 },   // ~1200
  5: { depth: 3, randomness: 0.1 },   // ~1400
  6: { depth: 3, randomness: 0.05 },  // ~1600
  7: { depth: 4, randomness: 0.02 },  // ~1800
  8: { depth: 4, randomness: 0 },     // ~2000
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function evaluateBoard(chess) {
  let score = 0;
  const board = chess.board();
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] || 0;
      score += sq.color === 'w' ? val : -val;
    }
  }
  return score;
}

function minimax(chess, depth, alpha, beta, isMaximizing) {
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

function getBotMove(fen, level = 4) {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;

  const config = BOT_LEVELS[level] || BOT_LEVELS[4];
  const moves = chess.moves();
  if (!moves.length) return null;

  // Add randomness for lower-level bots
  if (Math.random() < config.randomness) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const isWhite = chess.turn() === 'w';
  let bestMove = null;
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

function applyMove(fen, move) {
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

function getGameResult(fen) {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? 'black' : 'white';
  }
  return 'draw';
}

module.exports = { getBotMove, applyMove, getGameResult, BOT_LEVELS };
