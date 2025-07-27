const path = require('path');
const fs = require('fs');

// ✅ Función helper para cargar datos de manera segura
const loadTracksData = () => {
  try {
    const tracksPath = path.join(__dirname, '..', 'data', 'tracks.json');

    if (!fs.existsSync(tracksPath)) {
      console.error('❌ tracks.json not found at:', tracksPath);
      return { tracks: [] };
    }

    const data = fs.readFileSync(tracksPath, 'utf8');
    const parsed = JSON.parse(data);

    console.log(`✅ Loaded ${parsed.tracks?.length || 0} tracks`);
    return parsed;
  } catch (error) {
    console.error('❌ Error loading tracks data:', error);
    return { tracks: [] };
  }
};

// ✅ Helper function to parse QR code
const parseQRCode = (qrCode) => {
  console.log(`🔍 Parsing QR: ${qrCode}`);

  // Expected format: HITBACK_001_SONG_EASY
  const parts = qrCode.split('_');

  if (parts.length < 2 || parts[0] !== 'HITBACK') {
    throw new Error(`Invalid QR code format. Expected: HITBACK_001_SONG_EASY, got: ${qrCode}`);
  }

  const trackId = parts[1];
  const cardType = parts[2] ? parts[2].toLowerCase() : 'song';
  const difficulty = parts[3] ? parts[3].toLowerCase() : 'medium';

  console.log(`📋 Parsed - Track: ${trackId}, Type: ${cardType}, Difficulty: ${difficulty}`);
  return { trackId, cardType, difficulty };
};

// ✅ Helper function to build audio URL
const buildAudioUrl = (req, audioFile) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/audio/${audioFile}`;
};

// ✅ Helper function to calculate points based on difficulty
const calculatePoints = (basePoints, difficulty) => {
  const multipliers = {
    easy: 1,
    medium: 1.5,
    hard: 2,
    expert: 3
  };

  return Math.round(basePoints * (multipliers[difficulty] || 1));
};

// ✅ Helper function to validate track structure
const validateTrack = (track) => {
  const required = ['id', 'title', 'artist', 'audioFile', 'questions'];
  const missing = required.filter(field => !track[field]);

  if (missing.length > 0) {
    throw new Error(`Track ${track.id} missing required fields: ${missing.join(', ')}`);
  }

  return true;
};

// ========================================
// MAIN QR SCAN CONTROLLER - ✅ CORREGIDO
// ========================================

exports.scanQRCode = async (req, res) => {
  try {
    const { qrCode } = req.params;
    console.log(`🔍 Scanning QR: ${qrCode}`);

    // Parse QR code
    const { trackId, cardType, difficulty } = parseQRCode(qrCode);

    // Load tracks data
    const tracksData = loadTracksData();
    const track = tracksData.tracks.find(t => t.id === trackId);

    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        qrCode: qrCode,
        availableIds: tracksData.tracks.map(t => t.id)
      });
    }

    // ✅ SOPORTE PARA AMBAS ESTRUCTURAS: questions Y cardTypes
    let question;
    if (track.questions && track.questions[cardType]) {
      question = track.questions[cardType];
    } else if (track.cardTypes && track.cardTypes[cardType]) {
      question = track.cardTypes[cardType];
    } else {
      return res.status(404).json({
        success: false,
        error: `No ${cardType} data found for this track`,
        qrCode: qrCode,
        availableTypes: Object.keys(track.questions || track.cardTypes || {})
      });
    }

    // Build audio URL
    const audioUrl = buildAudioUrl(req, track.audioFile || `${track.id}.mp3`);

    // ✅ NO FALLAR SI NO HAY AUDIO - Solo advertir
    const audioPath = path.join(__dirname, '..', 'public', 'audio', track.audioFile || `${track.id}.mp3`);
    const audioExists = fs.existsSync(audioPath);

    if (!audioExists) {
      console.warn(`⚠️ Audio file not found: ${track.audioFile}, but continuing...`);
    }

    // Calculate points
    const finalPoints = calculatePoints(question.points, difficulty);

    // ✅ RESPUESTA EXITOSA INCLUSO SIN AUDIO
    const response = {
      success: true,
      qrCode: qrCode,
      card: {
        cardType: cardType,
        difficulty: difficulty,
        points: finalPoints,
        question: question.question,
        answer: question.answer,
        audioUrl: audioUrl,
        duration: track.duration || 30,
        audioExists: audioExists,
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
          year: track.year,
          genre: track.genre
        }
      }
    };

    console.log(`✅ QR Scan Success: ${track.title} - ${cardType} (${finalPoints}pts) [Audio: ${audioExists ? 'OK' : 'Missing'}]`);
    res.json(response);

  } catch (error) {
    console.error('❌ QR SCAN ERROR:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      qrCode: req.params.qrCode
    });
  }
};

// ========================================
// GET ALL TRACKS - ✅ CORREGIDO
// ========================================

exports.getAllTracks = (req, res) => {
  try {
    console.log('📊 Getting all tracks...');

    const tracksData = loadTracksData();

    if (!tracksData.tracks || tracksData.tracks.length === 0) {
      return res.json({
        success: true,
        count: 0,
        tracks: [],
        message: 'No tracks available'
      });
    }

    const tracks = tracksData.tracks.map(track => {
      try {
        validateTrack(track);

        return {
          id: track.id,
          qrCode: track.qrCode || `HITBACK_${track.id}`,
          title: track.title,
          artist: track.artist,
          year: track.year,
          genre: track.genre,
          difficulty: track.difficulty,
          audioUrl: buildAudioUrl(req, track.audioFile),
          availableCardTypes: Object.keys(track.questions || {}),
          audioExists: fs.existsSync(path.join(__dirname, '..', 'public', 'audio', track.audioFile))
        };
      } catch (error) {
        console.warn(`⚠️ Invalid track ${track.id}:`, error.message);
        return null;
      }
    }).filter(Boolean); // Remove null tracks

    console.log(`✅ Returning ${tracks.length} valid tracks`);

    res.json({
      success: true,
      count: tracks.length,
      tracks: tracks,
      timestamp: new Date().toISOString()
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
// GET SPECIFIC TRACK - ✅ CORREGIDO
// ========================================

exports.getTrackById = (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🎵 Getting track by ID: ${id}`);

    const tracksData = loadTracksData();
    const track = tracksData.tracks?.find(t => t.id === id);

    if (!track) {
      console.log(`❌ Track ${id} not found`);
      return res.status(404).json({
        success: false,
        error: 'Track not found',
        availableIds: tracksData.tracks?.map(t => t.id) || []
      });
    }

    try {
      validateTrack(track);
    } catch (validationError) {
      return res.status(500).json({
        success: false,
        error: 'Track data invalid',
        message: validationError.message
      });
    }

    const audioPath = path.join(__dirname, '..', 'public', 'audio', track.audioFile);
    const audioExists = fs.existsSync(audioPath);

    const response = {
      success: true,
      track: {
        ...track,
        audioUrl: buildAudioUrl(req, track.audioFile),
        audioExists: audioExists,
        availableCardTypes: Object.keys(track.questions || {})
      }
    };

    console.log(`✅ Track found: ${track.title}`);
    res.json(response);

  } catch (error) {
    console.error('❌ Error getting track:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get track',
      message: error.message
    });
  }
};

