(() => {
const { cardValue, createShuffledDeck } = globalThis.BlackjackDeck;

const PHASE = Object.freeze({
  HOME: "home", BETTING: "betting", DEALING: "dealing",
  PLAYER: "player", SPLIT_LEFT: "split-left", SPLIT_RIGHT: "split-right",
  DEALER: "dealer", SETTLEMENT: "settlement", SHUFFLE_WAIT: "shuffle-wait", END: "end"
});

function handValue(cards) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let softAces = cards.filter(card => card.rank === "A").length;
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces--;
  }
  return { total, soft: softAces > 0 };
}

const isBlackjack = cards => cards.length === 2 && handValue(cards).total === 21;
const freshStats = () => ({ rounds: 0, wins: 0, pushes: 0, losses: 0, blackjacks: 0, maxRoundBet: 0 });

class BlackjackGame {
  constructor({ deckFactory = createShuffledDeck, scheduler = globalThis, onChange = () => {}, onEnd = () => {} } = {}) {
    this.deckFactory = deckFactory;
    this.scheduler = scheduler;
    this.onChange = onChange;
    this.onEnd = onEnd;
    this.deck = null;
    this.state = { phase: PHASE.HOME, chips: 1000, pendingBet: 0, round: null, stats: freshStats(), endReason: null, message: "" };
    this.#emit();
  }

  getState() {
    return structuredClone(this.state);
  }

