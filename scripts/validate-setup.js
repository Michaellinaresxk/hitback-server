const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

class CompleteSetupValidator {
  constructor() {
    this.baseDir = path.join(__dirname, '..');
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
  }

  async validate() {
    console.log('🔍 HITBACK Complete Setup Validation\n');

    await this.validateRouteConfiguration();
    await this.validateDataFiles();
    await this.validateAudioSetup();
    await this.validateServerEndpoints();
    await this.validateExpoCompatibility();

    this.printResults();
    this.generateRecommendations();

    return this.results.failed === 0;
  }

  /**
   * Valida que las rutas completas estén configuradas
   */
  async validateRouteConfiguration() {
    console.log('🛣️ Validating route configuration...');

    const serverJsPath = path.join(this.baseDir, 'server.js');

    if (fs.existsSync(serverJsPath)) {
      const serverContent = fs.readFileSync(serverJsPath, 'utf8');

      // Verificar que esté usando rutas completas, no básicas
      if (serverContent.includes("require('./routes/qr')")) {
        this.addResult('pass', 'server.js importing complete QR routes');
      } else {
        this.addResult('fail', 'server.js NOT importing complete QR routes (usando routes básicas)');
      }

      if (serverContent.includes("app.use('/api/qr', qrRoutes)")) {
        this.addResult('pass', 'QR routes properly mounted at /api/qr');
      } else {
        this.addResult('fail', 'QR routes NOT properly mounted - tu app Expo no funcionará');
      }

      if (serverContent.includes("COMPLETE ROUTES ACTIVE") || serverContent.includes("USING COMPLETE ROUTES")) {
        this.addResult('pass', 'Server configured for complete routes');
      } else {
        this.addResult('warning', 'Server might be using basic routes instead of complete ones');
      }

    } else {
      this.addResult('fail', 'server.js file missing');
    }

    console.log('');
  }

