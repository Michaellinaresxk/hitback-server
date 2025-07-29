const TrackService = require('../services/TrackService');

class CardController {
  constructor() {
    this.trackService = new TrackService();
  }

  // ========================================
  // MAIN QR SCAN CONTROLLER - LOCAL ONLY
  // ========================================

  scanQRCode = async (req, res) => {
    try {
      const { qrCode } = req.params;
      console.log(`🔍 Scanning QR (Local Mode): ${qrCode}`);

      // Validar formato QR
      const parsedQR = this.parseQRCode(qrCode);
      const { trackId, cardType, difficulty } = parsedQR;

      // Obtener track local
      const track = await this.trackService.getTrackById(trackId);

      // Validar que el track tenga el tipo de carta solicitado
      if (!track.questions || !track.questions[cardType]) {
        return res.status(404).json({
          success: false,
          error: `No ${cardType} data found for this track`,
          qrCode: qrCode,
          availableTypes: track.availableCardTypes || []
        });
      }

      // Obtener pregunta específica
      const questionData = track.questions[cardType];

      // Calcular puntos según dificultad
      const finalPoints = this.calculatePoints(questionData.points, difficulty);

      // Construir respuesta
      const response = {
        success: true,
        qrCode: qrCode,
        card: {
          cardType: cardType,
          difficulty: difficulty,
          points: finalPoints,
          question: questionData.question,
          answer: questionData.answer,

          // Audio local
          audioUrl: track.audioUrl,
          audioSource: track.audioSource,
          audioFile: track.audioFile,
          duration: Math.min(track.duration / 1000, 30), // Max 30 segundos
          hasAudio: track.hasAudio,

          // Información del track
          track: {
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            year: track.year,
            genre: track.genre,
            decade: track.decade,
            popularity: track.popularity
          },

          // Metadatos adicionales
          challengeType: questionData.challengeType || null,
          hints: questionData.hints || [],
          lastUpdated: track.lastUpdated
        }
      };

      console.log(`✅ QR Scan Success: ${track.title} - ${cardType} (${finalPoints}pts) [Audio: ${track.audioSource}]`);
      res.json(response);

    } catch (error) {
      console.error('❌ QR SCAN ERROR:', error);

      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
          qrCode: req.params.qrCode
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error during QR scan',
          qrCode: req.params.qrCode,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  };

  // ========================================
  // GET ALL TRACKS - LOCAL ONLY
  // ========================================

  getAllTracks = async (req, res) => {
    try {
      console.log('📊 Getting all local tracks...');

      const result = await this.trackService.getAllTracks();

      // Agregar URLs base para testing
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const enrichedTracks = result.tracks.map(track => ({
        ...track,
        qrCodes: this.generateQRCodesForTrack(track.id),
        testUrls: {
          scan: `${baseUrl}/api/cards/scan`,
          audio: track.audioUrl,
          checkAudio: `${baseUrl}/api/audio/check/${track.audioFile}`,
          streamAudio: `${baseUrl}/api/audio/stream/${track.audioFile}`
        }
      }));

      console.log(`✅ Returning ${enrichedTracks.length} local tracks`);

      res.json({
        ...result,
        tracks: enrichedTracks,
        endpoints: {
          scan: `${baseUrl}/api/cards/scan/:qrCode`,
          track: `${baseUrl}/api/tracks/:id`,
          random: `${baseUrl}/api/tracks/random`,
          audioList: `${baseUrl}/api/audio/list`
        }
      });

    } catch (error) {
      console.error('❌ Error getting tracks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tracks',
        message: error.message
      });
    }
  };

  // ========================================
  // GET SPECIFIC TRACK - LOCAL ONLY
  // ========================================

