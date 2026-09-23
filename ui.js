(() => {
const { BlackjackGame, PHASE, handValue } = globalThis.BlackjackGameCore;
const { loadRecords, updateRecords } = globalThis.BlackjackStorage;

const $ = id => document.getElementById(id);
const format = number => new Intl.NumberFormat("zh-TW").format(number);
const outcomeText = { blackjack: "Blackjack", win: "獲勝", push: "平手", loss: "失敗" };
let records = loadRecords();

function renderCard(card, hidden = false) {
  if (hidden) return '<div class="card back" aria-label="暗牌"></div>';
  const red = card.suit === "♥" || card.suit === "♦";
  return `<div class="card${red ? " red" : ""}" aria-label="${card.rank}${card.suit}"><span class="corner">${card.rank}<br><span class="corner-suit">${card.suit}</span></span><span class="center-suit">${card.suit}</span></div>`;
}

function renderHands(round, phase) {
  if (!round) return '<div class="empty-hand">下注後開始發牌</div>';
  return round.hands.map((hand, index) => {
    const total = handValue(hand.cards).total;
    const active = [PHASE.PLAYER, PHASE.SPLIT_LEFT, PHASE.SPLIT_RIGHT].includes(phase) && round.activeHand === index;
    const label = round.hands.length === 1 ? "你的牌" : index === 0 ? "左手" : "右手";
    return `<div class="hand${active ? " active" : ""}">
      <div class="hand-top"><span class="hand-label">${label} · ${total} 點</span><span class="bet-pill">下注 ${format(hand.bet)}</span>${active ? '<span class="active-pill">操作中</span>' : ""}${hand.outcome ? `<span class="outcome-pill ${hand.outcome}">${total > 21 ? "Bust" : outcomeText[hand.outcome]}</span>` : ""}</div>
      <div class="cards">${hand.cards.map(card => renderCard(card)).join("")}</div>
    </div>`;
  }).join("");
}

function renderRecords() {
  $("top-rounds").textContent = format(records.longestRounds);
  $("top-blackjacks").textContent = format(records.mostBlackjacks);
}

function render(state, actions) {
  const { phase, round, stats } = state;
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
  $("player-hands").innerHTML = renderHands(round, phase);
  $("dealer-cards").innerHTML = round ? round.dealer.map((card, index) => renderCard(card, index === 1 && !round.dealerRevealed)).join("") : "";
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

$("start-challenge").addEventListener("click", () => game.startChallenge());
for (const button of document.querySelectorAll("[data-bet]")) button.addEventListener("click", () => game.addBet(Number(button.dataset.bet)));
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
