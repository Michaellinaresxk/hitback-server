# HITBACK Backend

Simple backend for HITBACK music game.

## Quick Setup

### 1. Install
```bash
npm install
```

### 2. Create Audio Folders
```bash
mkdir -p public/audio/tracks
mkdir -p public/audio/effects
```

### 3. Add Audio Files
Put your MP3 files in `public/audio/tracks/`:
- 001_despacito_preview.mp3
- 002_bohemian_rhapsody_preview.mp3
- 003_shape_of_you_preview.mp3

### 4. Start Server
```bash
npm start
```

Server runs on http://localhost:3000

## Test Endpoints

### Health Check
```bash
curl http://localhost:3000/
```

### QR Scan
```bash
curl -X POST http://localhost:3000/api/cards/scan/HITBACK_001_SONG_EASY
```

### Get Tracks
```bash
curl http://localhost:3000/api/tracks
```

## Audio URLs
Audio files are served at:
- http://localhost:3000/audio/tracks/001_despacito_preview.mp3
- http://localhost:3000/audio/tracks/002_bohemian_rhapsody_preview.mp3

## QR Code Format
```
HITBACK_001_SONG_EASY
HITBACK_002_ARTIST_MEDIUM
HITBACK_003_DECADE_HARD
```

## File Structure
```
project/
├── package.json
├── server.js
├── data/
│   └── tracks.json
└── public/
    └── audio/
        └── tracks/
            ├── 001_despacito_preview.mp3
            ├── 002_bohemian_rhapsody_preview.mp3
            └── 003_shape_of_you_preview.mp3
```

## Troubleshooting

If you get path-to-regexp errors:
1. Delete node_modules: `rm -rf node_modules`
2. Reinstall: `npm install`
3. Try again: `npm start`

If audio doesn't work:
1. Check files exist in public/audio/tracks/
2. Check file permissions
3. Test direct URL in browser