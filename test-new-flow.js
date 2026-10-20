/**
 * 🧪 Test del nuevo flujo de juego SIN QR
 *
 * Ejecutar: node test-new-flow.js
 */

const GameSessionService = require('./GameSessionService');

async function testNewFlow() {
  console.log('🧪 ═══════════════════════════════════════════');
  console.log('   TESTING NUEVO FLUJO DE JUEGO (SIN QR)');
  console.log('═══════════════════════════════════════════════\n');

  const gameService = new GameSessionService();

  // ═══════════════════════════════════════════════════════════
  // 1. CREAR SESIÓN
  // ═══════════════════════════════════════════════════════════
  console.log('📋 1. Creando sesión...');

  const createResult = gameService.createSession({
    players: ['Ana', 'Bob', 'Carlos'],
    genres: ['ROCK', 'POP', 'LATIN'],
    decades: ['1980s', '1990s', '2000s'],
    difficulty: 'ANY',
    targetScore: 22,
    timeLimit: 1200,
  });

  if (!createResult.success) {
    console.error('❌ Error creando sesión:', createResult.error);
    return;
  }

  const sessionId = createResult.session.id;
  console.log(`✅ Sesión creada: ${sessionId}`);
  console.log(`   Jugadores: ${createResult.session.players.map((p) => p.name).join(', ')}`);
  console.log(`   Géneros: ${createResult.session.config.genres.join(', ')}`);
  console.log(`   Décadas: ${createResult.session.config.decades.join(', ')}\n`);

  // ═══════════════════════════════════════════════════════════
  // 2. INICIAR JUEGO
  // ═══════════════════════════════════════════════════════════
  console.log('▶️ 2. Iniciando juego...');

  const startResult = gameService.startGame(sessionId);

  if (!startResult.success) {
    console.error('❌ Error iniciando juego:', startResult.error);
    return;
  }

  console.log(`✅ Juego iniciado`);
  console.log(`   Status: ${startResult.session.status}\n`);

  // ═══════════════════════════════════════════════════════════
  // 3. OBTENER PRIMERA RONDA
  // ═══════════════════════════════════════════════════════════
  console.log('🎵 3. Obteniendo primera ronda...');

  const roundResult = await gameService.nextRound(sessionId);

  if (!roundResult.success) {
    console.error('❌ Error obteniendo ronda:', roundResult.error);
    return;
  }

  console.log(`✅ Ronda ${roundResult.round.number}`);
  console.log(`   Género: ${roundResult.round.track.genre}`);
  console.log(`   Década: ${roundResult.round.track.decade}`);
  console.log(
    `   Audio URL: ${roundResult.round.track.audioUrl ? '✅ Disponible' : '❌ No disponible'}`
  );
  console.log(`   Audio Source: ${roundResult.round.track.audioSource}`);
  console.log(`   Pregunta: ${roundResult.round.question.text}`);
  console.log(`   Tipo: ${roundResult.round.question.type} (${roundResult.round.question.icon})`);
  console.log(`   Puntos base: ${roundResult.round.question.points}\n`);

  // ═══════════════════════════════════════════════════════════
  // 4. REGISTRAR APUESTAS
  // ═══════════════════════════════════════════════════════════
  console.log('🎰 4. Registrando apuestas...');

  const players = createResult.session.players;

  // Ana apuesta 2 tokens
  const bet1 = gameService.placeBet(sessionId, players[0].id, 2);
  console.log(`   ${players[0].name}: ${bet1.bet.tokens} tokens (×${bet1.bet.multiplier})`);

  // Bob apuesta 3 tokens
  const bet2 = gameService.placeBet(sessionId, players[1].id, 3);
  console.log(`   ${players[1].name}: ${bet2.bet.tokens} tokens (×${bet2.bet.multiplier})`);

  // Carlos no apuesta
  const bet3 = gameService.placeBet(sessionId, players[2].id, 0);
  console.log(`   ${players[2].name}: ${bet3.bet.tokens} tokens (×${bet3.bet.multiplier})\n`);

  // ═══════════════════════════════════════════════════════════
  // 5. REVELAR RESPUESTA (Ana gana)
  // ═══════════════════════════════════════════════════════════
  console.log('✅ 5. Revelando respuesta (Ana gana)...');

  const revealResult = gameService.revealAnswer(sessionId, players[0].id);

  if (!revealResult.success) {
    console.error('❌ Error revelando:', revealResult.error);
    return;
  }

  console.log(`   Respuesta correcta: ${revealResult.results.correctAnswer}`);
  console.log(
    `   Track: "${revealResult.results.trackInfo.title}" - ${revealResult.results.trackInfo.artist}`
  );
  console.log(`   Ganador: ${revealResult.results.winner.name}`);
  console.log(`   Puntos ganados: ${revealResult.results.pointsAwarded}`);
  console.log(`\n   Scoreboard:`);
  revealResult.players.forEach((p) => {
    console.log(`   - ${p.name}: ${p.score} pts, ${p.tokens} tokens`);
  });

  // ═══════════════════════════════════════════════════════════
  // 6. SEGUNDA RONDA
  // ═══════════════════════════════════════════════════════════
  console.log('\n🎵 6. Segunda ronda...');

  const round2 = await gameService.nextRound(sessionId);

  if (!round2.success) {
    console.error('❌ Error:', round2.error);
    return;
  }

  console.log(`✅ Ronda ${round2.round.number}`);
  console.log(`   Pregunta: ${round2.round.question.text}`);
  console.log(`   Audio: ${round2.round.track.audioUrl ? '✅' : '❌'}`);

  // ═══════════════════════════════════════════════════════════
  // 7. ESTADO FINAL
  // ═══════════════════════════════════════════════════════════
  console.log('\n📊 7. Estado final de la sesión...');

  const status = gameService.getStatus(sessionId);

  console.log(`   ID: ${status.session.id}`);
  console.log(`   Status: ${status.session.status}`);
  console.log(`   Rondas jugadas: ${status.session.round}`);
  console.log(`   Tracks usados: ${status.session.usedTrackIds.length}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log('✅ TEST COMPLETADO EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════\n');
}

// Ejecutar test
testNewFlow().catch(console.error);
