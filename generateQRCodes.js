/**
 * 🖨️ GENERADOR DE QR CODES PARA POWERCARDS
 * 
 * Este script genera QR codes para todas las PowerCards definidas en powerCards.json
 * Los códigos siguen el formato: HITBACK_PC_{cardId}_{timestamp}
 * 
 * INSTRUCCIONES:
 * 1. Colocar este archivo en la raíz de tu backend (mismo nivel que server.js)
 * 2. npm install qrcode
 * 3. node generateQRCodes.js
 * 4. Se creará un archivo HTML con todos los QR codes
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════

const POWER_CARDS_FILE = './data/powerCards.json';  // Ajusta esta ruta según tu estructura
const OUTPUT_DIR = './output';
const OUTPUT_FILE = 'powercard-qrs.html';

// ═══════════════════════════════════════════════════════════════
// FUNCIONES
// ═══════════════════════════════════════════════════════════════

/**
 * Generar código QR string para una PowerCard
 */
function generateQRString(cardId) {
  const timestamp = Date.now();
  return `HITBACK_PC_${cardId}_${timestamp}`;
}

/**
 * Generar QR code como Data URL (imagen base64)
 */
async function generateQRCodeImage(text) {
  try {
    const url = await QRCode.toDataURL(text, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return url;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
}

/**
 * Generar HTML con todas las PowerCards
 */
async function generateHTML(powerCards) {
  console.log(`\n🎴 Generando QR codes para ${powerCards.length} PowerCards...\n`);

  const cardsHTML = [];

  for (const card of powerCards) {
    const qrString = generateQRString(card.id);
    const qrImage = await generateQRCodeImage(qrString);

    if (!qrImage) {
      console.error(`❌ Error generando QR para ${card.name}`);
      continue;
    }

    console.log(`✅ ${card.emoji} ${card.name}`);
    console.log(`   ID: ${card.id}`);
    console.log(`   QR: ${qrString}`);
    console.log('');

    cardsHTML.push(`
    <div class="power-card">
      <div class="card-header">
        <div class="card-emoji">${card.emoji}</div>
        <div class="card-type">${card.type.toUpperCase()}</div>
      </div>
      
      <div class="card-name">${card.name}</div>
      
      <div class="card-qr">
        <img src="${qrImage}" alt="${card.name} QR Code" />
        <div class="qr-text">${qrString}</div>
      </div>
      
      <div class="card-description">
        ${card.description}
      </div>
      
      <div class="card-footer">
        <div class="card-uses">Usos: ${card.usageLimit}</div>
        <div class="card-id">${card.id}</div>
      </div>
    </div>
    `);
  }

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HITBACK PowerCards - QR Codes</title>
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Arial', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    h1 {
      text-align: center;
      color: white;
      margin-bottom: 10px;
      font-size: 3rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }

    .subtitle {
      text-align: center;
      color: rgba(255,255,255,0.9);
      margin-bottom: 30px;
      font-size: 1.2rem;
    }

    .instructions {
      background: rgba(255,255,255,0.95);
      padding: 20px;
      border-radius: 15px;
      margin-bottom: 30px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }

    .instructions h2 {
      color: #667eea;
      margin-bottom: 15px;
      font-size: 1.5rem;
    }

    .instructions ul {
      margin-left: 20px;
      line-height: 1.8;
    }

    .instructions li {
      margin: 8px 0;
      color: #333;
    }

    .instructions strong {
      color: #667eea;
      font-weight: bold;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 25px;
      margin-bottom: 40px;
    }

    .power-card {
      background: white;
      border-radius: 20px;
      padding: 25px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.15);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      page-break-inside: avoid;
      border: 3px solid #667eea;
    }

    .power-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 12px 35px rgba(0,0,0,0.25);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .card-emoji {
      font-size: 4rem;
    }

    .card-type {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: bold;
      text-transform: uppercase;
    }

    .card-name {
      font-size: 2rem;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
      color: #333;
    }

    .card-qr {
      background: #f8f9fa;
      border-radius: 15px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }

    .card-qr img {
      width: 200px;
      height: 200px;
      display: block;
      margin: 0 auto 15px;
    }

    .qr-text {
      font-size: 0.7rem;
      color: #666;
      word-break: break-all;
      font-family: 'Courier New', monospace;
      background: white;
      padding: 8px;
      border-radius: 5px;
    }

    .card-description {
      background: rgba(102, 126, 234, 0.1);
      border-radius: 10px;
      padding: 15px;
      text-align: center;
      margin: 15px 0;
      color: #333;
      line-height: 1.6;
      min-height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 2px solid #e9ecef;
      padding-top: 15px;
      margin-top: 15px;
    }

    .card-uses {
      font-weight: bold;
      color: #667eea;
      font-size: 0.95rem;
    }

    .card-id {
      font-size: 0.8rem;
      color: #999;
      font-family: 'Courier New', monospace;
    }

    .print-button {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 18px 35px;
      border-radius: 50px;
      font-size: 1.2rem;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 8px 25px rgba(0,0,0,0.3);
      transition: transform 0.2s, box-shadow 0.2s;
      z-index: 1000;
    }

    .print-button:hover {
      transform: scale(1.05);
      box-shadow: 0 12px 35px rgba(0,0,0,0.4);
    }

    .print-button:active {
      transform: scale(0.98);
    }

    @media print {
      body {
        background: white;
        padding: 10px;
      }

      .instructions,
      .print-button,
      .subtitle {
        display: none;
      }

      h1 {
        color: #333;
        text-shadow: none;
        font-size: 2rem;
        margin-bottom: 20px;
      }

      .power-card {
        border: 2px solid #667eea;
        box-shadow: none;
        break-inside: avoid;
      }

      .cards-grid {
        gap: 15px;
      }
    }

    @media (max-width: 768px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }

      h1 {
        font-size: 2rem;
      }

      .print-button {
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        font-size: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎴 HITBACK PowerCards</h1>
    <p class="subtitle">QR Codes Generados - Listos para Imprimir</p>

    <div class="instructions">
      <h2>📋 Instrucciones de Uso</h2>
      <ul>
        <li>✅ Los <strong>QR codes</strong> ya están generados para cada PowerCard</li>
        <li>🖨️ Presiona <strong>Ctrl+P</strong> (Cmd+P en Mac) o el botón "IMPRIMIR" para imprimir</li>
        <li>✂️ Recorta cada carta siguiendo los bordes</li>
        <li>📱 Escanéalas con tu app cuando logres un <strong>Hot Streak</strong> (3 respuestas correctas consecutivas)</li>
        <li>🎮 Cada carta tiene un <strong>ID único</strong> que el backend reconoce automáticamente</li>
        <li>⚡ Total de PowerCards: <strong>${powerCards.length}</strong></li>
      </ul>
    </div>

    <div class="cards-grid">
      ${cardsHTML.join('\n')}
    </div>
  </div>

  <button class="print-button" onclick="window.print()">
    🖨️ IMPRIMIR CARTAS
  </button>
</body>
</html>
  `;

  return html;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('\n🎴 HITBACK PowerCard QR Code Generator\n');
    console.log('═'.repeat(50));

    // 1. Leer powerCards.json
    console.log(`\n📂 Leyendo ${POWER_CARDS_FILE}...`);

    if (!fs.existsSync(POWER_CARDS_FILE)) {
      console.error(`\n❌ Error: No se encontró el archivo ${POWER_CARDS_FILE}`);
      console.log('\n💡 Asegúrate de que la ruta sea correcta.');
      console.log('   Verifica que powerCards.json esté en la ubicación especificada.');
      process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(POWER_CARDS_FILE, 'utf8'));
    const powerCards = data.powerCards;

    if (!powerCards || powerCards.length === 0) {
      console.error('\n❌ Error: No se encontraron PowerCards en el archivo');
      process.exit(1);
    }

    console.log(`✅ ${powerCards.length} PowerCards encontradas`);

    // 2. Crear directorio output
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`\n📁 Directorio creado: ${OUTPUT_DIR}`);
    }

    // 3. Generar HTML
    const html = await generateHTML(powerCards);

    // 4. Guardar archivo
    const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
    fs.writeFileSync(outputPath, html);

    console.log('\n═'.repeat(50));
    console.log('\n✅ ¡QR Codes generados exitosamente!');
    console.log(`\n📄 Archivo creado: ${outputPath}`);
    console.log(`\n🎉 Abre el archivo en tu navegador para ver los QR codes`);
    console.log('\n🖨️  Presiona Ctrl+P para imprimir las cartas');
    console.log('\n═'.repeat(50));
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar
main();