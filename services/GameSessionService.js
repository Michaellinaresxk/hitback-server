/**
 * 🎮 GAME SESSION SERVICE - UPDATED
 *
 * ✅ INTEGRACIÓN CON POWER CARDS
 * - Detecta combos automáticamente
 * - Aplica efectos de cartas a puntos
 * - Registra uso de power cards
 *
 * CAMBIOS:
 * - revealAnswer(): Integración con PowerCardService y ComboTracker
 * - Nuevos métodos: processCombos(), applyPowerCardBonus()
 */

const defaultTrackService = require('./TrackService');
const QuestionService = require('./QuestionService');
const DeezerService = require('./DeezerService');
const PowerCardService = require('./PowerCardService');
const GameSessionPersistence = require('./GameSessionPersistence');
const {
  createDeck,
  drawCard,
  isBackstagePosition,
} = require('./BackstageDeck');
const { BACKSTAGE_INTERVAL } = require('../constants/backstage');
const { BSIDE_LOSS_THRESHOLD } = require('../constants/lossStreak');
const crypto = require('crypto');

const PLAY_MODES = new Set(['physical', 'digital']);

class GameSessionService {
  constructor({
    trackService = defaultTrackService,
    questionService,
    persistence = new GameSessionPersistence(),
    backstageRng = Math.random,
  } = {}) {
    this.trackService = trackService;
    this.questionService = questionService || new QuestionService();
    this.persistence = persistence;
    this.backstageRng = backstageRng;
    this.sessions = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    await this.persistence.initialize();
    this.initialized = true;
  }

  _normalizeSession(session) {
    if (!session) return session;
    session.alliances = Array.isArray(session.alliances) ? session.alliances : [];
    session.activeEffects = Array.isArray(session.activeEffects) ? session.activeEffects : [];
    session.processedIdempotencyKeys = session.processedIdempotencyKeys && typeof session.processedIdempotencyKeys === 'object'
      ? session.processedIdempotencyKeys
      : {};
    session.doublePlatinumActive = Boolean(session.doublePlatinumActive);
    session.config = session.config && typeof session.config === 'object' ? session.config : {};
    session.config.playMode = PLAY_MODES.has(session.config.playMode)
      ? session.config.playMode
      : 'physical';
    if (session.config.playMode === 'digital') {
      session.config.backstageInterval =
        Number.isInteger(session.config.backstageInterval) &&
        session.config.backstageInterval > 0
          ? session.config.backstageInterval
          : BACKSTAGE_INTERVAL;
      session.backstageDeck = Array.isArray(session.backstageDeck)
        ? session.backstageDeck
        : [];
      session.lastBackstageCard = session.lastBackstageCard || null;
    }
    session.backstageCard =
      session.backstageCard && typeof session.backstageCard === 'object'
        ? session.backstageCard
        : null;
    session.timer = session.timer && typeof session.timer === 'object'
      ? {
          durationMs: Number(session.timer.durationMs) || (Number(session.config?.timeLimit) || 1200) * 1000,
          remainingMs: Math.max(0, Number(session.timer.remainingMs) || 0),
          startedAt: session.timer.startedAt || session.startedAt || null,
          pausedAt: session.timer.pausedAt || null,
          isPaused: Boolean(session.timer.isPaused),
        }
      : {
          durationMs: (Number(session.config?.timeLimit) || 1200) * 1000,
          remainingMs: (Number(session.timeRemaining) || Number(session.config?.timeLimit) || 1200) * 1000,
          startedAt: session.startedAt || null,
          pausedAt: null,
          isPaused: false,
        };

    session.players = (session.players || []).map((player) => ({
      ...player,
      boardPosition: Number.isFinite(player.boardPosition) ? player.boardPosition : 0,
      availableTokens: Array.isArray(player.availableTokens) ? player.availableTokens : [1, 2, 3],
      powerCards: Array.isArray(player.powerCards) ? player.powerCards : [],
      stats: {
        correctAnswers: 0,
        wrongAnswers: 0,
        tokensWon: 0,
        tokensLost: 0,
        tokensUsed: [],
        combosCompleted: 0,
        powerCardsUsed: 0,
        totalComboStreak: 0,
        ...(player.stats || {}),
      },
      effects: {
        isFrozen: Boolean(player.effects?.isFrozen),
        frozenRoundsLeft: Math.max(0, Number(player.effects?.frozenRoundsLeft) || 0),
        frozenForRound: Number.isFinite(player.effects?.frozenForRound) ? player.effects.frozenForRound : null,
        lossStreak: Math.max(0, Number(player.effects?.lossStreak) || 0),
        bSideActive: Boolean(player.effects?.bSideActive),
        stopBlastActive: Boolean(player.effects?.stopBlastActive),
        duelActive: Boolean(player.effects?.duelActive),
        duelOpponentId: player.effects?.duelOpponentId || null,
        featuringPartnerId: player.effects?.featuringPartnerId || null,
      },
    }));
    return session;
  }

  async getSession(sessionId) {
    const cachedSession = this.sessions.get(sessionId);
    if (cachedSession) return this._normalizeSession(cachedSession);

    await this.initialize();
    const session = await this.persistence.get(sessionId);
    if (session) {
      this._normalizeSession(session);
      this.sessions.set(sessionId, session);
      if (session.powerCardState) PowerCardService.importSessionState(sessionId, session.powerCardState);
    }
    return session;
  }

  async findSessionByCapabilityToken(token) {
    const cachedSession = Array.from(this.sessions.values()).find((session) =>
      this.verifyCapability(session.id, token),
    );
    if (cachedSession) return this._normalizeSession(cachedSession);

    await this.initialize();
    const session = await this.persistence.findByCapabilityToken(token);
    if (session) {
      this._normalizeSession(session);
      this.sessions.set(session.id, session);
      if (session.powerCardState) PowerCardService.importSessionState(session.id, session.powerCardState);
    }
    return session;
  }

