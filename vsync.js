// 30 FPS VSync helper
(() => {
  const FRAME = 1000 / 30;
  let running = false, last = 0, acc = 0, rafId = 0, cb = null;
  function loop(ts) {
    if (!running) return;
    if (!last) last = ts;
    let delta = ts - last; last = ts;
    acc += delta;
    if (acc >= FRAME) {
      try { cb && cb(); } catch {}
      acc %= FRAME;
    }
    rafId = requestAnimationFrame(loop);
  }
  window.VSync30 = {
    start(fn) { cb = fn; if (!running) { running = true; last = 0; acc = 0; rafId = requestAnimationFrame(loop); } },
    stop() { running = false; cancelAnimationFrame(rafId); }
  };
})();

