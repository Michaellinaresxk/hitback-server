// server.js - Main Server File
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const tracksRouter = require('./routes/tracks');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

// ✅ IMPORTANTE: Ambas rutas apuntan al mismo router
app.use('/api/tracks', tracksRouter);
app.use('/api/cards', tracksRouter);  // Para /api/cards/scan/:qrCode


// Load game data
const tracksData = JSON.parse(fs.readFileSync('./data/tracks.json', 'utf8'));
const powerCardsData = JSON.parse(fs.readFileSync('./data/powerCards.json', 'utf8'));

// 🎵 CARD SCANNING ENDPOINT
app.post('/api/cards/scan/:qrCode', (req, res) => {
  try {
    const { qrCode } = req.params;
    console.log(`🔍 Scanning QR: ${qrCode}`);

    // Validate QR format: HITBACK_001_SONG_EASY
    if (!qrCode.startsWith('HITBACK_')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid QR code format'
      });
    }

    const parts = qrCode.split('_');
    if (parts.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid QR code structure'
      });
    }

    const [prefix, trackId, cardType, difficulty] = parts;

    // Find track
    const track = tracksData.find(t => t.id === trackId);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    // Get card type data
    const cardTypeData = track.cardTypes[cardType.toLowerCase()];
    if (!cardTypeData) {
      return res.status(404).json({
        success: false,
        error: 'Card type not available for this track'
      });
    }

    // Calculate points based on difficulty
    const difficultyMultipliers = {
      'EASY': 1,
      'MEDIUM': 1.5,
      'HARD': 2,
      'EXPERT': 3
    };

    const basePoints = {
      'song': 1,
      'artist': 2,
      'decade': 3,
      'lyrics': 3,
      'challenge': 5
    };

    const points = Math.round(
      basePoints[cardType.toLowerCase()] *
      (difficultyMultipliers[difficulty] || 1)
    );

    // Build response
    const cardResponse = {
      success: true,
      qrCode: qrCode,
      card: {
        cardType: cardType.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        points: points,
        question: cardTypeData.question,
        answer: cardTypeData.answer,
        audioUrl: `${req.protocol}://${req.get('host')}/audio/${track.id}.mp3`,
        duration: 5, // 5 seconds
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
          year: track.year,
          genre: track.genre
        }
      }
    };

    console.log(`✅ Card found: ${track.title} - ${cardType} (${points} pts)`);
    res.json(cardResponse);

  } catch (error) {
    console.error('❌ Scan error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// 🎵 GET ALL TRACKS (for admin)
app.get('/api/tracks', (req, res) => {
  res.json({
    success: true,
    tracks: tracksData.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      year: track.year,
      genre: track.genre,
      difficulty: track.difficulty,
      qrCodes: generateQRCodesForTrack(track.id)
    }))
  });
});

// 🃏 GET POWER CARDS
app.get('/api/power-cards', (req, res) => {
  res.json({
    success: true,
    powerCards: powerCardsData.powerCards
  });
});

// 🎮 GAME STATS ENDPOINT
app.post('/api/game/stats', (req, res) => {
  try {
    const { gameId, players, duration, winner, totalRounds } = req.body;

    // Here you could save to database
    console.log(`🏆 Game completed: ${winner} won in ${duration}s`);

    res.json({
      success: true,
      message: 'Game stats saved',
      gameId: gameId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to save game stats'
    });
  }
});

// 🎵 AUDIO STREAMING ENDPOINT
app.get('/api/audio/:trackId', (req, res) => {
  try {
    const { trackId } = req.params;
    const audioPath = path.join(__dirname, 'public/audio', `${trackId}.mp3`);

    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({
        success: false,
        error: 'Audio file not found'
      });
    }

    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Support for range requests (streaming)
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(audioPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(200, head);
      fs.createReadStream(audioPath).pipe(res);
    }
  } catch (error) {
    console.error('Audio streaming error:', error);
    res.status(500).json({
      success: false,
      error: 'Audio streaming failed'
    });
  }
});

// 🧪 TESTING ENDPOINTS
app.get('/api/test/qr/:qrCode', (req, res) => {
  const { qrCode } = req.params;
  res.json({
    success: true,
    message: `QR ${qrCode} would be processed`,
    timestamp: new Date().toISOString()
  });
});

// 📊 HEALTH CHECK
app.get('/', (req, res) => {
  res.json({
    message: 'HITBACK Game Server Running! 🎵',
    version: '1.0.0',
    endpoints: [
      'POST /api/cards/scan/:qrCode',
      'GET /api/tracks',
      'GET /api/power-cards',
      'POST /api/game/stats',
      'GET /api/audio/:trackId'
    ]
  });
});

// Helper function to generate QR codes for a track
function generateQRCodesForTrack(trackId) {
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 HITBACK Server running on http://localhost:${PORT}`);
  console.log(`📱 For mobile testing: http://YOUR_IP:${PORT}`);
  console.log(`🎵 Audio files should be in: ./public/audio/`);
});

module.exports = app;