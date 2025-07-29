const fs = require('fs');
const path = require('path');
const https = require('https');

console.log('🎵 HITBACK Audio Setup - COMPLETE VERSION\n');

// Crear directorios necesarios
const directories = [
  'public/audio/tracks',
  'data',
  'logs'
];

console.log('📁 Creating directories...');
directories.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created: ${dir}`);
  } else {
    console.log(`✅ Exists: ${dir}`);
  }
});

// Archivos de audio de ejemplo (puedes reemplazar con tus archivos reales)
const audioFiles = [
  {
    id: '001',
    name: '001_despacito.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    description: 'Audio sample for Despacito'
  },
  {
    id: '002',
    name: '002_bohemian_rhapsody.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    description: 'Audio sample for Bohemian Rhapsody'
  },
  {
    id: '003',
    name: '003_shape_of_you.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    description: 'Audio sample for Shape of You'
  },
  {
    id: '004',
    name: '004_test.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    description: 'Test audio file'
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
        fs.unlink(destination, () => { });
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function setupAudioFiles() {
  console.log('\n🎵 Setting up audio files...');

  const audioDir = path.join(__dirname, '..', 'public', 'audio', 'tracks');

  for (const audio of audioFiles) {
    try {
      const filePath = path.join(audioDir, audio.name);

      if (fs.existsSync(filePath)) {
        console.log(`⏭️  ${audio.description} already exists`);
        continue;
      }

      console.log(`📥 Downloading ${audio.description}...`);
      await downloadFile(audio.url, filePath);
      console.log(`✅ ${audio.name} downloaded successfully`);

    } catch (error) {
      console.log(`❌ Failed to download ${audio.name}: ${error.message}`);

      // Crear archivo placeholder si la descarga falla
      const placeholderPath = path.join(audioDir, audio.name);
      const placeholderContent = 'placeholder audio file - replace with real audio';
      fs.writeFileSync(placeholderPath, placeholderContent);
      console.log(`📝 Created placeholder: ${audio.name}`);
    }
  }
}

// Validar configuración
function validateSetup() {
  console.log('\n🔍 Validating setup...');

  const checks = [
    {
      name: 'data/tracks.json',
      path: path.join(__dirname, '..', 'data', 'tracks.json'),
      required: true
    },
    {
      name: 'public/audio/tracks directory',
      path: path.join(__dirname, '..', 'public', 'audio', 'tracks'),
      required: true
    },
    {
      name: 'routes/qr.js',
      path: path.join(__dirname, '..', 'routes', 'qr.js'),
      required: true
    },
    {
      name: 'controllers/gameController.js',
      path: path.join(__dirname, '..', 'controllers', 'gameController.js'),
      required: true
    }
  ];

  let allValid = true;

  checks.forEach(check => {
    const exists = fs.existsSync(check.path);
    const status = exists ? '✅' : '❌';
    console.log(`${status} ${check.name}`);

    if (!exists && check.required) {
      allValid = false;
    }
  });

  console.log(`\n${allValid ? '🎉' : '⚠️'} Setup ${allValid ? 'completed successfully' : 'has issues'}`);

  return allValid;
}

// Generar script de prueba
function generateTestScript() {
  const testScript = `#!/bin/bash
# HITBACK Backend Test Script

echo "🧪 Testing HITBACK Backend..."

# Test 1: Health check
echo "1. Testing health endpoint..."
curl -s http://localhost:3000/api/health | jq .

# Test 2: QR scan endpoint  
echo "2. Testing QR scan..."
curl -s -X POST http://localhost:3000/api/qr/scan/HITBACK_001_SONG_EASY | jq .

# Test 3: Tracks endpoint
echo "3. Testing tracks endpoint..."
curl -s http://localhost:3000/api/tracks | jq .

# Test 4: Audio list
echo "4. Testing audio list..."
curl -s http://localhost:3000/api/audio/list | jq .

echo "✅ Tests completed!"
`;

  const testPath = path.join(__dirname, '..', 'test-backend.sh');
  fs.writeFileSync(testPath, testScript);
  fs.chmodSync(testPath, '755');
  console.log('📝 Created test-backend.sh script');
}

// Obtener IP local para mostrar URLs
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Función principal
async function main() {
  try {
    await setupAudioFiles();
    const isValid = validateSetup();
    generateTestScript();

    const localIP = getLocalIP();

    console.log('\n🎉 Setup completed!\n');
    console.log('📋 Next Steps:');
    console.log('1. Start the server: npm start');
    console.log(`2. Update your Expo audioService.ts:`);
    console.log(`   const SERVER_URL = 'http://${localIP}:3000';`);
    console.log('3. Test endpoints:');
    console.log(`   Health: http://${localIP}:3000/api/health`);
    console.log(`   QR Scan: http://${localIP}:3000/api/qr/scan/HITBACK_001_SONG_EASY`);
    console.log(`   Audio: http://${localIP}:3000/audio/tracks/001_despacito.mp3`);
    console.log('\n🧪 Run tests: ./test-backend.sh');

    if (!isValid) {
      console.log('\n⚠️  Some files are missing. Check the validation above.');
    }

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();