  /**
   * Valida archivos de datos
   */
  async validateDataFiles() {
    console.log('📊 Validating data files...');

    const tracksPath = path.join(this.baseDir, 'data', 'tracks.json');

    if (fs.existsSync(tracksPath)) {
      this.addResult('pass', 'data/tracks.json exists');

      try {
        const tracksData = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));

        if (tracksData.tracks && Array.isArray(tracksData.tracks)) {
          this.addResult('pass', `tracks.json valid with ${tracksData.tracks.length} tracks`);

          // Validar estructura esperada por la app Expo
          let validStructures = 0;
          tracksData.tracks.forEach((track, index) => {
            const hasRequiredFields = track.id && track.title && track.artist && track.questions;
            const hasAudioFile = track.audioFile;
            const hasCompleteQuestions = track.questions &&
              Object.keys(track.questions).every(type =>
                track.questions[type].question && track.questions[type].answer
              );

            if (hasRequiredFields && hasAudioFile && hasCompleteQuestions) {
              validStructures++;
            } else {
              this.addResult('warning', `Track ${track.id || index + 1} missing required fields for Expo app`);
            }
          });

          if (validStructures === tracksData.tracks.length) {
            this.addResult('pass', 'All tracks have complete structure for Expo app');
          } else {
            this.addResult('warning', `${validStructures}/${tracksData.tracks.length} tracks have complete structure`);
          }

        } else {
          this.addResult('fail', 'tracks.json has invalid structure - array missing');
        }
      } catch (error) {
        this.addResult('fail', `Invalid tracks.json: ${error.message}`);
      }
    } else {
      this.addResult('fail', 'data/tracks.json missing - crítico para Expo app');
    }

    console.log('');
  }

  /**
   * Valida configuración de audio
   */
  async validateAudioSetup() {
    console.log('🎵 Validating audio setup...');

    const audioDir = path.join(this.baseDir, 'public', 'audio', 'tracks');

    if (fs.existsSync(audioDir)) {
      this.addResult('pass', 'Audio directory exists');

      try {
        const audioFiles = fs.readdirSync(audioDir)
          .filter(file => file.toLowerCase().endsWith('.mp3') ||
            file.toLowerCase().endsWith('.wav') ||
            file.toLowerCase().endsWith('.m4a'));

        if (audioFiles.length > 0) {
          this.addResult('pass', `Found ${audioFiles.length} audio files`);

          // Verificar archivos específicos de tracks.json
          const tracksPath = path.join(this.baseDir, 'data', 'tracks.json');
          if (fs.existsSync(tracksPath)) {
            const tracksData = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));

            let matchingFiles = 0;
            let missingFiles = [];

            tracksData.tracks.forEach(track => {
              if (track.audioFile) {
                if (audioFiles.includes(track.audioFile)) {
                  matchingFiles++;
                  this.addResult('pass', `Audio file exists: ${track.audioFile}`);
                } else {
                  missingFiles.push(track.audioFile);
                  this.addResult('warning', `Missing audio file: ${track.audioFile}`);
                }
              }
            });

            if (missingFiles.length === 0) {
              this.addResult('pass', 'All referenced audio files exist');
            } else {
              this.addResult('warning', `Missing ${missingFiles.length} audio files - Expo app may not play audio`);
            }
          }

        } else {
          this.addResult('warning', 'No audio files found - Expo app will not have audio');
        }

      } catch (error) {
        this.addResult('fail', `Failed to read audio directory: ${error.message}`);
      }
    } else {
      this.addResult('fail', 'Audio directory missing - crear public/audio/tracks/');
    }

    console.log('');
  }

  /**
   * Valida endpoints del servidor (si está corriendo)
   */
  async validateServerEndpoints() {
    console.log('🌐 Validating server endpoints...');

    const port = process.env.PORT || 3000;

    try {
      // Test health endpoint
      const healthResponse = await this.makeRequest('localhost', port, '/api/health');
      if (healthResponse.success) {
        this.addResult('pass', 'Health endpoint working');
      } else {
        this.addResult('warning', 'Health endpoint not responding correctly');
      }

      // Test QR scan endpoint (critical for Expo app)
      const qrResponse = await this.makeRequest('localhost', port, '/api/qr/scan/HITBACK_001_SONG_EASY', 'POST');
      if (qrResponse.success && qrResponse.data && qrResponse.data.track) {
        this.addResult('pass', 'QR scan endpoint working with complete data structure');
      } else if (qrResponse.success) {
        this.addResult('fail', 'QR scan endpoint working but WITHOUT complete data - Expo app will crash');
      } else {
        this.addResult('fail', 'QR scan endpoint not working - Expo app cannot scan cards');
      }

      // Test tracks endpoint
      const tracksResponse = await this.makeRequest('localhost', port, '/api/tracks');
      if (tracksResponse.success) {
        this.addResult('pass', 'Tracks endpoint working');
      } else {
        this.addResult('warning', 'Tracks endpoint not working');
      }

      // Test audio list endpoint
      const audioResponse = await this.makeRequest('localhost', port, '/api/audio/list');
      if (audioResponse.success) {
        this.addResult('pass', 'Audio list endpoint working');
      } else {
        this.addResult('warning', 'Audio list endpoint not working');
      }

    } catch (error) {
      this.addResult('warning', `Server not running on port ${port} - start with 'npm start' to test endpoints`);
    }

    console.log('');
  }

  /**
   * Valida compatibilidad con Expo
   */
  async validateExpoCompatibility() {
    console.log('📱 Validating Expo compatibility...');

    const serverJsPath = path.join(this.baseDir, 'server.js');

    if (fs.existsSync(serverJsPath)) {
      const serverContent = fs.readFileSync(serverJsPath, 'utf8');

      // CORS configuration
      if (serverContent.includes('exp://*') && serverContent.includes('expo')) {
        this.addResult('pass', 'CORS configured for Expo development');
      } else {
        this.addResult('warning', 'CORS might not be configured for Expo - add exp://* to origins');
      }

      // Static files for audio
      if (serverContent.includes("'/audio/tracks'") && serverContent.includes('express.static')) {
        this.addResult('pass', 'Static audio files configured');
      } else {
        this.addResult('fail', 'Static audio files NOT configured - Expo app cannot access audio');
      }

      // Network IP detection
      if (serverContent.includes('getLocalNetworkIPs') || serverContent.includes('networkInterfaces')) {
        this.addResult('pass', 'Network IP detection configured');
      } else {
        this.addResult('warning', 'Network IP detection not configured - might be hard to connect from mobile');
      }

    }

    // Check IP configuration suggestion
    const localIP = this.getLocalIP();
    console.log(`💡 Suggested Expo configuration:`);
    console.log(`   In audioService.ts: const SERVER_URL = 'http://${localIP}:3000';`);

    console.log('');
  }

  /**
   * Hace request HTTP
   */
  makeRequest(hostname, port, path, method = 'GET') {
    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        port,
        path,
        method,
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            resolve({ success: res.statusCode === 200, statusCode: res.statusCode });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Obtiene IP local
   */
  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  /**
   * Agrega resultado de test
   */
  addResult(type, message) {
    this.results.tests.push({ type, message });

    switch (type) {
      case 'pass':
        this.results.passed++;
        console.log(`✅ ${message}`);
        break;
      case 'fail':
        this.results.failed++;
        console.log(`❌ ${message}`);
        break;
      case 'warning':
        this.results.warnings++;
        console.log(`⚠️  ${message}`);
        break;
    }
  }

  /**
   * Imprime resultados finales
   */
  printResults() {
    console.log('📋 Validation Summary:');
    console.log(`   ✅ Passed: ${this.results.passed}`);
    console.log(`   ❌ Failed: ${this.results.failed}`);
    console.log(`   ⚠️  Warnings: ${this.results.warnings}`);
    console.log(`   📊 Total: ${this.results.tests.length}`);
    console.log('');

    if (this.results.failed === 0) {
      console.log('🎉 Setup validation passed! Your Expo app should work.');
    } else {
      console.log('❌ Setup validation failed. Fix the issues above for Expo compatibility.');
    }
  }

  /**
   * Genera recomendaciones específicas
   */
  generateRecommendations() {
    const localIP = this.getLocalIP();

    console.log('🔧 Recommendations:');

    if (this.results.failed > 0 || this.results.warnings > 0) {
      console.log('');
      console.log('1. 🛠️  Fix Critical Issues:');

      const criticalIssues = this.results.tests.filter(t => t.type === 'fail');
      criticalIssues.forEach(issue => {
        console.log(`   • ${issue.message}`);
      });

      console.log('\n2. 📱 Update Expo App Configuration:');
      console.log(`   • In audioService.ts: const SERVER_URL = 'http://${localIP}:3000';`);

      console.log('\n3. 🚀 Start Server:');
      console.log('   • Run: npm start');
      console.log(`   • Test: http://${localIP}:3000/api/health`);

      console.log('\n4. 🧪 Test QR Scanning:');
      console.log(`   • Test URL: http://${localIP}:3000/api/qr/scan/HITBACK_001_SONG_EASY`);
      console.log('   • Should return complete track data structure');
    } else {
      console.log('✅ Everything looks good! Your setup should work perfectly with Expo.');
      console.log(`📱 Make sure your Expo app uses: http://${localIP}:3000`);
    }

    console.log('');
  }
}

// Ejecutar validación
if (require.main === module) {
  const validator = new CompleteSetupValidator();

  validator.validate()
    .then(success => {
      if (!success) {
        console.log('💡 Run setup: node scripts/setup-audio-complete.js');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

module.exports = CompleteSetupValidator;