import test from "node:test";
import assert from "node:assert/strict";
import "./deck.js";
import "./game.js";
import "./storage.js";

const { BlackjackGame, PHASE, handValue } = globalThis.BlackjackGameCore;
const { RANKS, SUITS, createShuffledDeck } = globalThis.BlackjackDeck;
const { loadRecords, updateRecords } = globalThis.BlackjackStorage;

const c = rank => ({ rank, suit: "♠" });
const cards = (...ranks) => ranks.map(c);

function setup(ranks, { remaining = 30, nextDeck = null } = {}) {
  const tasks = [];
  const scheduler = { setTimeout(fn, ms) { tasks.push({ fn, ms }); } };
  let deckCalls = 0;
  let index = 0;
  const first = cards(...ranks);
  const deckFactory = () => {
    deckCalls++;
    if (deckCalls > 1) return nextDeck ?? { draw: () => c("2"), remaining: () => 52 };
    return { draw() { assert.ok(index < first.length, "scripted shoe ran out"); return first[index++]; }, remaining: () => remaining };
  };
  const game = new BlackjackGame({ deckFactory, scheduler });
  function flush(ms) {
    assert.ok(tasks.length, "expected a scheduled transition");
    const task = tasks.shift();
    assert.equal(task.ms, ms);
    task.fn();
  }
  function begin(bet = 100) {
    game.startChallenge();
    if (bet === 1000) game.allIn();
    else if (bet === 25) game.addBet(25);
    else if (bet === 100) game.addBet(100);
    else throw new Error("unsupported test bet");
    assert.equal(game.startRound(), true);
    assert.equal(game.getState().phase, PHASE.DEALING);
    assert.equal(game.getActions().hit, false);
    flush(450);
    return game;
  }
  return { game, begin, flush, deckCalls: () => deckCalls, tasks };
}

test("one shuffled shoe has exactly 52 distinct standard cards", () => {
  const deck = createShuffledDeck();
  const dealt = Array.from({ length: 52 }, () => deck.draw());
  assert.equal(new Set(dealt.map(card => `${card.rank}${card.suit}`)).size, 52);
  assert.deepEqual(new Set(dealt.map(card => card.rank)), new Set(RANKS));
  assert.deepEqual(new Set(dealt.map(card => card.suit)), new Set(SUITS));
  assert.equal(deck.remaining(), 0);
});

test("natural Blackjack wins 3:2 and skips actions", () => {
  const { game, begin } = setup(["A", "9", "K", "7"]);
  begin();
  assert.equal(game.getState().chips, 1150);
  assert.equal(game.getState().stats.blackjacks, 1);
  assert.equal(game.getState().round.hands[0].outcome, "blackjack");
  assert.equal(game.getActions().hit, false);
  assert.match(game.getState().message, /Blackjack/);
});

test("simultaneous Blackjack pushes but counts the player's Blackjack", () => {
  const { game, begin } = setup(["A", "A", "K", "Q"]);
  begin();
  assert.equal(game.getState().chips, 1000);
  assert.equal(game.getState().stats.pushes, 1);
  assert.equal(game.getState().stats.blackjacks, 1);
});

test("dealer Blackjack immediately defeats a non-Blackjack player", () => {
  const { game, begin } = setup(["9", "A", "7", "K"]);
  begin();
  assert.equal(game.getState().chips, 900);
  assert.equal(game.getState().stats.losses, 1);
  assert.equal(game.getState().round.dealerRevealed, true);
});

test("Hit bust loses without any dealer draws", () => {
  const { game, begin } = setup(["10", "6", "9", "9", "5"]);
  begin();
  game.hit();
  assert.equal(game.getState().phase, PHASE.SETTLEMENT);
  assert.equal(game.getState().round.dealer.length, 2);
  assert.equal(game.getState().chips, 900);
  assert.equal(game.getState().message, "Bust");
});

test("dealer bust pays 1:1 and dealer stands on soft 17", () => {
  const bust = setup(["10", "6", "8", "9", "10"]);
  bust.begin();
  bust.game.stand();
  bust.flush(450);
  assert.equal(bust.game.getState().chips, 1100);
  assert.equal(bust.game.getState().round.dealer.length, 3);

  const soft = setup(["10", "A", "8", "6"]);
  soft.begin();
  soft.game.stand();
  soft.flush(450);
  assert.equal(soft.game.getState().round.dealer.length, 2);
  assert.equal(handValue(soft.game.getState().round.dealer).soft, true);
});

