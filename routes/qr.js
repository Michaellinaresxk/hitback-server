// routes/qr.js - VERSION CON DEEZER INTEGRADO

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// 🛠️ FUNCION PARA CARGAR TRACKS CON MANEJO DE ERRORES
function loadTracks() {
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'data/tracks.json'),
      path.join(__dirname, '../data/tracks.json'),
      path.join(__dirname, '../../data/tracks.json'),
      path.join(process.cwd(), 'tracks.json'),
      path.join(__dirname, '../tracks.json'),
    ];

    let tracksData = null;
    let usedPath = null;

    for (const filePath of possiblePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          tracksData = JSON.parse(fileContent);
          usedPath = filePath;
          console.log(`✅ Tracks loaded from: ${filePath}`);
          break;
        }
      } catch (error) {
        console.log(`⚠️ Failed to load from ${filePath}: ${error.message}`);
        continue;
      }
    }

    if (!tracksData) {
      throw new Error('tracks.json not found in any expected location');
    }

    if (!tracksData.tracks || !Array.isArray(tracksData.tracks)) {
      throw new Error('Invalid tracks.json structure - missing tracks array');
    }

    console.log(`📊 Loaded ${tracksData.tracks.length} tracks from ${usedPath}`);
    return tracksData.tracks;

  } catch (error) {
    console.error('❌ Error loading tracks:', error.message);
    console.error('📁 Current working directory:', process.cwd());
    console.error('📁 __dirname:', __dirname);
    throw new Error(`Failed to load tracks: ${error.message}`);
  }
}

// 🎯 PARSEAR QR CODE CON VALIDACION
function parseQRCode(qrCode) {
  try {
    console.log(`🔍 Parsing QR code: ${qrCode}`);
    const qrPattern = /^HITBACK_(\d{3})_([A-Z]+)_([A-Z]+)$/;
    const match = qrCode.match(qrPattern);

    if (!match) {
      throw new Error(`Invalid QR code format: ${qrCode}. Expected: HITBACK_001_SONG_EASY`);
    }

    const [, trackId, questionType, difficulty] = match;
    console.log(`✅ QR parsed - Track: ${trackId}, Type: ${questionType}, Difficulty: ${difficulty}`);

    return {
      trackId,
      questionType: questionType.toLowerCase(),
      difficulty: difficulty.toLowerCase()
    };

  } catch (error) {
    console.error('❌ QR parsing error:', error.message);
    throw error;
  }
}

// 🎵 ENCONTRAR TRACK CON LOGGING DETALLADO
function findTrack(tracks, trackId) {
  try {
    console.log(`🔍 Looking for track ID: ${trackId}`);
    console.log(`📋 Available track IDs: ${tracks.map(t => t.id).join(', ')}`);

    const track = tracks.find(t => t.id === trackId);

    if (!track) {
      throw new Error(`Track not found: ${trackId}. Available tracks: ${tracks.map(t => t.id).join(', ')}`);
    }

    console.log(`✅ Track found: ${track.title} by ${track.artist}`);
    return track;

  } catch (error) {
    console.error('❌ Track lookup error:', error.message);
    throw error;
  }
}

// 🎯 GENERAR PREGUNTA CON FALLBACKS
function generateQuestion(track, questionType) {
  try {
    console.log(`🎯 Generating question - Type: ${questionType}`);

    if (!track.questions || typeof track.questions !== 'object') {
      console.warn(`⚠️ Track ${track.id} has no questions object, using defaults`);
      return generateDefaultQuestion(track, questionType);
    }

    const question = track.questions[questionType];

    if (!question) {
      console.warn(`⚠️ Question type '${questionType}' not found for track ${track.id}, using default`);
      return generateDefaultQuestion(track, questionType);
    }

    console.log(`✅ Question generated: ${question.question}`);
    return question;

  } catch (error) {
    console.error('❌ Question generation error:', error.message);
    return generateDefaultQuestion(track, questionType);
  }
}