  getActions() {
    const { phase, chips, pendingBet, round } = this.state;
    const betting = phase === PHASE.BETTING;
    const playing = [PHASE.PLAYER, PHASE.SPLIT_LEFT, PHASE.SPLIT_RIGHT].includes(phase);
    const hand = playing ? round.hands[round.activeHand] : null;
    return {
      startChallenge: phase === PHASE.HOME,
      bet10: betting && pendingBet + 10 <= chips,
      bet25: betting && pendingBet + 25 <= chips,
      bet50: betting && pendingBet + 50 <= chips,
      bet100: betting && pendingBet + 100 <= chips,
      allIn: betting && chips > 0 && pendingBet < chips,
      clear: betting && pendingBet > 0,
      startRound: betting && pendingBet > 0,
      hit: playing,
      stand: playing,
      double: playing && hand.cards.length === 2 && chips >= hand.bet,
      split: phase === PHASE.PLAYER && round.hands.length === 1 &&
        hand.cards.length === 2 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) && chips >= hand.bet,
      nextRound: phase === PHASE.SETTLEMENT,
      leave: phase === PHASE.SETTLEMENT,
      home: phase === PHASE.END,
      retry: phase === PHASE.END
    };
  }

  startChallenge() {
    if (!this.getActions().startChallenge && !this.getActions().retry) return false;
    this.deck = this.deckFactory();
    this.state = { phase: PHASE.BETTING, chips: 1000, pendingBet: 0, round: null, stats: freshStats(), endReason: null, message: "請先下注。" };
    this.#emit();
    return true;
  }

  goHome() {
    if (!this.getActions().home) return false;
    this.state.phase = PHASE.HOME;
    this.state.message = "";
    this.#emit();
    return true;
  }

  addBet(amount) {
    if (![10, 25, 50, 100].includes(amount) || !this.getActions()[`bet${amount}`]) return false;
    this.state.pendingBet += amount;
    this.#emit();
    return true;
  }

  allIn() {
    if (!this.getActions().allIn) return false;
    this.state.pendingBet = this.state.chips;
    this.#emit();
    return true;
  }

  clearBet() {
    if (!this.getActions().clear) return false;
    this.state.pendingBet = 0;
    this.#emit();
    return true;
  }

  startRound() {
    if (!this.getActions().startRound) return false;
    const bet = this.state.pendingBet;
    this.state.chips -= bet;
    this.state.pendingBet = 0;
    this.state.round = {
      hands: [{ cards: [], bet, outcome: null }], dealer: [],
      activeHand: 0, dealerRevealed: false, naturalBlackjack: false
    };
    // Cards always come from the next position in this challenge's fixed shoe.
    const round = this.state.round;
    round.hands[0].cards.push(this.deck.draw());
    round.dealer.push(this.deck.draw());
    round.hands[0].cards.push(this.deck.draw());
    round.dealer.push(this.deck.draw());
    this.state.phase = PHASE.DEALING;
    this.state.message = "發牌中……";
    this.#emit();
    this.scheduler.setTimeout(() => this.#afterDeal(), 450);
    return true;
  }

  #afterDeal() {
    if (this.state.phase !== PHASE.DEALING) return;
    const round = this.state.round;
    const playerBlackjack = isBlackjack(round.hands[0].cards);
    const dealerBlackjack = isBlackjack(round.dealer);
    if (playerBlackjack) {
      round.naturalBlackjack = true;
      this.state.stats.blackjacks++;
      this.state.message = "Blackjack！";
    }
    if (playerBlackjack || dealerBlackjack) {
      round.dealerRevealed = true;
      round.hands[0].outcome = playerBlackjack && dealerBlackjack ? "push" : playerBlackjack ? "blackjack" : "loss";
      this.#settle();
      return;
    }
    this.state.phase = PHASE.PLAYER;
    this.state.message = "請選擇操作。";
    this.#emit();
  }

  hit() {
    if (!this.getActions().hit) return false;
    const round = this.state.round;
    const hand = round.hands[round.activeHand];
    hand.cards.push(this.deck.draw());
    if (handValue(hand.cards).total > 21) {
      hand.outcome = "loss";
      this.#finishHand();
    } else {
      this.state.message = handValue(hand.cards).total === 21 ? "21 點！可停牌。" : "請選擇操作。";
      this.#emit();
    }
    return true;
  }

  stand() {
    if (!this.getActions().stand) return false;
    this.#finishHand();
    return true;
  }

  double() {
    if (!this.getActions().double) return false;
    const round = this.state.round;
    const hand = round.hands[round.activeHand];
    this.state.chips -= hand.bet;
    hand.bet *= 2;
    hand.cards.push(this.deck.draw());
    if (handValue(hand.cards).total > 21) hand.outcome = "loss";
    this.#finishHand();
    return true;
  }

  split() {
    if (!this.getActions().split) return false;
    const round = this.state.round;
    const original = round.hands[0];
    const [left, right] = original.cards;
    this.state.chips -= original.bet;
    round.hands = [
      { cards: [left, this.deck.draw()], bet: original.bet, outcome: null },
      { cards: [right], bet: original.bet, outcome: null }
    ];
    round.activeHand = 0;
    this.state.phase = PHASE.SPLIT_LEFT;
    this.state.message = "分牌：先操作左手。";
    this.#emit();
    if (left.rank === "A") this.#finishHand();
    return true;
  }

  #finishHand() {
    const round = this.state.round;
    if (round.hands.length === 2 && round.activeHand === 0) {
      round.activeHand = 1;
      round.hands[1].cards.push(this.deck.draw());
      this.state.phase = PHASE.SPLIT_RIGHT;
      this.state.message = "輪到右手。";
      this.#emit();
      if (round.hands[1].cards[0].rank === "A") this.#finishHand();
      return;
    }
    if (round.hands.every(hand => handValue(hand.cards).total > 21)) {
      round.dealerRevealed = true;
      this.#settle();
      return;
    }
    round.dealerRevealed = true;
    this.state.phase = PHASE.DEALER;
    this.state.message = "莊家行動中……";
    this.#emit();
    this.scheduler.setTimeout(() => this.#dealerTurn(), 450);
  }

  #dealerTurn() {
    if (this.state.phase !== PHASE.DEALER) return;
    const round = this.state.round;
    // Soft 17 stands, since only totals below 17 draw.
    while (handValue(round.dealer).total < 17) round.dealer.push(this.deck.draw());
    this.#settle();
  }

  #settle() {
    const round = this.state.round;
    const dealerTotal = handValue(round.dealer).total;
    const stats = this.state.stats;
    for (const hand of round.hands) {
      if (!hand.outcome) {
        const total = handValue(hand.cards).total;
        hand.outcome = total > 21 ? "loss" : dealerTotal > 21 || total > dealerTotal ? "win" : total === dealerTotal ? "push" : "loss";
      }
      if (hand.outcome === "blackjack") {
        this.state.chips += hand.bet + Math.ceil(hand.bet * 1.5);
        stats.wins++;
      } else if (hand.outcome === "win") {
        this.state.chips += hand.bet * 2;
        stats.wins++;
      } else if (hand.outcome === "push") {
        this.state.chips += hand.bet;
        stats.pushes++;
      } else {
        stats.losses++;
      }
    }
    stats.rounds++;
    stats.maxRoundBet = Math.max(stats.maxRoundBet, round.hands.reduce((sum, hand) => sum + hand.bet, 0));
    this.state.message = round.naturalBlackjack ? "Blackjack！" :
      round.hands.map((hand, index) => `${round.hands.length === 2 ? `${index === 0 ? "左手" : "右手"}：` : ""}${handValue(hand.cards).total > 21 ? "Bust" : { blackjack: "Blackjack", win: "獲勝", push: "平手", loss: "失敗" }[hand.outcome]}`).join("　");
    if (this.state.chips === 0) {
      this.#end("bankrupt");
    } else {
      this.state.phase = PHASE.SETTLEMENT;
      this.#emit();
    }
  }

  nextRound() {
    if (!this.getActions().nextRound) return false;
    this.state.round = null;
    if (this.deck.remaining() < 13) {
      this.state.phase = PHASE.SHUFFLE_WAIT;
      this.state.message = "牌堆不足，重新洗牌中……";
      this.#emit();
      this.scheduler.setTimeout(() => {
        if (this.state.phase !== PHASE.SHUFFLE_WAIT) return;
        this.deck = this.deckFactory();
        this.state.phase = PHASE.BETTING;
        this.state.message = "請先下注。";
        this.#emit();
      }, 5000);
    } else {
      this.state.phase = PHASE.BETTING;
      this.state.message = "請先下注。";
      this.#emit();
    }
    return true;
  }

  leaveTable() {
    if (!this.getActions().leave) return false;
    this.#end("left");
    return true;
  }

  #end(reason) {
    this.state.phase = PHASE.END;
    this.state.endReason = reason;
    this.state.message = reason === "bankrupt" ? "籌碼用盡，挑戰結束。" : "已離開牌桌。";
    this.onEnd(structuredClone(this.state.stats));
    this.#emit();
  }

  #emit() { this.onChange(this.getState(), this.getActions()); }
}

globalThis.BlackjackGameCore = { BlackjackGame, PHASE, handValue };
})();