test("equal totals push and return the stake", () => {
  const { game, begin, flush } = setup(["10", "9", "8", "9"]);
  begin(); game.stand(); flush(450);
  assert.equal(game.getState().chips, 1000);
  assert.equal(game.getState().stats.pushes, 1);
});

test("aces count as soft 17, then hard 17 after a ten", () => {
  assert.deepEqual(handValue(cards("A", "6")), { total: 17, soft: true });
  assert.deepEqual(handValue(cards("A", "6", "10")), { total: 17, soft: false });
  assert.deepEqual(handValue(cards("A", "A", "9")), { total: 21, soft: true });
});

test("Double takes exactly one card, auto-stands, and doubles only that hand's stake", () => {
  const { game, begin, flush } = setup(["10", "9", "6", "8", "5"]);
  begin();
  assert.equal(game.double(), true);
  assert.equal(game.getState().round.hands[0].cards.length, 3);
  assert.equal(game.getState().round.hands[0].bet, 200);
  assert.equal(game.getState().phase, PHASE.DEALER);
  assert.equal(game.hit(), false);
  flush(450);
  assert.equal(game.getState().stats.maxRoundBet, 200);
});

test("insufficient chips disable Double and Split", () => {
  const { game, begin } = setup(["8", "9", "8", "8"]);
  begin(1000);
  assert.equal(game.getActions().double, false);
  assert.equal(game.getActions().split, false);
  assert.equal(game.double(), false);
  assert.equal(game.split(), false);
});

test("8+8 Split settles one winning hand and one losing hand", () => {
  const { game, begin, flush } = setup(["8", "9", "8", "8", "10", "7"]);
  begin();
  assert.equal(game.split(), true);
  assert.equal(game.getState().phase, PHASE.SPLIT_LEFT);
  assert.equal(game.getState().round.hands[1].cards.length, 1);
  game.stand();
  assert.equal(game.getState().phase, PHASE.SPLIT_RIGHT);
  assert.equal(game.getState().round.hands[1].cards.length, 2);
  assert.equal(game.getActions().split, false);
  game.stand(); flush(450);
  assert.deepEqual(game.getState().round.hands.map(hand => hand.outcome), ["win", "loss"]);
  assert.equal(game.getState().stats.rounds, 1);
  assert.equal(game.getState().stats.wins, 1);
  assert.equal(game.getState().stats.losses, 1);
  assert.equal(game.getState().chips, 1000);
  assert.equal(game.getState().stats.maxRoundBet, 200);
});

test("10+K can Split by Blackjack value", () => {
  const { game, begin } = setup(["10", "9", "K", "7", "A"]);
  begin();
  assert.equal(game.getActions().split, true);
  game.split();
  assert.equal(game.getState().round.hands[0].cards[1].rank, "A");
  assert.equal(game.getState().stats.blackjacks, 0);
});

test("a busted split hand moves to the other hand", () => {
  const { game, begin, flush } = setup(["8", "9", "8", "8", "10", "10", "9"]);
  begin(); game.split(); game.hit();
  assert.equal(game.getState().phase, PHASE.SPLIT_RIGHT);
  assert.equal(game.getState().round.hands[0].outcome, "loss");
  assert.equal(game.getActions().stand, true);
  game.stand(); flush(450);
  assert.deepEqual(game.getState().round.hands.map(hand => hand.outcome), ["loss", "push"]);
});

test("Double after Split changes only the active stake and round maximum", () => {
  const { game, begin, flush } = setup(["8", "9", "8", "8", "3", "10", "4"]);
  begin(); game.split();
  assert.equal(game.getActions().double, true);
  game.double();
  assert.equal(game.getState().phase, PHASE.SPLIT_RIGHT);
  assert.deepEqual(game.getState().round.hands.map(hand => hand.bet), [200, 100]);
  game.stand(); flush(450);
  assert.equal(game.getState().stats.maxRoundBet, 300);
  assert.equal(game.getState().stats.rounds, 1);
});

