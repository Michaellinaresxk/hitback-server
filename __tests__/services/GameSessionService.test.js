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
    service.startGame(session.id);
    session.players[0].boardPosition = 20;
    session.players[0].score = 8;
    session.players[1].score = 20;
    await service.nextRound(session.id);

    const reveal = service.revealAnswer(session.id, 'player_1');

    expect(reveal.players[0].boardPosition).toBe(21);
    expect(reveal.results.gameOver).toBe(true);
    expect(reveal.results.gameWinner).toMatchObject({
      id: 'player_2',
      score: 20,
      boardPosition: 0,
    });

    session.players[0].score = 20;
    session.players[1].score = 20;
    session.players[1].boardPosition = 20;
    expect(service._checkWinner(session).id).toBe('player_1');
  });

  test('rejects malformed or incomplete World Tour routes', () => {
    const result = service.createSession({
      players: ['Ada', 'Lin'],
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
    session.players[0].boardPosition = 7;
    session.players[0].score = 12;

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
});
