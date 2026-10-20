const trackService = require('../../services/TrackService');

describe('TrackService session isolation', () => {
  test('tracks used in one session remain available to another session', async () => {
    const originalTracks = trackService.tracks;
    const originalDeezerService = trackService.deezerService;
    const service = trackService;
    service.resetUsedTracks();
    service.tracks = [
      { id: 'a', title: 'A', genre: 'ROCK', decade: '2000s', difficulty: 'EASY' },
      { id: 'b', title: 'B', genre: 'ROCK', decade: '2000s', difficulty: 'EASY' },
    ];
    service.deezerService = { searchTracks: jest.fn(async () => []) };

    const firstSessionTrack = await service.getRandomTrack({ sessionId: 'first' });
    const secondSessionTrack = await service.getRandomTrack({ sessionId: 'first' });
    const otherSessionTrack = await service.getRandomTrack({ sessionId: 'second' });

    expect(secondSessionTrack.id).not.toBe(firstSessionTrack.id);
    expect(['a', 'b']).toContain(otherSessionTrack.id);
    expect(service.getUsedTracksStatus('first').used).toBe(2);
    expect(service.getUsedTracksStatus('second').used).toBe(1);
    service.resetUsedTracks('first');
    service.resetUsedTracks('second');
    service.tracks = originalTracks;
    service.deezerService = originalDeezerService;
  });
});