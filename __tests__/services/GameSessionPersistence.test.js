const GameSessionPersistence = require('../../services/GameSessionPersistence');

describe('GameSessionPersistence', () => {
  test('loads snapshots, hashes credentials, and never stores the raw token', async () => {
    const snapshot = {
      id: 'game_abc1234',
      status: 'playing',
      players: [{ id: 'player_1', score: 3, boardPosition: 2 }],
      worldTourRoutes: { player_1: [{ position: 0 }] },
    };
    const token = 'secret-capability-token';
    const queries = [];
    const pool = {
      query: jest.fn(async (sql, values) => {
        queries.push({ sql, values });
        if (sql.includes('SELECT session_data')) {
          return {
            rows: [
              {
                session_data: snapshot,
                capability_token_hash:
                  GameSessionPersistence.hashCapabilityToken(token),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const persistence = new GameSessionPersistence({ pool });

    await persistence.initialize();
    const restored = await persistence.get(snapshot.id);
    const foundByToken = await persistence.findByCapabilityToken(token);
    await persistence.save({
      ...snapshot,
      capabilityToken: token,
      capabilityTokenHash: GameSessionPersistence.hashCapabilityToken(token),
    });
    await persistence.delete(snapshot.id);

    expect(restored).toMatchObject({
      id: snapshot.id,
      capabilityTokenHash: GameSessionPersistence.hashCapabilityToken(token),
    });
    expect(foundByToken.id).toBe(snapshot.id);
    const saveValues = queries.find(({ sql }) => sql.includes('INSERT INTO')).values;
    expect(JSON.parse(saveValues[1]).capabilityToken).toBeUndefined();
    expect(saveValues[2]).toBe(
      GameSessionPersistence.hashCapabilityToken(token),
    );
    expect(queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      'SELECT',
      'SELECT',
      'SELECT',
      'INSERT',
      'DELETE',
    ]);
  });
});
