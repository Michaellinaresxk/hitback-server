/**
 * 🎮 Game Session Service - Maneja partidas SIN QR
 * 
 * Flujo nuevo:
 * 1. createSession() - Crear partida con filtros (géneros, décadas)
 * 2. nextRound() - Obtener siguiente canción + pregunta aleatoria
 * 3. submitAnswer() - Registrar ganador y calcular puntos
 * 4. getStatus() - Estado actual de la partida
 * 
 * ❌ Sin escaneo QR
 * ✅ Control 100% desde la app
 */

// ✅ CORREGIDO: TrackService es singleton, no clase
const trackService = require('./TrackService');
const QuestionService = require('./QuestionService');
const DeezerService = require('./DeezerService');

class GameSessionService {
  constructor() {
    // ✅ CORREGIDO: Usar singleton directamente
    this.trackService = trackService;
    this.questionService = new QuestionService();

    // Sesiones activas (en producción usar Redis/DB)
    this.sessions = new Map();
  }

  // ═══════════════════════════════════════════════════════════
  // 🎮 CREAR SESIÓN
  // ═══════════════════════════════════════════════════════════

  /**
   * Crea una nueva sesión de juego
   * @param {Object} config - Configuración de la partida
   * @returns {Object} Sesión creada
   */
  createSession(config = {}) {
    const {
      players = [],
      genres = ['ANY'],
      decades = ['ANY'],
      difficulty = 'ANY',
      targetScore = 15,
      timeLimit = 1200, // 20 minutos en segundos
      tokensPerPlayer = 5,
      powerCardsPerPlayer = 3
    } = config;

    // Generar ID único
    const sessionId = this._generateSessionId();

    // Crear estructura de jugadores
    const playerList = players.map((name, index) => ({
      id: `player_${index + 1}`,
      name: name || `Jugador ${index + 1}`,
      score: 0,
      tokens: tokensPerPlayer,
      powerCards: [],
      stats: {
        correctAnswers: 0,
        wrongAnswers: 0,
        tokensWon: 0,
        tokensLost: 0
      }
    }));

    // Crear sesión
    const session = {
      id: sessionId,
      status: 'created', // created | playing | paused | finished
      createdAt: new Date().toISOString(),

      // Configuración
      config: {
        genres,
        decades,
        difficulty,
        targetScore,
        timeLimit,
        tokensPerPlayer,
        powerCardsPerPlayer
      },

      // Jugadores
      players: playerList,
      currentPlayerIndex: 0,

      // Estado del juego
      round: 0,
      usedTrackIds: [],
      currentRound: null,

      // Tiempo
      timeRemaining: timeLimit,
      startedAt: null,

      // Historial
      history: []
    };

    // Guardar sesión
    this.sessions.set(sessionId, session);

    // Resetear tracks usados en TrackService
    this.trackService.resetUsedTracks();

    console.log(`🎮 Sesión creada: ${sessionId}`);
    console.log(`   Jugadores: ${playerList.length}`);
    console.log(`   Géneros: ${genres.join(', ')}`);
    console.log(`   Décadas: ${decades.join(', ')}`);

    return {
      success: true,
      session: this._sanitizeSession(session)
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ▶️ INICIAR JUEGO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia la partida
   */
  startGame(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    if (session.status === 'playing') {
      return { success: false, error: 'El juego ya está en curso' };
    }

    session.status = 'playing';
    session.startedAt = new Date().toISOString();

    console.log(`▶️ Juego iniciado: ${sessionId}`);

    return {
      success: true,
      session: this._sanitizeSession(session)
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎵 SIGUIENTE RONDA
  // ═══════════════════════════════════════════════════════════

  /**
   * Obtiene la siguiente ronda (track + pregunta)
   * @param {string} sessionId - ID de la sesión
   * @param {string} forcedQuestionType - Tipo forzado (opcional, para carta SNIPER)
   */
  async nextRound(sessionId, forcedQuestionType = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    if (session.status !== 'playing') {
      return { success: false, error: 'El juego no está en curso' };
    }

    // Verificar si alguien ganó
    const winner = this._checkWinner(session);
    if (winner) {
      session.status = 'finished';
      return {
        success: true,
        gameOver: true,
        winner,
        session: this._sanitizeSession(session)
      };
    }

    // Incrementar ronda
    session.round++;

    // Obtener track aleatorio con filtros
    const filters = {
      genre: this._getRandomFromArray(session.config.genres),
      decade: this._getRandomFromArray(session.config.decades),
      difficulty: session.config.difficulty
    };

    const track = this.trackService.getRandomTrack(filters);

    if (!track) {
      return { success: false, error: 'No hay tracks disponibles' };
    }

    // 🎵 OBTENER AUDIO URL DE DEEZER
    let audioUrl = null;
    let audioSource = 'none';

    try {
      console.log(`🎵 Buscando audio en Deezer: "${track.title}" - ${track.artist}`);
      const deezerResult = await DeezerService.searchTrack(track.title, track.artist);

      if (deezerResult && deezerResult.previewUrl) {
        audioUrl = deezerResult.previewUrl;
        audioSource = 'deezer';
        console.log(`✅ Audio encontrado: ${audioUrl}`);
      } else {
        console.warn(`⚠️ No se encontró preview en Deezer para: ${track.title}`);
      }
    } catch (error) {
      console.error(`❌ Error buscando en Deezer:`, error.message);
    }

    // Generar pregunta
    const question = this.questionService.generateQuestion(track, forcedQuestionType);

    // Guardar ronda actual
    session.currentRound = {
      roundNumber: session.round,
      trackId: track.id,
      track: {
        id: track.id,
        // NO enviamos title/artist aún (es la respuesta!)
        genre: track.genre,
        decade: track.decade,
        audioUrl: audioUrl,
        audioSource: audioSource
      },
      question: {
        type: question.type,
        text: question.question,
        icon: question.icon,
        points: question.points,
        hints: question.hints,
        isChallenge: question.isChallenge || false
      },
      // Respuesta guardada pero NO enviada al cliente aún
      _answer: {
        correct: question.answer,
        acceptableAnswers: question.acceptableAnswers,
        trackTitle: track.title,
        trackArtist: track.artist
      },
      bets: {},
      startedAt: new Date().toISOString(),
      status: 'playing' // playing | betting | answered
    };

    // Agregar a usados
    session.usedTrackIds.push(track.id);

    console.log(`🎵 Ronda ${session.round}: ${track.title} - ${track.artist}`);
    console.log(`   Pregunta: ${question.type} (${question.points} pts)`);
    console.log(`   Audio: ${audioSource}`);

    return {
      success: true,
      round: {
        number: session.round,
        track: session.currentRound.track,
        question: session.currentRound.question
      }
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎰 REGISTRAR APUESTAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Registra la apuesta de un jugador
   */
  placeBet(sessionId, playerId, tokensBet) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.currentRound) {
      return { success: false, error: 'No hay ronda activa' };
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    // Validar tokens
    const bet = Math.min(Math.max(0, tokensBet), player.tokens);

    // Registrar apuesta
    session.currentRound.bets[playerId] = {
      tokens: bet,
      multiplier: this._calculateMultiplier(bet)
    };

    console.log(`🎰 ${player.name} apuesta ${bet} tokens (×${this._calculateMultiplier(bet)})`);

    return {
      success: true,
      bet: session.currentRound.bets[playerId],
      playerTokens: player.tokens
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ REVELAR RESPUESTA Y ASIGNAR PUNTOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Revela la respuesta y asigna puntos al ganador
   * @param {string} sessionId 
   * @param {string} winnerId - ID del jugador ganador (null si nadie acertó)
   */
  revealAnswer(sessionId, winnerId = null) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.currentRound) {
      return { success: false, error: 'No hay ronda activa' };
    }

    const round = session.currentRound;
    const answer = round._answer;

    // Calcular resultados
    const results = {
      correctAnswer: answer.correct,
      trackInfo: {
        title: answer.trackTitle,
        artist: answer.trackArtist
      },
      winner: null,
      pointsAwarded: 0,
      tokensLost: {},
      tokensWon: 0
    };

    if (winnerId) {
      const winner = session.players.find(p => p.id === winnerId);

      if (winner) {
        // Calcular puntos con multiplicador
        const bet = round.bets[winnerId] || { tokens: 0, multiplier: 1 };
        const basePoints = round.question.points;
        const totalPoints = Math.round(basePoints * bet.multiplier);

        // Asignar puntos
        winner.score += totalPoints;
        winner.stats.correctAnswers++;
        winner.stats.tokensWon += bet.tokens;

        results.winner = {
          id: winner.id,
          name: winner.name,
          newScore: winner.score
        };
        results.pointsAwarded = totalPoints;
        results.tokensWon = bet.tokens;

        console.log(`✅ ${winner.name} gana ${totalPoints} puntos (base: ${basePoints}, mult: ×${bet.multiplier})`);
      }
    }

    // Procesar perdedores (pierden tokens apostados)
    session.players.forEach(player => {
      if (player.id !== winnerId) {
        const bet = round.bets[player.id];
        if (bet && bet.tokens > 0) {
          player.tokens -= bet.tokens;
          player.stats.tokensLost += bet.tokens;
          results.tokensLost[player.id] = bet.tokens;

          console.log(`❌ ${player.name} pierde ${bet.tokens} tokens`);
        }
        player.stats.wrongAnswers++;
      }
    });

    // Guardar en historial
    session.history.push({
      round: round.roundNumber,
      trackId: round.trackId,
      questionType: round.question.type,
      winner: winnerId,
      pointsAwarded: results.pointsAwarded,
      timestamp: new Date().toISOString()
    });

    // Limpiar ronda actual
    session.currentRound = null;

    // Verificar ganador del juego
    const gameWinner = this._checkWinner(session);
    if (gameWinner) {
      session.status = 'finished';
      results.gameOver = true;
      results.gameWinner = gameWinner;
    }

    return {
      success: true,
      results,
      players: session.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        tokens: p.tokens
      }))
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 📊 ESTADO DEL JUEGO
  // ═══════════════════════════════════════════════════════════

  /**
   * Obtiene el estado actual de la sesión
   */
  getStatus(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    return {
      success: true,
      session: this._sanitizeSession(session)
    };
  }

  /**
   * Obtiene todas las sesiones activas
   */
  getAllSessions() {
    const sessions = [];
    this.sessions.forEach((session, id) => {
      sessions.push({
        id,
        status: session.status,
        players: session.players.length,
        round: session.round,
        createdAt: session.createdAt
      });
    });
    return sessions;
  }

  // ═══════════════════════════════════════════════════════════
  // ⚡ CARTAS DE PODER
  // ═══════════════════════════════════════════════════════════

  /**
   * Usa una carta de poder
   */
  usePowerCard(sessionId, playerId, cardType, targetPlayerId = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    // Aquí iría la lógica de cada poder
    // Por ahora solo log
    console.log(`⚡ ${player.name} usa poder: ${cardType}`);

    return {
      success: true,
      message: `Poder ${cardType} activado`
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🔧 UTILIDADES PRIVADAS
  // ═══════════════════════════════════════════════════════════

  _generateSessionId() {
    return 'game_' + Math.random().toString(36).substring(2, 9);
  }

  _getRandomFromArray(arr) {
    if (!arr || arr.length === 0) return 'ANY';
    if (arr.includes('ANY')) return 'ANY';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  _calculateMultiplier(tokens) {
    const multipliers = {
      0: 1,
      1: 1.5,
      2: 2,
      3: 2.5,
      4: 3,
      5: 4 // ALL IN
    };
    return multipliers[tokens] || 1;
  }

  _checkWinner(session) {
    const targetScore = session.config.targetScore;

    for (const player of session.players) {
      if (player.score >= targetScore) {
        return {
          id: player.id,
          name: player.name,
          score: player.score
        };
      }
    }

    return null;
  }

  _sanitizeSession(session) {
    // Quita información sensible (respuestas) antes de enviar al cliente
    const sanitized = { ...session };

    if (sanitized.currentRound) {
      sanitized.currentRound = { ...sanitized.currentRound };
      delete sanitized.currentRound._answer; // No enviar respuesta
    }

    return sanitized;
  }

  // ═══════════════════════════════════════════════════════════
  // 🧹 LIMPIEZA
  // ═══════════════════════════════════════════════════════════

  /**
   * Elimina una sesión
   */
  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    console.log(`🗑️ Sesión ${sessionId} ${deleted ? 'eliminada' : 'no encontrada'}`);
    return { success: deleted };
  }

  /**
   * Limpia sesiones antiguas (más de 2 horas)
   */
  cleanupOldSessions() {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    let cleaned = 0;

    this.sessions.forEach((session, id) => {
      const createdAt = new Date(session.createdAt).getTime();
      if (createdAt < twoHoursAgo) {
        this.sessions.delete(id);
        cleaned++;
      }
    });

    console.log(`🧹 Limpiadas ${cleaned} sesiones antiguas`);
    return { cleaned };
  }
}

module.exports = GameSessionService;