// ========================================
// GENERATE QR CODES (UTILITY) - ✅ MEJORADO
// ========================================

exports.generateQRCodes = (req, res) => {
  try {
    console.log('🏷️ Generating QR codes...');

    const tracksData = loadTracksData();
    const cardTypes = ['song', 'artist', 'decade', 'lyrics', 'challenge'];
    const difficulties = ['easy', 'medium', 'hard', 'expert'];

    const qrCodes = [];

    tracksData.tracks?.forEach(track => {
      try {
        validateTrack(track);

        cardTypes.forEach(cardType => {
          // Only generate QR if the track has that question type
          if (track.questions[cardType]) {
            difficulties.forEach(difficulty => {
              const qrCode = `HITBACK_${track.id}_${cardType.toUpperCase()}_${difficulty.toUpperCase()}`;

              qrCodes.push({
                qrCode,
                trackId: track.id,
                trackTitle: track.title,
                cardType,
                difficulty,
                points: calculatePoints(track.questions[cardType].points, difficulty),
                question: track.questions[cardType].question,
                audioUrl: buildAudioUrl(req, track.audioFile)
              });
            });
          }
        });
      } catch (error) {
        console.warn(`⚠️ Skipping invalid track ${track.id}:`, error.message);
      }
    });

    console.log(`✅ Generated ${qrCodes.length} QR codes`);

    res.json({
      success: true,
      message: 'QR codes generated for physical cards',
      totalCodes: qrCodes.length,
      qrCodes: qrCodes,
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
// HEALTH CHECK - ✅ MEJORADO
// ========================================

exports.healthCheck = (req, res) => {
  try {
    console.log('🏥 Health check...');

    const tracksData = loadTracksData();
    const audioPath = path.join(__dirname, '..', 'public', 'audio');

    // Check if audio directory exists
    const audioExists = fs.existsSync(audioPath);

    // Count audio files
    let audioCount = 0;
    let missingAudio = [];

    if (audioExists) {
      const files = fs.readdirSync(audioPath);
      audioCount = files.filter(file => file.endsWith('.mp3')).length;

      // Check for missing audio files
      tracksData.tracks?.forEach(track => {
        const trackAudioPath = path.join(audioPath, track.audioFile);
        if (!fs.existsSync(trackAudioPath)) {
          missingAudio.push(track.audioFile);
        }
      });
    }

    const health = {
      success: true,
      message: 'Card service is healthy',
      timestamp: new Date().toISOString(),
      stats: {
        totalTracks: tracksData.tracks?.length || 0,
        audioDirectory: audioExists ? 'exists' : 'missing',
        audioFiles: audioCount,
        expectedAudioFiles: tracksData.tracks?.length || 0,
        missingAudioFiles: missingAudio.length,
        missingAudioList: missingAudio
      },
      endpoints: {
        scan: '/api/cards/scan/:qrCode',
        tracks: '/api/tracks',
        generate: '/api/cards/generate-qr',
        health: '/api/cards/health'
      },
      directories: {
        tracks: path.join(__dirname, '..', 'data', 'tracks.json'),
        audio: audioPath
      }
    };

    // Add warnings if there are issues
    if (missingAudio.length > 0) {
      health.warnings = [`${missingAudio.length} audio files are missing`];
    }

    if (!audioExists) {
      health.warnings = [...(health.warnings || []), 'Audio directory does not exist'];
    }

    console.log(`✅ Health check completed - ${tracksData.tracks?.length || 0} tracks, ${audioCount} audio files`);

    res.json(health);

  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};