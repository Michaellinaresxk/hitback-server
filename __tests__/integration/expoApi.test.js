const request = require('supertest');
const app = require('../../server');
const gameSessionRouter = require('../../routes/gameSession');
const tracksV2Router = require('../../routes/tracksV2');
const PowerCardService = require('../../services/PowerCardService');

describe('Expo HTTP contract', () => {
  let originalTrackService;
  let originalGenerateQuestion;
  let sessionId;

  beforeAll(() => {
    originalTrackService = gameSessionRouter.gameService.trackService;
    originalGenerateQuestion = gameSessionRouter.gameService.questionService.generateQuestion;
    gameSessionRouter.gameService.trackService = {
      getRandomTrack: jest.fn(async ({ sessionId: currentSessionId }) => ({
        id: `${currentSessionId}-track`,
        title: 'Contract Track',
        artist: 'Test Artist',
        genre: 'ROCK',
        decade: '2000s',
        previewUrl: 'https://example.test/preview.mp3',
        audioSource: 'test',
      })),
    };
    gameSessionRouter.gameService.questionService.generateQuestion = jest.fn(() => ({
      type: 'song',
      question: 'Name the track',
      answer: 'Contract Track',
      points: 2,
      hints: [],
      icon: 'music',
    }));
  });

  beforeEach(() => {
    PowerCardService.clearAll();
  });

  afterAll(() => {
    gameSessionRouter.gameService.trackService = originalTrackService;
    gameSessionRouter.gameService.questionService.generateQuestion = originalGenerateQuestion;
    return tracksV2Router.trackService.pool.end();
  });

  test('creates and starts a game, scans a card, bets, uses it, then reveals the round', async () => {
    const created = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Ada', 'Lin'], targetScore: 22 });

    expect(created.status).toBe(201);
    expect(created.body.session.config.targetScore).toBe(22);
    sessionId = created.body.session.id;

    const started = await request(app).post(`/api/v2/game/session/${sessionId}/start`);
    expect(started.status).toBe(200);
    expect(started.body.success).toBe(true);

    const scanned = await request(app)
      .post('/api/cards/scan-qr')
      .send({
        qrCode: 'HITBACK_PC_power_replay_001',
        playerId: 'player_1',
        sessionId,
      });
    expect(scanned.status).toBe(200);
    expect(scanned.body.data.cardId).toBe('power_replay_001');

    const round = await request(app).post(`/api/v2/game/session/${sessionId}/round`);
    expect(round.status).toBe(200);
    expect(round.body.round.gameMasterAnswer.correct).toBe('Contract Track');

    const bet = await request(app)
      .post(`/api/v2/game/session/${sessionId}/bet`)
      .send({ playerId: 'player_1', tokens: 1 });
    expect(bet.body.success).toBe(true);

    const activation = await request(app)
      .post(`/api/v2/game/session/${sessionId}/power`)
      .send({ playerId: 'player_1', cardId: 'power_replay_001' });
    expect(activation.status).toBe(200);
    expect(activation.body.effect).toBe('replay');

    const reveal = await request(app)
      .post(`/api/v2/game/session/${sessionId}/reveal`)
      .send({ winnerId: 'player_1' });
    expect(reveal.status).toBe(200);
    expect(reveal.body.results.pointsAwarded).toBe(6);
    expect(reveal.body.players[0].score).toBe(6);
  });

  test('rejects activation with a card type instead of cardId or without ownership', async () => {
    const created = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Ada', 'Lin'] });
    const id = created.body.session.id;
    await request(app).post(`/api/v2/game/session/${id}/start`);

    const result = await request(app)
      .post(`/api/v2/game/session/${id}/power`)
      .send({ playerId: 'player_1', cardId: 'replay' });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  test('exposes the World Tour Double Platinum modifier endpoint', async () => {
    const created = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Ada', 'Lin'] });
    const id = created.body.session.id;
    await request(app).post(`/api/v2/game/session/${id}/start`);

    const result = await request(app).post(
      `/api/v2/game/session/${id}/double-platinum`,
    );
    expect(result.status).toBe(200);
    expect(result.body.active).toBe(true);
  });
});