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

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

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
    const token = created.body.capabilityToken;
    expect(typeof token).toBe('string');
    expect(created.body.session.capabilityToken).toBeUndefined();

    const started = await request(app)
      .post(`/api/v2/game/session/${sessionId}/start`)
      .set(auth(token));
    expect(started.status).toBe(200);
    expect(started.body.success).toBe(true);

    const scanned = await request(app)
      .post('/api/cards/scan-qr')
      .send({
        qrCode: 'HITBACK_PC_power_replay_001',
        playerId: 'player_1',
        sessionId,
      })
      .set(auth(token));
    expect(scanned.status).toBe(200);
    expect(scanned.body.data.cardId).toBe('power_replay_001');

    const round = await request(app)
      .post(`/api/v2/game/session/${sessionId}/round`)
      .set(auth(token));
    expect(round.status).toBe(200);
    expect(round.body.round.gameMasterAnswer.correct).toBe('Contract Track');

    const bet = await request(app)
      .post(`/api/v2/game/session/${sessionId}/bet`)
      .set(auth(token))
      .send({ playerId: 'player_1', tokens: 1 });
    expect(bet.body.success).toBe(true);

    const activation = await request(app)
      .post(`/api/v2/game/session/${sessionId}/power`)
      .set(auth(token))
      .send({ playerId: 'player_1', cardId: 'power_replay_001' });
    expect(activation.status).toBe(200);
    expect(activation.body.effect).toBe('replay');

    const reveal = await request(app)
      .post(`/api/v2/game/session/${sessionId}/reveal`)
      .set(auth(token))
      .send({ winnerId: 'player_1' });
    expect(reveal.status).toBe(200);
    expect(reveal.body.results.pointsAwarded).toBe(6);
    expect(reveal.body.players[0].score).toBe(6);
  });

  test('requires a matching session capability for game and private Power Card state', async () => {
    const first = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Ada', 'Lin'] });
    const second = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Grace', 'Katherine'] });
    const firstToken = first.body.capabilityToken;
    expect(firstToken).not.toBe(second.body.capabilityToken);
    const secondId = second.body.session.id;

    const anonymous = await request(app).get(
      `/api/v2/game/session/${first.body.session.id}`,
    );
    expect(anonymous.status).toBe(401);

    const headerIsNotAuthentication = await request(app)
      .get(`/api/v2/game/session/${first.body.session.id}`)
      .set('x-expo-token', 'present-but-not-a-credential')
      .set('Origin', 'https://client.expo.dev');
    expect(headerIsNotAuthentication.status).toBe(401);

    const crossed = await request(app)
      .get(`/api/v2/game/session/${secondId}`)
      .set(auth(firstToken));
    expect(crossed.status).toBe(401);

    const accepted = await request(app)
      .get(`/api/v2/game/session/${first.body.session.id}`)
      .set(auth(firstToken));
    expect(accepted.status).toBe(200);
    expect(accepted.body.session.capabilityToken).toBeUndefined();

    const anonymousScan = await request(app)
      .post('/api/cards/scan-qr')
      .send({
        qrCode: 'HITBACK_PC_power_replay_001',
        playerId: 'player_1',
        sessionId: first.body.session.id,
      });
    expect(anonymousScan.status).toBe(401);

    const crossedScan = await request(app)
      .post('/api/cards/scan-qr')
      .set(auth(firstToken))
      .send({
        qrCode: 'HITBACK_PC_power_replay_001',
        playerId: 'player_1',
        sessionId: secondId,
      });
    expect(crossedScan.status).toBe(401);

    const privateInventory = await request(app)
      .get('/api/cards/inventory/player_1')
      .query({ sessionId: first.body.session.id })
      .set(auth(firstToken));
    expect(privateInventory.status).toBe(200);

    const wrongPlayer = await request(app)
      .patch(`/api/v2/game/session/${first.body.session.id}/players/player_3/score`)
      .set(auth(firstToken))
      .send({ delta: 1, reason: 'REACTION_CARD' });
    expect(wrongPlayer.status).toBe(403);

    const invalidBatch = await request(app)
      .post(`/api/v2/game/session/${first.body.session.id}/score-settlement`)
      .set(auth(firstToken))
      .send({
        adjustments: [
          { playerId: 'player_1', delta: 2, reason: 'SOLD_OUT' },
          { playerId: 'player_3', delta: 1, reason: 'CHARITY_SHOW' },
        ],
      });
    expect(invalidBatch.status).toBe(400);
    expect(gameSessionRouter.gameService.sessions.get(first.body.session.id).players[0].score).toBe(0);

    const settledBatch = await request(app)
      .post(`/api/v2/game/session/${first.body.session.id}/score-settlement`)
      .set(auth(firstToken))
      .send({
        adjustments: [
          { playerId: 'player_1', delta: 2, reason: 'SOLD_OUT' },
          { playerId: 'player_2', delta: 3, reason: 'CHARITY_SHOW' },
        ],
      });
    expect(settledBatch.status).toBe(200);
    expect(settledBatch.body.players.map((player) => player.score)).toEqual([2, 3]);

    const printable = await request(app).get('/api/cards/printable-qrs');
    expect(printable.status).toBe(200);
    const health = await request(app).get('/api/v2/game/health');
    expect(health.status).toBe(200);
  });

  test('settles modifiers atomically before deciding game over and returns canonical scores', async () => {
    const created = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Ada', 'Lin'], targetScore: 2 });
    const id = created.body.session.id;
    const token = created.body.capabilityToken;
    const session = gameSessionRouter.gameService.sessions.get(id);
    session.players[0].score = 0;
    await request(app)
      .post(`/api/v2/game/session/${id}/start`)
      .set(auth(token));

    await request(app)
      .post(`/api/v2/game/session/${id}/round`)
      .set(auth(token));
    const belowTarget = await request(app)
      .post(`/api/v2/game/session/${id}/reveal`)
      .set(auth(token))
      .send({
        winnerId: 'player_1',
        scoreModifiers: { alliancePartnerId: 'player_2' },
      });

    expect(belowTarget.status).toBe(200);
    expect(belowTarget.body.players[0].score).toBe(1);
    expect(belowTarget.body.results.gameOver).not.toBe(true);

    await request(app)
      .post(`/api/v2/game/session/${id}/round`)
      .set(auth(token));
    const invalidSettlement = await request(app)
      .post(`/api/v2/game/session/${id}/reveal`)
      .set(auth(token))
      .send({
        winnerId: 'player_1',
        scoreModifiers: { alliancePartnerId: 'not-a-player' },
      });
    expect(invalidSettlement.status).toBe(400);
    expect(session.players[1].score).toBe(1);
    expect(session.currentRound).not.toBeNull();

    const finalSettlement = await request(app)
      .post(`/api/v2/game/session/${id}/reveal`)
      .set(auth(token))
      .send({
        winnerId: 'player_1',
        scoreModifiers: { bSidePlayerId: 'player_1' },
      });
    expect(finalSettlement.status).toBe(200);
    expect(finalSettlement.body.players[0].score).toBe(4);
    expect(finalSettlement.body.results.gameOver).toBe(true);

    const finishedRound = await request(app)
      .post(`/api/v2/game/session/${id}/round`)
      .set(auth(token));
    expect(finishedRound.status).toBe(200);
    expect(finishedRound.body.gameOver).toBe(true);
    expect(finishedRound.body.round).toBeUndefined();
  });

  test('rejects activation with a card type instead of cardId or without ownership', async () => {
    const created = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Ada', 'Lin'] });
    const id = created.body.session.id;
    const token = created.body.capabilityToken;
    await request(app)
      .post(`/api/v2/game/session/${id}/start`)
      .set(auth(token));

    const result = await request(app)
      .post(`/api/v2/game/session/${id}/power`)
      .set(auth(token))
      .send({ playerId: 'player_1', cardId: 'replay' });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  test('exposes the World Tour Double Platinum modifier endpoint', async () => {
    const created = await request(app)
      .post('/api/v2/game/session')
      .send({ players: ['Ada', 'Lin'] });
    const id = created.body.session.id;
    const token = created.body.capabilityToken;
    await request(app)
      .post(`/api/v2/game/session/${id}/start`)
      .set(auth(token));

    const result = await request(app).post(
      `/api/v2/game/session/${id}/double-platinum`,
    ).set(auth(token));
    expect(result.status).toBe(200);
    expect(result.body.active).toBe(true);
  });
});