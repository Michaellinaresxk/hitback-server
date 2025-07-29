// verify-backend.js
// Ejecuta este script desde el directorio raíz del backend: node verify-backend.js

const os = require('os');
const fs = require('fs');
const path = require('path');

// 🔍 VERIFICACIÓN COMPLETA DEL BACKEND HITBACK

console.log('🔍 HITBACK Backend Verification');
console.log('================================\n');

// 1. Verificar Estructura de Archivos
console.log('📁 1. File Structure Check');
const requiredFiles = [
  'server.js',
  'routes/qr.js',
  'controllers/gameController.js',
  'services/TrackService.js',
  'services/AudioService.js',
  'services/QRService.js',
  'data/tracks.json',
  'public/audio/tracks'
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
});

// 2. Verificar IP de Red
console.log('\n📡 2. Network Configuration');
function getLocalNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  Object.keys(interfaces).forEach(ifname => {
    interfaces[ifname].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    });
  });

  return ips;
}

const networkIPs = getLocalNetworkIPs();
console.log('   Available Network IPs:');
networkIPs.forEach(ip => {
  console.log(`   📍 ${ip}:3000`);
});

if (networkIPs.length === 0) {
  console.log('   ❌ No network interfaces found. Check WiFi connection.');
} else {
  console.log(`   ✅ Recommended IP for Expo: ${networkIPs[0]}:3000`);
}

// 3. Verificar datos de tracks
console.log('\n🎵 3. Tracks Data Check');
const tracksPath = path.join(__dirname, 'data/tracks.json');
if (fs.existsSync(tracksPath)) {
  try {
    const tracksData = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));

    if (tracksData.tracks && Array.isArray(tracksData.tracks)) {
      console.log(`   ✅ Found ${tracksData.tracks.length} tracks`);

      // Verificar estructura de track
      const firstTrack = tracksData.tracks[0];
      if (firstTrack) {
        console.log('   📋 First track structure:');
        console.log(`      ID: ${firstTrack.id || 'MISSING'}`);
        console.log(`      Title: ${firstTrack.title || 'MISSING'}`);
        console.log(`      Artist: ${firstTrack.artist || 'MISSING'}`);
        console.log(`      Audio File: ${firstTrack.audioFile || 'MISSING'}`);
        console.log(`      Questions: ${firstTrack.questions ? Object.keys(firstTrack.questions).length : 0} types`);
      }
    } else {
      console.log('   ❌ Invalid tracks.json structure');
    }
  } catch (error) {
    console.log(`   ❌ Error reading tracks.json: ${error.message}`);
  }
} else {
  console.log('   ❌ tracks.json not found');
}

