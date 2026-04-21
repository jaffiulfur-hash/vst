// Safe Steamworks/Electron integration + Steam Cloud sync
(() => {
  const isElectron = () => typeof window !== 'undefined' && typeof window.process === 'object' && window.process.versions?.electron;
  const tryRequire = (m) => { try { return window.require?.(m); } catch { return null; } };
  let client = null, runId = 0, APP_ID = (window.STEAM_APP_ID && Number(window.STEAM_APP_ID)) || 480; // TODO: replace 480 with real appId

  function init() {
    if (client || !isElectron()) return false;
    const Steamworks = tryRequire('steamworks.js'); if (!Steamworks) return false;
    try {
      client = Steamworks.init(APP_ID);
      if (!runId) runId = setInterval(() => { try { client.runCallbacks(); } catch {} }, 16);
      window.addEventListener('beforeunload', () => { try { clearInterval(runId); runId = 0; } catch {} });
      return true;
    } catch { client = null; return false; }
  }

  function saveFile(name, dataStr) {
    if (!client) return false;
    try { client.storage.writeFile(name, Buffer.from(dataStr, 'utf8')); return true; } catch { return false; }
  }

  function readFile(name) {
    if (!client) return null;
    try {
      const files = client.storage.getFileNames?.() || [];
      if (!files.includes(name)) return null;
      const buf = client.storage.readFile(name);
      return buf?.toString('utf8') ?? null;
    } catch { return null; }
  }

  async function trySyncToLocal(lsKey) {
    if (!client) return false;
    const fname = `${lsKey}.json`;
    const remote = readFile(fname);
    if (!remote) return false;
    try {
      const rObj = JSON.parse(remote);
      const lStr = localStorage.getItem(lsKey);
      const lObj = lStr ? JSON.parse(lStr) : null;
      const rTime = rObj?.saveTime || rObj?.data?.saveTime || 0;
      const lTime = lObj?.saveTime || lObj?.data?.saveTime || 0;
      if (rTime > lTime) localStorage.setItem(lsKey, remote);
      return true;
    } catch { return false; }
  }

  function syncFromLocal(lsKey) {
    if (!client) return false;
    const lStr = localStorage.getItem(lsKey);
    if (!lStr) return false;
    return saveFile(`${lsKey}.json`, lStr);
  }

  window.SteamCloud = { init, syncFromLocal, trySyncToLocal };
})();