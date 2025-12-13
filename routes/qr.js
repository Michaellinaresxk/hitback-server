const express = require('express');
const router = express.Router();
const QRService = require('../services/QRService');
const TrackService = require('../services/TrackService');
const DeezerService = require('../services/DeezerService');

// Instanciar QRService
const qrService = new QRService();

/**
 * 🎯 GENERAR PREGUNTA PARA UN TRACK
 */
function generateQuestion(track, cardType) {
  // Si el track tiene preguntas predefinidas, usarlas
  if (track.questions && track.questions[cardType]) {
    return track.questions[cardType];
  }

  // Preguntas por defecto
  const defaults = {
    song: {
      question: "¿Cuál es el nombre de esta canción?",
      answer: track.title,
      points: 1,
      hints: ["Escucha atentamente la melodía", "Es un éxito conocido"]
    },
    artist: {
      question: "¿Quién interpreta esta canción?",
      answer: track.artist,
      points: 2,
      hints: ["Reconoce la voz", "Piensa en el estilo musical"]
    },
    decade: {
      question: "¿De qué década es esta canción?",
      answer: track.decade || `${Math.floor(track.year / 10) * 10}s`,
      points: 3,
      hints: ["Escucha el estilo de producción", "¿Suena retro o moderno?"]
    },
    lyrics: {
      question: "Completa la letra de esta canción...",
      answer: track.title,
      points: 3,
      hints: ["Presta atención a la letra", "Es una frase conocida"]
    },
    challenge: {
      question: `¡Demuestra tu talento con "${track.title}"!`,
      answer: "Completar el desafío",
      points: 5,
      challengeType: "performance",
      hints: ["Sé creativo", "Diviértete"]
    }
  };

  return defaults[cardType] || defaults.song;
}

/**
 * 🎵 OBTENER AUDIO DE DEEZER
 */
async function getAudioFromDeezer(track) {
  const audioInfo = {
    hasAudio: false,
    url: null,
    source: 'deezer',
    duration: 30,
    metadata: null
  };

  try {
    console.log(`🎵 Buscando en Deezer: "${track.title}" - ${track.artist}`);

    const deezerTrack = await DeezerService.searchTrack(track.title, track.artist);

    if (deezerTrack && deezerTrack.previewUrl) {
      console.log(`✅ Preview de Deezer encontrado`);

      audioInfo.hasAudio = true;
      audioInfo.url = deezerTrack.previewUrl;
      audioInfo.duration = 30;
      audioInfo.metadata = {
        deezerLink: deezerTrack.link,
        albumArt: deezerTrack.cover?.large || deezerTrack.cover?.medium,
        album: deezerTrack.album,
        artistId: deezerTrack.artistId,
        explicit: deezerTrack.explicit || false
      };
    } else {
      console.log(`⚠️ No se encontró preview en Deezer para: ${track.title}`);
    }
  } catch (error) {
    console.error(`❌ Error buscando en Deezer: ${error.message}`);
  }

  return audioInfo;
}

/**
 * 🚀 RUTA PRINCIPAL: ESCANEAR QR
 * POST /api/qr/scan/:qrCode
 */
