/**
 * 🧪 COMBOTRACKER.TEST.JS
 * Tests profesionales con Jest
 * 
 * Ejecutar: npm test -- ComboTracker.test.js
 */

const ComboTracker = require('../../services/ComboTracker');

describe('ComboTracker Service', () => {

  beforeEach(() => {
    // Limpiar antes de cada test
    ComboTracker.clearAll();
  });

  afterEach(() => {
    // Limpiar después de cada test
    ComboTracker.clearAll();
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 1: Registro básico de respuestas
  // ═══════════════════════════════════════════════════════════════

  describe('recordAnswer - Funcionalidad básica', () => {

    test('debe registrar respuesta correcta y aumentar streak a 1', () => {
      const result = ComboTracker.recordAnswer('player1', true);

      expect(result).toBeDefined();
      expect(result.currentStreak).toBe(1);
      expect(result.comboDetected).toBe(false);
    });

    test('debe acumular streak con múltiples respuestas correctas', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);
      const result = ComboTracker.recordAnswer('player1', true);

      expect(result.currentStreak).toBe(3);
      expect(result.comboDetected).toBe(true);
    });

    test('debe resetear streak a 0 con respuesta incorrecta', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);
      const result = ComboTracker.recordAnswer('player1', false);

      expect(result.currentStreak).toBe(0);
      expect(result.comboDetected).toBe(false);
    });

    test('debe manejar primer registro como respuesta incorrecta', () => {
      const result = ComboTracker.recordAnswer('player1', false);

      expect(result.currentStreak).toBe(0);
      expect(result.comboDetected).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 2: Detección de Combo (HOT_STREAK)
  // ═══════════════════════════════════════════════════════════════

  describe('Detección de Combo HOT_STREAK', () => {

    test('debe detectar combo en respuesta #3', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);
      const result = ComboTracker.recordAnswer('player1', true);

      expect(result.comboDetected).toBe(true);
      expect(result.comboType).toBe('HOT_STREAK');
      expect(result.currentStreak).toBe(3);
    });

    test('debe incluir mensaje de combo en respuesta', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);
      const result = ComboTracker.recordAnswer('player1', true);

      expect(result.comboMessage).toBeDefined();
      expect(result.comboMessage.length).toBeGreaterThan(0);
    });

    test('debe resetear streak después de detectar combo', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true); // combo detectado

      const result = ComboTracker.recordAnswer('player1', true); // siguiente respuesta
      expect(result.currentStreak).toBe(1);
    });

    test('no debe detectar combo antes de 3 respuestas', () => {
      const result1 = ComboTracker.recordAnswer('player1', true);
      const result2 = ComboTracker.recordAnswer('player1', true);

      expect(result1.comboDetected).toBe(false);
      expect(result2.comboDetected).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 3: Múltiples Jugadores
  // ═══════════════════════════════════════════════════════════════

  describe('Múltiples jugadores - Independencia', () => {

    test('cada jugador debe mantener su propia racha', () => {
      // Player 1: 2 correctas
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);

      // Player 2: 1 correcta
      ComboTracker.recordAnswer('player2', true);

      const streak1 = ComboTracker.getPlayerStreak('player1');
      const streak2 = ComboTracker.getPlayerStreak('player2');

      expect(streak1.streak).toBe(2);
      expect(streak2.streak).toBe(1);
    });

    test('respuesta incorrecta de un jugador no debe afectar otros', () => {
      // Player 1: 2 correctas
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);

      // Player 2: respuesta incorrecta
      ComboTracker.recordAnswer('player2', false);

      const streak1 = ComboTracker.getPlayerStreak('player1');
      const streak2 = ComboTracker.getPlayerStreak('player2');

      expect(streak1.streak).toBe(2);
      expect(streak2.streak).toBe(0);
    });

    test('combo de un jugador no debe afectar otros', () => {
      // Player 1: COMBO!
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);
      const result1 = ComboTracker.recordAnswer('player1', true);

      // Player 2: sin combo
      ComboTracker.recordAnswer('player2', true);
      const result2 = ComboTracker.getPlayerStreak('player2');

      expect(result1.comboDetected).toBe(true);
      expect(result2.streak).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 4: Getters y Estado
  // ═══════════════════════════════════════════════════════════════

  describe('getPlayerStreak - Obtener estado del jugador', () => {

    test('debe retornar streak para jugador existente', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);

      const result = ComboTracker.getPlayerStreak('player1');

      expect(result).toBeDefined();
      expect(result.streak).toBe(2);
      expect(result.playerId).toBe('player1');
    });

    test('debe retornar streak 0 para jugador nuevo', () => {
      const result = ComboTracker.getPlayerStreak('newPlayer');

      expect(result.streak).toBe(0);
      expect(result.playerId).toBe('newPlayer');
    });

    test('debe incluir información de progreso', () => {
      ComboTracker.recordAnswer('player1', true);

      const result = ComboTracker.getPlayerStreak('player1');

      expect(result.nextComboIn).toBeDefined();
      expect(result.nextComboIn).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 5: Limpiar datos
  // ═══════════════════════════════════════════════════════════════

  describe('clearPlayerData - Limpiar datos específicos', () => {

    test('debe resetear racha de jugador específico', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);

      ComboTracker.clearPlayerData('player1');

      const result = ComboTracker.getPlayerStreak('player1');
      expect(result.streak).toBe(0);
    });

    test('debe limpiar solo jugador específico', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player2', true);

      ComboTracker.clearPlayerData('player1');

      const streak1 = ComboTracker.getPlayerStreak('player1');
      const streak2 = ComboTracker.getPlayerStreak('player2');

      expect(streak1.streak).toBe(0);
      expect(streak2.streak).toBe(1);
    });
  });

  describe('clearAll - Limpiar todo', () => {

    test('debe resetear todas las rachas', () => {
      ComboTracker.recordAnswer('player1', true);
      ComboTracker.recordAnswer('player2', true);
      ComboTracker.recordAnswer('player2', true);

      ComboTracker.clearAll();

      const streak1 = ComboTracker.getPlayerStreak('player1');
      const streak2 = ComboTracker.getPlayerStreak('player2');

      expect(streak1.streak).toBe(0);
      expect(streak2.streak).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 6: Casos Edge
  // ═══════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {

    test('debe manejar muchas respuestas correctas seguidas', () => {
      // 10 respuestas correctas
      for (let i = 0; i < 10; i++) {
        const result = ComboTracker.recordAnswer('player1', true);

        if (i < 2) {
          expect(result.comboDetected).toBe(false);
        } else {
          // Después de cada combo, resetea, así que solo detecta cada 3
          if ((i + 1) % 3 === 0) {
            expect(result.comboDetected).toBe(true);
          }
        }
      }
    });

    test('debe manejar alternancia de correcto e incorrecto', () => {
      const results = [];
      const answers = [true, true, false, true, true, true];

      answers.forEach((answer, index) => {
        const result = ComboTracker.recordAnswer('player1', answer);
        results.push(result);
      });

      // Verificar que combo solo se detecta en posición 5 (tercera correcta)
      expect(results[2].comboDetected).toBe(false); // fue incorrecto
      expect(results[5].comboDetected).toBe(true);  // tercer correcto
    });

    test('debe manejar respuestas incorrectas consecutivas', () => {
      const result1 = ComboTracker.recordAnswer('player1', false);
      const result2 = ComboTracker.recordAnswer('player1', false);

      expect(result1.currentStreak).toBe(0);
      expect(result2.currentStreak).toBe(0);
      expect(result1.comboDetected).toBe(false);
      expect(result2.comboDetected).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 7: Validación de datos
  // ═══════════════════════════════════════════════════════════════

  describe('Validación y Tipo de datos', () => {

    test('debe retornar objeto con propiedades correctas', () => {
      const result = ComboTracker.recordAnswer('player1', true);

      expect(result).toHaveProperty('currentStreak');
      expect(result).toHaveProperty('comboDetected');
      expect(result).toHaveProperty('comboType');
      expect(result).toHaveProperty('comboMessage');
      expect(result).toHaveProperty('progressToNextCombo');
    });

    test('currentStreak debe ser número', () => {
      const result = ComboTracker.recordAnswer('player1', true);

      expect(typeof result.currentStreak).toBe('number');
      expect(result.currentStreak).toBeGreaterThanOrEqual(0);
    });

    test('comboDetected debe ser booleano', () => {
      const result = ComboTracker.recordAnswer('player1', true);

      expect(typeof result.comboDetected).toBe('boolean');
    });

    test('comboType debe ser null o string válido', () => {
      const result1 = ComboTracker.recordAnswer('player1', true);
      const result2 = ComboTracker.recordAnswer('player1', true);
      const result3 = ComboTracker.recordAnswer('player1', true);

      expect(result1.comboType).toBeNull();
      expect(result2.comboType).toBeNull();
      expect(result3.comboType).toBe('HOT_STREAK');
    });
  });
});