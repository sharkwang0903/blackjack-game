(() => {
const KEY = "blackjack-best-v1";
const empty = () => ({ longestRounds: 0, mostBlackjacks: 0 });

function loadRecords(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(KEY));
    return {
      longestRounds: Number.isInteger(saved?.longestRounds) && saved.longestRounds >= 0 ? saved.longestRounds : 0,
      mostBlackjacks: Number.isInteger(saved?.mostBlackjacks) && saved.mostBlackjacks >= 0 ? saved.mostBlackjacks : 0
    };
  } catch {
    return empty();
  }
}

function updateRecords(stats, storage) {
  const old = loadRecords(storage);
  const records = {
    longestRounds: Math.max(old.longestRounds, stats.rounds),
    mostBlackjacks: Math.max(old.mostBlackjacks, stats.blackjacks)
  };
  try { (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(records)); } catch { /* Some file browsers block storage. */ }
  return records;
}

globalThis.BlackjackStorage = { loadRecords, updateRecords };
})();
