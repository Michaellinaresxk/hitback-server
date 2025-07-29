
const fs = require('fs');
const path = require('path');

console.log('🎵 HITBACK - Local Audio Setup\n');

function createDirectories() {
  const directories = [
    'public/audio/tracks',
    'data',
    'logs',
    'backups'
  ];

  console.log('📁 Creating directories...');
  directories.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created: ${dir}`);
    } else {
      console.log(`✅ Exists: ${dir}`);
    }
  });
}

function createTracksFile() {
  const tracksPath = path.join(__dirname, 'data', 'tracks.json');

  if (fs.existsSync(tracksPath)) {
    console.log('\n📂 tracks.json already exists');
    return;
  }

  console.log('\n📂 Creating tracks.json...');

  const tracksData = {
    "tracks": [
      {
        "id": "001",
        "qrCode": "HITBACK_001",
        "title": "Despacito",
        "artist": "Luis Fonsi ft. Daddy Yankee",
        "album": "Vida",
        "year": 2017,
        "decade": "2010s",
        "genre": "Reggaeton",
        "difficulty": "easy",
        "popularity": 95,
        "audioFile": "001_despacito.mp3",
        "duration": 30000,
        "questions": {
          "song": {
            "question": "¿Cuál es la canción?",
            "answer": "Despacito",
            "points": 1
          },
          "artist": {
            "question": "¿Quién la canta?",
            "answer": "Luis Fonsi ft. Daddy Yankee",
            "points": 2
          },
          "decade": {
            "question": "¿De qué década es?",
            "answer": "2010s",
            "points": 3
          },
          "lyrics": {
            "question": "Completa: 'Sí, sabes que ya llevo un rato...'",
            "answer": "mirándote",
            "points": 3
          },
          "challenge": {
            "question": "Baila los primeros 10 segundos de Despacito",
            "answer": "Completar baile reggaeton",
            "points": 5,
            "challengeType": "dance"
          }
        }
      },
      {
        "id": "002",
        "qrCode": "HITBACK_002",
        "title": "Bohemian Rhapsody",
        "artist": "Queen",
        "album": "A Night At The Opera",
        "year": 1975,
        "decade": "1970s",
        "genre": "Rock",
        "difficulty": "hard",
        "popularity": 90,
        "audioFile": "002_bohemian_rhapsody.mp3",
        "duration": 30000,
        "questions": {
          "song": {
            "question": "¿Cuál es la canción?",
            "answer": "Bohemian Rhapsody",
            "points": 1
          },
          "artist": {
            "question": "¿Quién la canta?",
            "answer": "Queen",
            "points": 2
          },
          "decade": {
            "question": "¿De qué década es?",
            "answer": "1970s",
            "points": 3
          },
          "lyrics": {
            "question": "Completa: 'Is this the real life...'",
            "answer": "is this just fantasy",
            "points": 3
          },
          "challenge": {
            "question": "Imita a Freddie Mercury cantando la canción",
            "answer": "Completar imitación de Freddie",
            "points": 5,
            "challengeType": "imitate"
          }
        }
      },
      {
        "id": "003",
        "qrCode": "HITBACK_003",
        "title": "Shape of You",
        "artist": "Ed Sheeran",
        "album": "Divide",
        "year": 2017,
        "decade": "2010s",
        "genre": "Pop",
        "difficulty": "medium",
        "popularity": 88,
        "audioFile": "003_shape_of_you.mp3",
        "duration": 30000,
        "questions": {
          "song": {
            "question": "¿Cuál es la canción?",
            "answer": "Shape of You",
            "points": 1
          },
          "artist": {
            "question": "¿Quién la canta?",
            "answer": "Ed Sheeran",
            "points": 2
          },
          "decade": {
            "question": "¿De qué década es?",
            "answer": "2010s",
            "points": 3
          },
          "lyrics": {
            "question": "Completa: 'The club isn't the best place...'",
            "answer": "to find a lover",
            "points": 3
          },
          "challenge": {
            "question": "Canta el coro completo",
            "answer": "Cantar coro de Shape of You",
            "points": 5,
            "challengeType": "sing"
          }
        }
      },
      {
        "id": "004",
        "qrCode": "HITBACK_004",
        "title": "Uptown Funk",
        "artist": "Mark Ronson ft. Bruno Mars",
        "album": "Uptown Special",
        "year": 2014,
        "decade": "2010s",
        "genre": "Funk",
        "difficulty": "medium",
        "popularity": 92,
        "audioFile": "004_uptown_funk.mp3",
        "duration": 30000,
        "questions": {
          "song": {
            "question": "¿Cuál es la canción?",
            "answer": "Uptown Funk",
            "points": 1
          },
          "artist": {
            "question": "¿Quién la canta?",
            "answer": "Mark Ronson ft. Bruno Mars",
            "points": 2
          },
          "decade": {
            "question": "¿De qué década es?",
            "answer": "2010s",
            "points": 3
          },
          "lyrics": {
            "question": "Completa: 'This hit, that ice cold...'",
            "answer": "Michelle Pfeiffer, that white gold",
            "points": 3
          },
          "challenge": {
            "question": "Haz el moonwalk durante 10 segundos",
            "answer": "Completar moonwalk",
            "points": 5,
            "challengeType": "dance"
          }
        }
      },
      {
        "id": "005",
        "qrCode": "HITBACK_005",
        "title": "Billie Jean",
        "artist": "Michael Jackson",
        "album": "Thriller",
        "year": 1983,
        "decade": "1980s",
        "genre": "Pop",
        "difficulty": "easy",
        "popularity": 89,
        "audioFile": "005_billie_jean.mp3",
        "duration": 30000,
        "questions": {
          "song": {
            "question": "¿Cuál es la canción?",
            "answer": "Billie Jean",
            "points": 1
          },
          "artist": {
            "question": "¿Quién la canta?",
            "answer": "Michael Jackson",
            "points": 2
          },
          "decade": {
            "question": "¿De qué década es?",
            "answer": "1980s",
            "points": 3
          },
          "lyrics": {
            "question": "Completa: 'Billie Jean is not my...'",
            "answer": "lover",
            "points": 3
          },
          "challenge": {
            "question": "Haz el moonwalk como Michael Jackson",
            "answer": "Completar moonwalk de MJ",
            "points": 5,
            "challengeType": "dance"
          }
        }
      },
      {
        "id": "006",
        "qrCode": "HITBACK_006",
        "title": "Hotel California",
        "artist": "Eagles",
        "album": "Hotel California",
        "year": 1976,
        "decade": "1970s",
        "genre": "Rock",
        "difficulty": "hard",
        "popularity": 85,
        "audioFile": "006_hotel_california.mp3",
        "duration": 30000,
        "questions": {
          "song": {
            "question": "¿Cuál es la canción?",
            "answer": "Hotel California",
            "points": 1
          },
          "artist": {
            "question": "¿Quién la canta?",
            "answer": "Eagles",
            "points": 2
          },
          "decade": {
            "question": "¿De qué década es?",
            "answer": "1970s",
            "points": 3
          },
          "lyrics": {
            "question": "Completa: 'Welcome to the Hotel California...'",
            "answer": "Such a lovely place",
            "points": 3
          },
          "challenge": {
            "question": "Toca un riff de guitarra imaginario",
            "answer": "Completar riff de guitarra",
            "points": 5,
            "challengeType": "instrument"
          }
        }
      }
    ],
    "version": "1.0.0",
    "audioPath": "public/audio",
    "lastUpdated": new Date().toISOString(),
    "totalTracks": 6
  };

  fs.writeFileSync(tracksPath, JSON.stringify(tracksData, null, 2));
  console.log('✅ Created tracks.json with 6 sample tracks');
}

function checkAudioFiles() {
  const audioDir = path.join(__dirname, 'public', 'audio');
  const tracksPath = path.join(__dirname, 'data', 'tracks.json');

  console.log('\n🎵 Checking audio files...');

  if (!fs.existsSync(tracksPath)) {
    console.log('❌ tracks.json not found');
    return;
  }

  const data = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));
  const requiredFiles = data.tracks.map(track => track.audioFile);
  const existingFiles = fs.existsSync(audioDir) ?
    fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')) : [];

  console.log(`📂 Audio directory: ${audioDir}`);
  console.log(`📁 Required files: ${requiredFiles.length}`);
  console.log(`📁 Existing files: ${existingFiles.length}`);

  console.log('\n📋 File Status:');
  requiredFiles.forEach(filename => {
    const exists = existingFiles.includes(filename);
    console.log(`   ${exists ? '✅' : '❌'} ${filename}`);
  });

  // Archivos huérfanos
  const orphanedFiles = existingFiles.filter(f => !requiredFiles.includes(f));
  if (orphanedFiles.length > 0) {
    console.log('\n🗂️ Orphaned audio files (not referenced in tracks.json):');
    orphanedFiles.forEach(filename => {
      console.log(`   ⚠️ ${filename}`);
    });
  }

  return {
    required: requiredFiles,
    existing: existingFiles,
    missing: requiredFiles.filter(f => !existingFiles.includes(f)),
    orphaned: orphanedFiles
  };
}

function generateInstructions() {
  const audioFiles = checkAudioFiles();

  console.log('\n🎯 SETUP INSTRUCTIONS:');
  console.log('');

  if (audioFiles && audioFiles.missing.length > 0) {
    console.log('📥 MISSING AUDIO FILES:');
    console.log('Add these MP3 files to public/audio/:');
    audioFiles.missing.forEach(filename => {
      console.log(`   • ${filename} (30 seconds duration recommended)`);
    });
    console.log('');
  }

  console.log('🎵 AUDIO SOURCES:');
  console.log('• YouTube Audio Library (copyright-free)');
  console.log('• Freemusicarchive.org');
  console.log('• Freesound.org');
  console.log('• Your own recordings');
  console.log('• 30-second clips from legal sources');
  console.log('');

  console.log('🔧 AUDIO REQUIREMENTS:');
  console.log('• Format: MP3');
  console.log('• Duration: ~30 seconds');
  console.log('• Quality: 128kbps or higher');
  console.log('• Size: < 2MB per file');
  console.log('');

  console.log('🚀 NEXT STEPS:');
  console.log('1. Replace your current files with the updated versions');
  console.log('2. Add MP3 files to public/audio/');
  console.log('3. Start server: npm start');
  console.log('4. Test: curl http://localhost:3000/api/tracks');
  console.log('5. Test QR: curl -X POST http://localhost:3000/api/cards/scan/HITBACK_001_SONG_EASY');
  console.log('');

  console.log('🧪 TESTING COMMANDS:');
  console.log('• Health check: curl http://localhost:3000/api/cards/health');
  console.log('• List audio: curl http://localhost:3000/api/audio/list');
  console.log('• Audio diagnostics: curl http://localhost:3000/api/cards/audio-diagnostics');
  console.log('');

  console.log('📱 FOR YOUR REACT NATIVE APP:');
  console.log('Update your audioService to use these endpoints:');
  console.log('• POST /api/cards/scan/:qrCode → Get track + audio URL');
  console.log('• Audio will be at: http://YOUR_IP:3000/audio/filename.mp3');
}

function createEnvFile() {
  const envPath = path.join(__dirname, '.env');

  if (fs.existsSync(envPath)) {
    console.log('\n⚙️ .env file already exists');
    return;
  }

  console.log('\n⚙️ Creating .env file...');

  const envContent = `# HITBACK Local Audio Configuration
PORT=3000
NODE_ENV=development

# Server Settings
SERVER_URL=http://localhost:3000

# Audio Configuration  
AUDIO_DIRECTORY=./public/audio
MAX_AUDIO_SIZE=5MB

# CORS Settings
ALLOWED_ORIGINS=*

# Game Settings
MAX_PLAYERS=8
GAME_DURATION=1200
AUDIO_PREVIEW_DURATION=30

# Logging
LOG_LEVEL=info
`;

  fs.writeFileSync(envPath, envContent);
  console.log('✅ Created .env file');
}

// Ejecutar setup completo
function runSetup() {
  try {
    createDirectories();
    createEnvFile();
    createTracksFile();
    generateInstructions();

    console.log('🎉 LOCAL AUDIO SETUP COMPLETED!');
    console.log('');
    console.log('🔄 FILES TO UPDATE:');
    console.log('• services/trackService.js');
    console.log('• controllers/cardController.js');
    console.log('• server.js');
    console.log('• data/tracks.json');
    console.log('');
    console.log('Your game will now work 100% with local audio files! 🎵');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runSetup();
}

module.exports = { runSetup };