// 4. Verificar archivos de audio
console.log('\n🎵 4. Audio Files Check');
const audioDir = path.join(__dirname, 'public/audio/tracks');
if (fs.existsSync(audioDir)) {
  try {
    const audioFiles = fs.readdirSync(audioDir)
      .filter(file => file.toLowerCase().endsWith('.mp3'));

    console.log(`   ✅ Found ${audioFiles.length} MP3 audio files`);

    if (audioFiles.length > 0) {
      console.log('   📋 Audio files:');
      audioFiles.slice(0, 5).forEach(file => {
        const filePath = path.join(audioDir, file);
        const stats = fs.statSync(filePath);
        const sizeKB = Math.round(stats.size / 1024);
        console.log(`      🎵 ${file} (${sizeKB}KB)`);
      });

      if (audioFiles.length > 5) {
        console.log(`      ... and ${audioFiles.length - 5} more files`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error reading audio directory: ${error.message}`);
  }
} else {
  console.log('   ❌ Audio directory not found: public/audio/tracks');
  console.log('   💡 Create the directory and add MP3 files');
}

// 5. Verificar endpoints
console.log('\n🔌 5. Endpoint Configuration Check');
const endpoints = [
  { method: 'POST', path: '/api/qr/scan/:qrCode', description: 'Main QR scanning (Expo uses this)' },
  { method: 'GET', path: '/api/health', description: 'Health check' },
  { method: 'GET', path: '/api/tracks', description: 'Get all tracks' },
  { method: 'GET', path: '/api/audio/list', description: 'List audio files' }
];

console.log('   📋 Expected endpoints:');
endpoints.forEach(endpoint => {
  console.log(`      ${endpoint.method} ${endpoint.path} - ${endpoint.description}`);
});

// 6. Generar códigos QR de ejemplo
console.log('\n🏷️ 6. Sample QR Codes');
const sampleQRCodes = [
  'HITBACK_001_SONG_EASY',
  'HITBACK_001_ARTIST_MEDIUM',
  'HITBACK_002_DECADE_HARD',
  'HITBACK_003_CHALLENGE_EXPERT'
];

console.log('   📋 Test QR codes for your physical cards:');
sampleQRCodes.forEach(qr => {
  console.log(`      📱 ${qr}`);
});

// 7. Generar comando de testing
console.log('\n🧪 7. Testing Commands');
const testIP = networkIPs[0] || 'localhost';
const testCommands = [
  `curl http://${testIP}:3000/api/health`,
  `curl http://${testIP}:3000/api/tracks`,
  `curl -X POST http://${testIP}:3000/api/qr/scan/HITBACK_001_SONG_EASY`,
  `curl http://${testIP}:3000/api/audio/list`
];

console.log('   📋 Test these commands when server is running:');
testCommands.forEach(cmd => {
  console.log(`      $ ${cmd}`);
});

// 8. Configuración recomendada para Expo
console.log('\n📱 8. Expo Configuration');
console.log('   📋 Update your audioService.ts with:');
console.log(`      const SERVER_URL = 'http://${testIP}:3000';`);
console.log('');
console.log('   🔧 Or use automatic detection:');
console.log('      import Constants from "expo-constants";');
console.log('      const hostUri = Constants.expoConfig?.hostUri?.split(":")[0];');
console.log(`      const SERVER_URL = \`http://\${hostUri}:3000\`;`);

// 9. Comandos para iniciar
console.log('\n🚀 9. Start Commands');
console.log('   📋 To start the backend:');
console.log('      $ npm install');
console.log('      $ node server.js');
console.log('');
console.log('   📋 Expected output:');
console.log('      🎵 HITBACK Backend started with COMPLETE ROUTES!');
console.log(`      📱 Network Access URLs for Expo:`);
networkIPs.forEach(ip => {
  console.log(`         📍 http://${ip}:3000`);
});

console.log('\n✅ Verification Complete!');
console.log('==========================================');

// Resumen final
let score = 0;
let maxScore = 5;

if (fs.existsSync('server.js')) score++;
if (fs.existsSync(tracksPath)) score++;
if (fs.existsSync(audioDir)) score++;
if (networkIPs.length > 0) score++;
if (fs.existsSync('routes/qr.js')) score++;

console.log(`📊 Backend Health Score: ${score}/${maxScore}`);

if (score === maxScore) {
  console.log('🎉 Backend is fully configured and ready!');
} else if (score >= 3) {
  console.log('⚠️ Backend is mostly ready, but check the issues above');
} else {
  console.log('❌ Backend needs significant configuration before it will work');
}

console.log('\n💡 Next Steps:');
if (score < maxScore) {
  console.log('1. Fix the issues marked with ❌ above');
  console.log('2. Run this verification script again');
  console.log('3. Start the server with: node server.js');
  console.log('4. Test the endpoints with the curl commands');
  console.log('5. Update the IP in your Expo audioService.ts');
} else {
  console.log('1. Start the server: node server.js');
  console.log('2. Update your Expo audioService.ts with the correct IP');
  console.log('3. Test the connection in your Expo app');
  console.log('4. Start scanning QR codes!');
}

console.log('\n🎮 Happy Gaming!');
console.log('==========================================\n');