// 🎯 PREGUNTAS POR DEFECTO
function generateDefaultQuestion(track, questionType) {
  const defaultQuestions = {
    song: {
      question: "¿Cuál es la canción?",
      answer: track.title,
      points: 1,
      hints: ["Escucha la canción", "Piensa en el título"]
    },
    artist: {
      question: "¿Quién canta esta canción?",
      answer: track.artist,
      points: 2,
      hints: ["Escucha la voz", "Piensa en el intérprete"]
    },
    decade: {
      question: "¿De qué década es esta canción?",
      answer: track.decade || `${Math.floor(track.year / 10) * 10}s`,
      points: 3,
      hints: ["Piensa en el año", "¿Cuándo se hizo popular?"]
    },
    lyrics: {
      question: "¿Reconoces esta canción por su letra?",
      answer: track.title,
      points: 3,
      hints: ["Escucha la letra", "¿Qué dice la canción?"]
    },
    challenge: {
      question: `Haz un desafío relacionado con ${track.title}`,
      answer: "Completar desafío",
      points: 5,
      hints: ["Sé creativo", "Demuestra tu conocimiento"]
    }
  };

  return defaultQuestions[questionType] || defaultQuestions.song;
}

// 🎵 GENERAR INFO DE AUDIO - SISTEMA HÍBRIDO CON DEEZER
async function generateAudioInfo(track, serverUrl = 'http://192.168.1.10:3000') {
  const audioInfo = {
    hasAudio: false,
    url: null,
    source: null,
    duration: 0,
    metadata: null
  };

  try {
    // 1️⃣ PRIORIDAD: Audio local (control total, sin restricciones)
    if (track.hasAudio && track.audioFile) {
      const localUrl = `${serverUrl}/audio/tracks/${track.audioFile}`;
      console.log(`✅ Audio local disponible: ${track.audioFile}`);

      audioInfo.hasAudio = true;
      audioInfo.url = localUrl;
      audioInfo.source = 'local';
      audioInfo.duration = Math.floor((track.duration || 180000) / 1000);
    }

    // 2️⃣ FALLBACK: Deezer preview (si no hay audio local)
    if (!audioInfo.hasAudio) {
      try {
        console.log(`🔍 No hay audio local, buscando en Deezer...`);
        const DeezerService = require('./services/DeezerService');
        const deezerTrack = await DeezerService.searchTrack(track.title, track.artist);

        if (deezerTrack && deezerTrack.previewUrl) {
          console.log(`✅ Deezer preview encontrado: ${deezerTrack.title}`);

          audioInfo.hasAudio = true;
          audioInfo.url = deezerTrack.previewUrl;
          audioInfo.source = 'deezer';
          audioInfo.duration = 30; // Previews son 30 segundos

          // Metadata de Deezer
          audioInfo.metadata = {
            deezerLink: deezerTrack.link,
            albumArt: deezerTrack.cover.large,
            explicit: deezerTrack.explicit
          };
        } else {
          console.log(`⚠️ No se encontró preview en Deezer`);
        }
      } catch (deezerError) {
        console.log(`⚠️ Deezer no disponible: ${deezerError.message}`);
      }
    }

    // 3️⃣ Si tenemos audio local, enriquecer con metadata de Deezer
    if (audioInfo.source === 'local') {
      try {
        console.log(`🔍 Obteniendo metadata de Deezer para enriquecer...`);
        const DeezerService = require('./services/DeezerService');
        const deezerTrack = await DeezerService.searchTrack(track.title, track.artist);

        if (deezerTrack) {
          console.log(`✅ Metadata de Deezer obtenida`);
          audioInfo.metadata = {
            deezerLink: deezerTrack.link,
            albumArt: deezerTrack.cover.large,
            explicit: deezerTrack.explicit
          };
        }
      } catch (e) {
        // No crítico, seguimos sin metadata
        console.log(`⚠️ No se pudo obtener metadata de Deezer`);
      }
    }

    return audioInfo;

  } catch (error) {
    console.error('❌ Error generando audio info:', error.message);
    return audioInfo;
  }
}

