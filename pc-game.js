// PC helpers: keyboard shortcuts and subtle UI sound
window.addEventListener('load', () => {
  // Detect macOS for Command key support
  const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  document.addEventListener('keydown', (e) => {
    const modKey = isMacOS ? e.metaKey : e.ctrlKey; // Use Command on macOS, Ctrl elsewhere
    if (modKey && e.key.toLowerCase() === 's') { e.preventDefault(); document.getElementById('saveGameBtn')?.click(); }
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') { document.getElementById('generateMapBtn')?.click(); }
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'p') { window.vikingGame?.takePhoto(); }
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); window.vikingGame?.exportSaveTxt(); }
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'i') { e.preventDefault(); window.vikingGame?.importSaveTxt(); }
    if (e.key === 'Escape') { document.querySelector('.building-card.selected')?.classList.remove('selected'); }
  });
  const hover = new Audio('ui_click.mp3'); hover.volume = 0.15;
  document.querySelectorAll('.building-card').forEach(card => {
    card.addEventListener('mouseenter', () => { try { hover.currentTime = 0; hover.play().catch(()=>{}); } catch {} });
  });
  // PC QoL: time overlay and rename jarl
  const updateTime = () => {
    const g = window.vikingGame; if (!g) return;
    const info = g.getDayNightInfo();
    const tp = document.getElementById('timePhase'); const tc = document.getElementById('timeClock');
    if (tp && tc) {
      tp.textContent = info.phase;
      const hours = Math.floor(info.cycleProgress * 24);
      tc.textContent = `${String(hours).padStart(2,'0')}:00`;
    }
  };
  setInterval(updateTime, 500);
  document.getElementById('renameJarlBtn')?.addEventListener('click', () => {
    try {
      const key = 'vikingKingName';
      const cur = window.vikingGame?.kingName || localStorage.getItem(key) || '';
      const name = (prompt('Rename your Jarl:', cur) || '').trim();
      if (!name) return;
      localStorage.setItem(key, name);
      if (window.vikingGame) { window.vikingGame.kingName = name; }
      const el = document.getElementById('kingNameDisplay'); if (el) el.textContent = `Jarl: ${name}`;
    } catch {}
  });
});