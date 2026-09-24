(() => {
const { BlackjackGame, PHASE, handValue } = globalThis.BlackjackGameCore;
const { loadRecords, updateRecords } = globalThis.BlackjackStorage;

const $ = id => document.getElementById(id);
const format = number => new Intl.NumberFormat("zh-TW").format(number);
const outcomeText = { blackjack: "Blackjack", win: "獲勝", push: "平手", loss: "失敗" };
let records = loadRecords();
let hasRenderedRound = false;

function setCardFace(element, card, hidden = false) {
  const red = card.suit === "♥" || card.suit === "♦";
  element.classList.toggle("back", hidden);
  element.classList.toggle("red", !hidden && red);
  element.setAttribute("aria-label", hidden ? "暗牌" : `${card.rank}${card.suit}`);
  element.innerHTML = hidden ? "" : `<span class="corner">${card.rank}<br><span class="corner-suit">${card.suit}</span></span><span class="center-suit">${card.suit}</span>`;
}

function appendCard(container, card, hidden = false, delay = 0) {
  const element = document.createElement("div");
  element.className = "card";
  setCardFace(element, card, hidden);
  container.append(element);
  // Measure only the new card; its animation starts at the visible shoe.
  const shoe = document.querySelector(".shoe-mark .shoe-card:last-of-type")?.getBoundingClientRect();
  if (shoe) {
    const target = element.getBoundingClientRect();
    element.style.setProperty("--deal-x", `${shoe.left + shoe.width / 2 - target.left - target.width / 2}px`);
    element.style.setProperty("--deal-y", `${shoe.top + shoe.height / 2 - target.top - target.height / 2}px`);
  }
  element.style.animationDelay = `${delay}ms`;
  element.addEventListener("animationend", () => {
    element.classList.remove("dealing");
    element.style.animationDelay = "";
  }, { once: true });
  element.classList.add("dealing");
}

function createHand() {
  const element = document.createElement("div");
  element.className = "hand";
  element.innerHTML = '<div class="hand-top"></div><div class="cards"></div>';
  return element;
}

function syncCards(round, phase, initialRound) {
  const hands = $("player-hands");
  const dealer = $("dealer-cards");

  if (!round) {
    if (hasRenderedRound) {
      hands.replaceChildren();
      dealer.replaceChildren();
      hasRenderedRound = false;
    }
    return;
  }

  if (!hasRenderedRound) {
    hands.append(createHand());
    hasRenderedRound = true;
  }

  if (round.hands.length === 2 && hands.children.length === 1) {
    const right = createHand();
    const leftCards = hands.children[0].querySelector(".cards");
    // Move the original second card to the right hand without dealing it again.
    const moved = leftCards.children[1];
    for (const oldCard of [leftCards.children[0], moved]) {
      oldCard.classList.remove("dealing");
      oldCard.style.animationDelay = "";
    }
    right.querySelector(".cards").append(moved);
    hands.append(right);
  }

  round.hands.forEach((hand, index) => {
    const element = hands.children[index];
    const cardRow = element.querySelector(".cards");
    const active = [PHASE.PLAYER, PHASE.SPLIT_LEFT, PHASE.SPLIT_RIGHT].includes(phase) && round.activeHand === index;
    const label = round.hands.length === 1 ? "你的牌" : index === 0 ? "左手" : "右手";
    const total = handValue(hand.cards).total;
    element.classList.toggle("active", active);
    element.querySelector(".hand-top").innerHTML = `<span class="hand-label">${label} · ${total} 點</span><span class="bet-pill">下注 ${format(hand.bet)}</span>${active ? '<span class="active-pill">操作中</span>' : ""}${hand.outcome ? `<span class="outcome-pill ${hand.outcome}">${total > 21 ? "Bust" : outcomeText[hand.outcome]}</span>` : ""}`;
    while (cardRow.children.length < hand.cards.length) {
      const cardIndex = cardRow.children.length;
      appendCard(cardRow, hand.cards[cardIndex], false, initialRound ? cardIndex * 120 : 0);
    }
  });

  const oldDealerCount = dealer.children.length;
  while (dealer.children.length < round.dealer.length) {
    const index = dealer.children.length;
    const delay = initialRound ? 60 + index * 120 : (index - oldDealerCount) * 90;
    appendCard(dealer, round.dealer[index], index === 1 && !round.dealerRevealed, delay);
  }
  const holeCard = dealer.children[1];
  if (holeCard?.classList.contains("back") && round.dealerRevealed) {
    setCardFace(holeCard, round.dealer[1]);
  }
}

function renderRecords() {
  $("top-rounds").textContent = format(records.longestRounds);
  $("top-blackjacks").textContent = format(records.mostBlackjacks);
}

function render(state, actions) {
  const { phase, round, stats } = state;
  document.querySelector(".app").classList.toggle("is-home", phase === PHASE.HOME);
  $("home-screen").hidden = phase !== PHASE.HOME;
  $("game-screen").hidden = phase === PHASE.HOME || phase === PHASE.END;
  $("end-screen").hidden = phase !== PHASE.END;
  $("chips").textContent = format(state.chips);
  $("round-bet").textContent = format(round ? round.hands.reduce((sum, hand) => sum + hand.bet, 0) : state.pendingBet);
  $("rounds").textContent = format(stats.rounds);
  $("pending-bet").textContent = format(state.pendingBet);
  $("status").textContent = state.message;
  $("bet-controls").hidden = phase !== PHASE.BETTING;
  $("play-controls").hidden = ![PHASE.PLAYER, PHASE.SPLIT_LEFT, PHASE.SPLIT_RIGHT].includes(phase);
  $("settlement-controls").hidden = phase !== PHASE.SETTLEMENT;
  $("player-hands").classList.toggle("split", round?.hands.length === 2);
  syncCards(round, phase, !hasRenderedRound);
  $("dealer-total").textContent = round ? round.dealerRevealed ? `${handValue(round.dealer).total} 點${handValue(round.dealer).total > 21 ? " · Bust" : ""}` : `${handValue([round.dealer[0]]).total} + ?` : "—";

  for (const amount of [10, 25, 50, 100]) document.querySelector(`[data-bet="${amount}"]`).disabled = !actions[`bet${amount}`];
  const buttons = { "all-in": actions.allIn, "clear-bet": actions.clear, "start-round": actions.startRound,
    hit: actions.hit, stand: actions.stand, double: actions.double, split: actions.split,
    "next-round": actions.nextRound, "leave-table": actions.leave };
  for (const [id, enabled] of Object.entries(buttons)) $(id).disabled = !enabled;

  if (phase === PHASE.END) {
    const hands = stats.wins + stats.pushes + stats.losses;
    $("end-title").textContent = state.endReason === "bankrupt" ? "籌碼用盡" : "本次成績";
    $("end-rounds").textContent = format(stats.rounds);
    $("end-chips").textContent = format(state.chips);
    $("end-record").textContent = `${stats.wins} / ${stats.pushes} / ${stats.losses}`;
    $("end-rate").textContent = `${(hands ? stats.wins / hands * 100 : 0).toFixed(1)}%`;
    $("end-max-bet").textContent = format(stats.maxRoundBet);
  }
  renderRecords();
}

const game = new BlackjackGame({
  onChange: render,
  onEnd: stats => { records = updateRecords(stats); }
});

function animateBetChip(button, source) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = $("pending-bet").getBoundingClientRect();
  const visual = document.createElement("div");
  visual.className = `${button.className} bet-chip-flying`;
  visual.innerHTML = button.innerHTML;
  visual.setAttribute("aria-hidden", "true");
  visual.style.left = `${source.left}px`;
  visual.style.top = `${source.top}px`;
  visual.style.width = `${source.width}px`;
  visual.style.height = `${source.height}px`;
  visual.style.setProperty("--chip-flight-x", `${target.left + target.width / 2 - source.left - source.width / 2}px`);
  visual.style.setProperty("--chip-flight-y", `${target.top + target.height / 2 - source.top - source.height / 2}px`);
  document.body.append(visual);
  visual.addEventListener("animationend", () => visual.remove(), { once: true });
  window.setTimeout(() => visual.remove(), 650);
}

$("start-challenge").addEventListener("click", () => game.startChallenge());
for (const button of document.querySelectorAll("[data-bet]")) button.addEventListener("click", () => {
  const source = button.getBoundingClientRect();
  if (game.addBet(Number(button.dataset.bet))) animateBetChip(button, source);
});
$("all-in").addEventListener("click", () => game.allIn());
$("clear-bet").addEventListener("click", () => game.clearBet());
$("start-round").addEventListener("click", () => game.startRound());
$("hit").addEventListener("click", () => game.hit());
$("stand").addEventListener("click", () => game.stand());
$("double").addEventListener("click", () => game.double());
$("split").addEventListener("click", () => game.split());
$("next-round").addEventListener("click", () => game.nextRound());
$("leave-table").addEventListener("click", () => game.leaveTable());
$("home").addEventListener("click", () => game.goHome());
$("retry").addEventListener("click", () => game.startChallenge());
})();