router.post('/scan/:qrCode', async (req, res) => {
  const startTime = Date.now();
  const { qrCode } = req.params;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🎯 QR SCAN: ${qrCode}`);
  console.log(`⏰ ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(50)}\n`);

  try {
    // 1. Parsear QR (soporta ambos formatos)
    const parsedQR = qrService.parseQRCode(qrCode);
    console.log(`📱 Formato: ${parsedQR.format}`);

    // 2. Obtener track según el formato
    let track;

    if (parsedQR.format === 'NEW') {
      // ✅ FORMATO NUEVO: Selección aleatoria con filtros
      console.log(`🎲 Selección aleatoria con filtros:`);
      console.log(`   Dificultad: ${parsedQR.difficulty}`);
      console.log(`   Género: ${parsedQR.genre}`);
      console.log(`   Década: ${parsedQR.decade}`);

      track = TrackService.getRandomTrack({
        difficulty: parsedQR.difficulty.toUpperCase(),
        genre: parsedQR.genre,
        decade: parsedQR.decade
      });
    } else {
      // ⚠️ FORMATO ANTIGUO: Track específico por ID
      console.log(`📌 Buscando track por ID: ${parsedQR.trackId}`);
      track = TrackService.getTrackById(parsedQR.trackId);
    }

    if (!track) {
      throw new Error('No se encontró ningún track con los filtros especificados');
    }

    console.log(`✅ Track seleccionado: "${track.title}" - ${track.artist}`);

    // 3. Obtener audio de Deezer
    const audio = await getAudioFromDeezer(track);

    // 4. Generar pregunta
    const question = generateQuestion(track, parsedQR.cardType);

    // 5. Construir respuesta
    const responseData = {
      scan: {
        qrCode,
        format: parsedQR.format,
        timestamp: new Date().toISOString(),
        points: parsedQR.points,
        difficulty: parsedQR.difficulty,
        processingTime: Date.now() - startTime,
        filters: parsedQR.format === 'NEW' ? {
          genre: parsedQR.genre,
          decade: parsedQR.decade,
          cardType: parsedQR.cardType
        } : null
      },
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || null,
        year: track.year || null,
        genre: track.genre || null,
        decade: track.decade || null,
        difficulty: track.difficulty || null
      },
      question: {
        type: parsedQR.cardType,
        question: question.question,
        answer: question.answer,
        points: parsedQR.points,
        hints: question.hints || [],
        challengeType: question.challengeType || null
      },
      audio
    };

    console.log(`\n✅ SCAN EXITOSO`);
    console.log(`   Track: ${track.title}`);
    console.log(`   Audio: ${audio.hasAudio ? '✅ Deezer' : '❌ No disponible'}`);
    console.log(`   Tiempo: ${Date.now() - startTime}ms\n`);

    // 6. Enviar respuesta
    if (res.sendSuccess) {
      res.sendSuccess(responseData, `QR scan successful: ${track.title}`);
    } else {
      res.json({
        success: true,
        message: `QR scan successful: ${track.title}`,
        data: responseData
      });
    }

  } catch (error) {
    console.error(`\n❌ ERROR EN SCAN: ${error.message}\n`);

    const statusCode =
      error.message.includes('no encontrado') || error.message.includes('not found') ? 404 :
        error.message.includes('inválido') || error.message.includes('invalid') || error.name === 'QRError' ? 400 :
          500;

    const errorResponse = {
      success: false,
      error: {
        message: error.message,
        code: statusCode === 404 ? 'NOT_FOUND' : statusCode === 400 ? 'INVALID_FORMAT' : 'SERVER_ERROR',
        qrCode,
        processingTime: Date.now() - startTime,
        help: qrService.getHelpInfo()
      }
    };

    if (res.sendError) {
      res.status(statusCode).sendError(error.message, errorResponse.error.code, statusCode);
    } else {
      res.status(statusCode).json(errorResponse);
    }
  }
});

/**
 * 🔗 GET también funciona (para testing en browser)
 */
router.get('/scan/:qrCode', async (req, res, next) => {
  // Redirigir al POST
  return router.handle(req, res, next);
});

/**
 * 🧪 VALIDAR QR SIN ESCANEAR
 * GET /api/qr/validate/:qrCode
 */
router.get('/validate/:qrCode', (req, res) => {
  const { qrCode } = req.params;

  try {
    const parsed = qrService.parseQRCode(qrCode);

    const response = {
      isValid: true,
      format: parsed.format,
      parsed: {
        cardType: parsed.cardType,
        difficulty: parsed.difficulty,
        genre: parsed.genre,
        decade: parsed.decade,
        points: parsed.points
      }
    };

    if (res.sendSuccess) {
      res.sendSuccess(response, 'QR válido');
    } else {
      res.json({ success: true, data: response });
    }

  } catch (error) {
    const response = {
      isValid: false,
      error: error.message,
      help: qrService.getHelpInfo()
    };

    if (res.sendSuccess) {
      res.sendSuccess(response, 'Resultado de validación');
    } else {
      res.json({ success: true, data: response });
    }
  }
});

/**
 * 📊 ESTADÍSTICAS DE QR
 * GET /api/qr/stats
 */
router.get('/stats', (req, res) => {
  try {
    const tracks = TrackService.getAllTracks();

    const stats = {
      totalTracks: tracks.length,
      byGenre: {},
      byDecade: {},
      byDifficulty: {},
      possibleCombinations: 0
    };

    tracks.forEach(track => {
      const genre = track.genre || 'Unknown';
      const decade = track.decade || 'Unknown';
      const difficulty = track.difficulty || 'Unknown';

      stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1;
      stats.byDecade[decade] = (stats.byDecade[decade] || 0) + 1;
      stats.byDifficulty[difficulty] = (stats.byDifficulty[difficulty] || 0) + 1;
    });

    // Calcular combinaciones posibles (5 tipos × 4 dificultades × tracks)
    stats.possibleCombinations = tracks.length * 5 * 4;

    if (res.sendSuccess) {
      res.sendSuccess(stats, 'QR Statistics');
    } else {
      res.json({ success: true, data: stats });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * 🏗️ GENERAR QR CODES DE EJEMPLO
 * GET /api/qr/generate
 */
router.get('/generate', (req, res) => {
  const { type, difficulty, genre, decade } = req.query;

  const examples = [
    qrService.generateQRCode({ cardType: type || 'SONG', difficulty: difficulty || 'EASY', genre: genre || 'ANY', decade: decade || 'ANY' }),
    qrService.generateQRCode({ cardType: 'ARTIST', difficulty: 'MEDIUM', genre: 'ROCK', decade: '1980s' }),
    qrService.generateQRCode({ cardType: 'DECADE', difficulty: 'HARD', genre: 'POP', decade: '2010s' }),
    qrService.generateQRCode({ cardType: 'CHALLENGE', difficulty: 'EXPERT', genre: 'REGGAETON', decade: 'ANY' }),
  ];

  const response = {
    generated: examples[0],
    examples,
    format: 'HITBACK_TYPE:{type}_DIFF:{difficulty}_GENRE:{genre}_DECADE:{decade}',
    validValues: qrService.getHelpInfo()
  };

  if (res.sendSuccess) {
    res.sendSuccess(response, 'QR codes generated');
  } else {
    res.json({ success: true, data: response });
  }
});

/**
 * 📋 LISTAR TRACKS CON QR INFO
 * GET /api/qr/tracks
 */
router.get('/tracks', (req, res) => {
  try {
    const tracks = TrackService.getAllTracks();

    const tracksWithQR = tracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre,
      decade: track.decade,
      difficulty: track.difficulty,
      sampleQRs: {
        song: qrService.generateQRCode({
          cardType: 'SONG',
          difficulty: track.difficulty || 'EASY',
          genre: track.genre || 'ANY',
          decade: track.decade || 'ANY'
        }),
        artist: qrService.generateQRCode({
          cardType: 'ARTIST',
          difficulty: track.difficulty || 'EASY',
          genre: track.genre || 'ANY',
          decade: track.decade || 'ANY'
        })
      }
    }));

    if (res.sendSuccess) {
      res.sendSuccess({ tracks: tracksWithQR, total: tracksWithQR.length }, 'Tracks with QR info');
    } else {
      res.json({ success: true, data: { tracks: tracksWithQR, total: tracksWithQR.length } });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});



router.post('/reset-used', (req, res) => {
  try {
    TrackService.resetUsedTracks();

    const status = TrackService.getUsedTracksStatus();

    res.json({
      success: true,
      message: 'Tracks usados reseteados correctamente',
      data: status
    });
  } catch (error) {
    console.error('❌ Error reseteando tracks:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * 📊 OBTENER ESTADO DE TRACKS USADOS
 * GET /api/qr/used-status
 * 
 * Para debugging y UI
 */
router.get('/used-status', (req, res) => {
  try {
    const status = TrackService.getUsedTracksStatus();

    res.json({
      success: true,
      message: `${status.available} tracks disponibles de ${status.total}`,
      data: {
        ...status,
        percentageUsed: Math.round((status.used / status.total) * 100)
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo estado:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

module.exports = router;