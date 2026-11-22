const {
  createDeck,
  drawCard,
  isBackstagePosition,
  crossedBackstages,
} = require('../../services/BackstageDeck');
const {
  BACKSTAGE_DECK,
  BACKSTAGE_INTERVAL,
  BACKSTAGE_LAST_POSITION,
} = require('../../constants/backstage');

const seededRng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

describe('BackstageDeck', () => {
  test('marks only the 3-step backstage positions up to 18', () => {
    expect(BACKSTAGE_INTERVAL).toBe(3);
    expect(BACKSTAGE_LAST_POSITION).toBe(18);

    const backstages = Array.from({ length: 22 }, (_, position) => position).filter(
      (position) => isBackstagePosition(position),
    );

    expect(backstages).toEqual([3, 6, 9, 12, 15, 18]);
    expect(isBackstagePosition(0)).toBe(false);
    expect(isBackstagePosition(21)).toBe(false);
    expect(isBackstagePosition(3.5)).toBe(false);
    expect(isBackstagePosition(6, 2)).toBe(true);
    expect(isBackstagePosition(6, 0)).toBe(false);
  });

  test('crossedBackstages reports every pass-through position', () => {
    expect(crossedBackstages(1, 7)).toEqual([3, 6]);
    expect(crossedBackstages(7, 1)).toEqual([3, 6]);
    expect(crossedBackstages(15, 21)).toEqual([18]);
    expect(crossedBackstages(18, 21)).toEqual([]);
    expect(crossedBackstages(0, 0)).toEqual([]);
  });

  test('creates a full shuffled deck without mutating the constant', () => {
    const deck = createDeck(seededRng(7));

    expect(deck).toHaveLength(BACKSTAGE_DECK.length);
    expect([...deck].sort()).toEqual([...BACKSTAGE_DECK].sort());
    expect(BACKSTAGE_DECK[0]).toBe('FEATURING');
  });

  test('draws the twelve cards without replacement before reshuffling', () => {
    const rng = seededRng(42);
    let deck = createDeck(rng);
    let lastCard = null;
    const drawn = [];

    for (let index = 0; index < BACKSTAGE_DECK.length; index++) {
      const draw = drawCard(deck, lastCard, rng);
      deck = draw.deck;
      lastCard = draw.card;
      drawn.push(draw.card);
    }

    expect(deck).toEqual([]);
    expect(new Set(drawn)).toEqual(new Set(BACKSTAGE_DECK));
    expect(drawn).toHaveLength(BACKSTAGE_DECK.length);

    const reshuffled = drawCard(deck, lastCard, rng);
    expect(reshuffled.card).not.toBe(lastCard);
    expect(reshuffled.deck).toHaveLength(BACKSTAGE_DECK.length - 1);
  });

  test('swaps the first card when a fresh deck repeats the last card', () => {
    const draw = drawCard(['FEATURING', 'DUEL'], 'FEATURING', () => 0.5);

    expect(draw.card).toBe('DUEL');
    expect(draw.deck).toEqual([]);
  });
});
