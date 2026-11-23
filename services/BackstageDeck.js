const {
  BACKSTAGE_DECK,
  BACKSTAGE_INTERVAL,
  BACKSTAGE_LAST_POSITION,
} = require('../constants/backstage');

function shuffle(cards, rng) {
  const deck = [...cards];
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function createDeck(rng = Math.random) {
  return shuffle(BACKSTAGE_DECK, rng);
}

function isBackstagePosition(position, interval = BACKSTAGE_INTERVAL) {
  return (
    Number.isInteger(position) &&
    Number.isInteger(interval) &&
    interval > 0 &&
    position > 0 &&
    position <= BACKSTAGE_LAST_POSITION &&
    position % interval === 0
  );
}

function crossedBackstages(from, to, interval = BACKSTAGE_INTERVAL) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const positions = [];
  for (let position = start + 1; position <= end; position++) {
    if (isBackstagePosition(position, interval)) positions.push(position);
  }
  return positions;
}

/**
 * Draws the first card without replacement. Reshuffles when empty and avoids
 * repeating the last drawn card when the fresh deck allows it.
 */
function drawCard(deck, lastCard = null, rng = Math.random) {
  const remaining = Array.isArray(deck) && deck.length > 0 ? [...deck] : createDeck(rng);
  let card = remaining.shift();

  if (card === lastCard) {
    const replacementIndex = remaining.findIndex((candidate) => candidate !== lastCard);
    if (replacementIndex >= 0) {
      [remaining[0], remaining[replacementIndex]] = [
        remaining[replacementIndex],
        remaining[0],
      ];
      card = remaining.shift();
    }
  }

  return { card, deck: remaining };
}

module.exports = {
  createDeck,
  drawCard,
  isBackstagePosition,
  crossedBackstages,
};
