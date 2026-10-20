const GameSessionService = require('../../services/GameSessionService');
const PowerCardService = require('../../services/PowerCardService');

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
    const { session } = service.createSession({ players: ['Ada', 'Lin'] });

    expect(session.config.targetScore).toBe(22);
    expect(session.players.map(({ id }) => id)).toEqual(['player_1', 'player_2']);
  });

  test('preserves an explicit target score override', () => {
    const { session } = service.createSession({
      players: ['Ada', 'Lin'],
      targetScore: 15,
    });

    expect(session.config.targetScore).toBe(15);
  });

  test('completes create, start, round, bet, reveal and score delta contracts', async () => {
    const { session } = service.createSession({ players: ['Ada', 'Lin'] });
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
    expect(service.applyScoreDelta(session.id, 'player_1', 1, 'TEST')).toMatchObject({
      success: true,
      player: { newScore: 5 },
    });
  });

  test('validates Power Card ownership and consumes cards in the same session', async () => {
    const { session } = service.createSession({ players: ['Ada', 'Lin'] });
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
    const { session } = service.createSession({ players: ['Ada', 'Lin'] });
    service.startGame(session.id);
    expect(service.activateDoublePlatinum(session.id).success).toBe(true);
    await service.nextRound(session.id);

    const reveal = service.revealAnswer(session.id, 'player_1');
    expect(reveal.results.pointsAwarded).toBe(4);
    expect(reveal.results.powerCardEffect.cardName).toBe('DOUBLE PLATINUM');
    expect(service.getStatus(session.id).session.doublePlatinumActive).toBe(false);
  });

  test('does not leak inventories or combo streaks between sessions', () => {
    const first = service.createSession({ players: ['Ada', 'Lin'] }).session;
    const second = service.createSession({ players: ['Ada', 'Lin'] }).session;

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
});