  async persistSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('No se puede persistir una sesión inexistente');
    session.powerCardState = PowerCardService.exportSessionState(sessionId);
    await this.persistence.save(session);
  }

  async deletePersistedSession(sessionId) {
    await this.persistence.delete(sessionId);
  }

  async getPersistedSessionCount() {
    await this.initialize();
    return this.persistence.count();
  }

  captureSession(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? JSON.parse(JSON.stringify(session)) : null;
  }

  restoreSession(sessionId, snapshot) {
    if (snapshot) {
      this._normalizeSession(snapshot);
      this.sessions.set(sessionId, snapshot);
      if (snapshot.powerCardState) PowerCardService.importSessionState(sessionId, snapshot.powerCardState);
    } else {
      this.sessions.delete(sessionId);
      PowerCardService.clearSessionData(sessionId);
    }
  }

  _getIdempotencyRecord(session, scope, key) {
    if (!key) return null;
    return session.processedIdempotencyKeys?.[`${scope}:${key}`] || null;
  }

  _commitIdempotency(session, scope, key, payload, result) {
    if (!key) return;
    session.processedIdempotencyKeys = session.processedIdempotencyKeys || {};
    session.processedIdempotencyKeys[`${scope}:${key}`] = {
      payload: JSON.stringify(payload ?? null),
      result,
      committedAt: new Date().toISOString(),
    };
    const entries = Object.entries(session.processedIdempotencyKeys);
    if (entries.length > 200) {
      entries
        .sort((a, b) => String(a[1].committedAt).localeCompare(String(b[1].committedAt)))
        .slice(0, entries.length - 200)
        .forEach(([k]) => delete session.processedIdempotencyKeys[k]);
    }
  }

  _idempotencyGuard(session, scope, key, payload) {
    if (!key) return { hit: false };
    const record = this._getIdempotencyRecord(session, scope, key);
    if (!record) return { hit: false };
    const samePayload = record.payload === JSON.stringify(payload ?? null);
    if (samePayload) return { hit: true, result: record.result };
    return { hit: true, conflict: true };
  }

  _getPlayer(session, playerId) {
    return session.players.find((p) => p.id === playerId) || null;
  }

  _activeAlliances(session) {
    return (session.alliances || []).filter((a) => a.status === 'active' && a.roundsLeft > 0);
  }

  _getPlayerAlliance(session, playerId) {
    return this._activeAlliances(session).find(
      (a) => a.player1Id === playerId || a.player2Id === playerId,
    ) || null;
  }

  _syncDerivedPlayerEffects(session) {
    const activeAlliances = this._activeAlliances(session);
    const activeEffects = (session.activeEffects || []).filter((e) => e.status === 'active');
    const activeDuel = activeEffects.find((e) => e.type === 'DUEL' && e.status === 'active');
    session.players.forEach((player) => {
      player.effects = player.effects || {};
      const freeze = activeEffects.find(
        (e) => e.type === 'FREEZE' && (e.targetPlayerIds || []).includes(player.id),
      );
      const inDuel = Boolean(activeDuel && (activeDuel.targetPlayerIds || []).includes(player.id));
      const frozenByDuel = Boolean(activeDuel && !inDuel);
      player.effects.isFrozen = Boolean(freeze) || frozenByDuel;
      player.effects.frozenRoundsLeft = freeze
        ? Math.max(0, Number(freeze.roundsLeft) || 0)
        : frozenByDuel
          ? Math.max(0, Number(activeDuel.roundsLeft) || 1)
          : 0;
      player.effects.frozenForRound = freeze
        ? freeze.createdAtRound ?? null
        : frozenByDuel
          ? activeDuel.createdAtRound ?? null
          : null;

      const stopBlast = activeEffects.find((e) => e.type === 'STOP_BLAST' && e.status === 'active');
      player.effects.stopBlastActive = Boolean(stopBlast && stopBlast.sourcePlayerId === player.id);

      player.effects.duelActive = inDuel;
      player.effects.duelOpponentId = inDuel
        ? (activeDuel.targetPlayerIds || []).find((id) => id !== player.id) || null
        : null;

      const featuring = activeEffects.find(
        (e) => e.type === 'FEATURING' && e.status === 'active' && e.sourcePlayerId === player.id,
      );
      player.effects.featuringPartnerId = featuring ? featuring.targetPlayerIds?.[0] || null : null;

      player.effects.lossStreak = Math.max(0, Number(player.effects.lossStreak) || 0);
      player.effects.bSideActive = Boolean(player.effects.bSideActive);
      // alliance membership is derived from session.alliances, not stored on player
      player._hasAlliance = activeAlliances.some(
        (a) => a.player1Id === player.id || a.player2Id === player.id,
      );
    });
    session.players.forEach((p) => { delete p._hasAlliance; });
  }

  _getRevealEligibility(session, playerId) {
    this._syncDerivedPlayerEffects(session);
    const player = this._getPlayer(session, playerId);
    if (!player) return { eligible: false, reason: 'PLAYER_NOT_FOUND' };
    if (player.effects.isFrozen) return { eligible: false, reason: 'PLAYER_FROZEN' };

    const stopBlast = (session.activeEffects || []).find((e) => e.type === 'STOP_BLAST' && e.status === 'active');
    if (stopBlast && stopBlast.sourcePlayerId !== playerId) {
      return { eligible: false, reason: 'STOP_BLAST_ACTIVE' };
    }

    const duel = (session.activeEffects || []).find((e) => e.type === 'DUEL' && e.status === 'active');
    if (duel && !(duel.targetPlayerIds || []).includes(playerId)) {
      return { eligible: false, reason: 'DUEL_ACTIVE' };
    }

    return { eligible: true };
  }

  _updateBSideStreaks(session, winnerId, suppressActivation = false) {
    const newlyActivated = [];
    session.players.forEach((player) => {
      player.effects = player.effects || { lossStreak: 0, bSideActive: false };
      if (winnerId && player.id === winnerId) {
        player.effects.lossStreak = 0;
        return;
      }
      const prev = Math.max(0, Number(player.effects.lossStreak) || 0);
      const next = prev + 1;
      player.effects.lossStreak = next;
      // Con HOT_STREAK en la ronda se pospone la activación: el contador sigue
      // subiendo y B-SIDE se activa en el siguiente turno si sigue sin acertar.
      if (next >= BSIDE_LOSS_THRESHOLD && !suppressActivation) {
        // Premio de consolación: +1 fan/punto al activarse, no al hacer comeback.
        // Se reinicia la racha para permitir un nuevo B-SIDE tras otras 4 derrotas.
        player.score += 1;
        newlyActivated.push(player.id);
        player.effects.bSideActive = false;
        player.effects.lossStreak = 0;
      }
    });
    return newlyActivated;
  }

  _advanceRoundState(session) {
    // Called when moving to next round. Decrement freeze/round-based effects, expire alliances, clear round-scoped effects.
    (session.activeEffects || []).forEach((effect) => {
      if (effect.status !== 'active') return;
      if (effect.type === 'FREEZE') {
        effect.roundsLeft = Math.max(0, (Number(effect.roundsLeft) || 0) - 1);
        if (effect.roundsLeft <= 0) effect.status = 'expired';
      }
      if (effect.type === 'STOP_BLAST' || effect.type === 'DUEL') {
        effect.status = 'expired';
      }
      // FEATURING persists until consumed in reveal or explicitly expired; keep active.
    });

    (session.alliances || []).forEach((alliance) => {
      if (alliance.status !== 'active') return;
      alliance.roundsLeft = Math.max(0, (Number(alliance.roundsLeft) || 0) - 1);
      if (alliance.roundsLeft <= 0) alliance.status = 'expired';
    });

    this._syncDerivedPlayerEffects(session);
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎮 CREAR SESIÓN
  // ═══════════════════════════════════════════════════════════════

  createSession(config = {}) {
    const {
      players = [],
      genres = ['ANY'],
      decades = ['ANY'],
      difficulty = 'ANY',
      targetScore = 22,
      timeLimit = 1200,
      powerCardsPerPlayer = 3,
      worldTourRoutes = null,
      playMode,
      backstageInterval = BACKSTAGE_INTERVAL,
    } = config;

    if (!Array.isArray(players) || players.length < 2 || players.length > 8) {
      return { success: false, error: 'Se requieren entre 2 y 8 jugadores' };
    }

    if (!PLAY_MODES.has(playMode)) {
      return { success: false, error: 'playMode inválido' };
    }

    const playerIds = players.map((_, index) => `player_${index + 1}`);
    if (!this._isValidWorldTourRoutes(worldTourRoutes, playerIds)) {
      return { success: false, error: 'Rutas de World Tour inválidas' };
    }

    const sessionId = this._generateSessionId();
    const capabilityToken = crypto.randomBytes(32).toString('hex');

    const playerList = players.map((name, index) => ({
      id: `player_${index + 1}`,
      name: name || `Jugador ${index + 1}`,
      score: 0,
      boardPosition: 0,
      availableTokens: [1, 2, 3],
      powerCards: [],
      stats: {
        correctAnswers: 0,
        wrongAnswers: 0,
        tokensWon: 0,
        tokensLost: 0,
        tokensUsed: [],
        combosCompleted: 0,
        powerCardsUsed: 0,
        totalComboStreak: 0,
      },
      effects: {
        isFrozen: false,
        frozenRoundsLeft: 0,
        frozenForRound: null,
        lossStreak: 0,
        bSideActive: false,
        stopBlastActive: false,
        duelActive: false,
        duelOpponentId: null,
        featuringPartnerId: null,
      },
    }));

    const session = {
      id: sessionId,
      capabilityToken,
      capabilityTokenHash: GameSessionPersistence.hashCapabilityToken(capabilityToken),
      status: 'created',
      createdAt: new Date().toISOString(),
      config: {
        genres,
        decades,
        difficulty,
        targetScore,
        timeLimit,
        powerCardsPerPlayer,
        playMode,
        ...(playMode === 'digital'
          ? {
              backstageInterval:
                Number.isInteger(backstageInterval) && backstageInterval > 0
                  ? backstageInterval
                  : BACKSTAGE_INTERVAL,
            }
          : {}),
      },
      players: playerList,
      worldTourRoutes,
      currentPlayerIndex: 0,
      round: 0,
      usedTrackIds: [],
      currentRound: null,
      timeRemaining: timeLimit,
      startedAt: null,
      history: [],
      alliances: [],
      activeEffects: [],
      doublePlatinumActive: false,
      processedIdempotencyKeys: {},
      ...(playMode === 'digital'
        ? {
            backstageDeck: createDeck(this.backstageRng),
            lastBackstageCard: null,
            backstageCard: null,
          }
        : {}),
      timer: {
        durationMs: Number(timeLimit) * 1000,
        remainingMs: Number(timeLimit) * 1000,
        startedAt: null,
        pausedAt: null,
        isPaused: false,
      },
    };

    this.sessions.set(sessionId, session);
    PowerCardService.clearSessionData(sessionId);

    console.log(`🎮 Sesión creada: ${sessionId}`);
    console.log(`   Jugadores: ${playerList.length}`);
    console.log(`   Tokens por jugador: [1, 2, 3]`);
    console.log(`   ✅ Power Cards System ACTIVO`);

    return {
      success: true,
      session: this._sanitizeSession(session),
      capabilityToken,
    };
  }

  verifyCapability(sessionId, token) {
    const session = this.sessions.get(sessionId);
    if (!session || typeof token !== 'string') return false;
    const expected = Buffer.from(
      session.capabilityTokenHash ||
        GameSessionPersistence.hashCapabilityToken(session.capabilityToken || ''),
      'hex',
    );
    const supplied = Buffer.from(
      GameSessionPersistence.hashCapabilityToken(token),
      'hex',
    );
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
  }

  // ═══════════════════════════════════════════════════════════════
  // ✅ REVELAR RESPUESTA CON INTEGRACIÓN DE POWER CARDS
  // ═══════════════════════════════════════════════════════════════

  revealAnswer(sessionId, winnerId = null, scoreModifiers = {}, options = {}) {
    const session = this.sessions.get(sessionId);
    // HOT_STREAK tiene prioridad: si se detecta en esta ronda, B-SIDE no se
    // activa aquí (se pospone al siguiente turno si el jugador sigue perdiendo).
    let comboDetectedThisRound = false;

    if (!session || !session.currentRound) {
      return { success: false, error: 'No hay ronda activa' };
    }

    const idempotencyKey = options.idempotencyKey || null;
    const idem = this._idempotencyGuard(session, 'reveal', idempotencyKey, { winnerId, scoreModifiers });
    if (idem.hit) {
      if (idem.conflict) return { success: false, error: 'Conflicto de idempotencia en reveal', statusCode: 409 };
      return idem.result;
    }

    if (winnerId && !session.players.some((player) => player.id === winnerId)) {
      return { success: false, error: 'Jugador ganador no pertenece a la sesión' };
    }

    if (winnerId) {
      const eligibility = this._getRevealEligibility(session, winnerId);
      if (!eligibility.eligible) {
        return {
          success: false,
          error: 'El jugador no es elegible para ganar esta ronda',
          reason: eligibility.reason,
          statusCode: 400,
        };
      }
    }

    const modifierKeys = ['alliancePartnerId', 'featuringPartnerId', 'bSidePlayerId'];
    const invalidModifier =
      !scoreModifiers ||
      typeof scoreModifiers !== 'object' ||
      Array.isArray(scoreModifiers) ||
      Object.keys(scoreModifiers).some((key) => !modifierKeys.includes(key)) ||
      Object.values(scoreModifiers).some(
        (playerId) =>
          typeof playerId !== 'string' ||
          !session.players.some((player) => player.id === playerId),
      ) ||
      (scoreModifiers.alliancePartnerId &&
        scoreModifiers.alliancePartnerId === winnerId) ||
      (scoreModifiers.featuringPartnerId &&
        scoreModifiers.featuringPartnerId === winnerId) ||
      (scoreModifiers.bSidePlayerId &&
        scoreModifiers.bSidePlayerId !== winnerId) ||
      (!winnerId && Object.keys(scoreModifiers).length > 0);
    if (invalidModifier) {
      return { success: false, error: 'Ajustes de puntuación inválidos' };
    }

    // Canonicalize modifiers from server state; reject mismatches when client sends them.
    const canonicalModifiers = {};
    if (winnerId) {
      const alliance = this._getPlayerAlliance(session, winnerId);
      if (alliance) {
        canonicalModifiers.alliancePartnerId =
          alliance.player1Id === winnerId ? alliance.player2Id : alliance.player1Id;
      }
      const featuring = (session.activeEffects || []).find(
        (e) => e.type === 'FEATURING' && e.status === 'active' &&
          (e.sourcePlayerId === winnerId || (e.targetPlayerIds || []).includes(winnerId)),
      );
      if (featuring) {
        canonicalModifiers.featuringPartnerId =
          featuring.sourcePlayerId === winnerId ? featuring.targetPlayerIds[0] : featuring.sourcePlayerId;
      }
      const winner = this._getPlayer(session, winnerId);
      if (winner?.effects?.bSideActive) {
        canonicalModifiers.bSidePlayerId = winnerId;
      }
    }

    const legacyModifiers = {};
    for (const key of modifierKeys) {
      if (scoreModifiers[key] && canonicalModifiers[key] && scoreModifiers[key] !== canonicalModifiers[key]) {
        return { success: false, error: `Modificador ${key} no coincide con el estado canónico`, statusCode: 400 };
      }
      if (scoreModifiers[key] && !canonicalModifiers[key]) {
        legacyModifiers[key] = scoreModifiers[key]; // backward compat
      }
    }
    scoreModifiers = { ...canonicalModifiers, ...legacyModifiers };

    const round = session.currentRound;
    const answer = round._answer;

    const results = {
      correctAnswer: answer.correct,
      trackInfo: {
        title: answer.trackTitle,
        artist: answer.trackArtist,
      },
      winner: null,
      pointsAwarded: 0,
      basePoints: round.question.points,
      tokenBonus: 0,
      powerCardEffect: null, // ✅ NUEVA PROP
      comboStatus: null, // ✅ NUEVA PROP
      backstage: null,
    };

    console.log(`\n═══ REVEAL ANSWER ═══`);
    console.log(`Winner: ${winnerId || 'none'}`);
    console.log(`Base points: ${round.question.points}`);

    // ═══════════════════════════════════════════════════════════════
    // PROCESAR GANADOR
    // ═══════════════════════════════════════════════════════════════

    if (winnerId) {
      const winner = session.players.find((p) => p.id === winnerId);

      if (winner) {
        const basePoints = round.question.points;
        const bet = round.bets[winnerId];
        const tokenBonus = bet ? bet.tokenValue : 0;

        // Paso 1: Calcular puntos base con token
        let totalPoints = basePoints + tokenBonus;

        console.log(`✅ ${winner.name} ACIERTA:`);
        console.log(`   Base: ${basePoints} pts`);
        console.log(`   Token: +${tokenBonus} pts`);

        // ✅ CORREGIDO: Registrar token ganado
        if (tokenBonus > 0) {
          winner.stats.tokensWon += tokenBonus;
        }

        // ═══════════════════════════════════════════════════════════
        // Paso 2: APLICAR EFECTO DE POWER CARD
        // ═══════════════════════════════════════════════════════════

        const powerCardEffect = PowerCardService.applyActiveCardEffect(
          winnerId,
          totalPoints,
          sessionId,
        );

        if (powerCardEffect.cardUsed) {
          totalPoints = powerCardEffect.finalPoints;
          winner.stats.powerCardsUsed++;

          results.powerCardEffect = {
            cardId: powerCardEffect.cardUsed.id,
            cardName: powerCardEffect.cardUsed.name,
            emoji: powerCardEffect.cardUsed.emoji,
            multiplier: powerCardEffect.multiplier,
            basePointsBeforeCard: totalPoints / powerCardEffect.multiplier,
            finalPointsAfterCard: totalPoints,
          };

          console.log(
            `   💥 Power Card ${powerCardEffect.cardUsed.name}: x${powerCardEffect.multiplier}`
          );
          console.log(`   → ${totalPoints} pts (con poder)`);
        } else {
          console.log(`   Total: ${totalPoints} pts`);
        }

        // ═══════════════════════════════════════════════════════════
        // Paso 2b: DOUBLE PLATINUM (flag de ronda, aplica a cualquiera)
        // ═══════════════════════════════════════════════════════════

        if (session.doublePlatinumActive) {
          const beforeDP = totalPoints;
          totalPoints = totalPoints * 2;
          session.doublePlatinumActive = false;
          console.log(`   💿 DOUBLE PLATINUM: ${beforeDP} → ${totalPoints} pts`);

          // Si no hubo power card personal, reportar DP como el efecto
          if (!results.powerCardEffect) {
            results.powerCardEffect = {
              cardId: 'power_double_platinum_001',
              cardName: 'DOUBLE PLATINUM',
              emoji: '💿',
              multiplier: 2,
              basePointsBeforeCard: beforeDP,
              finalPointsAfterCard: totalPoints,
            };
          }
        }

        // ═══════════════════════════════════════════════════════════
        // Paso 3: REGISTRAR RESPUESTA Y DETECTAR COMBOS
        // ═══════════════════════════════════════════════════════════

        console.log(`\n🔍 DEBUG COMBO - Antes de procesar:`);
        console.log(`   Player: ${winnerId}`);
        console.log(`   Round: ${round.roundNumber}`);
        console.log(`   Correct answers antes: ${winner.stats.correctAnswers}`);

        const comboResult = PowerCardService.processPlayerAnswer(
          winnerId,
          true, // Es correcta
          {
            gameSessionId: sessionId,
            roundNumber: round.roundNumber,
            playMode: session.config?.playMode || 'physical',
          }
        );

        console.log(`🔍 DEBUG COMBO - Resultado:`);
        console.log(`   Current Streak: ${comboResult.currentStreak}`);
        console.log(`   Combo Detected: ${comboResult.comboDetected}`);
        console.log(`   Combo Type: ${comboResult.comboType}`);

        // Actualizar stats de combo
        if (comboResult.comboDetected) {
          comboDetectedThisRound = true;
          winner.stats.combosCompleted++;

          results.comboStatus = {
            type: comboResult.comboType,
            message: comboResult.comboMessage,
            cardAwarded: comboResult.cardAwarded,
          };

          console.log(`   🔥 COMBO ACTIVADO: ${comboResult.comboMessage}`);
          console.log(`   🔥 Correct answers TOTAL: ${winner.stats.correctAnswers + 1}`);
        }

        // Actualizar streak en stats
        winner.stats.totalComboStreak = comboResult.currentStreak;

        // Sumar puntos finales
        winner.score += totalPoints;
        winner.stats.correctAnswers++;

        // Limpiar cartas activas
        PowerCardService.clearActiveCards(winnerId, sessionId);

        results.winner = {
          id: winner.id,
          name: winner.name,
          newScore: winner.score,
        };
        results.pointsAwarded = totalPoints;
        results.tokenBonus = tokenBonus;

        // ═══════════════════════════════════════════════════════════
        // ⚠️ IMPORTANTE: Resetear streak de los jugadores que NO ganaron
        // ═══════════════════════════════════════════════════════════
        console.log(`\n🔄 Reseteando streak de jugadores que NO ganaron:`);
        session.players.forEach((player) => {
          if (player.id !== winnerId) {
            console.log(
              `   ❌ ${player.name} (${player.id}) no ganó esta ronda - reseteando streak`
            );
            PowerCardService.processPlayerAnswer(
              player.id,
              false, // Incorrecto
              { gameSessionId: sessionId, roundNumber: round.roundNumber }
            );

            // ✅ CORREGIDO: Registrar tokens perdidos
            const playerBet = round.bets[player.id];
            if (playerBet && playerBet.tokenValue > 0) {
              player.stats.tokensLost += playerBet.tokenValue;
            }
          }
        });
      }
    } else {
      // ═══════════════════════════════════════════════════════════
      // NADIE ACERTÓ - Registrar respuestas incorrectas para todos
      // ═══════════════════════════════════════════════════════════

      console.log(`😅 Nadie acertó`);

      session.players.forEach((player) => {
        PowerCardService.processPlayerAnswer(
          player.id,
          false, // Incorrecto
          { gameSessionId: sessionId, roundNumber: round.roundNumber }
        );

        // ✅ CORREGIDO: Registrar tokens perdidos cuando nadie acierta
        const playerBet = round.bets[player.id];
        if (playerBet && playerBet.tokenValue > 0) {
          player.stats.tokensLost += playerBet.tokenValue;
        }
      });
    }

    // Log estado de jugadores
    console.log(`\n📊 Estado:`);
    session.players.forEach((p) => {
      const bet = round.bets[p.id];
      const tokenUsed = bet ? `(usó +${bet.tokenValue})` : '';
      const combos = p.stats.combosCompleted > 0 ? ` | ${p.stats.combosCompleted} combos` : '';
      console.log(
        `   ${p.name}: ${p.score} pts, tokens: [${p.availableTokens.join(', ')}] ${tokenUsed}${combos}`
      );
    });

    // Historial
    session.history.push({
      round: round.roundNumber,
      trackId: round.trackId,
      questionType: round.question.type,
      winner: winnerId,
      pointsAwarded: results.pointsAwarded,
      comboDetected: results.comboStatus ? results.comboStatus.type : null,
      powerCardUsed: results.powerCardEffect ? results.powerCardEffect.cardName : null,
      timestamp: new Date().toISOString(),
    });

    session.currentRound = null;

    // Apply every round modifier after base awards and before checking the
    // target score. Validation above ensures no partial settlement is possible.
    const settledModifiers = [];
    if (winnerId && scoreModifiers.alliancePartnerId) {
      const share = Math.floor(results.pointsAwarded / 2);
      const winner = session.players.find((player) => player.id === winnerId);
      const partner = session.players.find(
        (player) => player.id === scoreModifiers.alliancePartnerId,
      );
      winner.score = Math.max(0, winner.score - share);
      partner.score += share;
      settledModifiers.push({ type: 'ALLIANCE', playerId: partner.id, points: share });
    }

    if (winnerId && scoreModifiers.featuringPartnerId) {
      const partner = session.players.find(
        (player) => player.id === scoreModifiers.featuringPartnerId,
      );
      partner.score += results.pointsAwarded;
      settledModifiers.push({
        type: 'FEATURING',
        playerId: partner.id,
        points: results.pointsAwarded,
      });
    }

    // B-SIDE ya no otorga puntos en el comeback: el +1 se da al activarse en
    // _updateBSideStreaks. Se ignora bSidePlayerId aunque el cliente lo envíe.

    // Consume featuring effect if used
    if (winnerId && canonicalModifiers.featuringPartnerId) {
      const featuring = (session.activeEffects || []).find(
        (e) => e.type === 'FEATURING' && e.status === 'active' &&
          (e.sourcePlayerId === winnerId || (e.targetPlayerIds || []).includes(winnerId)),
      );
      if (featuring) featuring.status = 'consumed';
    }

    // Update B-SIDE streaks for all players based on round outcome
    const newlyActivatedBSide = this._updateBSideStreaks(
      session,
      winnerId,
      comboDetectedThisRound,
    );

    if (winnerId && session.worldTourRoutes) {
      const winner = session.players.find((player) => player.id === winnerId);
      winner.boardPosition = Math.min(winner.boardPosition + 1, 21);
    }

    if (results.winner) {
      const settledWinner = session.players.find((player) => player.id === results.winner.id);
      results.winner.newScore = settledWinner.score;
    }

    results.scoreModifiers = settledModifiers;
    results.bSideActivatedPlayerIds = newlyActivatedBSide;
    this._syncDerivedPlayerEffects(session);

    // Verificar ganador del juego
    const scoreToWin = session.config?.targetScore ?? 22;
    const gameWinner = this._checkWinner(session);
    if (gameWinner && gameWinner.gameOver) {
      session.status = 'finished';
      results.gameOver = true;
      results.gameWinner = gameWinner;
      results.isCandidate = false;
      console.log(`🏆 GAME OVER - ${gameWinner.name}`);
    } else {
      // Near-win warning (1 point away from target)
      const candidate = session.players.find((p) => p.score === scoreToWin - 1);
      if (candidate) {
        results.isCandidate = true;
        results.candidatePlayerId = candidate.id;
        results.candidatePlayerName = candidate.name;
      }
    }

    // Streaming: landing on a backstage tile draws the session card. The draw
    // belongs to this persisted mutation, so a failed snapshot rolls it back.
    if (winnerId && session.config?.playMode === 'digital' && !results.gameOver) {
      const winner = this._getPlayer(session, winnerId);
      const interval = session.config.backstageInterval || BACKSTAGE_INTERVAL;
      if (winner && isBackstagePosition(winner.boardPosition, interval)) {
        const { card, deck } = drawCard(
          session.backstageDeck,
          session.lastBackstageCard,
          this.backstageRng,
        );
        session.backstageDeck = deck;
        session.lastBackstageCard = card;
        const route = session.worldTourRoutes?.[winnerId];
        const cityId = Array.isArray(route)
          ? route[winner.boardPosition]?.cityId || null
          : null;
        session.backstageCard = {
          playerId: winnerId,
          cardType: card,
          position: winner.boardPosition,
          cityId,
        };
        results.backstage = session.backstageCard;
        console.log(
          `🎟️ BACKSTAGE ${winner.name} @ ${winner.boardPosition}: ${card}`,
        );
      }
    }

    console.log(`═══════════════════════\n`);

    const response = {
      success: true,
      session: this._sanitizeSession(session),
      results,
      players: session.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        boardPosition: p.boardPosition,
        tokens: p.availableTokens.length,
        availableTokens: [...p.availableTokens],
        powerCards: p.powerCards || [],
        stats: {
          correctAnswers: p.stats.correctAnswers || 0,
          wrongAnswers: p.stats.wrongAnswers || 0,
          tokensWon: p.stats.tokensWon || 0,
          tokensLost: p.stats.tokensLost || 0,
          tokensUsed: p.stats.tokensUsed || [],
          combosCompleted: p.stats.combosCompleted || 0,
          powerCardsUsed: p.stats.powerCardsUsed || 0,
          totalComboStreak: p.stats.totalComboStreak || 0,
        },
        effects: p.effects || {},
      })),
    };
    this._commitIdempotency(session, 'reveal', idempotencyKey, { winnerId, scoreModifiers: canonicalModifiers }, response);
    return response;
  }

  /**
   * Aplica un delta de puntos a un jugador en la sesión.
   * Usado por Reaction Cards (frontend-only) para mantener el backend sincronizado.
   *
   * @param {string} sessionId
   * @param {string} playerId  - ID del backend (player_1, player_2, etc.)
   * @param {number} delta     - positivo o negativo
   * @param {string} reason    - para logging (MANAGEMENT_FEE, BAD_REVIEW, etc.)
   */
  applyScoreDelta(sessionId, playerId, delta, reason = 'REACTION_CARD') {
    const result = this.applyScoreAdjustments(sessionId, [
      { playerId, delta, reason },
    ]);
    if (!result.success) return result;
    return {
      ...result,
      player: {
        ...result.adjustments[0],
        id: playerId,
      },
    };
  }

  applyScoreAdjustments(sessionId, adjustments) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Sesión no encontrada' };

    if (
      !Array.isArray(adjustments) ||
      adjustments.length === 0 ||
      adjustments.length > 16 ||
      adjustments.some(
        (adjustment) =>
          !adjustment ||
          !session.players.some((player) => player.id === adjustment.playerId) ||
          typeof adjustment.delta !== 'number' ||
          !Number.isFinite(adjustment.delta) ||
          typeof adjustment.reason !== 'string' ||
          adjustment.reason.length === 0 ||
          adjustment.reason.length > 64,
      )
    ) {
      return { success: false, error: 'Ajustes de puntuación inválidos' };
    }

    const settledAdjustments = adjustments.map((adjustment) => {
      const player = session.players.find((item) => item.id === adjustment.playerId);
      const previousScore = player.score;
      player.score = Math.max(0, player.score + adjustment.delta);
      console.log(
        `🎴 ${adjustment.reason}: ${player.name} ${adjustment.delta > 0 ? '+' : ''}${adjustment.delta} (${previousScore} → ${player.score})`,
      );
      return {
        playerId: player.id,
        previousScore,
        newScore: player.score,
        delta: adjustment.delta,
        reason: adjustment.reason,
      };
    });

    return {
      success: true,
      adjustments: settledAdjustments,
      players: session.players.map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        boardPosition: player.boardPosition,
        availableTokens: [...player.availableTokens],
        stats: { ...player.stats },
      })),
    };
  }

  _stablePick(ids, seedStr) {
    if (!ids || ids.length === 0) return null;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) hash = ((hash << 5) - hash) + seedStr.charCodeAt(i) | 0;
    const idx = Math.abs(hash) % ids.length;
    return ids[idx];
  }

  _pushEvent(session, event) {
    session.history = session.history || [];
    session.history.push({ ...event, timestamp: new Date().toISOString() });
  }

  applyReactionCard(sessionId, command = {}, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Sesión no encontrada', statusCode: 404 };
    if (session.status !== 'playing') return { success: false, error: 'La sesión no está en juego', statusCode: 400 };

    const { sourcePlayerId, cardType, targetPlayerId = null, payload = {} } = command || {};
    const idempotencyKey = options.idempotencyKey || command.idempotencyKey || null;
    const idemPayload = { sourcePlayerId, cardType, targetPlayerId, payload };
    const idem = this._idempotencyGuard(session, 'reaction', idempotencyKey, idemPayload);
    if (idem.hit) {
      if (idem.conflict) return { success: false, error: 'Conflicto de idempotencia en reaction card', statusCode: 409 };
      return idem.result;
    }

    const source = this._getPlayer(session, sourcePlayerId);
    if (!source) return { success: false, error: 'Jugador origen no encontrado', statusCode: 400 };
    if (targetPlayerId && !this._getPlayer(session, targetPlayerId)) {
      return { success: false, error: 'Jugador objetivo no encontrado', statusCode: 400 };
    }

    // Algunas cartas necesitan otro jugador además del portador. Con menos de
    // 3 jugadores no hay compañero válido: rechazar antes de mutar el estado.
    const PARTNER_REQUIRED_CARDS = ['FEATURING', 'DUEL', 'ALLIANCE'];
    if (PARTNER_REQUIRED_CARDS.includes(cardType) && session.players.length < 3) {
      return {
        success: false,
        error: 'Esta carta requiere al menos 3 jugadores',
        statusCode: 400,
        code: 'INSUFFICIENT_PLAYERS',
      };
    }

    const isDigital = session.config?.playMode === 'digital';
    if (isDigital) {
      const pending = session.backstageCard;
      if (
        !pending ||
        pending.playerId !== sourcePlayerId ||
        pending.cardType !== cardType
      ) {
        return {
          success: false,
          error: 'No hay carta de backstage para ese jugador',
          statusCode: 400,
        };
      }
    }

    const round = session.round || 0;
    const effectId = `eff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let event = { type: 'REACTION_CARD', cardType, sourcePlayerId, targetPlayerId, round };
    let resultData = {};

    const ensureNoDuplicateActive = (type, predicate) => {
      return (session.activeEffects || []).some((e) => e.status === 'active' && e.type === type && (!predicate || predicate(e)));
    };

    switch (cardType) {
      case 'MUTE': {
        if (!targetPlayerId) return { success: false, error: 'targetPlayerId requerido', statusCode: 400 };
        const existing = (session.activeEffects || []).find((e) => e.status === 'active' && e.type === 'FREEZE' && e.sourceCard === 'MUTE' && (e.targetPlayerIds || []).includes(targetPlayerId));
        if (existing) {
          existing.status = 'expired';
          resultData = { action: 'unfrozen', targetPlayerId };
        } else {
          session.activeEffects.push({
            id: effectId, type: 'FREEZE', sourceCard: 'MUTE', sourcePlayerId,
            targetPlayerIds: [targetPlayerId], roundsLeft: 1, createdAtRound: round, status: 'active',
          });
          resultData = { action: 'frozen', targetPlayerId, roundsLeft: 1 };
        }
        break;
      }
      case 'ARTIST_HOLD': {
        const maxScore = Math.max(...session.players.map((p) => p.score));
        const leaders = session.players.filter((p) => p.score === maxScore).map((p) => p.id);
        if (leaders.length === 0) return { success: false, error: 'No hay líderes para congelar', statusCode: 400 };
        session.activeEffects.push({
          id: effectId, type: 'FREEZE', sourceCard: 'ARTIST_HOLD', sourcePlayerId,
          targetPlayerIds: leaders, roundsLeft: 2, createdAtRound: round, status: 'active',
        });
        resultData = { targetPlayerIds: leaders, roundsLeft: 2 };
        break;
      }
      case 'STOP_BLAST': {
        if (ensureNoDuplicateActive('STOP_BLAST')) return { success: false, error: 'STOP_BLAST ya está activo', statusCode: 400 };
        session.activeEffects.push({
          id: effectId, type: 'STOP_BLAST', sourceCard: 'STOP_BLAST', sourcePlayerId,
          targetPlayerIds: [sourcePlayerId], roundsLeft: 1, createdAtRound: round, status: 'active',
        });
        resultData = { holderId: sourcePlayerId };
        break;
      }
      case 'DUEL': {
        if (!targetPlayerId) return { success: false, error: 'targetPlayerId requerido', statusCode: 400 };
        if (targetPlayerId === sourcePlayerId) return { success: false, error: 'No puedes retarte a ti mismo', statusCode: 400 };
        if (ensureNoDuplicateActive('DUEL')) return { success: false, error: 'DUEL ya está activo', statusCode: 400 };
        session.activeEffects.push({
          id: effectId, type: 'DUEL', sourceCard: 'DUEL', sourcePlayerId,
          targetPlayerIds: [sourcePlayerId, targetPlayerId], roundsLeft: 1, createdAtRound: round, status: 'active',
        });
        resultData = { challengerId: sourcePlayerId, opponentId: targetPlayerId };
        break;
      }
      case 'FEATURING': {
        if (!targetPlayerId) return { success: false, error: 'targetPlayerId requerido', statusCode: 400 };
        if (targetPlayerId === sourcePlayerId) return { success: false, error: 'No puedes hacer featuring contigo mismo', statusCode: 400 };
        const existing = (session.activeEffects || []).find((e) => e.status === 'active' && e.type === 'FEATURING' && e.sourcePlayerId === sourcePlayerId);
        if (existing) return { success: false, error: 'Ya tienes un FEATURING activo', statusCode: 400 };
        session.activeEffects.push({
          id: effectId, type: 'FEATURING', sourceCard: 'FEATURING', sourcePlayerId,
          targetPlayerIds: [targetPlayerId], roundsLeft: 99, createdAtRound: round, status: 'active',
        });
        resultData = { featuringPlayerId: sourcePlayerId, partnerId: targetPlayerId };
        break;
      }
      case 'ALLIANCE': {
        const p2 = targetPlayerId;
        if (!p2) return { success: false, error: 'targetPlayerId requerido', statusCode: 400 };
        if (p2 === sourcePlayerId) return { success: false, error: 'No puedes aliarte contigo mismo', statusCode: 400 };
        const p1Has = this._getPlayerAlliance(session, sourcePlayerId);
        const p2Has = this._getPlayerAlliance(session, p2);
        if (p1Has || p2Has) return { success: false, error: 'Uno de los jugadores ya tiene alianza activa', statusCode: 400 };
        session.alliances.push({
          id: `all_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          player1Id: sourcePlayerId, player2Id: p2, roundsLeft: 3, createdAtRound: round, status: 'active',
        });
        resultData = { player1Id: sourcePlayerId, player2Id: p2, roundsLeft: 3 };
        break;
      }
      case 'ROYALTIES': {
        const maxScore = Math.max(...session.players.map((p) => p.score));
        const leaders = session.players.filter((p) => p.score === maxScore && p.id !== sourcePlayerId).map((p) => p.id);
        if (leaders.length === 0) return { success: false, error: 'No hay líder válido para ROYALTIES', statusCode: 400 };
        const leaderId = this._stablePick(leaders, `${session.id}:${round}:ROYALTIES:${sourcePlayerId}`);
        const leader = this._getPlayer(session, leaderId);
        leader.score = Math.max(0, leader.score - 1);
        source.score += 1;
        resultData = { leaderId, holderId: sourcePlayerId, amount: 1, tiedLeaderIds: leaders };
        break;
      }
      case 'COPYRIGHTS': {
        if (!targetPlayerId) return { success: false, error: 'targetPlayerId requerido', statusCode: 400 };
        const points = Math.max(0, Number(payload.lastAwardedPoints) || 0);
        const deduction = Math.floor(points / 2);
        if (deduction <= 0) return { success: false, error: 'No hay puntos para deducir', statusCode: 400 };
        const target = this._getPlayer(session, targetPlayerId);
        target.score = Math.max(0, target.score - deduction);
        resultData = { targetPlayerId, deduction, sourcePoints: points };
        break;
      }
      case 'SOLD_OUT': {
        source.score += 1;
        resultData = { holderId: sourcePlayerId, delta: 1 };
        break;
      }
      case 'BAD_REVIEW': {
        if (!targetPlayerId) return { success: false, error: 'targetPlayerId requerido', statusCode: 400 };
        const target = this._getPlayer(session, targetPlayerId);
        target.score = Math.max(0, target.score - 1);
        resultData = { targetPlayerId, delta: -1 };
        break;
      }
      case 'MANAGEMENT_FEE': {
        if (!targetPlayerId) return { success: false, error: 'targetPlayerId requerido', statusCode: 400 };
        const target = this._getPlayer(session, targetPlayerId);
        target.score = Math.max(0, target.score - 1);
        resultData = { targetPlayerId, delta: -1 };
        break;
      }
      case 'CHARITY_SHOW': {
        const maxScore = Math.max(...session.players.map((p) => p.score));
        const leaderIds = session.players.filter((p) => p.score === maxScore).map((p) => p.id);
        const leaderId = this._stablePick(leaderIds, `${session.id}:${round}:CHARITY_LEADER:${sourcePlayerId}`);
        const leader = this._getPlayer(session, leaderId);
        if (!leader || leader.score <= 0) return { success: false, error: 'No hay líder con puntos para donar', statusCode: 400 };
        const minScore = Math.min(...session.players.map((p) => p.score));
        const recipients = session.players.filter((p) => p.score === minScore && p.id !== leaderId).map((p) => p.id);
        if (recipients.length === 0) return { success: false, error: 'No hay destinatario válido', statusCode: 400 };
        const recipientId = this._stablePick(recipients, `${session.id}:${round}:CHARITY_RECIPIENT:${sourcePlayerId}`);
        const recipient = this._getPlayer(session, recipientId);
        leader.score = Math.max(0, leader.score - 1);
        recipient.score += 1;
        resultData = { leaderId, leaderName: leader.name, recipientId, recipientName: recipient.name, tiedLeaders: leaderIds.length, tiedRecipients: recipients.length };
        break;
      }
      default:
        return { success: false, error: `Reaction Card no soportada: ${cardType}`, statusCode: 400 };
    }

    this._syncDerivedPlayerEffects(session);
    if (isDigital) session.backstageCard = null;
    event = { ...event, ...resultData, effectId };
    this._pushEvent(session, event);

    const response = {
      success: true,
      event,
      session: this._sanitizeSession(session),
      players: session.players.map((p) => ({
        id: p.id, name: p.name, score: p.score, boardPosition: p.boardPosition,
        availableTokens: [...p.availableTokens], stats: { ...p.stats }, effects: { ...p.effects },
      })),
      activeEffects: session.activeEffects,
      alliances: session.alliances,
    };
    this._commitIdempotency(session, 'reaction', idempotencyKey, idemPayload, response);
    return response;
  }

  discardBackstageCard(sessionId, playerId = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Sesión no encontrada', statusCode: 404 };
    }
    const pending = session.backstageCard;
    if (!pending) {
      return {
        success: true,
        discarded: false,
        session: this._sanitizeSession(session),
      };
    }
    if (playerId && pending.playerId !== playerId) {
      return {
        success: false,
        error: 'No hay carta de backstage para ese jugador',
        statusCode: 400,
      };
    }
    session.backstageCard = null;
    return {
      success: true,
      discarded: true,
      session: this._sanitizeSession(session),
    };
  }

  dissolveAlliance(sessionId, allianceId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Sesión no encontrada', statusCode: 404 };
    const alliance = (session.alliances || []).find((a) => a.id === allianceId);
    if (!alliance) return { success: false, error: 'Alianza no encontrada', statusCode: 404 };
    alliance.status = 'expired';
    alliance.roundsLeft = 0;
    this._syncDerivedPlayerEffects(session);
    return {
      success: true,
      session: this._sanitizeSession(session),
      alliances: session.alliances,
      players: session.players.map((p) => ({ id: p.id, name: p.name, score: p.score, boardPosition: p.boardPosition, availableTokens: [...p.availableTokens], stats: { ...p.stats }, effects: { ...p.effects } })),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // ⚡ MÉTODOS HELPER PARA POWER CARDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtener estado de combo de un jugador en sesión
   */
  getPlayerComboStatus(sessionId, playerId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    const comboStatus = PowerCardService.getComboStatus(playerId, sessionId);
    const player = session.players.find((p) => p.id === playerId);

    return {
      success: true,
      comboStatus,
      playerStats: player
        ? {
            name: player.name,
            score: player.score,
            combosCompleted: player.stats.combosCompleted,
            powerCardsUsed: player.stats.powerCardsUsed,
          }
        : null,
    };
  }

  /**
   * Obtener inventario de cartas del jugador
   */
  getPlayerPowerCards(playerId) {
    const inventory = PowerCardService.getPlayerInventory(playerId);

    return {
      success: true,
      playerId,
      inventory,
      totalCards: Object.values(inventory).reduce((a, b) => a + b, 0),
    };
  }

  /**
   * Activar power card (llamado desde frontend)
   */
  activatePlayerPowerCard(sessionId, playerId, cardId) {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== 'playing') {
      return { success: false, error: 'Sesión no activa' };
    }

    const result = PowerCardService.activatePowerCard(playerId, cardId, sessionId);

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTODOS ORIGINALES (sin cambios)
  // ═══════════════════════════════════════════════════════════════

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
      session: this._sanitizeSession(session),
    };
  }

  async nextRound(sessionId, forcedQuestionType = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    if (session.status === 'finished') {
      return {
        success: true,
        gameOver: true,
        winner: this._checkWinner(session),
        session: this._sanitizeSession(session),
      };
    }

    if (session.status !== 'playing') {
      return { success: false, error: 'El juego no está en curso' };
    }

    if (session.currentRound) {
      return {
        success: true,
        round: {
          number: session.currentRound.roundNumber,
          track: session.currentRound.track,
          question: session.currentRound.question,
          gameMasterAnswer: {
            correct: session.currentRound._answer.correct,
            trackTitle: session.currentRound._answer.trackTitle,
            trackArtist: session.currentRound._answer.trackArtist,
            acceptableAnswers:
              session.currentRound._answer.acceptableAnswers || [],
          },
        },
      };
    }

    if (session.config?.playMode === 'digital') {
      session.backstageCard = null;
    }

    const winner = this._checkWinner(session);
    if (winner) {
      session.status = 'finished';
      return {
        success: true,
        gameOver: true,
        winner,
        session: this._sanitizeSession(session),
      };
    }

    if (session.round > 0) {
      this._advanceRoundState(session);
    }
    session.round++;

    const filters = {
      genre: this._getRandomFromArray(session.config.genres),
      decade: this._getRandomFromArray(session.config.decades),
      difficulty: session.config.difficulty,
    };

    // 🔄 Intentar hasta MAX_AUDIO_RETRIES veces para encontrar un track con audio
    const MAX_AUDIO_RETRIES = 3;
    let track = null;
    let audioUrl = null;
    let audioSource = 'deezer';

    for (let attempt = 1; attempt <= MAX_AUDIO_RETRIES; attempt++) {
      const candidate = await this.trackService.getRandomTrack({ ...filters, sessionId });

      if (!candidate) {
        break; // No quedan tracks
      }

      let candidateAudioUrl = candidate.previewUrl || null;
      let candidateAudioSource = candidate.audioSource || 'deezer';

      if (!candidateAudioUrl) {
        try {
          console.log(
            `🎵 [${attempt}/${MAX_AUDIO_RETRIES}] Buscando audio: "${candidate.title}" - ${candidate.artist}`
          );
          const deezerResult = await DeezerService.searchTrack(candidate.title, candidate.artist);
          if (deezerResult && deezerResult.previewUrl) {
            candidateAudioUrl = deezerResult.previewUrl;
            candidateAudioSource = 'deezer';
            console.log(`✅ Audio encontrado en intento ${attempt}`);
          }
        } catch (error) {
          console.error(`❌ Error Deezer (intento ${attempt}):`, error.message);
        }
      }

      track = candidate;
      audioUrl = candidateAudioUrl;
      audioSource = candidateAudioSource;

      if (audioUrl) {
        // ✅ Track con audio encontrado
        break;
      }

      console.warn(
        `⚠️ Intento ${attempt}: sin audio para "${candidate.title}", probando otro track...`
      );
    }

    if (!track) {
      return { success: false, error: 'No hay tracks disponibles' };
    }

    if (!audioUrl) {
      console.warn(
        `⚠️ No se encontró audio después de ${MAX_AUDIO_RETRIES} intentos — continuando sin audio`
      );
    }

    console.log(
      `🎵 Track: "${track.title}" - ${track.artist} (${audioUrl ? audioSource : 'sin audio'})`
    );

    const question = this.questionService.generateQuestion(track, forcedQuestionType);

    session.currentRound = {
      roundNumber: session.round,
      trackId: track.id,
      track: {
        id: track.id,
        genre: track.genre,
        decade: track.decade,
        audioUrl: audioUrl,
        audioSource: audioSource,
      },
      question: {
        type: question.type,
        text: question.question,
        icon: question.icon,
        points: question.points,
        hints: question.hints,
        isChallenge: question.isChallenge || false,
      },
      _answer: {
        correct: question.answer,
        acceptableAnswers: question.acceptableAnswers,
        trackTitle: track.title,
        trackArtist: track.artist,
      },
      bets: {},
      startedAt: new Date().toISOString(),
      status: 'playing',
    };

    session.usedTrackIds.push(track.id);

    console.log(`🎵 Ronda ${session.round}: ${track.title}`);
    console.log(`   Pregunta: ${question.type} (${question.points} pts base)`);

    return {
      success: true,
      round: {
        number: session.round,
        track: session.currentRound.track,
        question: session.currentRound.question,
        gameMasterAnswer: {
          correct: session.currentRound._answer?.correct,
          trackTitle: session.currentRound._answer?.trackTitle,
          trackArtist: session.currentRound._answer?.trackArtist,
          acceptableAnswers: session.currentRound._answer?.acceptableAnswers || [],
        },
      },
    };
  }

  placeBet(sessionId, playerId, tokenValue) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.currentRound) {
      return { success: false, error: 'No hay ronda activa' };
    }

    const player = session.players.find((p) => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    if (session.currentRound.bets[playerId]) {
      return { success: false, error: 'El jugador ya apostó en esta ronda' };
    }

    if (!Number.isInteger(tokenValue)) {
      return { success: false, error: 'El valor de apuesta debe ser un token válido' };
    }

    if (!player.availableTokens.includes(tokenValue)) {
      console.log(`❌ Token +${tokenValue} no disponible para ${player.name}`);
      console.log(`   Tokens disponibles: [${player.availableTokens.join(', ')}]`);
      return {
        success: false,
        error: `Token +${tokenValue} ya fue usado`,
        availableTokens: player.availableTokens,
      };
    }

    console.log(`🪙 ${player.name} usa token +${tokenValue}`);
    console.log(`   Tokens antes: [${player.availableTokens.join(', ')}]`);

    player.availableTokens = player.availableTokens.filter((t) => t !== tokenValue);
    player.stats.tokensUsed.push(tokenValue);

    console.log(`   Tokens después: [${player.availableTokens.join(', ')}]`);

    session.currentRound.bets[playerId] = {
      tokenValue: tokenValue,
      usedAt: new Date().toISOString(),
    };

    return {
      success: true,
      bet: {
        tokens: tokenValue, // ✅ CORREGIDO: nombre correcto para frontend
        multiplier: tokenValue,
      },
      playerTokens: player.availableTokens.length, // ✅ CORREGIDO: devolver número, no array
    };
  }

  usePowerCard(sessionId, playerId, cardId, targetPlayerId = null) {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== 'playing') {
      return { success: false, error: 'Sesión no activa' };
    }

    const player = session.players.find((p) => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    let card;
    try {
      card = PowerCardService.getPowerCardById(cardId);
    } catch (error) {
      return { success: false, error: 'Power Card no encontrada' };
    }

    const inventory = PowerCardService.getPlayerInventory(playerId, sessionId);
    if (!inventory[cardId] || inventory[cardId] < 1) {
      return { success: false, error: 'El jugador no tiene esta Power Card' };
    }

    console.log(`⚡ ${player.name} usa: ${card.type}`);

    if (card.type === 'festival') {
      PowerCardService.removeCardFromInventory(playerId, cardId, sessionId);
      session.players.forEach((p) => {
        p.score += 1;
      });
      const affected = session.players.map((p) => ({ id: p.id, name: p.name, score: p.score }));
      console.log(`🎪 FESTIVAL: +1 a todos (${session.players.length} jugadores)`);
      return {
        success: true,
        cardId,
        cardType: card.type,
        message: `🎪 ¡Festival! Todos los jugadores +1 pt`,
        effect: 'festival',
        affected,
      };
    }

    if (card.type === 'replay') {
      const activation = PowerCardService.activatePowerCard(playerId, cardId, sessionId);
      if (!activation.success) {
        console.warn(`⚠️ REPLAY activation failed: ${activation.error}`);
        return activation;
      } else {
        console.log(`⚡ REPLAY activado para ${player.name} — próxima respuesta x2`);
      }
      return {
        success: true,
        cardId,
        cardType: card.type,
        message: `⚡ REPLAY activado — próxima respuesta x2`,
        effect: 'replay',
      };
    }

    if (card.type === 'double_platinum') {
      PowerCardService.removeCardFromInventory(playerId, cardId, sessionId);
      session.doublePlatinumActive = true;
      console.log(
        `💿 DOUBLE PLATINUM activado por ${player.name} — próxima ronda vale x2 para todos`
      );
      return {
        success: true,
        cardId,
        cardType: card.type,
        message: `💿 DOUBLE PLATINUM — la próxima respuesta correcta vale x2`,
        effect: 'double_platinum',
      };
    }

    return {
      success: false,
      error: `La Power Card ${card.type} no se puede activar desde el inventario`,
    };
  }

  activateDoublePlatinum(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'playing') {
      return { success: false, error: 'Sesión no activa' };
    }
    session.doublePlatinumActive = true;
    return { success: true, active: true };
  }

  getStatus(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    return {
      success: true,
      session: this._sanitizeSession(session),
    };
  }

  getAllSessions() {
    const sessions = [];
    this.sessions.forEach((session, id) => {
      sessions.push({
        id,
        status: session.status,
        players: session.players.length,
        round: session.round,
        createdAt: session.createdAt,
      });
    });
    return sessions;
  }

  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      PowerCardService.clearSessionData(sessionId);
      if (typeof this.trackService.resetUsedTracks === 'function') {
        this.trackService.resetUsedTracks(sessionId);
      }
    }
    return { success: deleted };
  }

  cleanupOldSessions() {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    let cleaned = 0;

    this.sessions.forEach((session, id) => {
      const createdAt = new Date(session.createdAt).getTime();
      if (createdAt < twoHoursAgo) {
        this.sessions.delete(id);
        cleaned++;
      }
    });

    return { cleaned };
  }

  _generateSessionId() {
    return 'game_' + Math.random().toString(36).substring(2, 9);
  }

  _getRandomFromArray(arr) {
    if (!arr || arr.length === 0) return 'ANY';
    if (arr.includes('ANY')) return 'ANY';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  _isValidWorldTourRoutes(routes, playerIds) {
    if (
      !routes ||
      typeof routes !== 'object' ||
      Array.isArray(routes) ||
      Object.keys(routes).length !== playerIds.length
    ) {
      return false;
    }

    const tileTypes = new Set([
      'concert',
      'festival',
      'record_deal',
      'rival_band',
      'sold_out',
    ]);
    const acts = new Set([
      'act1_underground',
      'act2_theBuzz',
      'act3_goingGlobal',
      'act4_headliner',
    ]);

    return playerIds.every((playerId) => {
      const route = routes[playerId];
      return (
        Array.isArray(route) &&
        route.length === 22 &&
        route.every(
          (tile, position) =>
            tile &&
            tile.position === position &&
            typeof tile.cityId === 'string' &&
            typeof tile.emoji === 'string' &&
            tileTypes.has(tile.tileType) &&
            acts.has(tile.act) &&
            tile.isStart === (position === 0) &&
            tile.isFinish === (position === 21),
        )
      );
    });
  }

  _checkWinner(session) {
    const scoreToWin = session.config?.targetScore ?? 22;
    const finisher = session.players.some((player) => player.boardPosition >= 21);
    const scoreWinner = session.players.some((player) => player.score >= scoreToWin);
    if (!finisher && !scoreWinner) return null;

    const [winner] = [...session.players].sort(
      (left, right) =>
        right.score - left.score || right.boardPosition - left.boardPosition,
    );

    const reachedScoreTarget = winner.score >= scoreToWin;
    const gameOver = reachedScoreTarget || finisher;
    const isCandidate = !reachedScoreTarget && winner.score === scoreToWin - 1;

    return {
      id: winner.id,
      name: winner.name,
      score: winner.score,
      boardPosition: winner.boardPosition,
      stats: winner.stats,
      gameOver,
      isCandidate,
    };
  }

  _sanitizeSession(session) {
    const sanitized = JSON.parse(JSON.stringify(session));
    delete sanitized.capabilityToken;
    delete sanitized.capabilityTokenHash;
    delete sanitized.processedIdempotencyKeys;
    delete sanitized.backstageDeck;
    delete sanitized.lastBackstageCard;

    if (sanitized.currentRound) {
      delete sanitized.currentRound._answer;
    }

    return sanitized;
  }
}

module.exports = GameSessionService;
