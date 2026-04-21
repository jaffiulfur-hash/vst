(function () {
  function approxEqual(a, b, eps = 0.5) { return Math.abs(a - b) <= eps; }
  function sanitizeScouts(game) {
    if (!game || !Array.isArray(game.scouts)) return;
    // remove exact/near duplicates at same spot
    const unique = [];
    game.scouts.forEach(s => {
      if (!s || !isFinite(s.x) || !isFinite(s.y) || !isFinite(s.speed) || s.speed <= 0) return; // drop invalid
      const dup = unique.some(u => approxEqual(u.x, s.x, 1) && approxEqual(u.y, s.y, 1));
      if (!dup) unique.push(s);
    });
    if (unique.length === 0) {
      // respawn one clean scout at center
      game.spawnInitialScout?.();
    } else {
      game.scouts = unique;
      // clear impossible targets to avoid stuck state
      game.scouts.forEach(s => {
        if (!s.target || !isFinite(s.target.x) || !isFinite(s.target.y)) { s.target = null; s.exploring = false; }
      });
    }
  }

  function attach() {
    const game = window.vikingGame;
    if (!game) return false;
    // run once now
    sanitizeScouts(game);
    // run after resets/loads
    const origReset = game.resetGameProgress?.bind(game);
    if (origReset) {
      game.resetGameProgress = () => { origReset(); setTimeout(() => sanitizeScouts(game), 0); }
    }
    const origLoad = game.loadGame?.bind(game);
    if (origLoad) {
      game.loadGame = () => { const r = origLoad(); setTimeout(() => sanitizeScouts(game), 0); return r; }
    }
    // periodic watchdog for edge cases
    setInterval(() => sanitizeScouts(game), 3000);
    return true;
  }

  // wait until game is ready
  let tries = 0;
  const iv = setInterval(() => {
    if (attach() || ++tries > 40) clearInterval(iv);
  }, 250);
})();