test("split aces get exactly one card each; A+K is ordinary 21", () => {
  const { game, begin, flush } = setup(["A", "9", "A", "8", "K", "9"]);
  begin(); game.split();
  assert.equal(game.getState().phase, PHASE.DEALER);
  assert.deepEqual(game.getState().round.hands.map(hand => hand.cards.length), [2, 2]);
  assert.equal(game.getActions().hit, false);
  flush(450);
  assert.equal(game.getState().stats.blackjacks, 0);
  assert.equal(game.getState().round.hands[0].outcome, "win");
  assert.equal(game.getState().chips, 1200);
});

test("All In waits for Start and disables Double and Split", () => {
  const { game, flush } = setup(["8", "9", "8", "8"]);
  game.startChallenge(); game.allIn();
  assert.equal(game.getState().phase, PHASE.BETTING);
  assert.equal(game.getState().pendingBet, 1000);
  assert.equal(game.getState().chips, 1000);
  game.startRound(); flush(450);
  assert.equal(game.getState().chips, 0);
  assert.equal(game.getActions().double, false);
  assert.equal(game.getActions().split, false);
});

test("odd Blackjack bet rounds profit up for the player", () => {
  const { game, begin } = setup(["A", "9", "K", "8"]);
  begin(25);
  assert.equal(game.getState().chips, 1038);
  assert.equal(game.getState().stats.maxRoundBet, 25);
});

test("low shoe waits five seconds before creating a new shuffled deck", () => {
  const f = setup(["10", "9", "8", "9"], { remaining: 12 });
  f.begin(); f.game.stand(); f.flush(450);
  f.game.nextRound();
  assert.equal(f.game.getState().phase, PHASE.SHUFFLE_WAIT);
  assert.equal(f.game.getState().message, "牌堆不足，重新洗牌中……");
  assert.equal(f.deckCalls(), 1);
  assert.equal(f.game.addBet(10), false);
  f.flush(5000);
  assert.equal(f.deckCalls(), 2);
  assert.equal(f.game.getState().phase, PHASE.BETTING);
});

test("losing an All In stake ends the challenge as bankrupt", () => {
  const { game, begin, flush } = setup(["10", "9", "6", "9"]);
  begin(1000); game.stand(); flush(450);
  assert.equal(game.getState().phase, PHASE.END);
  assert.equal(game.getState().endReason, "bankrupt");
  assert.equal(game.getState().chips, 0);
  assert.equal(game.getState().stats.rounds, 1);
});

test("leaving is allowed only after settlement and keeps accurate statistics", () => {
  const { game, begin, flush } = setup(["10", "9", "8", "9"]);
  begin();
  assert.equal(game.leaveTable(), false);
  game.stand(); flush(450);
  assert.equal(game.leaveTable(), true);
  const state = game.getState();
  assert.equal(state.phase, PHASE.END);
  assert.equal(state.endReason, "left");
  assert.deepEqual(state.stats, { rounds: 1, wins: 0, pushes: 1, losses: 0, blackjacks: 0, maxRoundBet: 100 });
});

test("retry resets chips, stats, round and deck", () => {
  const f = setup(["10", "9", "8", "9"]);
  f.begin(); f.game.stand(); f.flush(450); f.game.leaveTable();
  assert.equal(f.game.startChallenge(), true);
  assert.equal(f.deckCalls(), 2);
  assert.equal(f.game.getState().phase, PHASE.BETTING);
  assert.equal(f.game.getState().chips, 1000);
  assert.equal(f.game.getState().round, null);
  assert.equal(f.game.getState().stats.rounds, 0);
  assert.equal(f.game.getState().stats.maxRoundBet, 0);
});

test("bet buttons add to the pending stake, clear it, and never exceed available chips", () => {
  const { game } = setup([]);
  game.startChallenge();
  game.addBet(100); game.addBet(25);
  assert.equal(game.getState().pendingBet, 125);
  game.clearBet();
  assert.equal(game.getState().pendingBet, 0);
  assert.equal(game.startRound(), false);
  game.allIn();
  assert.equal(game.addBet(10), false);
  assert.equal(game.getState().pendingBet, 1000);
});

test("localStorage records keep the independent best values", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(loadRecords(storage), { longestRounds: 0, mostBlackjacks: 0 });
  updateRecords({ rounds: 5, blackjacks: 1 }, storage);
  updateRecords({ rounds: 3, blackjacks: 4 }, storage);
  assert.deepEqual(loadRecords(storage), { longestRounds: 5, mostBlackjacks: 4 });
});
