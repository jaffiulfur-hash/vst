// SaveGuard: transactional localStorage protection for game saves
(() => {
  const TARGET_KEYS = ['vikingSettlement', 'vikingSettlementMobile'];
  const lsSet = localStorage.setItem.bind(localStorage);
  const lsGet = localStorage.getItem.bind(localStorage);

  const checksum = (str) => {
    let hash = 0; for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    return hash.toString();
  };

  const isCorrupt = (val, key) => {
    try {
      const savedCs = lsGet(key + '_checksum');
      if (savedCs && savedCs !== checksum(val)) return true;
      const obj = JSON.parse(val);
      if (obj && obj.data && obj.checksum) {
        const dataStr = JSON.stringify(obj.data);
        return obj.checksum !== checksum(dataStr);
      }
      if (!obj || typeof obj !== 'object') return true;
      if (obj.resources) {
        for (const r of ['food','wood','iron','gold']) {
          const v = obj.resources[r];
          if (typeof v !== 'number' || !isFinite(v)) return true;
        }
      }
      if (obj.camera) {
        const c = obj.camera;
        if (![c.x,c.y,c.scale].every(n => typeof n === 'number' && isFinite(n))) return true;
      }
      if (obj.scouts && !Array.isArray(obj.scouts)) return true;
      return false;
    } catch { return true; }
  };

  localStorage.setItem = (key, value) => {
    if (TARGET_KEYS.includes(key)) {
      try {
        const prev = lsGet(key);
        if (prev) lsSet(key + '_backup', prev);
        lsSet(key + '_checksum', checksum(value));
      } catch {}
    }
    return lsSet(key, value);
  };

  localStorage.getItem = (key) => {
    const val = lsGet(key);
    if (!TARGET_KEYS.includes(key)) return val;
    if (!val) {
      const backup = lsGet(key + '_backup');
      if (backup) { lsSet(key, backup); lsSet(key + '_checksum', checksum(backup)); return backup; }
      return val;
    }
    if (isCorrupt(val, key)) {
      const backup = lsGet(key + '_backup');
      if (backup && !isCorrupt(backup, key)) {
        lsSet(key, backup);
        lsSet(key + '_checksum', checksum(backup));
        return backup;
      }
    }
    return val;
  };

  window.SaveGuard = { computeChecksum: checksum };
})();