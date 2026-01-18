const QRService = require('../services/QRService');
const AudioService = require('../services/AudioService');
const TrackService = require('../services/TrackService');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

class GameController {
  constructor() {
    this.qrService = new QRService();
    this.audioService = new AudioService();
    this.trackService = TrackService; // ✅ Ya es una instancia singleton
  }

  /**
   * ðŸŽ¯ ENDPOINT PRINCIPAL: Escanear cÃ³digo QR
   * POST/GET /api/qr/scan/:qrCode
   */
  scanQRCode = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('QR_SCAN');
    const { qrCode } = req.params;

    logger.info(`QR scan initiated: ${qrCode}`);

    try {
      // 1. Parsear y validar QR
      const qrData = this.qrService.parseQRCode(qrCode);

      // 2. Obtener datos del track
      const track = this.trackService.getTrackById(qrData.trackId);

      // 3. Validar que el track tiene el tipo de carta solicitado
      if (!track.questions || !track.questions[qrData.cardType]) {
        return res.sendError(
          `No ${qrData.cardType} data found for this track`,
          'CARD_TYPE_NOT_AVAILABLE',
          404,
          {
            qrCode,
            availableTypes: track.availableCardTypes
          }
        );
      }

      // 4. Obtener URL de audio
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const audioUrl = this.audioService.getAudioUrl(track.audioFile, baseUrl);

      // 5. Construir datos de la pregunta
      const questionData = track.questions[qrData.cardType];
      const finalPoints = qrData.points;

      // 6. Construir respuesta completa
      const gameData = {
        qrCode,
        scan: {
          trackId: qrData.trackId,
          cardType: qrData.cardType,
          difficulty: qrData.difficulty,
          points: finalPoints
        },
        question: {
          text: questionData.question,
          answer: questionData.answer,
          challengeType: questionData.challengeType || null,
          hints: questionData.hints || []
        },
        audio: {
          url: audioUrl,
          file: track.audioFile,
          duration: Math.min(track.duration / 1000, 30), // Max 30 segundos
          hasAudio: !!audioUrl,
          source: audioUrl ? 'local' : 'none'
        },
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          year: track.year,
          genre: track.genre,
          decade: track.decade
        },
        game: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      };

      const duration = timer();
      logger.info(`QR scan successful: ${track.title} - ${qrData.cardType} (${finalPoints}pts) in ${duration}ms`);

