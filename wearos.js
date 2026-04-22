class WearVikingSettlementTycoon {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.camera = { x: 0, y: 0, scale: 1 };
    this.resources = { food: 100, wood: 50, iron: 25, gold: 10 };
    this.population = 5;
    this.buildings = [];
    this.selectedBuilding = null;
    this.placementMode = false;

    this.gameTime = 0;
    this.dayLength = 3600;
    this.timeSpeed = 1;

    this.chunkSize = 192;
    this.tileSize = 16;
    this.loadedChunks = new Map();
    this.chunkLoadRadius = 2;
    this.seed = Math.random() * 10000;

    this.fogOfWar = new Map();
    this.scouts = [];
    this.exploredAreas = new Set();
    this.revealAnimations = [];
    this.spriteCache = {};
    this.productionPopups = [];

    this.settlementStatusKey = 'vikingSettlementWearPersistentStats';
    this.settlementStatus = this.loadPersistentStats() || { happiness: 75, defense: 40, prosperity: 60 };
    this.saveKey = 'vikingSettlementWear';
    this.backupKey = 'vikingSettlementWear_backup';

    this.lastUpdate = 0;
    this.externalLoop = true;

    this.init();
    VSync30.start(() => this.gameLoop());
  }

  init() {
    this.setupCanvas();
    this.loadNearbyChunks();
    this.preloadSprites();
    if (!localStorage.getItem(this.saveKey)) { this.spawnInitialScout(); this.notify('Welcome to Wear OS!', 'success'); } else { this.loadGame(); }
    this.bindUI();
    this.updateHUD();
    
    // watchOS/Apple Watch detection
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('watch') || ua.includes('watchos')) {
      this.notify('Apple Watch detected', 'info');
    }
  }

  setupCanvas() {
    const resize = () => {
      const r = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = r.width;
      this.canvas.height = r.height;
    };
    resize();
    window.addEventListener('resize', resize);
    // wheel = crown zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.camera.scale = Math.max(0.3, Math.min(2.2, this.camera.scale * factor));
    });
    // drag pan
    let drag = null;
    this.canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; const rect = this.canvas.getBoundingClientRect();
      drag = { x: t.clientX - rect.left, y: t.clientY - rect.top, sx: this.camera.x, sy: this.camera.y, time: Date.now(), longDone: false };//this._lp = setTimeout(() => { if (drag && !drag.longDone) { drag.longDone = true; const w = this.screenToWorld(drag.x, drag.y); this.sendScoutToExplore(w.x, w.y); } }, 700);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      if (!drag) return;
      const t = e.touches[0]; const rect = this.canvas.getBoundingClientRect();
      const cx = t.clientX - rect.left, cy = t.clientY - rect.top;
      const dx = cx - drag.x, dy = cy - drag.y;
      this.camera.x = drag.sx - dx / this.camera.scale;
      this.camera.y = drag.sy - dy / this.camera.scale;
      if (Math.hypot(dx, dy) > 20 && this._lp) { clearTimeout(this._lp); this._lp = null; }
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      if (this._lp) { clearTimeout(this._lp); this._lp = null; }
      if (drag && !drag.longDone) {
        // tap = place building
        const rect = this.canvas.getBoundingClientRect();
        const x = drag.x, y = drag.y;
        if (this.placementMode && this.selectedBuilding) this.tryPlaceBuilding(x, y);
      }
      drag = null;
    });
  }

  bindUI() {
    const q = (id) => document.getElementById(id);
    q('btnBuild').addEventListener('click', () => q('buildTray').classList.toggle('active'));
    q('btnScout').addEventListener('click', () => this.notify('Long-press map to send scout', 'info'));
    q('btnSave').addEventListener('click', () => this.saveGame());
    q('btnSettings').addEventListener('click', () => this.toggleSettings(true));
    q('closeSettingsBtn').addEventListener('click', () => this.toggleSettings(false));
    q('settingsExportBtn').addEventListener('click', () => this.exportSaveTxt());
    q('settingsImportBtn').addEventListener('click', () => this.importSaveTxt());
    document.querySelectorAll('#buildTray .wear-pill').forEach(b => {
      b.addEventListener('click', () => {
        this.selectedBuilding = b.dataset.building;
        this.placementMode = true;
        this.notify(`Tap map to place ${this.getBuildingData(this.selectedBuilding)?.name || this.selectedBuilding}`, 'success');
      });
    });
  }

  updateHUD() {
    const info = this.getDayNightInfo();
    const percent = (this.gameTime % this.dayLength) / this.dayLength;
    let h = Math.floor(percent * 24); const clock = `${String(h).padStart(2, '0')}:00`;
    const qp = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    qp('wearPhase', info.phase);
    qp('wearClock', clock);
    qp('wearPop', ` ${this.population}`);
  }

  notify(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = message;
    document.getElementById('notifications').appendChild(n);
    setTimeout(() => n.remove(), 2500);
    try { navigator.vibrate?.(30); } catch {}
  }

  toggleSettings(show) { const m = document.getElementById('settingsModal'); if (m) m.classList.toggle('active', !!show); }

  // Core game systems (reuse patterns from game.js/mobile)
  getDayNightInfo() {
    const cycleProgress = (this.gameTime % this.dayLength) / this.dayLength;
    const sunAngle = cycleProgress * Math.PI * 2;
    const sunAltitude = Math.sin(sunAngle - Math.PI / 2);
    const daylight = Math.max(0, sunAltitude);
    const lightLevel = 0.25 + 0.75 * daylight;
    let phase = daylight === 0 ? 'night' : (daylight < 0.25 ? 'dawn' : (daylight > 0.75 ? 'dusk' : 'day'));
    return { phase, lightLevel, cycleProgress };
  }

  screenToWorld(x, y) { return { x: (x / this.camera.scale) + this.camera.x, y: (y / this.camera.scale) + this.camera.y }; }

  getChunkCoords(wx, wy) { return { x: Math.floor(wx / this.chunkSize), y: Math.floor(wy / this.chunkSize) }; }
  getChunkKey(cx, cy) { return `${cx},${cy}`; }

  loadNearbyChunks() {
    const center = this.getChunkCoords(this.camera.x + this.canvas.width / (2 * this.camera.scale), this.camera.y + this.canvas.height / (2 * this.camera.scale));
    for (let x = center.x - this.chunkLoadRadius; x <= center.x + this.chunkLoadRadius; x++) {
      for (let y = center.y - this.chunkLoadRadius; y <= center.y + this.chunkLoadRadius; y++) {
        const key = this.getChunkKey(x, y);
        if (!this.loadedChunks.has(key)) this.generateChunk(x, y);
      }
    }
    // unload
    const limit = this.chunkLoadRadius + 1;
    const del = [];
    for (const [key, c] of this.loadedChunks) {
      const d = Math.max(Math.abs(c.x - center.x), Math.abs(c.y - center.y));
      if (d > limit) del.push(key);
    }
    del.forEach(k => { this.loadedChunks.delete(k); this.fogOfWar.delete(k); });
  }

  generateChunk(chunkX, chunkY) {
    const worldX = chunkX * this.chunkSize, worldY = chunkY * this.chunkSize;
    const chunk = {
      x: chunkX, y: chunkY, worldX, worldY, tiles: [],
      textureCanvas: document.createElement('canvas'),
      detailCanvas: document.createElement('canvas')
    };
    chunk.textureCanvas.width = this.chunkSize; chunk.textureCanvas.height = this.chunkSize;
    chunk.detailCanvas.width = this.chunkSize; chunk.detailCanvas.height = this.chunkSize;
    chunk.textureCtx = chunk.textureCanvas.getContext('2d'); chunk.textureCtx.imageSmoothingEnabled = false;
    chunk.detailCtx = chunk.detailCanvas.getContext('2d'); chunk.detailCtx.imageSmoothingEnabled = false;
    this.generateChunkTerrain(chunk);
    this.renderChunkTextures(chunk);
    this.initializeChunkFogOfWar(chunkX, chunkY);
    this.loadedChunks.set(this.getChunkKey(chunkX, chunkY), chunk);
  }

  generateChunkTerrain(chunk) {
    const tpc = this.chunkSize / this.tileSize;
    for (let tx = 0; tx < tpc; tx++) for (let ty = 0; ty < tpc; ty++) {
      const wx = chunk.worldX + tx * this.tileSize, wy = chunk.worldY + ty * this.tileSize;
      const biome = this.getBiomeAt(wx, wy);
      const type = this.generateBiomeTerrain(wx, wy, biome);
      chunk.tiles.push({ localX: tx * this.tileSize, localY: ty * this.tileSize, worldX: wx, worldY: wy, type, moisture: biome.moisture, detailNoise: this.seededNoise(wx * 0.05, wy * 0.05) });
    }
  }

  getBiomeAt(x, y) {
    const scale = 0.003;
    const t = (this.seededNoise(x * scale + this.seed, y * scale + this.seed) + 1) * 0.5;
    const m = (this.seededNoise(x * scale + this.seed + 1000, y * scale + this.seed + 1000) + 1) * 0.5;
    const e = (this.seededNoise(x * scale * 0.5 + this.seed + 2000, y * scale * 0.5 + this.seed + 2000) + 1) * 0.5;
    let primary = 'temperate_plains';
    if (t < 0.3) primary = 'arctic_tundra';
    else if (t < 0.5 && m > 0.4) primary = 'boreal_forest';
    else if (e > 0.7) primary = 'highland_mountains';
    else if (m > 0.6 && t > 0.4 && t < 0.7) primary = 'coastal_fjords';
    return { primary, temperature: t, moisture: m, elevation: e };
  }

  generateBiomeTerrain(x, y, b) {
    const d = this.seededNoise(x * 0.02 + this.seed, y * 0.02 + this.seed);
    const micro = this.seededNoise(x * 0.05 + this.seed + 500, y * 0.05 + this.seed + 500);
    if (b.primary === 'arctic_tundra') return b.elevation < 0.2 ? (d < -0.3 ? 'arctic_ice' : 'snow') : (d > 0.2 ? 'tundra_grass' : 'snow');
    if (b.primary === 'boreal_forest') return b.moisture > 0.4 ? (d > 0.2 ? 'dense_conifer_forest' : 'conifer_forest') : (micro > 0 ? 'conifer_forest' : 'boreal_clearing');
    if (b.primary === 'coastal_fjords') return b.elevation < 0.1 ? 'deep_fjord_water' : (b.elevation < 0.25 ? (d < 0 ? 'shallow_water' : 'rocky_shore') : (micro > 0.2 ? 'coastal_forest' : 'beach'));
    if (b.primary === 'highland_mountains') return b.elevation > 0.9 ? (b.temperature < 0.3 ? 'snow_peak' : 'rocky_peak') : (b.elevation > 0.7 ? (d > 0.3 ? 'alpine_forest' : 'rocky_slope') : (micro > 0.2 ? 'mountain_forest' : 'alpine_meadow'));
    // temperate
    if (b.elevation < 0.15 && b.moisture > 0.7) return d < -0.2 ? 'river' : 'wetland';
    if (b.moisture > 0.5 && d > 0.1) return micro > 0.3 ? 'deciduous_forest' : 'mixed_forest';
    if (b.moisture < 0.3 && d < -0.2) return 'dry_grassland';
    if (micro > 0.4) return 'flowering_meadow';
    return 'grass';
  }

  seededNoise(x, y) {
    let v = 0, a = 1, f = 1;
    for (let i = 0; i < 3; i++) {
      const px = x * f, py = y * f;
      const n = Math.sin(px * 2.3 + py * 1.7 + this.seed) * Math.cos(px * 1.9 + py * 2.1 + this.seed) * Math.sin(px * 3.1 + py * 2.9 + this.seed * 2);
      v += n * a;
      a *= 0.5;
      f *= 2;
    }
    return Math.max(-1, Math.min(1, v * 0.5));
  }

  renderChunkTextures(chunk) {
    const ctx = chunk.textureCtx, dctx = chunk.detailCtx;
    chunk.tiles.forEach(t => this.drawEnhancedTerrainTile(ctx, t.type, t.localX, t.localY, this.tileSize, t.detailNoise, t.moisture));
    chunk.tiles.forEach(t => this.drawTerrainDetails(dctx, t.type, t.localX, t.localY, this.tileSize, t.detailNoise));
  }

  // simplified versions adapted from android.js/game.js
  drawEnhancedTerrainTile(ctx, type, x, y, size, detailNoise, moisture) {
    switch (type) {
      case 'grass': this.drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture); break;
      case 'snow': this.drawEnhancedSnowTile(ctx, x, y, size, detailNoise); break;
      case 'shallow_water': this.drawEnhancedWaterTile(ctx, x, y, size, '#1976d2', '#2196f3', '#64b5f6'); break;
      case 'deep_fjord_water': this.drawEnhancedWaterTile(ctx, x, y, size, '#0d47a1', '#1565c0', '#1976d2'); break;
      case 'beach': this.drawEnhancedBeachTile(ctx, x, y, size, moisture); break;
      case 'conifer_forest': case 'dense_conifer_forest': this.drawConiferForestTile(ctx, x, y, size, detailNoise); break;
      case 'deciduous_forest': this.drawDeciduousForestTile(ctx, x, y, size, detailNoise); break;
      case 'mixed_forest': this.drawMixedForestTile(ctx, x, y, size, detailNoise); break;
      case 'rocky_slope': case 'rocky_peak': case 'sea_cliff': case 'rocky_terrain': this.drawRockySlopeTile(ctx, x, y, size, detailNoise); break;
      case 'alpine_meadow': this.drawAlpineMeadowTile(ctx, x, y, size, detailNoise); break;
      case 'river': this.drawRiverTile(ctx, x, y, size); break;
      default: this.drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture); break;
    }
  }

  drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture) {
    const base = moisture > 0 ? '#4caf50' : '#7cb342';
    const light = moisture > 0 ? '#66bb6a' : '#8bc34a';
    const dark = moisture > 0 ? '#388e3c' : '#689f38';
    const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 0, x + size / 2, y + size / 2, size);
    g.addColorStop(0, light);
    g.addColorStop(0.7, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
  }

  drawEnhancedSnowTile(ctx, x, y, size) {
    const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 0, x + size / 2, y + size / 2, size);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#e6e6fa');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
  }

  drawEnhancedWaterTile(ctx, x, y, size, deep, mid, light) {
    const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 0, x + size / 2, y + size / 2, size);
    g.addColorStop(0, light);
    g.addColorStop(0.5, mid);
    g.addColorStop(1, deep);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
  }

  drawEnhancedBeachTile(ctx, x, y, size) {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#f5e6a3');
    g.addColorStop(1, '#e6d28a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
  }

  drawConiferForestTile(ctx, x, y, size) {
    ctx.fillStyle = '#1b5e20';
    ctx.fillRect(x, y, size, size);
  }

  drawDeciduousForestTile(ctx, x, y, size) {
    ctx.fillStyle = '#228b22';
    ctx.fillRect(x, y, size, size);
  }

  drawMixedForestTile(ctx, x, y, size) {
    ctx.fillStyle = '#2e8b57';
    ctx.fillRect(x, y, size, size);
  }

  drawRockySlopeTile(ctx, x, y, size) {
    ctx.fillStyle = '#a9a9a9';
    ctx.fillRect(x, y, size, size);
  }

  drawAlpineMeadowTile(ctx, x, y, size) {
    ctx.fillStyle = '#adff2f';
    ctx.fillRect(x, y, size, size);
  }

  drawRiverTile(ctx, x, y, size) {
    ctx.fillStyle = '#32cd32';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#4169e1';
    ctx.lineWidth = Math.max(2, size / 6);
    ctx.beginPath();
    ctx.moveTo(x, y + size / 3);
    ctx.quadraticCurveTo(x + size / 2, y + 2 * size / 3, x + size, y + size / 2);
    ctx.stroke();
  }

  drawTerrainDetails(ctx, type, x, y, size, detailNoise) {
    /* minimal to keep perf on watch */
  }

  initializeChunkFogOfWar(cx, cy) {
    const key = this.getChunkKey(cx, cy);
    const c = document.createElement('canvas');
    c.width = this.chunkSize;
    c.height = this.chunkSize;
    const f = c.getContext('2d');
    f.fillStyle = 'rgba(0,0,0,0.85)';
    f.fillRect(0, 0, this.chunkSize, this.chunkSize);
    this.fogOfWar.set(key, { canvas: c, ctx: f });
  }

  spawnInitialScout() {
    const s = { x: this.camera.x + this.canvas.width / (2 * this.camera.scale), y: this.camera.y + this.canvas.height / (2 * this.camera.scale), speed: 22, target: null, exploring: false, health: 100, range: 50 };
    this.scouts.push(s);
    this.revealArea(s.x, s.y, 70);
  }

  revealArea(x, y, r) {
    const cc = this.getChunkCoords(x, y), key = this.getChunkKey(cc.x, cc.y), fog = this.fogOfWar.get(key), chunk = this.loadedChunks.get(key);
    if (!fog || !chunk) return;
    const lx = x - chunk.worldX, ly = y - chunk.worldY;
    fog.ctx.save();
    fog.ctx.globalCompositeOperation = 'destination-out';
    const g = fog.ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    fog.ctx.fillStyle = g;
    fog.ctx.beginPath();
    fog.ctx.arc(lx, ly, r, 0, Math.PI * 2);
    fog.ctx.fill();
    fog.ctx.restore();
  }

  sendScoutToExplore(x, y) {
    if (this.scouts.length === 0) {
      this.spawnInitialScout();
      this.notify('New scout created', 'warning');
    }
    const s = this.scouts[0];
    const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
    if (d < 10) {
      this.notify('Target too close', 'warning');
      return;
    }
    if (d > 1800) {
      this.notify('Target too far', 'warning');
      return;
    }
    s.target = { x, y };
    s.exploring = true;
    this.notify('Scout dispatched!', 'success');
    try { navigator.vibrate?.(40); } catch {}
    setTimeout(() => this.saveGame(), 800);
  }

  tryPlaceBuilding(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    const bd = this.getBuildingData(this.selectedBuilding);
    if (!bd) return;
    if (!this.canAfford(bd.cost)) {
      this.notify('Not enough resources', 'error');
      return;
    }
    if (!this.isValidPlacement(w.x, w.y)) {
      this.notify('Invalid location', 'warning');
      return;
    }
    this.addBuilding(this.selectedBuilding, w.x, w.y);
    this.spendResources(bd.cost);
    this.placementMode = false;
    this.selectedBuilding = null;
    this.notify(`${bd.name} built!`, 'success');
  }

  getBuildingData(type) {
    const m = {
      longhouse: { name: 'Longhouse', sprite: 'longhouse_sprite.png', cost: { wood: 20, food: 10 }, produces: { population: 3 }, size: 28 },
      farm: { name: 'Farm', sprite: 'farm_sprite.png', cost: { wood: 15 }, produces: { food: 2 }, size: 24 },
      lumbermill: { name: 'Lumber Mill', sprite: 'lumbermill_sprite.png', cost: { wood: 25, iron: 5 }, produces: { wood: 3 }, size: 26 },
      blacksmith: { name: 'Blacksmith', sprite: 'blacksmith_sprite.png', cost: { wood: 30, iron: 10 }, produces: { iron: 2 }, size: 24 },
      tradingpost: { name: 'Trading Post', sprite: 'tradingpost_sprite.png', cost: { wood: 40, gold: 5 }, produces: { gold: 1 }, size: 26 },
      temple: { name: 'Temple', sprite: 'temple_sprite.png', cost: { wood: 50, iron: 20, gold: 15 }, produces: { happiness: 10 }, size: 30 }
    };
    return m[type];
  }

  canAfford(cost) {
    for (const [r, a] of Object.entries(cost)) if ((this.resources[r] || 0) < a) return false;
    return true;
  }

  spendResources(cost) {
    for (const [r, a] of Object.entries(cost)) this.resources[r] -= a;
  }

  isValidPlacement(x, y) {
    const tile = this.getTileAt(x, y);
    if (tile === 'deep_fjord_water' || tile === 'shallow_water') return false;
    for (const b of this.buildings) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < b.size) return false;
    }
    return true;
  }

  addBuilding(type, x, y) {
    const d = this.getBuildingData(type);
    if (!d) return;
    const b = { type, x, y, ...d, level: 1, lastUpdate: Date.now(), productionPerSec: {} };
    if (d.produces) for (const [res, amt] of Object.entries(d.produces)) b.productionPerSec[res] = amt / 3;
    this.buildings.push(b);
    // small popup
    this.addProductionPopup(b, '+built', '#fff');
  }

  getTileAt(x, y) {
    const cc = this.getChunkCoords(x, y), key = this.getChunkKey(cc.x, cc.y), chunk = this.loadedChunks.get(key);
    if (!chunk) return 'grass';
    const lx = x - chunk.worldX, ly = y - chunk.worldY;
    const tx = Math.floor(lx / this.tileSize) * this.tileSize, ty = Math.floor(ly / this.tileSize) * this.tileSize;
    const t = chunk.tiles.find(t => t.localX === tx && t.localY === ty);
    return t ? t.type : 'grass';
  }

  update(dt) {
    this.gameTime += (dt / 1000) * this.timeSpeed;
    this.loadNearbyChunks();
    const now = Date.now();
    this.buildings.forEach(b => {
      if (now - b.lastUpdate > 3000) {
        if (b.produces) {
          for (const [res, amt] of Object.entries(b.produces)) {
            if (res === 'population') {
              this.population += amt;
              this.addProductionPopup(b, `+${amt} pop`, '#d4af37');
            } else if (this.resources[res] !== undefined) {
              this.resources[res] += amt;
              const c = res === 'food' ? '#66bb6a' : res === 'wood' ? '#a1887f' : res === 'iron' ? '#b0bec5' : res === 'gold' ? '#ffd54f' : '#ffffff';
              this.addProductionPopup(b, `+${amt} ${res}`, c);
            }
          }
        }
        b.lastUpdate = now;
      }
    });
    this.updateScouts(dt);
    this.updateRevealAnimations();
    this.updateHUD();
  }

  updateScouts(dt) {
    this.scouts.forEach(s => {
      if (s.target) {
        const dx = s.target.x - s.x, dy = s.target.y - s.y, d = Math.hypot(dx, dy);
        if (d > 5) {
          const mx = (dx / d) * s.speed * (dt / 1000), my = (dy / d) * s.speed * (dt / 1000);
          s.x += mx;
          s.y += my;
          this.revealArea(s.x, s.y, s.range);
        } else {
          s.target = null;
          s.exploring = false;
        }
      }
    });
  }

  updateRevealAnimations() {
    /* minimal; reveal handled inline */
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.scale(this.camera.scale, this.camera.scale);
    this.ctx.translate(-this.camera.x, -this.camera.y);
    this.renderTerrain();
    this.renderBuildings();
    this.renderScouts();
    this.renderFogOfWar();
    this.renderProductionPopups();
    this.ctx.restore();
  }

  renderTerrain() {
    const v = { l: this.camera.x, r: this.camera.x + this.canvas.width / this.camera.scale, t: this.camera.y, b: this.camera.y + this.canvas.height / this.camera.scale };
    for (const [key, chunk] of this.loadedChunks) {
      if (chunk.worldX + this.chunkSize < v.l || chunk.worldX > v.r || chunk.worldY + this.chunkSize < v.t || chunk.worldY > v.b) continue;
      this.ctx.drawImage(chunk.textureCanvas, chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
      this.ctx.drawImage(chunk.detailCanvas, chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
    }
  }

  renderBuildings() {
    this.buildings.forEach(b => {
      this.ctx.fillStyle = 'rgba(0,0,0,0.25)';
      this.ctx.fillRect(b.x + 2, b.y + 2, b.size, b.size);
      if (b.sprite) {
        if (!this.spriteCache[b.sprite]) this.loadSprite(b.sprite);
        const img = this.spriteCache[b.sprite]?.img;
        if (img && this.spriteCache[b.sprite]?.loaded) {
          this.ctx.drawImage(img, b.x, b.y, b.size, b.size);
        } else {
          this.ctx.fillStyle = '#8b4513';
          this.ctx.fillRect(b.x, b.y, b.size, b.size);
        }
      }
      // per-sec labels
      if (b.productionPerSec && Object.keys(b.productionPerSec).length) {
        this.ctx.save();
        this.ctx.font = '10px Space Mono';
        this.ctx.textAlign = 'center';
        let off = 6;
        for (const [res, rate] of Object.entries(b.productionPerSec)) {
          const line = `+${rate.toFixed(1)} ${res}/s`;
          this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
          this.ctx.fillText(line, b.x + b.size / 2 + 1, b.y - off + 1);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillText(line, b.x + b.size / 2, b.y - off);
          off += 12;
        }
        this.ctx.restore();
      }
    });
  }

  renderScouts() {
    this.scouts.forEach(s => {
      this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
      this.ctx.beginPath();
      this.ctx.arc(s.x + 1, s.y + 1, 6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = s.exploring ? '#ff5722' : '#2196f3';
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  renderFogOfWar() {
    const v = { l: this.camera.x, r: this.camera.x + this.canvas.width / this.camera.scale, t: this.camera.y, b: this.camera.y + this.canvas.height / this.camera.scale };
    for (const [key, chunk] of this.loadedChunks) {
      if (chunk.worldX + this.chunkSize < v.l || chunk.worldX > v.r || chunk.worldY + this.chunkSize < v.t || chunk.worldY > v.b) continue;
      const fog = this.fogOfWar.get(key);
      if (fog) this.ctx.drawImage(fog.canvas, chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
    }
  }

  renderProductionPopups() {
    const now = Date.now();
    this.productionPopups = this.productionPopups.filter(p => {
      const t = (now - p.start) / p.duration;
      if (t >= 1) return false;
      const a = 1 - t, y = p.y - t * 18;
      this.ctx.save();
      this.ctx.font = '10px Space Mono';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.globalAlpha = a * 0.8;
      this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this.ctx.fillText(p.text, p.x + 1, y + 1);
      this.ctx.globalAlpha = a;
      this.ctx.fillStyle = p.color;
      this.ctx.fillText(p.text, p.x, y);
      this.ctx.restore();
      return true;
    });
  }

  addProductionPopup(b, text, color = '#fff') {
    this.productionPopups.push({ x: b.x + b.size / 2, y: b.y - 6, text, color, start: Date.now(), duration: 900 });
  }

  preloadSprites() {
    ['longhouse', 'farm', 'lumbermill', 'blacksmith', 'tradingpost', 'temple'].forEach(t => {
      const d = this.getBuildingData(t);
      if (d?.sprite) this.loadSprite(d.sprite);
    });
  }

  loadSprite(src) {
    if (this.spriteCache[src]) return;
    const resolved = new URL(src, window.location.href).href;
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    this.spriteCache[src] = { img, loaded: false, retries: 0 };
    img.onload = () => { this.spriteCache[src].loaded = true; };
    img.onerror = () => {
      const e = this.spriteCache[src];
      if (e.retries < 2) {
        e.retries++;
        setTimeout(() => { img.src = resolved + (resolved.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 300 * e.retries);
      }
    };
    img.src = resolved;
  }

  saveGame() {
    try {
      const state = {
        version: 'wear-1.0.0',
        resources: this.resources,
        population: this.population,
        buildings: this.buildings.map(b => ({ type: b.type, x: b.x, y: b.y, level: b.level || 1, lastUpdate: b.lastUpdate || Date.now() })),
        camera: { x: this.camera.x, y: this.camera.y, scale: Math.max(0.3, Math.min(2.2, this.camera.scale)) },
        scouts: this.scouts.map(s => ({ x: s.x, y: s.y, speed: s.speed, health: s.health || 100, range: s.range || 50, exploring: false, target: null })),
        seed: this.seed,
        exploredAreas: Array.from(this.exploredAreas),
        gameTime: this.gameTime,
        settlementStatus: this.settlementStatus,
        saveTime: Date.now()
      };
      localStorage.setItem(this.saveKey, JSON.stringify(state));
      localStorage.setItem(this.backupKey, JSON.stringify(state));
      this.notify('Saved!', 'success');
      return true;
    } catch (e) {
      console.error(e);
      this.notify('Save failed', 'error');
      return false;
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.resources = s.resources || this.resources;
      this.population = s.population || this.population;
      this.buildings = [];
      (s.buildings || []).forEach(sb => {
        const d = this.getBuildingData(sb.type);
        if (d) {
          this.buildings.push({
            type: sb.type,
            x: sb.x,
            y: sb.y,
            level: sb.level || 1,
            lastUpdate: sb.lastUpdate || Date.now(),
            ...d,
            productionPerSec: Object.fromEntries(Object.entries(d.produces || {}).map(([r, a]) => [r, a / 3]))
          });
        }
      });
      if (s.camera) this.camera = { x: s.camera.x || 0, y: s.camera.y || 0, scale: Math.max(0.3, Math.min(2.2, s.camera.scale || 1)) };
      if (typeof s.seed === 'number') this.seed = s.seed;
      if (typeof s.gameTime === 'number') this.gameTime = s.gameTime;
      if (Array.isArray(s.exploredAreas)) this.exploredAreas = new Set(s.exploredAreas);
      if (s.settlementStatus) {
        const cur = this.settlementStatus || { happiness:0, defense:0, prosperity:0 };
        this.settlementStatus = {
          happiness: Math.max(cur.happiness||0, s.settlementStatus.happiness||0),
          defense: Math.max(cur.defense||0, s.settlementStatus.defense||0),
          prosperity: Math.max(cur.prosperity||0, s.settlementStatus.prosperity||0)
        };
        this.savePersistentStats();
      }
      this.loadedChunks.clear(); this.fogOfWar.clear(); this.loadNearbyChunks();
      this.updateHUD(); this.notify('Loaded!', 'success'); return true;
    } catch(e) { console.error(e); this.notify('Load failed','error'); return false; }
  }

  loadPersistentStats() {
    try { const s = localStorage.getItem(this.settlementStatusKey); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  savePersistentStats() {
    try { localStorage.setItem(this.settlementStatusKey, JSON.stringify(this.settlementStatus)); } catch {}
  }

  exportSaveTxt() {
    try {
      if (!localStorage.getItem(this.saveKey)) this.saveGame();
      const raw = localStorage.getItem(this.saveKey) || '{}';
      const b64 = this.encodeB64(raw);
      const blob = new Blob([b64], { type: 'text/plain' });
      const a = document.createElement('a'); a.download = `VikingTycoon_WearSave_${Date.now()}.txt`;
      a.href = URL.createObjectURL(blob); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 0);
      this.notify('Exported save', 'success');
    } catch { this.notify('Export failed','error'); }
  }
  importSaveTxt() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.txt,text/plain';
    input.onchange = async () => {
      try {
        const file = input.files?.[0]; if (!file) return;
        const text = await file.text(); const jsonStr = this.decodeB64(text.trim());
        const data = JSON.parse(jsonStr); if (!data || typeof data !== 'object') throw new Error('invalid');
        localStorage.setItem(this.saveKey, jsonStr); localStorage.setItem(this.backupKey, jsonStr);
        this.notify('Import successful - loading...', 'success'); this.loadGame();
      } catch { this.notify('Import failed','error'); }
    }; input.click();
  }

  encodeB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  decodeB64(b64) { return decodeURIComponent(escape(atob(b64))); }

  gameLoop() {
    const now = performance.now(); if (!this.lastUpdate) this.lastUpdate = now;
    const step = 1000/30; this._acc = (this._acc||0) + Math.min(1000, now - this.lastUpdate);
    let n=0; while (this._acc >= step && n < 5) { this.update(step); this._acc -= step; n++; }
    this.render(); this.lastUpdate = now; if (!this.externalLoop) requestAnimationFrame(() => this.gameLoop());
  }
}