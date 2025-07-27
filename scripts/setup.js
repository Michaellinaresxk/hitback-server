const fs = require('fs');
const path = require('path');
const https = require('https');

console.log('🎵 HITBACK Backend Setup Starting...\n');

// Create required directories
const directories = [
  'public/audio',
  'data',
  'logs',
  'uploads'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Download sample audio files (using free/public domain audio)
const sampleAudioFiles = [
  {
    id: '001',
    name: 'Sample 1 - Electronic Beat',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  },
  {
    id: '002',
    name: 'Sample 2 - Rock Style',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
  },
  {
    id: '003',
    name: 'Sample 3 - Pop Style',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
  },
  {
    id: '004',
    name: 'Sample 4 - Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
  },
  {
    id: '005',
    name: 'Sample 5 - Jazz Style',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3'
  },
  {
    id: '006',
    name: 'Sample 6 - Classical',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3'
  },
  {
    id: 'test1',
    name: 'Test Track 1',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3'
  }
];

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(destination, () => { }); // Delete file on error
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function downloadSampleAudio() {
  console.log('\n🎵 Downloading sample audio files...');

  for (const audio of sampleAudioFiles) {
    try {
      const filePath = path.join(__dirname, '..', 'public', 'audio', `${audio.id}.mp3`);

      if (fs.existsSync(filePath)) {
        console.log(`⏭️  ${audio.name} already exists`);
        continue;
      }

      console.log(`📥 Downloading ${audio.name}...`);
      await downloadFile(audio.url, filePath);
      console.log(`✅ Downloaded ${audio.name}`);
    } catch (error) {
      console.log(`❌ Failed to download ${audio.name}: ${error.message}`);
    }
  }
}

// Create environment file
function createEnvFile() {
  const envContent = `# HITBACK Backend Configuration
PORT=3000
NODE_ENV=development

# Audio Configuration  
AUDIO_DIRECTORY=./public/audio
MAX_AUDIO_SIZE=10MB

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# CORS Settings
ALLOWED_ORIGINS=*

# Game Settings
MAX_PLAYERS=8
GAME_DURATION=1200
AUDIO_PREVIEW_DURATION=5

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/hitback.log
`;

  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env file');
  }
}

// Create gitignore
function createGitignore() {
  const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log

# Audio files (optional - uncomment if you don't want to commit audio)
# public/audio/*.mp3

# Uploads
uploads/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Testing
coverage/
.nyc_output/

# Runtime data
pids/
*.pid
*.seed
*.pid.lock
`;

  const gitignorePath = path.join(__dirname, '..', '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, gitignoreContent);
    console.log('✅ Created .gitignore file');
  }
}

// Get local IP address
function getLocalIPAddress() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const results = {};

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
      if (net.family === familyV4Value && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
      }
    }
  }

  return Object.values(results).flat()[0] || 'localhost';
}

// Main setup function
async function setup() {
  try {
    console.log('📁 Creating directories...');
    // Directories already created above

    console.log('\n⚙️  Creating configuration files...');
    createEnvFile();
    createGitignore();

    console.log('\n🎵 Setting up audio files...');
    await downloadSampleAudio();

    const localIP = getLocalIPAddress();

    console.log('\n🎉 Setup completed successfully!\n');
    console.log('📋 Next Steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Update your React Native app audioService.ts:');
    console.log(`   const SERVER_URL = 'http://${localIP}:3000';`);
    console.log('3. Make sure both devices are on the same WiFi network');
    console.log('4. Test the connection in your app\n');

    console.log('🔗 Server URLs:');
    console.log(`   Local: http://localhost:3000`);
    console.log(`   Network: http://${localIP}:3000`);
    console.log(`   QR Scan: POST http://${localIP}:3000/api/cards/scan/:qrCode`);
    console.log(`   Audio: http://${localIP}:3000/audio/001.mp3\n`);

    console.log('🧪 Test QR Codes:');
    console.log('   HITBACK_001_SONG_EASY');
    console.log('   HITBACK_002_ARTIST_MEDIUM');
    console.log('   HITBACK_003_CHALLENGE_HARD');
    console.log('   HITBACK_004_DECADE_EXPERT\n');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setup();