// 🚀 RUTA PRINCIPAL - QR SCAN CON MANEJO ROBUSTO DE ERRORES
router.post('/scan/:qrCode', async (req, res) => {
  const startTime = Date.now();
  const { qrCode } = req.params;

  try {
    console.log(`\n🎯 ===== QR SCAN REQUEST =====`);
    console.log(`📱 QR Code: ${qrCode}`);
    console.log(`🌐 IP: ${req.ip}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`===============================\n`);

    // 1. Validar parámetros
    if (!qrCode || typeof qrCode !== 'string' || qrCode.length === 0) {
      throw new Error('QR code is required and must be a non-empty string');
    }

    // 2. Cargar tracks
    console.log('📋 Loading tracks...');
    const tracks = loadTracks();

    // 3. Parsear QR code
    console.log('🔍 Parsing QR code...');
    const { trackId, questionType, difficulty } = parseQRCode(qrCode);

    // 4. Buscar track
    console.log('🎵 Finding track...');
    const track = findTrack(tracks, trackId);

    // 5. Generar pregunta
    console.log('🎯 Generating question...');
    const question = generateQuestion(track, questionType);

    // 6. Generar información de audio (AHORA ES ASYNC!)
    console.log('🎵 Generating audio info...');
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const audio = await generateAudioInfo(track, serverUrl);

    // 7. Preparar respuesta
    const responseData = {
      scan: {
        qrCode,
        timestamp: new Date().toISOString(),
        points: question.points || 1,
        difficulty,
        processingTime: Date.now() - startTime
      },
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genre: track.genre,
        difficulty: difficulty
      },
      question: {
        type: questionType,
        question: question.question,
        answer: question.answer,
        points: question.points || 1,
        hints: question.hints || []
      },
      audio: audio
    };

    console.log(`\n✅ ===== QR SCAN SUCCESS =====`);
    console.log(`🎵 Track: ${track.title} - ${track.artist}`);
    console.log(`🎯 Question: ${question.question}`);
    console.log(`🎵 Audio: ${audio.hasAudio ? `✅ ${audio.source}` : '❌ Not available'}`);
    console.log(`⏱️ Processing time: ${Date.now() - startTime}ms`);
    console.log(`===============================\n`);

    // 8. Enviar respuesta exitosa
    res.sendSuccess(responseData, `QR scan successful for ${track.title}`);

  } catch (error) {
    console.error(`\n❌ ===== QR SCAN ERROR =====`);
    console.error(`📱 QR Code: ${qrCode}`);
    console.error(`❌ Error: ${error.message}`);
    console.error(`📊 Stack: ${error.stack}`);
    console.error(`⏱️ Processing time: ${Date.now() - startTime}ms`);
    console.error(`===============================\n`);

    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';

    if (error.message.includes('not found') || error.message.includes('Invalid QR code format')) {
      statusCode = 404;
      errorCode = 'QR_NOT_FOUND';
    } else if (error.message.includes('Failed to load tracks')) {
      statusCode = 503;
      errorCode = 'SERVICE_UNAVAILABLE';
    }

    res.status(statusCode).json({
      success: false,
      error: {
        message: error.message,
        code: errorCode,
        timestamp: new Date().toISOString(),
        qrCode: qrCode,
        processingTime: Date.now() - startTime
      }
    });
  }
});

// 🧪 RUTA DE VALIDACION DE QR
router.get('/validate/:qrCode', (req, res) => {
  try {
    const { qrCode } = req.params;
    console.log(`🔍 Validating QR: ${qrCode}`);

    const parsed = parseQRCode(qrCode);

    res.sendSuccess({
      isValid: true,
      parsed: parsed
    }, 'QR code is valid');

  } catch (error) {
    console.error('❌ QR validation error:', error.message);

    res.sendSuccess({
      isValid: false,
      error: error.message
    }, 'QR code validation result');
  }
});

// 🎵 RUTA PARA LISTAR TRACKS DISPONIBLES
router.get('/tracks', (req, res) => {
  try {
    console.log('📋 Listing available tracks...');

    const tracks = loadTracks();

    const tracksList = tracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      hasAudio: track.hasAudio,
      availableQRs: [
        `HITBACK_${track.id}_SONG_EASY`,
        `HITBACK_${track.id}_ARTIST_EASY`,
        `HITBACK_${track.id}_DECADE_MEDIUM`,
        `HITBACK_${track.id}_LYRICS_MEDIUM`,
        `HITBACK_${track.id}_CHALLENGE_HARD`
      ]
    }));

    res.sendSuccess({
      tracks: tracksList,
      total: tracksList.length
    }, 'Available tracks');

  } catch (error) {
    console.error('❌ Error listing tracks:', error.message);
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        code: 'TRACKS_LOAD_ERROR'
      }
    });
  }
});

module.exports = router;