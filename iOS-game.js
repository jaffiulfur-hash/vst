/*
  iOS-game.js
  - Bootstraps the main VikingSettlementTycoon game on the iOS page.
  - Bridges the game's HUD values into the iOS-specific DOM (iosFood, iosWood, iosIron, iosGold, iosPop, iosTime, iosHappinessBar, iosDefenseBar, iosProsperityBar).
*/

(function () {
  // Wait for DOM ready + game class availability
  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn, 0);
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    // Splash handling similar to desktop: fade then start
    const splash = document.getElementById('splashScreen');
    const container = document.getElementById('gameContainer');
    const startGame = () => {
      // Ensure the global VikingSettlementTycoon class is present
      if (typeof VikingSettlementTycoon !== 'function') {
        console.error('VikingSettlementTycoon class not found. Did game.js load?');
        return;
      }
      // create instance and expose it
      try {
        const game = new VikingSettlementTycoon();
        window.vikingGame = game;
        // Ensure main container visible
        if (container) container.style.display = 'flex';
        // Sync UI periodically with game's current logic
        startHudSync(game);
        // If VSync helper used externally, ensure externalLoop true to let VSync drive loop
        game.externalLoop = true;
        try { VSync30.start(() => game.gameLoop()); } catch (e) {}
      } catch (e) {
        console.error('Failed to start game:', e);
      }
    };

    if (splash) {
      // show splash for short moment then fade out like other builds
      setTimeout(() => {
        splash.classList.add('fade-out');
        setTimeout(() => {
          splash.style.display = 'none';
          startGame();
        }, 500);
      }, 1200);
    } else {
      startGame();
    }
  });

  // HUD sync function: maps core game state into iOS DOM ids
  function startHudSync(game) {
    const qp = (id) => document.getElementById(id);
    const formatRate = (v) => (v >= 0 ? `+${v.toFixed(1)}/s` : `${v.toFixed(1)}/s`);

    function syncOnce() {
      try {
        if (!game) return;
        // resources
        const prod = computeProductionRates(game);
        const res = game.resources || {};
        const pop = typeof game.population === 'number' ? Math.floor(game.population) : '';

        const elFood = qp('iosFood'), elWood = qp('iosWood'), elIron = qp('iosIron'), elGold = qp('iosGold'), elPop = qp('iosPop');
        if (elFood) elFood.textContent = Math.floor(res.food || 0);
        if (elFood && elFood.nextElementSibling) elFood.nextElementSibling.textContent = `(${prod.food ? '+'+prod.food.toFixed(1) : '0.0'}/s)`;
        if (elWood) elWood.textContent = Math.floor(res.wood || 0);
        if (elWood && elWood.nextElementSibling) elWood.nextElementSibling.textContent = `(${prod.wood ? '+'+prod.wood.toFixed(1) : '0.0'}/s)`;
        if (elIron) elIron.textContent = Math.floor(res.iron || 0);
        if (elIron && elIron.nextElementSibling) elIron.nextElementSibling.textContent = `(${prod.iron ? '+'+prod.iron.toFixed(1) : '0.0'}/s)`;
        if (elGold) elGold.textContent = Math.floor(res.gold || 0);
        if (elGold && elGold.nextElementSibling) elGold.nextElementSibling.textContent = `(${prod.gold ? '+'+prod.gold.toFixed(1) : '0.0'}/s)`;
        if (elPop) elPop.textContent = pop;

        // time / phase
        const dni = typeof game.getDayNightInfo === 'function' ? game.getDayNightInfo() : null;
        const timeEl = qp('iosTime');
        if (timeEl && dni) {
          const percent = dni.cycleProgress || 0;
          const hour = Math.floor(percent * 24);
          const clock = `${String(hour).padStart(2,'0')}:00`;
          timeEl.textContent = `${dni.phase} ${clock}`;
        }

        // settlement stats (use game's updateStatsDisplay logic if available)
        if (typeof game.updateStatsDisplay === 'function') {
          // call to ensure game.settlementStatus refreshed
          try { game.updateStatsDisplay(); } catch {}
        }
        const st = game.settlementStatus || {};
        const hb = qp('iosHappinessBar'), db = qp('iosDefenseBar'), pb = qp('iosProsperityBar');
        if (hb && typeof st.happiness === 'number') hb.style.width = `${st.happiness}%`;
        if (db && typeof st.defense === 'number') db.style.width = `${st.defense}%`;
        if (pb && typeof st.prosperity === 'number') pb.style.width = `${st.prosperity}%`;
      } catch (e) {
        console.warn('HUD sync error', e);
      }
    }

    // compute production rates similarly to game logic
    function computeProductionRates(game) {
      const rates = { food: 0, wood: 0, iron: 0, gold: 0 };
      try {
        (game.buildings || []).forEach(b => {
          if (b.produces) {
            for (const [r, amt] of Object.entries(b.produces)) {
              if (rates.hasOwnProperty(r)) rates[r] += (amt / 3);
            }
          }
        });
      } catch (e) {}
      return rates;
    }

    // Sync at 2Hz for responsive mobile UI without heavy updates
    syncOnce();
    const iv = setInterval(syncOnce, 500);

    // attempt to stop interval when page unloads
    window.addEventListener('beforeunload', () => clearInterval(iv));
  }
})();