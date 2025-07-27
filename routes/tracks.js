const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cardController');

router.post('/scan/:qrCode', cardController.scanQRCode);

// ========================================
// TRACK ENDPOINTS (tus rutas existentes)
// ========================================
router.get('/', cardController.getAllTracks);

// Search tracks by title, artist, or genre
// GET /api/tracks/search?q=despacito
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        example: '/api/tracks/search?q=despacito'
      });
    }

    const tracksData = require('../data/tracks.json');
    const searchTerm = q.toLowerCase();

    const results = tracksData.tracks.filter(track =>
      track.title.toLowerCase().includes(searchTerm) ||
      track.artist.toLowerCase().includes(searchTerm) ||
      track.genre.toLowerCase().includes(searchTerm)
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const formattedResults = results.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      year: track.year,
      genre: track.genre,
      audioUrl: `${baseUrl}/audio/tracks/${track.audioFile}`,
      availableCards: Object.keys(track.questions)
    }));

    res.json({
      success: true,
      query: q,
      count: formattedResults.length,
      results: formattedResults
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Get specific track by ID (DEBE IR DESPUÉS de /search)
// GET /api/tracks/:id
router.get('/:id', cardController.getTrackById);

// ========================================
// AUDIO ENDPOINTS
// ========================================

// Get direct audio URL for a track
// GET /api/tracks/:id/audio
router.get('/:id/audio', (req, res) => {
  const { id } = req.params;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // Find the track to get the actual filename
  const tracksData = require('../data/tracks.json');
  const track = tracksData.tracks.find(t => t.id === id);

  if (!track) {
    return res.status(404).json({
      success: false,
      error: 'Track not found'
    });
  }

  const audioUrl = `${baseUrl}/audio/tracks/${track.audioFile}`;

  res.json({
    success: true,
    trackId: id,
    audioUrl: audioUrl,
    message: 'Use this URL to play the track preview'
  });
});

module.exports = router;