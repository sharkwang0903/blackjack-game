(() => {
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function cardValue(card) {
  if (card.rank === "A") return 11;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

// Fisher–Yates shuffle. Rejection sampling avoids modulo bias when crypto is available.
function randomIndex(maxExclusive) {
  if (!globalThis.crypto?.getRandomValues) return Math.floor(Math.random() * maxExclusive);
  const values = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  do {
    globalThis.crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % maxExclusive;
}

function createShuffledDeck() {
  const cards = SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit })));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  let next = 0;
  return {
    draw() {
      if (next >= cards.length) throw new Error("牌堆已空");
      return cards[next++];
    },
    remaining() { return cards.length - next; }
  };
}

globalThis.BlackjackDeck = { SUITS, RANKS, cardValue, createShuffledDeck };
})();
