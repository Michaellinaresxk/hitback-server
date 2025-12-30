/**
 * 🧪 POWERCARDSERVICE.TEST.JS
 * Tests profesionales con Jest
 * 
 * Ejecutar: npm test -- PowerCardService.test.js
 */

const PowerCardService = require('../../services/PowerCardService');
const ComboTracker = require('../../services/ComboTracker');

describe('PowerCardService', () => {

  beforeEach(() => {
    // Limpiar antes de cada test
    PowerCardService.clearAll();
    ComboTracker.clearAll();
  });

  afterEach(() => {
    // Limpiar después de cada test
    PowerCardService.clearAll();
    ComboTracker.clearAll();
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 1: Cargar Power Cards
  // ═══════════════════════════════════════════════════════════════

  describe('getAllPowerCards - Cargar cartas', () => {

    test('debe cargar power cards desde JSON', () => {
      const cards = PowerCardService.getAllPowerCards();

      expect(Array.isArray(cards)).toBe(true);
      expect(cards.length).toBeGreaterThan(0);
    });

    test('debe tener estructura correcta de carta', () => {
      const cards = PowerCardService.getAllPowerCards();
      const card = cards[0];

      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('type');
      expect(card).toHaveProperty('emoji');
      expect(card).toHaveProperty('description');
    });

    test('debe contener al menos la carta REPLAY', () => {
      const cards = PowerCardService.getAllPowerCards();
      const replayCard = cards.find(c => c.type === 'replay');

      expect(replayCard).toBeDefined();
      expect(replayCard.type).toBe('replay');
    });
  });

  describe('getPowerCardById - Obtener carta específica', () => {

    test('debe obtener carta por ID', () => {
      const card = PowerCardService.getPowerCardById('power_replay_001');

      expect(card).toBeDefined();
      expect(card.id).toBe('power_replay_001');
      expect(card.type).toBe('replay');
    });

    test('debe lanzar error si carta no existe', () => {
      expect(() => {
        PowerCardService.getPowerCardById('nonexistent_card');
      }).toThrow();
    });
  });

  describe('getPowerCardByType - Obtener por tipo', () => {

    test('debe obtener carta por tipo', () => {
      const card = PowerCardService.getPowerCardByType('replay');

      expect(card).toBeDefined();
      expect(card.type).toBe('replay');
    });

    test('debe lanzar error si tipo no existe', () => {
      expect(() => {
        PowerCardService.getPowerCardByType('nonexistent_type');
      }).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 2: Procesar Respuestas y Detectar Combo
  // ═══════════════════════════════════════════════════════════════

  describe('processPlayerAnswer - Integración con ComboTracker', () => {

    test('debe procesar respuesta correcta sin combo', () => {
      const result = PowerCardService.processPlayerAnswer('player1', true);

      expect(result.success).toBe(true);
      expect(result.currentStreak).toBe(1);
      expect(result.comboDetected).toBe(false);
      expect(result.cardAwarded).toBeNull();
    });

    test('debe acumular rachas', () => {
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result = PowerCardService.processPlayerAnswer('player1', true);

      expect(result.currentStreak).toBe(3);
      expect(result.comboDetected).toBe(true);
    });

    test('debe resetear racha con respuesta incorrecta', () => {
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result = PowerCardService.processPlayerAnswer('player1', false);

      expect(result.currentStreak).toBe(0);
      expect(result.comboDetected).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 3: Otorgamiento de Cartas
  // ═══════════════════════════════════════════════════════════════

  describe('Otorgamiento de Cartas - Combo Detected', () => {

    test('debe otorgar carta al detectar combo', () => {
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result = PowerCardService.processPlayerAnswer('player1', true);

      expect(result.comboDetected).toBe(true);
      expect(result.cardAwarded).toBeDefined();
      expect(result.cardAwarded.id).toBe('power_replay_001');
    });

    test('carta otorgada debe tener QR code', () => {
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result = PowerCardService.processPlayerAnswer('player1', true);

      expect(result.cardAwarded.qrCode).toBeDefined();
      expect(typeof result.cardAwarded.qrCode).toBe('string');
      expect(result.cardAwarded.qrCode.length).toBeGreaterThan(0);
    });

    test('QR code debe tener formato válido', () => {
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result = PowerCardService.processPlayerAnswer('player1', true);

      const qrCode = result.cardAwarded.qrCode;
      expect(qrCode).toMatch(/^HITBACK_POWERCARD_/);
    });

    test('carta debe aparecer en inventario', () => {
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);

      const inventory = PowerCardService.getPlayerInventory('player1');

      expect(inventory['power_replay_001']).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 4: Gestión de Inventario
  // ═══════════════════════════════════════════════════════════════

  describe('Inventario de Cartas', () => {

    test('inventario debe estar vacío al inicio', () => {
      const inventory = PowerCardService.getPlayerInventory('newPlayer');

      expect(Object.keys(inventory).length).toBe(0);
    });

    test('addCardToInventory debe añadir carta', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      const inventory = PowerCardService.getPlayerInventory('player1');

      expect(inventory['power_replay_001']).toBe(1);
    });

    test('debe permitir múltiples cartas del mismo tipo', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      const inventory = PowerCardService.getPlayerInventory('player1');

      expect(inventory['power_replay_001']).toBe(2);
    });

    test('removeCardFromInventory debe remover carta', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      PowerCardService.removeCardFromInventory('player1', 'power_replay_001');
      const inventory = PowerCardService.getPlayerInventory('player1');

      expect(inventory['power_replay_001']).toBeUndefined();
    });

    test('debe lanzar error al remover carta inexistente', () => {
      expect(() => {
        PowerCardService.removeCardFromInventory('player1', 'nonexistent');
      }).toThrow();
    });

    test('debe decrementar cantidad al remover', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 2);
      PowerCardService.removeCardFromInventory('player1', 'power_replay_001');
      const inventory = PowerCardService.getPlayerInventory('player1');

      expect(inventory['power_replay_001']).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 5: Activación y Efectos
  // ═══════════════════════════════════════════════════════════════

  describe('Activación de Cartas', () => {

    test('activatePowerCard debe marcar carta como activa', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      const result = PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');

      expect(result.activated).toBe(true);
      expect(result.name).toBe('REPLAY');
    });

    test('debe retornar efecto correcto', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      const result = PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');

      expect(result.effect).toBeDefined();
      expect(result.effect.multiplier).toBe(2);
    });

    test('debe retornar error si jugador no tiene carta', () => {
      const result = PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Aplicar Efectos', () => {

    test('applyActiveCardEffect debe multiplicar puntos', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');

      const result = PowerCardService.applyActiveCardEffect('player1', 10);

      expect(result.finalPoints).toBe(20);
      expect(result.multiplier).toBe(2);
    });

    test('debe remover carta después de aplicar efecto', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');
      PowerCardService.applyActiveCardEffect('player1', 10);

      const inventory = PowerCardService.getPlayerInventory('player1');
      expect(Object.keys(inventory).length).toBe(0);
    });

    test('debe calcular correctamente con diferentes puntos base', () => {
      const testCases = [
        { base: 5, expected: 10 },
        { base: 15, expected: 30 },
        { base: 1, expected: 2 }
      ];

      testCases.forEach(testCase => {
        PowerCardService.clearAll();
        PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
        PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');

        const result = PowerCardService.applyActiveCardEffect('player1', testCase.base);
        expect(result.finalPoints).toBe(testCase.expected);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 6: Flujos Completos
  // ═══════════════════════════════════════════════════════════════

  describe('Flujo Completo - Combo a Multiplicador', () => {

    test('flujo completo: combo -> otorgamiento -> activación -> efecto', () => {
      // Paso 1: Detectar combo
      const comboResult = PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result3 = PowerCardService.processPlayerAnswer('player1', true);

      expect(result3.comboDetected).toBe(true);
      expect(result3.cardAwarded).toBeDefined();

      // Paso 2: Verificar inventario
      const inventory = PowerCardService.getPlayerInventory('player1');
      expect(inventory['power_replay_001']).toBe(1);

      // Paso 3: Activar carta
      const activated = PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');
      expect(activated.activated).toBe(true);

      // Paso 4: Aplicar efecto
      const effect = PowerCardService.applyActiveCardEffect('player1', 10);
      expect(effect.finalPoints).toBe(20);

      // Paso 5: Verificar consumo
      const finalInventory = PowerCardService.getPlayerInventory('player1');
      expect(Object.keys(finalInventory).length).toBe(0);
    });

    test('múltiples combos en la misma partida', () => {
      // Combo 1
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result1 = PowerCardService.processPlayerAnswer('player1', true);

      expect(result1.comboDetected).toBe(true);

      // Usar primera carta
      PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');
      PowerCardService.applyActiveCardEffect('player1', 10);

      // Combo 2
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result2 = PowerCardService.processPlayerAnswer('player1', true);

      expect(result2.comboDetected).toBe(true);

      // Debe tener otra carta en inventario
      const inventory = PowerCardService.getPlayerInventory('player1');
      expect(inventory['power_replay_001']).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 7: Múltiples Jugadores
  // ═══════════════════════════════════════════════════════════════

  describe('Múltiples Jugadores', () => {

    test('inventarios deben ser independientes', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      PowerCardService.addCardToInventory('player2', 'power_replay_001', 2);

      const inv1 = PowerCardService.getPlayerInventory('player1');
      const inv2 = PowerCardService.getPlayerInventory('player2');

      expect(inv1['power_replay_001']).toBe(1);
      expect(inv2['power_replay_001']).toBe(2);
    });

    test('cartas activadas deben ser independientes', () => {
      PowerCardService.addCardToInventory('player1', 'power_replay_001', 1);
      PowerCardService.addCardToInventory('player2', 'power_replay_001', 1);

      PowerCardService.activatePowerCard('player1', 'power_replay_001', 'session1');

      // Solo player1 debe tener carta activa
      const effect1 = PowerCardService.applyActiveCardEffect('player1', 10);
      expect(effect1.finalPoints).toBe(20);

      // Player2 todavía tiene carta
      const inv2 = PowerCardService.getPlayerInventory('player2');
      expect(inv2['power_replay_001']).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST SUITE 8: Estructura y Validación
  // ═══════════════════════════════════════════════════════════════

  describe('Estructura de Datos y Validación', () => {

    test('processPlayerAnswer debe retornar estructura correcta', () => {
      const result = PowerCardService.processPlayerAnswer('player1', true);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('comboDetected');
      expect(result).toHaveProperty('comboType');
      expect(result).toHaveProperty('currentStreak');
      expect(result).toHaveProperty('cardAwarded');
      expect(result).toHaveProperty('playerInventory');
    });

    test('cardAwarded debe tener todas las propiedades cuando existe', () => {
      PowerCardService.processPlayerAnswer('player1', true);
      PowerCardService.processPlayerAnswer('player1', true);
      const result = PowerCardService.processPlayerAnswer('player1', true);

      const card = result.cardAwarded;
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('type');
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('emoji');
      expect(card).toHaveProperty('description');
      expect(card).toHaveProperty('qrCode');
    });
  });
});