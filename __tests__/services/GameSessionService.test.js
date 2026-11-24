const GameSessionService = require('../../services/GameSessionService');
const PowerCardService = require('../../services/PowerCardService');

const createTestRoutes = (playerCount) =>
  Object.fromEntries(
    Array.from({ length: playerCount }, (_, playerIndex) => [
      `player_${playerIndex + 1}`,
      Array.from({ length: 22 }, (_, position) => ({
        position,
        cityId: `city_${playerIndex}_${position}`,
        emoji: '🎵',
        tileType: 'concert',
        act:
          position <= 5
            ? 'act1_underground'
            : position <= 10
              ? 'act2_theBuzz'
              : position <= 15
                ? 'act3_goingGlobal'
                : 'act4_headliner',
        isStart: position === 0,
        isFinish: position === 21,
      })),
    ]),
  );

const createSession = (service, config) =>
  service.createSession({
    playMode: 'physical',
    ...config,
    worldTourRoutes: createTestRoutes(config.players.length),
  });

describe('GameSessionService contracts used by Expo', () => {
  let service;

  beforeEach(() => {
    PowerCardService.clearAll();
    const trackService = {
      getRandomTrack: jest.fn(async ({ sessionId }) => ({
        id: `${sessionId}-track-${Date.now()}`,
        title: 'Test Track',
        artist: 'Test Artist',
        genre: 'ROCK',
        decade: '2000s',
        previewUrl: 'https://example.test/preview.mp3',
        audioSource: 'test',
      })),
    };
    const questionService = {
      generateQuestion: jest.fn(() => ({
        type: 'song',
        question: 'Name this song',
        answer: 'Test Track',
        points: 2,
        hints: [],
        icon: 'music',
      })),
    };
    service = new GameSessionService({ trackService, questionService });
  });

  afterEach(() => {
    PowerCardService.clearAll();
  });

  test('uses the frontend victory target and returns matching backend player IDs', () => {
    const { session } = createSession(service, { players: ['Ada', 'Lin'] });

    expect(session.config.targetScore).toBe(22);
    expect(session.players.map(({ id }) => id)).toEqual(['player_1', 'player_2']);
  });

  test('preserves an explicit target score override', () => {
    const { session } = createSession(service, {
      players: ['Ada', 'Lin'],
      targetScore: 15,
    });

    expect(session.config.targetScore).toBe(15);
  });

  test('completes create, start, round, bet, reveal and score delta contracts', async () => {
    const { session } = createSession(service, { players: ['Ada', 'Lin'] });
    expect(service.startGame(session.id).success).toBe(true);
    const round = await service.nextRound(session.id);

    expect(round.success).toBe(true);
    expect(round.round.gameMasterAnswer.correct).toBe('Test Track');
    expect(service.placeBet(session.id, 'player_1', 2)).toMatchObject({
      success: true,
      bet: { tokens: 2 },
    });

    const reveal = service.revealAnswer(session.id, 'player_1');
    expect(reveal.success).toBe(true);
    expect(reveal.results.pointsAwarded).toBe(4);
    expect(reveal.players[0].score).toBe(4);
    expect(reveal.players[0].stats.correctAnswers).toBe(1);
    expect(service.applyScoreDelta(session.id, 'player_1', 1, 'TEST')).toMatchObject({
      success: true,
      player: { newScore: 5 },
    });
  });

  test('keeps exact cumulative score and correct-answer count across rounds', async () => {
    const { session } = createSession(service, { players: ['Ada', 'Lin'] });
    service.startGame(session.id);

    await service.nextRound(session.id);
    service.placeBet(session.id, 'player_1', 2);
    const firstReveal = service.revealAnswer(session.id, 'player_1');

    expect(firstReveal.players[0]).toMatchObject({
      score: 4,
      stats: { correctAnswers: 1 },
    });

    await service.nextRound(session.id);
    const secondReveal = service.revealAnswer(session.id, 'player_1');

    expect(secondReveal.players[0]).toMatchObject({
      score: 6,
      stats: { correctAnswers: 2 },
    });
    expect(secondReveal.players[1]).toMatchObject({
      score: 0,
      stats: { correctAnswers: 0 },
    });

    await service.nextRound(session.id);
    const noWinnerReveal = service.revealAnswer(session.id);

    expect(noWinnerReveal.players[0]).toMatchObject({
      score: 6,
      stats: { correctAnswers: 2 },
    });
  });

  test('validates Power Card ownership and consumes cards in the same session', async () => {
    const { session } = createSession(service, { players: ['Ada', 'Lin'] });
    service.startGame(session.id);

    expect(service.usePowerCard(session.id, 'player_1', 'power_replay_001').success).toBe(false);

    PowerCardService.addCardToInventory('player_1', 'power_replay_001', 1, session.id);
    expect(service.usePowerCard(session.id, 'player_1', 'power_replay_001').success).toBe(true);

    await service.nextRound(session.id);
    const reveal = service.revealAnswer(session.id, 'player_1');
    expect(reveal.results.pointsAwarded).toBe(4);
    expect(PowerCardService.getPlayerInventory('player_1', session.id)).toEqual({});
  });

  test('applies Double Platinum from the World Tour tile on the next reveal', async () => {
    const { session } = createSession(service, { players: ['Ada', 'Lin'] });
    service.startGame(session.id);
    expect(service.activateDoublePlatinum(session.id).success).toBe(true);
    await service.nextRound(session.id);

    const reveal = service.revealAnswer(session.id, 'player_1');
    expect(reveal.results.pointsAwarded).toBe(4);
    expect(reveal.results.powerCardEffect.cardName).toBe('DOUBLE PLATINUM');
    expect(service.getStatus(session.id).session.doublePlatinumActive).toBe(false);
  });

  test('does not leak inventories or combo streaks between sessions', () => {
    const first = createSession(service, { players: ['Ada', 'Lin'] }).session;
    const second = createSession(service, { players: ['Ada', 'Lin'] }).session;

    PowerCardService.addCardToInventory('player_1', 'power_replay_001', 1, first.id);
    PowerCardService.processPlayerAnswer('player_1', true, { gameSessionId: first.id });
    PowerCardService.processPlayerAnswer('player_1', true, { gameSessionId: first.id });
    PowerCardService.processPlayerAnswer('player_1', true, { gameSessionId: second.id });

    expect(PowerCardService.getPlayerInventory('player_1', first.id)).toEqual({
      power_replay_001: 1,
    });
    expect(PowerCardService.getPlayerInventory('player_1', second.id)).toEqual({});
    expect(PowerCardService.getComboStatus('player_1', first.id).currentStreak).toBe(2);
    expect(PowerCardService.getComboStatus('player_1', second.id).currentStreak).toBe(1);
  });

  test('advances one tile per winner and ranks by fans then progress at the finish', async () => {
    const { session } = createSession(service, { players: ['Ada', 'Lin'] });
    const live = service.sessions.get(session.id);
    service.startGame(session.id);
    live.players[0].boardPosition = 20;
    live.players[0].score = 8;
    live.players[1].score = 20;
    await service.nextRound(session.id);

    const reveal = service.revealAnswer(session.id, 'player_1');

    expect(reveal.players[0].boardPosition).toBe(21);
    expect(reveal.results.gameOver).toBe(true);
    expect(reveal.results.gameWinner).toMatchObject({
      id: 'player_2',
      score: 20,
      boardPosition: 0,
    });

    live.players[0].score = 20;
    live.players[1].score = 20;
    live.players[1].boardPosition = 20;
    expect(service._checkWinner(live).id).toBe('player_1');
  });

  test('rejects malformed or incomplete World Tour routes', () => {
    const result = service.createSession({
      players: ['Ada', 'Lin'],
      playMode: 'physical',
      worldTourRoutes: { player_1: [] },
    });
    expect(result).toMatchObject({
      success: false,
      error: 'Rutas de World Tour inválidas',
    });
  });

  test('restores persisted route, progress and capability verification after restart', async () => {
    const { session, capabilityToken } = createSession(service, {
      players: ['Ada', 'Lin'],
    });
    const live = service.sessions.get(session.id);
    live.players[0].boardPosition = 7;
    live.players[0].score = 12;

    let savedSnapshot;
    const persistence = {
      initialize: jest.fn(async () => {}),
      get: jest.fn(async (id) =>
        savedSnapshot?.id === id ? savedSnapshot : null,
      ),
      findByCapabilityToken: jest.fn(async () => savedSnapshot || null),
      count: jest.fn(async () => (savedSnapshot ? 1 : 0)),
      save: jest.fn(async (savedSession) => {
        savedSnapshot = { ...savedSession };
        delete savedSnapshot.capabilityToken;
      }),
      delete: jest.fn(),
    };
    service.persistence = persistence;
    await service.persistSession(session.id);

    const restartedService = new GameSessionService({ persistence });
    await restartedService.initialize();
    await restartedService.getSession(session.id);

    const restored = restartedService.getStatus(session.id).session;
    expect(restored.players[0]).toMatchObject({
      id: 'player_1',
      boardPosition: 7,
      score: 12,
    });
    expect(restored.worldTourRoutes).toEqual(session.worldTourRoutes);
    expect(restartedService.verifyCapability(session.id, capabilityToken)).toBe(true);
    expect(savedSnapshot.capabilityToken).toBeUndefined();
  });

  describe('Vinilo / Streaming backstage', () => {
    const createDigitalSession = (players = ['Ada', 'Lin']) =>
      createSession(service, { players, playMode: 'digital' });

    const startAtPosition = async (sessionId, position) => {
      service.startGame(sessionId);
      const live = service.sessions.get(sessionId);
      live.players[0].boardPosition = position;
      await service.nextRound(sessionId);
      return live;
    };

    test('requires a valid playMode when creating a session', () => {
      const routes = createTestRoutes(2);

      expect(
        service.createSession({ players: ['Ada', 'Lin'], worldTourRoutes: routes }),
      ).toMatchObject({ success: false, error: 'playMode inválido' });
      expect(
        service.createSession({
          players: ['Ada', 'Lin'],
          playMode: 'cassette',
          worldTourRoutes: routes,
        }),
      ).toMatchObject({ success: false, error: 'playMode inválido' });
    });

    test('creates a secret deck and interval only for Streaming', () => {
      const physical = createSession(service, { players: ['Ada', 'Lin'] });
      const digital = createDigitalSession();

      expect(physical.session.config.playMode).toBe('physical');
      expect(physical.session.config.backstageInterval).toBeUndefined();
      expect(physical.session.backstageDeck).toBeUndefined();

      expect(digital.session.config).toMatchObject({
        playMode: 'digital',
        backstageInterval: 3,
      });
      expect(digital.session.backstageDeck).toBeUndefined();
      expect(service.sessions.get(digital.session.id).backstageDeck).toHaveLength(12);
    });

    test('never draws a backstage card in Vinilo', async () => {
      const { session } = createSession(service, { players: ['Ada', 'Lin'] });
      const live = await startAtPosition(session.id, 2);

      const reveal = service.revealAnswer(session.id, 'player_1');

      expect(reveal.results.backstage).toBeNull();
      expect(live.backstageCard).toBeUndefined();
      expect(live.backstageDeck).toBeUndefined();
    });

    test('draws and stores the card when a Streaming reveal lands on backstage', async () => {
      const { session } = createDigitalSession();
      const live = await startAtPosition(session.id, 2);

      const reveal = service.revealAnswer(session.id, 'player_1');

      expect(reveal.results.backstage).toMatchObject({
        playerId: 'player_1',
        position: 3,
        cityId: 'city_0_3',
        cardType: expect.any(String),
      });
      expect(reveal.session.backstageCard).toEqual(reveal.results.backstage);
      expect(reveal.session.backstageDeck).toBeUndefined();
      expect(reveal.session.lastBackstageCard).toBeUndefined();
      expect(live.backstageDeck).toHaveLength(11);
      expect(live.lastBackstageCard).toBe(reveal.results.backstage.cardType);
    });

    test('returns null when Streaming does not land on backstage or nobody wins', async () => {
      const { session } = createDigitalSession();
      await startAtPosition(session.id, 0);

      expect(service.revealAnswer(session.id, 'player_1').results.backstage).toBeNull();

      const live = service.sessions.get(session.id);
      live.players[0].boardPosition = 2;
      await service.nextRound(session.id);
      expect(service.revealAnswer(session.id).results.backstage).toBeNull();
      expect(live.backstageCard).toBeNull();
    });

    test('rejects a mismatched Streaming card and clears it only after a valid apply', async () => {
      const { session } = createDigitalSession();
      const live = await startAtPosition(session.id, 2);
      service.revealAnswer(session.id, 'player_1');
      live.backstageCard = {
        playerId: 'player_1',
        cardType: 'SOLD_OUT',
        position: 3,
        cityId: 'city_0_3',
      };

      expect(
        service.applyReactionCard(session.id, {
          sourcePlayerId: 'player_2',
          cardType: 'SOLD_OUT',
        }),
      ).toMatchObject({ success: false, statusCode: 400 });
      expect(
        service.applyReactionCard(session.id, {
          sourcePlayerId: 'player_1',
          cardType: 'DUEL',
        }),
      ).toMatchObject({ success: false, statusCode: 400 });
      expect(live.backstageCard.cardType).toBe('SOLD_OUT');
      expect(live.activeEffects).toHaveLength(0);

      const scoreBefore = live.players[0].score;
      expect(
        service.applyReactionCard(session.id, {
          sourcePlayerId: 'player_1',
          cardType: 'SOLD_OUT',
        }),
      ).toMatchObject({ success: true });
      expect(live.backstageCard).toBeNull();
      expect(live.players[0].score).toBe(scoreBefore + 1);
    });

    test('discards or rolls over an unused Streaming card', async () => {
      const { session } = createDigitalSession();
      const live = await startAtPosition(session.id, 2);
      service.revealAnswer(session.id, 'player_1');

      expect(service.discardBackstageCard(session.id, 'player_2')).toMatchObject({
        success: false,
        statusCode: 400,
      });
      expect(live.backstageCard).not.toBeNull();
      expect(service.discardBackstageCard(session.id, 'player_1')).toMatchObject({
        success: true,
        discarded: true,
      });
      expect(live.backstageCard).toBeNull();

      live.backstageCard = {
        playerId: 'player_1',
        cardType: 'SOLD_OUT',
        position: 3,
        cityId: 'city_0_3',
      };
      await service.nextRound(session.id);
      expect(live.backstageCard).toBeNull();
    });

    test('recovers sessions saved before the feature as Vinilo', () => {
      const { session } = createSession(service, { players: ['Ada', 'Lin'] });
      const live = service.sessions.get(session.id);
      delete live.config.playMode;

      service._normalizeSession(live);

      expect(live.config.playMode).toBe('physical');
    });
  });

  describe('STOP-BLAST y BAD REVIEW', () => {
    const createPhysicalSession = (players = ['Ada', 'Lin', 'Nia']) =>
      createSession(service, { players });

    test('STOP-BLAST congela a los demás jugadores y solo el portador puede ganar', async () => {
      const { session } = createPhysicalSession();
      service.startGame(session.id);
      await service.nextRound(session.id);
      const live = service.sessions.get(session.id);

      const applied = service.applyReactionCard(session.id, {
        sourcePlayerId: 'player_1',
        cardType: 'STOP_BLAST',
      });
      expect(applied.success).toBe(true);
      expect(applied.players[0].effects).toMatchObject({
        stopBlastActive: true,
        isFrozen: false,
      });
      expect(applied.players[1].effects).toMatchObject({
        stopBlastActive: false,
        isFrozen: true,
        frozenRoundsLeft: 1,
      });
      expect(live.activeEffects[0]).toMatchObject({
        type: 'STOP_BLAST',
        activeFromRound: 1,
      });

      expect(service.revealAnswer(session.id, 'player_2')).toMatchObject({
        success: false,
        reason: 'STOP_BLAST_ACTIVE',
        statusCode: 400,
      });
      expect(service.revealAnswer(session.id, 'player_1').success).toBe(true);

      await service.nextRound(session.id);
      expect(live.activeEffects[0].status).toBe('expired');
      expect(service.revealAnswer(session.id, 'player_2').success).toBe(true);
    });

    test('un STOP-BLAST de Streaming se mantiene activo durante la ronda siguiente', async () => {
      const { session } = createSession(service, {
        players: ['Ada', 'Lin', 'Nia'],
        playMode: 'digital',
      });
      service.startGame(session.id);
      const live = service.sessions.get(session.id);
      await service.nextRound(session.id);
      service.revealAnswer(session.id, 'player_1');
      live.backstageCard = {
        playerId: 'player_1',
        cardType: 'STOP_BLAST',
        position: 3,
        cityId: 'city_0_3',
      };

      expect(
        service.applyReactionCard(session.id, {
          sourcePlayerId: 'player_1',
          cardType: 'STOP_BLAST',
        }).success,
      ).toBe(true);
      expect(live.activeEffects[0].activeFromRound).toBe(2);

      // nextRound expira efectos de la ronda que termina, no los que empiezan.
      await service.nextRound(session.id);
      expect(live.activeEffects[0].status).toBe('active');
      expect(live.players[1].effects.isFrozen).toBe(true);
      expect(service.revealAnswer(session.id, 'player_2')).toMatchObject({
        success: false,
        reason: 'STOP_BLAST_ACTIVE',
      });
      expect(service.revealAnswer(session.id, 'player_1').success).toBe(true);

      await service.nextRound(session.id);
      expect(live.activeEffects[0].status).toBe('expired');
      expect(service.revealAnswer(session.id, 'player_2').success).toBe(true);
    });

    test('BAD REVIEW resta 1 fan a quien obtiene la carta, con o sin objetivo', async () => {
      const { session } = createPhysicalSession();
      service.startGame(session.id);
      await service.nextRound(session.id);
      const live = service.sessions.get(session.id);
      live.players[0].score = 5;
      live.players[1].score = 7;

      expect(
        service.applyReactionCard(session.id, {
          sourcePlayerId: 'player_1',
          cardType: 'BAD_REVIEW',
          targetPlayerId: 'player_2',
        }),
      ).toMatchObject({ success: true, event: { holderId: 'player_1', delta: -1 } });
      expect(live.players[0].score).toBe(4);
      expect(live.players[1].score).toBe(7);

      expect(
        service.applyReactionCard(session.id, {
          sourcePlayerId: 'player_1',
          cardType: 'BAD_REVIEW',
        }).success,
      ).toBe(true);
      expect(live.players[0].score).toBe(3);
      expect(live.players[1].score).toBe(7);
    });
  });
});
