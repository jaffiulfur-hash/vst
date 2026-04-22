// Wear OS pairing + transfer helper
const WearPairing = (() => {
  const PAIR_KEY = 'vikingWearPairCode';
  const genCode = () => {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 12).toUpperCase();
  };
  const getOrCreateCode = () => {
    let code = localStorage.getItem(PAIR_KEY);
    if (!code) { code = genCode(); localStorage.setItem(PAIR_KEY, code); }
    return code;
  };
  function init(game) {
    if (!game) return;
    // Wire buttons
    const pairBtn = document.getElementById('settingsPairBtn');
    const transferBtn = document.getElementById('settingsTransferBtn');
    if (pairBtn) pairBtn.addEventListener('click', () => showPairModal(game));
    if (transferBtn) transferBtn.addEventListener('click', () => transferFromPhone(game));
    // Friendly popup
    try { game.notify('To import phone progress: Settings → Transfer from Phone', 'info'); } catch {}
  }
  function showPairModal(game) {
    const code = getOrCreateCode();
    const msg = [
      'Pairing your watch with phone:',
      `1) On your phone, open Viking Settlement Tycoon.`,
      `2) Export your save to TXT (Settings → Export).`,
      `3) On watch, tap “Transfer from Phone” and paste the code.`,
      '',
      `Your watch pairing code: ${code}`
    ].join('\n');
    try {
      navigator.clipboard?.writeText(code).catch(()=>{});
      game.notify('Pair code copied to clipboard', 'success');
    } catch {}
    alert(msg);
  }
  function transferFromPhone(game) {
    // Allow paste of Base64 TXT or raw JSON string from phone
    const input = prompt('Paste the Base64 TXT from your phone (or raw JSON):', '');
    if (!input) return;
    let jsonStr = input.trim();
    // Detect Base64 (simple heuristic)
    try {
      if (/^[A-Za-z0-9+/=\\s]+$/.test(jsonStr) && !jsonStr.startsWith('{')) {
        jsonStr = decodeURIComponent(escape(atob(jsonStr)));
      }
      const data = JSON.parse(jsonStr);
      // Accept both plain gameState and wrapped payloads ({data:{...}})
      const state = data.data && typeof data.data === 'object' ? data.data : data;
      if (!validate(state)) { game.notify('Invalid data', 'error'); return; }
      applyToWear(game, state);
      game.saveGame?.();
      game.notify('Transfer complete!', 'success');
    } catch (e) {
      console.error(e);
      game.notify('Transfer failed', 'error');
    }
  }
  function validate(s) {
    try {
      if (!s || typeof s !== 'object') return false;
      if (!s.resources || typeof s.resources.food !== 'number') return false;
      if (!Array.isArray(s.buildings)) return false;
      if (!Array.isArray(s.scouts)) return false;
      if (typeof s.camera !== 'object') return false;
      return true;
    } catch { return false; }
  }
  function applyToWear(game, s) {
    // Resources & population
    game.resources = { ...game.resources, ...s.resources };
    game.population = typeof s.population === 'number' ? s.population : game.population;
    // Buildings: map into wear format (sizes differ but getBuildingData resolves)
    game.buildings = [];
    (s.buildings || []).forEach(sb => {
      const d = game.getBuildingData?.(sb.type);
      if (!d) return;
      const b = { type: sb.type, x: sb.x || 0, y: sb.y || 0, level: sb.level || 1, lastUpdate: Date.now(), ...d, productionPerSec: {} };
      if (d.produces) for (const [res, amt] of Object.entries(d.produces)) b.productionPerSec[res] = amt / 3;
      game.buildings.push(b);
    });
    // Camera & seed
    if (s.camera) game.camera = { x: s.camera.x || 0, y: s.camera.y || 0, scale: Math.max(0.3, Math.min(2.2, s.camera.scale || 1)) };
    if (typeof s.seed === 'number') game.seed = s.seed;
    // Scouts: sanitize and reset targets
    game.scouts = (s.scouts || []).map(ss => ({ x: ss.x || 0, y: ss.y || 0, speed: Math.max(1, ss.speed || 20), health: ss.health || 100, range: ss.range || 50, exploring: false, target: null }));
    if (game.scouts.length === 0) game.spawnInitialScout?.();
    // Explored areas
    game.exploredAreas = new Set(Array.isArray(s.exploredAreas) ? s.exploredAreas : []);
    // Persistent stats: keep best values
    if (s.settlementStatus) {
      const cur = game.settlementStatus || { happiness: 0, defense: 0, prosperity: 0 };
      game.settlementStatus = {
        happiness: Math.max(cur.happiness || 0, s.settlementStatus.happiness || 0),
        defense: Math.max(cur.defense || 0, s.settlementStatus.defense || 0),
        prosperity: Math.max(cur.prosperity || 0, s.settlementStatus.prosperity || 0)
      };
    }
    // Refresh world/chunks and HUD
    try { game.loadedChunks.clear(); game.fogOfWar.clear(); game.loadNearbyChunks(); } catch {}
    try { game.updateHUD?.(); } catch {}
  }
  return { init }
})();