      res.sendSuccess(gameData, 'QR code scanned successfully', {
        performance: `${duration}ms`,
        audioAvailable: !!audioUrl
      });

    } catch (error) {
      timer();
      logger.error(`QR scan failed for ${qrCode}:`, error);

      if (error.name === 'QRError') {
        res.sendError(error.message, 'INVALID_QR_CODE', 400);
      } else if (error.name === 'FileNotFoundError') {
        res.sendNotFound('Track', qrData?.trackId);
      } else {
        res.sendError('QR scan failed', 'SCAN_ERROR', 500, error.message);
      }
    }
  });

  /**
   * ðŸ“‹ Obtener todos los tracks
   * GET /api/tracks
   */
  getAllTracks = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('GET_ALL_TRACKS');

    logger.info('Fetching all tracks');

    try {
      const tracks = this.trackService.getAllTracks();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Enriquecer tracks con URLs de audio y QR codes
      const enrichedTracks = tracks.map(track => ({
        ...track,
        audioUrl: this.audioService.getAudioUrl(track.audioFile, baseUrl),
        qrCodes: this.qrService.generateQRCodesForTrack(track.id),
        testUrls: this.generateTestUrls(track.id, baseUrl)
      }));

      const stats = this.trackService.getStats();
      const duration = timer();

      logger.info(`Retrieved ${enrichedTracks.length} tracks in ${duration}ms`);

      res.sendSuccess(enrichedTracks, `Retrieved ${enrichedTracks.length} tracks`, {
        count: enrichedTracks.length,
        stats,
        performance: `${duration}ms`,
        endpoints: this.generateEndpoints(baseUrl)
      });

    } catch (error) {
      timer();
      logger.error('Failed to get all tracks:', error);
      res.sendError('Failed to retrieve tracks', 'TRACKS_ERROR', 500, error.message);
    }
  });

  /**
   * ðŸŽµ Obtener track especÃ­fico
   * GET /api/tracks/:id
   */
  getTrackById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const timer = logger.startTimer('GET_TRACK');

    logger.info(`Fetching track: ${id}`);

    try {
      const track = this.trackService.getTrackById(id);
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const enrichedTrack = {
        ...track,
        audioUrl: this.audioService.getAudioUrl(track.audioFile, baseUrl),
        qrCodes: this.qrService.generateQRCodesForTrack(track.id),
        testUrls: this.generateTestUrls(track.id, baseUrl),
        validation: this.trackService.validateTrackData(track)
      };

      const duration = timer();
      logger.info(`Retrieved track ${track.title} in ${duration}ms`);

      res.sendSuccess(enrichedTrack, 'Track retrieved successfully', {
        performance: `${duration}ms`,
        audioAvailable: !!enrichedTrack.audioUrl
      });

    } catch (error) {
      timer();
      logger.error(`Failed to get track ${id}:`, error);

      if (error.name === 'FileNotFoundError') {
        res.sendNotFound('Track', id);
      } else {
        res.sendError('Failed to retrieve track', 'TRACK_ERROR', 500, error.message);
      }
    }
  });

  /**
   * ðŸŽ² Obtener track aleatorio
   * GET /api/tracks/random
   */
  getRandomTrack = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('GET_RANDOM_TRACK');
    const filters = this.parseFilters(req.query);

    logger.info('Getting random track with filters:', filters);

    try {
      const track = this.trackService.getRandomTrack(filters);
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const enrichedTrack = {
        ...track,
        audioUrl: this.audioService.getAudioUrl(track.audioFile, baseUrl),
        testUrls: this.generateTestUrls(track.id, baseUrl)
      };

      const duration = timer();
      logger.info(`Random track selected: ${track.title} in ${duration}ms`);

      res.sendSuccess(enrichedTrack, 'Random track retrieved successfully', {
        appliedFilters: filters,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error('Failed to get random track:', error);

      if (error.name === 'FileNotFoundError') {
        res.sendError('No tracks found matching the filters', 'NO_TRACKS_FOUND', 404, {
          availableFilters: this.getAvailableFilters()
        });
      } else {
        res.sendError('Failed to get random track', 'RANDOM_TRACK_ERROR', 500, error.message);
      }
    }
  });

  /**
   * ðŸ·ï¸ Generar cÃ³digos QR
   * GET /api/qr/generate
   */
  generateQRCodes = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('GENERATE_QR_CODES');

    logger.info('Generating QR codes for all tracks');

    try {
      const tracks = this.trackService.getAllTracks();
      const trackIds = tracks.map(track => track.id);

      const qrCodes = this.qrService.generateAllQRCodes(trackIds);
      const stats = this.qrService.getQRStats(qrCodes);

      const duration = timer();
      logger.info(`Generated ${qrCodes.length} QR codes in ${duration}ms`);

      res.sendSuccess({
        qrCodes,
        stats,
        total: qrCodes.length
      }, `Generated ${qrCodes.length} QR codes`, {
        performance: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      timer();
      logger.error('Failed to generate QR codes:', error);
      res.sendError('Failed to generate QR codes', 'QR_GENERATION_ERROR', 500, error.message);
    }
  });

  /**
   * ðŸ”§ Health check del sistema
   * GET /api/health
   */
  healthCheck = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('HEALTH_CHECK');

    logger.info('Performing health check');

    try {
      const services = {
        trackService: await this.trackService.healthCheck(),
        audioService: await this.audioService.healthCheck(),
        qrService: { status: 'healthy', service: 'QRService' }
      };

      // Determinar estado general
      const statuses = Object.values(services).map(s => s.status);
      let overallStatus = 'healthy';

      if (statuses.includes('error')) {
        overallStatus = 'error';
      } else if (statuses.includes('warning') || statuses.includes('degraded')) {
        overallStatus = 'degraded';
      }

      const duration = timer();
      logger.info(`Health check completed: ${overallStatus} in ${duration}ms`);

      res.sendHealthCheck(services, overallStatus);

    } catch (error) {
      timer();
      logger.error('Health check failed:', error);
      res.sendError('Health check failed', 'HEALTH_CHECK_ERROR', 500, error.message);
    }
  });

  /**
   * ðŸ” DiagnÃ³stico de audio
   * GET /api/audio/diagnostics
   */
  audioDiagnostics = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('AUDIO_DIAGNOSTICS');

    logger.info('Running audio diagnostics');

    try {
      const tracks = this.trackService.getAllTracks();
      const expectedFiles = tracks
        .filter(track => track.audioFile)
        .map(track => track.audioFile);

      const diagnostics = this.audioService.diagnoseAudioFiles(expectedFiles);
      const audioFiles = this.audioService.listAudioFiles();

      const duration = timer();
      logger.info(`Audio diagnostics completed in ${duration}ms`);

      res.sendSuccess({
        diagnostics,
        audioFiles,
        summary: {
          tracksExpected: expectedFiles.length,
          filesFound: audioFiles.length,
          missingFiles: diagnostics.missingFiles.length,
          orphanedFiles: diagnostics.orphanedFiles.length
        }
      }, 'Audio diagnostics completed', {
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error('Audio diagnostics failed:', error);
      res.sendError('Audio diagnostics failed', 'DIAGNOSTICS_ERROR', 500, error.message);
    }
  });

  // ========================================
  // MÃ‰TODOS HELPER PRIVADOS
  // ========================================

  /**
   * Parsea filtros de query parameters
   */
  parseFilters(query) {
    const filters = {};

    if (query.hasAudio === 'true') filters.hasQuestions = true;
    if (query.difficulty) filters.difficulty = query.difficulty;
    if (query.genre) filters.genre = query.genre;
    if (query.cardType) filters.cardType = query.cardType;
    if (query.decade) filters.decade = query.decade;
    if (query.artist) filters.artist = query.artist;
    if (query.year) filters.year = query.year;

    return filters;
  }

  /**
   * Genera URLs de test para un track
   */
  generateTestUrls(trackId, baseUrl) {
    return {
      songEasy: `${baseUrl}/api/qr/scan/HITBACK_${trackId}_SONG_EASY`,
      artistMedium: `${baseUrl}/api/qr/scan/HITBACK_${trackId}_ARTIST_MEDIUM`,
      decadeHard: `${baseUrl}/api/qr/scan/HITBACK_${trackId}_DECADE_HARD`,
      challengeExpert: `${baseUrl}/api/qr/scan/HITBACK_${trackId}_CHALLENGE_EXPERT`
    };
  }

  /**
   * Genera endpoints de la API
   */
  generateEndpoints(baseUrl) {
    return {
      scanQR: `${baseUrl}/api/qr/scan/:qrCode`,
      tracks: `${baseUrl}/api/tracks`,
      randomTrack: `${baseUrl}/api/tracks/random`,
      health: `${baseUrl}/api/health`,
      audioDiagnostics: `${baseUrl}/api/audio/diagnostics`,
      generateQR: `${baseUrl}/api/qr/generate`
    };
  }

  /**
   * Obtiene filtros disponibles
   */
  getAvailableFilters() {
    return {
      hasAudio: 'boolean',
      difficulty: 'easy|medium|hard|expert',
      genre: 'string',
      cardType: 'song|artist|decade|lyrics|challenge',
      decade: 'string (e.g., 2010s)',
      artist: 'string',
      year: 'number'
    };
  }
}

module.exports = GameController;