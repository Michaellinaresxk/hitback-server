const axios = require('axios');

class DeezerService {
  constructor() {
    this.baseUrl = 'https://api.deezer.com';
    this.timeout = 5000;
    console.log('✅ [DeezerService] Initialized (no auth required)');
  }

  /**
   * 🎵 Busca un track y retorna preview URL + metadata
   */
  async searchTrack(trackName, artistName) {
    try {
      const query = `${trackName} ${artistName}`.trim();
      console.log(`🔍 Searching Deezer: "${query}"`);

      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          q: query,
          limit: 5 // Buscar varios para encontrar el mejor match
        },
        timeout: this.timeout
      });

      if (!response.data.data || response.data.data.length === 0) {
        console.warn(`⚠️ No results found on Deezer`);
        return null;
      }

      // Buscar el primer resultado con preview disponible
      for (const track of response.data.data) {
        if (track.preview) {
          console.log(`✅ Found with preview: "${track.title}" by ${track.artist.name}`);

          return {
            id: track.id,
            title: track.title,
            artist: track.artist.name,
            artistId: track.artist.id,
            album: track.album.title,
            albumId: track.album.id,
            duration: track.duration, // Duración completa en segundos
            previewUrl: track.preview, // 30 segundos
            cover: {
              small: track.album.cover_small,
              medium: track.album.cover_medium,
              large: track.album.cover_big,
              xl: track.album.cover_xl
            },
            link: track.link, // Link a Deezer
            explicit: track.explicit_lyrics || false
          };
        }
      }

      console.warn(`⚠️ Tracks found but no preview available`);
      return null;

    } catch (error) {
      console.error('❌ Deezer search error:', error.message);
      return null;
    }
  }

  /**
   * 🎧 Obtiene solo la preview URL (método simple)
   */
  async getPreviewUrl(trackName, artistName) {
    const result = await this.searchTrack(trackName, artistName);
    return result?.previewUrl || null;
  }

  /**
   * 🏥 Health check del servicio
   */
  async healthCheck() {
    try {
      const testResult = await this.searchTrack('Despacito', 'Luis Fonsi');

      return {
        service: 'Deezer API',
        status: testResult ? 'connected' : 'no_preview',
        hasPreview: !!testResult?.previewUrl,
        testTrack: testResult ? {
          title: testResult.title,
          artist: testResult.artist,
          hasPreview: !!testResult.previewUrl
        } : null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'Deezer API',
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new DeezerService();