  getTrackById = async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`🎵 Getting local track: ${id}`);

      const track = await this.trackService.getTrackById(id);

      // Enriquecer con URLs de testing
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const response = {
        success: true,
        track: {
          ...track,
          qrCodes: this.generateQRCodesForTrack(track.id),
          testUrls: {
            songEasy: `${baseUrl}/api/cards/scan/HITBACK_${id}_SONG_EASY`,
            artistMedium: `${baseUrl}/api/cards/scan/HITBACK_${id}_ARTIST_MEDIUM`,
            decadeHard: `${baseUrl}/api/cards/scan/HITBACK_${id}_DECADE_HARD`,
            challengeExpert: `${baseUrl}/api/cards/scan/HITBACK_${id}_CHALLENGE_EXPERT`
          }
        }
      };

      console.log(`✅ Track found: ${track.title} (${track.audioSource} audio)`);
      res.json(response);

    } catch (error) {
      console.error('❌ Error getting track:', error);

      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get track',
          message: error.message
        });
      }
    }
  };

  // ========================================
  // RANDOM TRACK ENDPOINT
  // ========================================

  getRandomTrack = async (req, res) => {
    try {
      const filters = {
        hasAudio: req.query.hasAudio === 'true',
        difficulty: req.query.difficulty,
        genre: req.query.genre,
        cardType: req.query.cardType
      };

      // Limpiar filtros undefined
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === '') {
          delete filters[key];
        }
      });

      console.log('🎲 Getting random local track with filters:', filters);

      const track = await this.trackService.getRandomTrack(filters);
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      res.json({
        success: true,
        track: {
          ...track,
          testUrls: {
            scan: `${baseUrl}/api/cards/scan/HITBACK_${track.id}_SONG_EASY`,
            play: track.audioUrl
          }
        },
        appliedFilters: filters
      });

    } catch (error) {
      console.error('❌ Error getting random track:', error);
      res.status(404).json({
        success: false,
        error: error.message,
        availableFilters: {
          hasAudio: 'boolean',
          difficulty: 'easy|medium|hard|expert',
          genre: 'string',
          cardType: 'song|artist|decade|lyrics|challenge'
        }
      });
    }
  };

  // ========================================
  // HEALTH CHECK - LOCAL ONLY
  // ========================================

  healthCheck = async (req, res) => {
    try {
      console.log('🏥 Health check (Local Mode)...');

      const trackServiceHealth = await this.trackService.healthCheck();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const health = {
        success: true,
        message: 'Local Audio Card Service is healthy',
        mode: 'LOCAL_AUDIO_ONLY',
        timestamp: new Date().toISOString(),
        services: {
          trackService: trackServiceHealth
        },
        endpoints: {
          scan: `${baseUrl}/api/cards/scan/:qrCode`,
          tracks: `${baseUrl}/api/tracks`,
          random: `${baseUrl}/api/tracks/random`,
          audioList: `${baseUrl}/api/audio/list`,
          health: `${baseUrl}/api/cards/health`
        },
        testCodes: [
          'HITBACK_001_SONG_EASY',
          'HITBACK_002_ARTIST_MEDIUM',
          'HITBACK_003_DECADE_HARD',
          'HITBACK_004_CHALLENGE_EXPERT'
        ]
      };

      // Determinar estado general
      if (trackServiceHealth.status === 'error') {
        health.success = false;
        health.status = 'error';
      } else if (trackServiceHealth.status === 'degraded') {
        health.status = 'degraded';
        health.warnings = ['Some local files may be missing'];
      } else {
        health.status = 'healthy';
      }

      console.log(`✅ Health check completed - Status: ${health.status}`);
      res.json(health);

    } catch (error) {
      console.error('❌ Health check failed:', error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: 'Health check failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };

  // ========================================
  // AUDIO DIAGNOSTICS - NEW LOCAL FEATURE
  // ========================================

  audioDiagnostics = async (req, res) => {
    try {
      console.log('🔍 Running audio diagnostics...');

      const audioFiles = this.trackService.checkAudioFiles();
      const availableFiles = this.trackService.listAvailableAudioFiles();

      const diagnostics = {
        success: true,
        timestamp: new Date().toISOString(),
        trackAudioMapping: audioFiles,
        availableAudioFiles: availableFiles,
        stats: {
          totalTracks: audioFiles.length,
          tracksWithAudio: audioFiles.filter(t => t.exists).length,
          tracksWithoutAudio: audioFiles.filter(t => !t.exists).length,
          orphanedAudioFiles: availableFiles.filter(af =>
            !audioFiles.find(t => t.audioFile === af.filename)
          )
        }
      };

      res.json(diagnostics);

    } catch (error) {
      console.error('❌ Audio diagnostics failed:', error);
      res.status(500).json({
        success: false,
        error: 'Audio diagnostics failed',
        message: error.message
      });
    }
  };

  // ========================================
  // GENERATE QR CODES - LOCAL ONLY
  // ========================================

  generateQRCodes = async (req, res) => {
    try {
      console.log('🏷️ Generating QR codes for local tracks...');

      const allTracks = await this.trackService.getAllTracks();
      const cardTypes = ['song', 'artist', 'decade', 'lyrics', 'challenge'];
      const difficulties = ['easy', 'medium', 'hard', 'expert'];
      const qrCodes = [];

      allTracks.tracks.forEach(track => {
        cardTypes.forEach(cardType => {
          if (track.questions && track.questions[cardType]) {
            difficulties.forEach(difficulty => {
              const qrCode = `HITBACK_${track.id}_${cardType.toUpperCase()}_${difficulty.toUpperCase()}`;

              qrCodes.push({
                qrCode,
                trackId: track.id,
                trackTitle: track.title,
                trackArtist: track.artist,
                cardType,
                difficulty,
                points: this.calculatePoints(track.questions[cardType].points, difficulty),
                question: track.questions[cardType].question,
                audioUrl: track.audioUrl,
                audioSource: track.audioSource,
                hasAudio: track.hasAudio
              });
            });
          }
        });
      });

      console.log(`✅ Generated ${qrCodes.length} QR codes`);

      res.json({
        success: true,
        message: 'QR codes generated for local tracks',
        totalCodes: qrCodes.length,
        qrCodes: qrCodes,
        stats: {
          tracksWithAudio: qrCodes.filter(qr => qr.hasAudio).length,
          localAudioCodes: qrCodes.filter(qr => qr.audioSource === 'local').length,
          noAudioCodes: qrCodes.filter(qr => qr.audioSource === 'none').length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error generating QR codes:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate QR codes',
        message: error.message
      });
    }
  };

  // ========================================
  // HELPER METHODS
  // ========================================

  parseQRCode(qrCode) {
    console.log(`🔍 Parsing QR: ${qrCode}`);

    const parts = qrCode.split('_');

    if (parts.length < 2 || parts[0] !== 'HITBACK') {
      throw new Error(`Invalid QR code format. Expected: HITBACK_001_SONG_EASY, got: ${qrCode}`);
    }

    const trackId = parts[1];
    const cardType = parts[2] ? parts[2].toLowerCase() : 'song';
    const difficulty = parts[3] ? parts[3].toLowerCase() : 'medium';

    console.log(`📋 Parsed - Track: ${trackId}, Type: ${cardType}, Difficulty: ${difficulty}`);
    return { trackId, cardType, difficulty };
  }

  calculatePoints(basePoints, difficulty) {
    const multipliers = {
      easy: 1,
      medium: 1.5,
      hard: 2,
      expert: 3
    };

    return Math.round(basePoints * (multipliers[difficulty] || 1));
  }

  generateQRCodesForTrack(trackId) {
    const cardTypes = ['SONG', 'ARTIST', 'DECADE', 'LYRICS', 'CHALLENGE'];
    const difficulties = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    const qrCodes = [];

    cardTypes.forEach(type => {
      difficulties.forEach(diff => {
        qrCodes.push(`HITBACK_${trackId}_${type}_${diff}`);
      });
    });

    return qrCodes;
  }
}

// Export instance methods
const cardController = new CardController();

module.exports = {
  scanQRCode: cardController.scanQRCode,
  getAllTracks: cardController.getAllTracks,
  getTrackById: cardController.getTrackById,
  getRandomTrack: cardController.getRandomTrack,
  generateQRCodes: cardController.generateQRCodes,
  audioDiagnostics: cardController.audioDiagnostics,
  healthCheck: cardController.healthCheck
};