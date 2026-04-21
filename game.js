class VikingSettlementTycoon {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Game state
        this.camera = { x: 0, y: 0, scale: 1 };
        this.resources = {
            food: 100,
            wood: 50,
            iron: 25,
            gold: 10
        };
        this.population = 5;
        this.buildings = [];
        this.selectedBuilding = null;
        this.placementMode = false;
        
        // Day/Night cycle
        this.gameTime = 0; // Game time in seconds
        this.dayLength = 3600; // 60 minutes per full day/night cycle (30 min day + 30 min night)
        this.timeSpeed = 1; // Time speed multiplier
        
        // Infinite terrain system
        this.chunkSize = 512; // Size of each chunk in pixels
        this.tileSize = 32;
        this.loadedChunks = new Map(); // Map of chunk coordinates to chunk data
        this.chunkLoadRadius = 3; // How many chunks to load around camera
        this.seed = Math.random() * 10000; // Seed for consistent generation
        
        // Exploration system
        this.fogOfWar = new Map(); // Map of chunk coordinates to fog canvas
        this.scouts = [];
        this.exploredAreas = new Set();
        this.revealAnimations = [];
        
        // Mouse/Touch handling
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cameraStart = { x: 0, y: 0 };
        
        // Game loop
        this.lastUpdate = 0;
        this.gameRunning = true;
        
        // Lightning system
        this.lightningSystem = {
            enabled: true,
            strikes: [],
            nextStrike: 0,
            minInterval: 5000,  // Minimum 5 seconds between strikes
            maxInterval: 30000, // Maximum 30 seconds between strikes
            stormChance: 0.3,   // 30% chance during storms
            normalChance: 0.02  // 2% chance normally
        };
        
        // Sound system
        this.soundSystem = {
            enabled: true,
            masterVolume: 0.7,
            musicVolume: 0.4,
            sfxVolume: 0.8,
            currentAmbient: null,
            sounds: {},
            musicTracks: {},
            loadingPromises: []
        };
        /* cache for building sprites to avoid fallback when offline */
        this.spriteCache = {};
        this.productionPopups = []; // floating production numbers
        
        this.kingName = null;
        this.settlementStatusKey = 'vikingSettlementPersistentStats';
        this.settlementStatus = this.loadPersistentStats() || { happiness: 75, defense: 40, prosperity: 60 };
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadNearbyChunks();
        /* preload all building sprites once so they render even without network */
        this.preloadSprites();
        
        // Only spawn initial content if no saved game exists
        const hasSavedGame = localStorage.getItem('vikingSettlement');
        if (!hasSavedGame) {
            this.spawnInitialScout();
            // Remove automatic building placement for new players
            this.showNotification('Welcome, Jarl! Send scouts to explore the infinite lands and build your settlement!', 'success');
        } else {
            // Load the saved game
            this.loadGame();
        }
        
        this.initializeSoundSystem();
        this.setupEventListeners();
        this.setupUI();
        this.gameLoop();
        
        this.ensureKingName();
        document.getElementById('kingNameDisplay').textContent = `Jarl: ${this.kingName}`;
    }
    
    initializeSoundSystem() {
        // Initialize HTML5 audio context
        try {
            // Create audio context for better control
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Define all sound assets
            const soundAssets = {
                // UI Sounds
                'ui_click': 'ui_click.mp3',
                'notification_good': 'notification_good.mp3', 
                'notification_bad': 'notification_bad.mp3',
                
                // Game Sounds
                'build_hammer': 'build_hammer.mp3',
                'resource_collect': 'resource_collect.mp3',
                'scout_move': 'scout_move.mp3',
                'viking_horn': 'viking_horn.mp3',
                'thunder_distant': 'thunder_distant.mp3',
                
                // Ambient/Music
                'ambient_forest': 'ambient_forest.mp3',
                'ambient_ocean': 'ambient_ocean.mp3'
            };
            
            // Load all sound assets
            for (const [key, filename] of Object.entries(soundAssets)) {
                this.loadSound(key, filename);
            }
            
            // Setup ambient music rotation
            this.setupAmbientMusic();
            
        } catch (error) {
            console.warn('Audio context not supported, running without sound:', error);
            this.soundSystem.enabled = false;
        }
    }
    
    loadSound(key, filename) {
        try {
            const audio = new Audio(filename);
            audio.preload = 'auto';
            audio.volume = this.soundSystem.sfxVolume * this.soundSystem.masterVolume;
            
            // Create multiple instances for overlapping sounds
            this.soundSystem.sounds[key] = {
                audio: audio,
                instances: [audio],
                currentInstance: 0
            };
            
            // Create additional instances for frequently used sounds
            if (['ui_click', 'resource_collect', 'scout_move'].includes(key)) {
                for (let i = 1; i < 3; i++) {
                    const instance = new Audio(filename);
                    instance.preload = 'auto';
                    instance.volume = audio.volume;
                    this.soundSystem.sounds[key].instances.push(instance);
                }
            }
            
            // Setup looping for ambient tracks
            if (key.startsWith('ambient_')) {
                audio.loop = true;
                this.soundSystem.musicTracks[key] = audio;
            }
            
            console.log(`Loaded sound: ${key}`);
        } catch (error) {
            console.warn(`Failed to load sound ${key}:`, error);
        }
    }
    
    playSound(soundKey, volume = 1.0, pitch = 1.0) {
        if (!this.soundSystem.enabled) return;
        
        const soundData = this.soundSystem.sounds[soundKey];
        if (!soundData) {
            console.warn(`Sound not found: ${soundKey}`);
            return;
        }
        
        try {
            // Get next available instance
            const instance = soundData.instances[soundData.currentInstance];
            soundData.currentInstance = (soundData.currentInstance + 1) % soundData.instances.length;
            
            // Reset and configure
            instance.currentTime = 0;
            instance.volume = Math.max(0, Math.min(1, 
                volume * this.soundSystem.sfxVolume * this.soundSystem.masterVolume
            ));
            
            // Apply pitch if supported (experimental)
            if (instance.playbackRate !== undefined && pitch !== 1.0) {
                instance.playbackRate = Math.max(0.25, Math.min(4.0, pitch));
            }
            
            // Play the sound
            const playPromise = instance.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn(`Error playing sound ${soundKey}:`, error);
                });
            }
            
        } catch (error) {
            console.warn(`Error playing sound ${soundKey}:`, error);
        }
    }
    
    setupAmbientMusic() {
        // Start with forest ambient
        this.playAmbientMusic('ambient_forest');
        
        // Change ambient music based on biome and time
        setInterval(() => {
            this.updateAmbientMusic();
        }, 30000); // Check every 30 seconds
    }
    
    updateAmbientMusic() {
        if (!this.soundSystem.enabled) return;
        
        // Determine appropriate ambient based on visible terrain
        const centerX = this.camera.x + this.canvas.width / (2 * this.camera.scale);
        const centerY = this.camera.y + this.canvas.height / (2 * this.camera.scale);
        const biomeData = this.getBiomeAt(centerX, centerY);
        
        let targetAmbient = 'ambient_forest';
        
        // Choose ambient based on current biome
        if (biomeData.primary === 'coastal_fjords' || 
            biomeData.primary === 'arctic_tundra') {
            targetAmbient = 'ambient_ocean';
        } else {
            targetAmbient = 'ambient_forest';
        }
        
        // Fade to new ambient if different
        if (this.soundSystem.currentAmbient !== targetAmbient) {
            this.fadeToAmbient(targetAmbient);
        }
    }
    
    playAmbientMusic(trackKey) {
        if (!this.soundSystem.enabled) return;
        
        const track = this.soundSystem.musicTracks[trackKey];
        if (!track) return;
        
        try {
            track.volume = this.soundSystem.musicVolume * this.soundSystem.masterVolume;
            track.currentTime = 0;
            
            const playPromise = track.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.soundSystem.currentAmbient = trackKey;
                }).catch(error => {
                    console.warn(`Error playing ambient ${trackKey}:`, error);
                });
            }
        } catch (error) {
            console.warn(`Error starting ambient ${trackKey}:`, error);
        }
    }
    
    fadeToAmbient(newTrackKey) {
        if (!this.soundSystem.enabled || this.soundSystem.currentAmbient === newTrackKey) return;
        
        const currentTrack = this.soundSystem.musicTracks[this.soundSystem.currentAmbient];
        const newTrack = this.soundSystem.musicTracks[newTrackKey];
        
        if (!newTrack) return;
        
        // Fade out current track
        if (currentTrack && !currentTrack.paused) {
            this.fadeOutTrack(currentTrack, 2000);
        }
        
        // Fade in new track
        setTimeout(() => {
            this.playAmbientMusic(newTrackKey);
        }, 1000);
    }
    
    fadeOutTrack(track, duration) {
        const startVolume = track.volume;
        const fadeStep = startVolume / (duration / 50);
        
        const fadeInterval = setInterval(() => {
            if (track.volume > fadeStep) {
                track.volume -= fadeStep;
            } else {
                track.volume = 0;
                track.pause();
                clearInterval(fadeInterval);
            }
        }, 50);
    }
    
    setupCanvas() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight - 80; // Account for top UI
            this.ctx.imageSmoothingEnabled = false; // disable smoothing to avoid tile seams
        };
        
        resize();
        window.addEventListener('resize', resize);
    }
    
    getChunkCoords(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.chunkSize),
            y: Math.floor(worldY / this.chunkSize)
        };
    }
    
    getChunkKey(chunkX, chunkY) {
        return `${chunkX},${chunkY}`;
    }
    
    loadNearbyChunks() {
        const cameraChunk = this.getChunkCoords(this.camera.x + this.canvas.width / (2 * this.camera.scale), 
                                                this.camera.y + this.canvas.height / (2 * this.camera.scale));
        
        // Load chunks in a radius around camera
        for (let x = cameraChunk.x - this.chunkLoadRadius; x <= cameraChunk.x + this.chunkLoadRadius; x++) {
            for (let y = cameraChunk.y - this.chunkLoadRadius; y <= cameraChunk.y + this.chunkLoadRadius; y++) {
                const chunkKey = this.getChunkKey(x, y);
                if (!this.loadedChunks.has(chunkKey)) {
                    this.generateChunk(x, y);
                }
            }
        }
        
        // Unload distant chunks to save memory
        this.unloadDistantChunks(cameraChunk.x, cameraChunk.y);
    }
    
    generateChunk(chunkX, chunkY) {
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        const worldX = chunkX * this.chunkSize;
        const worldY = chunkY * this.chunkSize;
        
        // Create chunk data structure
        const chunk = {
            x: chunkX,
            y: chunkY,
            worldX: worldX,
            worldY: worldY,
            tiles: [],
            textureCanvas: document.createElement('canvas'),
            detailCanvas: document.createElement('canvas'),
            generated: false
        };
        
        // Setup canvases
        chunk.textureCanvas.width = this.chunkSize;
        chunk.textureCanvas.height = this.chunkSize;
        chunk.textureCtx = chunk.textureCanvas.getContext('2d');
        chunk.textureCtx.imageSmoothingEnabled = false;
        
        chunk.detailCanvas.width = this.chunkSize;
        chunk.detailCanvas.height = this.chunkSize;
        chunk.detailCtx = chunk.detailCanvas.getContext('2d');
        chunk.detailCtx.imageSmoothingEnabled = false;
        
        // Generate tiles for this chunk
        this.generateChunkTerrain(chunk);
        
        // Render chunk textures
        this.renderChunkTextures(chunk);
        
        // Initialize fog of war for this chunk
        this.initializeChunkFogOfWar(chunkX, chunkY);
        
        // Store chunk
        this.loadedChunks.set(chunkKey, chunk);
        chunk.generated = true;
    }
    
    generateChunkTerrain(chunk) {
        const tilesPerChunk = this.chunkSize / this.tileSize;
        
        for (let tileX = 0; tileX < tilesPerChunk; tileX++) {
            for (let tileY = 0; tileY < tilesPerChunk; tileY++) {
                const worldTileX = chunk.worldX + (tileX * this.tileSize);
                const worldTileY = chunk.worldY + (tileY * this.tileSize);
                
                // Generate biome-based terrain
                const biomeData = this.getBiomeAt(worldTileX, worldTileY);
                const tileType = this.generateBiomeTerrain(worldTileX, worldTileY, biomeData);
                
                chunk.tiles.push({
                    localX: tileX * this.tileSize,
                    localY: tileY * this.tileSize,
                    worldX: worldTileX,
                    worldY: worldTileY,
                    type: tileType,
                    biome: biomeData.primary,
                    biomeStrength: biomeData.strength,
                    elevation: biomeData.elevation,
                    temperature: biomeData.temperature,
                    moisture: biomeData.moisture
                });
            }
        }
    }
    
    getBiomeAt(x, y) {
        // Generate multiple noise layers for biome determination
        const scale = 0.003; // Larger biomes
        const temperatureNoise = this.seededNoise(x * scale + this.seed, y * scale + this.seed);
        const moistureNoise = this.seededNoise(x * scale + this.seed + 1000, y * scale + this.seed + 1000);
        const elevationNoise = this.seededNoise(x * scale * 0.5 + this.seed + 2000, y * scale * 0.5 + this.seed + 2000);
        
        // Normalize to 0-1 range
        const temperature = (temperatureNoise + 1) * 0.5;
        const moisture = (moistureNoise + 1) * 0.5;
        const elevation = (elevationNoise + 1) * 0.5;
        
        // Determine primary biome based on temperature, moisture, and elevation
        let primaryBiome = 'temperate_plains';
        let biomeStrength = 1.0;
        
        // Arctic conditions (cold)
        if (temperature < 0.3) {
            primaryBiome = 'arctic_tundra';
        }
        // Cold forest conditions
        else if (temperature < 0.5 && moisture > 0.4) {
            primaryBiome = 'boreal_forest';
        }
        // Mountainous regions
        else if (elevation > 0.7) {
            primaryBiome = 'highland_mountains';
        }
        // Coastal areas (high moisture, moderate temperature)
        else if (moisture > 0.6 && temperature > 0.4 && temperature < 0.7) {
            primaryBiome = 'coastal_fjords';
        }
        // Default temperate plains
        else {
            primaryBiome = 'temperate_plains';
        }
        
        // Calculate transition zones between biomes
        const transitionNoise = this.seededNoise(x * 0.01 + this.seed + 3000, y * 0.01 + this.seed + 3000);
        biomeStrength = Math.max(0.3, Math.min(1.0, biomeStrength + transitionNoise * 0.3));
        
        return {
            primary: primaryBiome,
            strength: biomeStrength,
            temperature,
            moisture,
            elevation,
            transitionNoise
        };
    }
    
    generateBiomeTerrain(x, y, biomeData) {
        const detailNoise = this.seededNoise(x * 0.02 + this.seed, y * 0.02 + this.seed);
        const microNoise = this.seededNoise(x * 0.05 + this.seed + 500, y * 0.05 + this.seed + 500);
        
        // Base terrain generation based on biome
        switch (biomeData.primary) {
            case 'arctic_tundra':
                return this.generateArcticTerrain(biomeData, detailNoise, microNoise);
            
            case 'boreal_forest':
                return this.generateBorealTerrain(biomeData, detailNoise, microNoise);
            
            case 'coastal_fjords':
                return this.generateCoastalTerrain(biomeData, detailNoise, microNoise);
            
            case 'highland_mountains':
                return this.generateMountainTerrain(biomeData, detailNoise, microNoise);
            
            case 'temperate_plains':
            default:
                return this.generateTemperateTerrain(biomeData, detailNoise, microNoise);
        }
    }
    
    generateArcticTerrain(biomeData, detailNoise, microNoise) {
        // Arctic tundra: mostly snow, some ice, sparse vegetation
        if (biomeData.elevation < 0.2) {
            return detailNoise < -0.3 ? 'arctic_ice' : 'snow';
        } else if (biomeData.elevation < 0.4 && detailNoise > 0.2) {
            return 'tundra_grass';
        } else if (microNoise > 0.4 && biomeData.moisture > 0.3) {
            return 'sparse_forest';
        }
        return 'snow';
    }
    
    generateBorealTerrain(biomeData, detailNoise, microNoise) {
        // Boreal forest: dense coniferous forests, lakes, rocky areas
        if (biomeData.elevation < 0.15 && biomeData.moisture > 0.6) {
            return detailNoise < -0.2 ? 'boreal_lake' : 'wetland';
        } else if (biomeData.moisture > 0.4) {
            return detailNoise > 0.2 ? 'dense_conifer_forest' : 'conifer_forest';
        } else if (biomeData.elevation > 0.6) {
            return 'rocky_terrain';
        }
        return microNoise > 0 ? 'conifer_forest' : 'boreal_clearing';
    }
    
    generateCoastalTerrain(biomeData, detailNoise, microNoise) {
        // Coastal fjords: water bodies, beaches, coastal forests, cliffs
        if (biomeData.elevation < 0.1) {
            return 'deep_fjord_water';
        } else if (biomeData.elevation < 0.25) {
            return detailNoise < 0 ? 'shallow_water' : 'rocky_shore';
        } else if (biomeData.elevation < 0.4 && biomeData.moisture > 0.5) {
            return microNoise > 0.2 ? 'coastal_forest' : 'beach';
        } else if (biomeData.elevation > 0.7) {
            return 'sea_cliff';
        }
        return detailNoise > 0.1 ? 'coastal_grass' : 'beach';
    }
    
    generateMountainTerrain(biomeData, detailNoise, microNoise) {
        // Highland mountains: peaks, alpine meadows, rocky slopes
        if (biomeData.elevation > 0.9) {
            return biomeData.temperature < 0.3 ? 'snow_peak' : 'rocky_peak';
        } else if (biomeData.elevation > 0.7) {
            return detailNoise > 0.3 ? 'alpine_forest' : 'rocky_slope';
        } else if (biomeData.elevation > 0.5) {
            return microNoise > 0.2 ? 'mountain_forest' : 'alpine_meadow';
        } else if (biomeData.moisture > 0.6) {
            return 'mountain_stream';
        }
        return 'hills';
    }
    
    generateTemperateTerrain(biomeData, detailNoise, microNoise) {
        // Temperate plains: varied grasslands, deciduous forests, rivers
        if (biomeData.elevation < 0.15 && biomeData.moisture > 0.7) {
            return detailNoise < -0.2 ? 'river' : 'wetland';
        } else if (biomeData.moisture > 0.5 && detailNoise > 0.1) {
            return microNoise > 0.3 ? 'deciduous_forest' : 'mixed_forest';
        } else if (biomeData.moisture < 0.3 && detailNoise < -0.2) {
            return 'dry_grassland';
        } else if (microNoise > 0.4) {
            return 'flowering_meadow';
        }
        return 'grass';
    }
    
    seededNoise(x, y) {
        // Seeded multi-octave noise for consistent infinite generation
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        
        for (let i = 0; i < 4; i++) {
            const px = x * frequency;
            const py = y * frequency;
            
            // Simple seeded noise function
            const n = Math.sin(px * 2.3 + py * 1.7 + this.seed) * 
                     Math.cos(px * 1.9 + py * 2.1 + this.seed) * 
                     Math.sin(px * 3.1 + py * 2.9 + this.seed * 2);
            
            value += n * amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        
        return Math.max(-1, Math.min(1, value * 0.5));
    }
    
    renderChunkTextures(chunk) {
        const ctx = chunk.textureCtx;
        const detailCtx = chunk.detailCtx;
        
        // Render base terrain
        chunk.tiles.forEach(tile => {
            this.drawEnhancedTerrainTile(ctx, tile.type, tile.localX, tile.localY, this.tileSize, tile.noise, tile.detailNoise, tile.moisture);
        });
        
        // Add detail overlay
        chunk.tiles.forEach(tile => {
            this.drawTerrainDetails(detailCtx, tile.type, tile.localX, tile.localY, this.tileSize, tile.detailNoise);
        });
    }
    
    initializeChunkFogOfWar(chunkX, chunkY) {
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        
        const fogCanvas = document.createElement('canvas');
        fogCanvas.width = this.chunkSize;
        fogCanvas.height = this.chunkSize;
        const fogCtx = fogCanvas.getContext('2d');
        
        // Initially fill with fog
        fogCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        fogCtx.fillRect(0, 0, this.chunkSize, this.chunkSize);
        
        this.fogOfWar.set(chunkKey, { canvas: fogCanvas, ctx: fogCtx });
    }
    
    unloadDistantChunks(centerChunkX, centerChunkY) {
        const unloadDistance = this.chunkLoadRadius + 2; // Keep some extra chunks loaded
        const chunksToUnload = [];
        
        for (const [chunkKey, chunk] of this.loadedChunks) {
            const distance = Math.max(
                Math.abs(chunk.x - centerChunkX),
                Math.abs(chunk.y - centerChunkY)
            );
            
            if (distance > unloadDistance) {
                chunksToUnload.push(chunkKey);
            }
        }
        
        // Unload chunks
        chunksToUnload.forEach(chunkKey => {
            this.loadedChunks.delete(chunkKey);
            this.fogOfWar.delete(chunkKey);
        });
    }
    
    drawEnhancedTerrainTile(ctx, tileType, x, y, size, noise, detailNoise, moisture) {
        switch(tileType) {
            // Arctic biome tiles
            case 'arctic_ice':
                this.drawArcticIceTile(ctx, x, y, size);
                break;
            case 'tundra_grass':
                this.drawTundraGrassTile(ctx, x, y, size, detailNoise);
                break;
            case 'sparse_forest':
                this.drawSparseForestTile(ctx, x, y, size, detailNoise);
                break;
                
            // Boreal biome tiles
            case 'boreal_lake':
                this.drawBorealLakeTile(ctx, x, y, size);
                break;
            case 'wetland':
                this.drawWetlandTile(ctx, x, y, size, moisture);
                break;
            case 'dense_conifer_forest':
                this.drawDenseConiferTile(ctx, x, y, size, detailNoise);
                break;
            case 'conifer_forest':
                this.drawConiferForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'boreal_clearing':
                this.drawBorealClearingTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_terrain':
                this.drawRockyTerrainTile(ctx, x, y, size, detailNoise);
                break;
                
            // Coastal biome tiles
            case 'deep_fjord_water':
                this.drawDeepFjordTile(ctx, x, y, size);
                break;
            case 'rocky_shore':
                this.drawRockyShoreTile(ctx, x, y, size, detailNoise);
                break;
            case 'coastal_forest':
                this.drawCoastalForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'sea_cliff':
                this.drawSeaCliffTile(ctx, x, y, size, detailNoise);
                break;
            case 'coastal_grass':
                this.drawCoastalGrassTile(ctx, x, y, size, moisture);
                break;
                
            // Mountain biome tiles
            case 'snow_peak':
                this.drawSnowPeakTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_peak':
                this.drawRockyPeakTile(ctx, x, y, size, detailNoise);
                break;
            case 'alpine_forest':
                this.drawAlpineForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_slope':
                this.drawRockySlopeTile(ctx, x, y, size, detailNoise);
                break;
            case 'alpine_meadow':
                this.drawAlpineMeadowTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountain_forest':
                this.drawMountainForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountain_stream':
                this.drawMountainStreamTile(ctx, x, y, size);
                break;
                
            // Temperate biome tiles
            case 'river':
                this.drawRiverTile(ctx, x, y, size);
                break;
            case 'deciduous_forest':
                this.drawDeciduousForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'mixed_forest':
                this.drawMixedForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'dry_grassland':
                this.drawDryGrasslandTile(ctx, x, y, size, detailNoise);
                break;
            case 'flowering_meadow':
                this.drawFloweringMeadowTile(ctx, x, y, size, detailNoise);
                break;
                
            // Existing tiles (fallback)
            case 'deep_water':
                this.drawEnhancedWaterTile(ctx, x, y, size, '#0d47a1', '#1565c0', '#1976d2');
                break;
            case 'shallow_water':
                this.drawEnhancedWaterTile(ctx, x, y, size, '#1976d2', '#2196f3', '#42a5f5');
                break;
            case 'beach':
                this.drawEnhancedBeachTile(ctx, x, y, size, moisture);
                break;
            case 'grass':
                this.drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture);
                break;
            case 'forest':
                this.drawEnhancedForestTile(ctx, x, y, size, false, detailNoise);
                break;
            case 'dense_forest':
                this.drawEnhancedForestTile(ctx, x, y, size, true, detailNoise);
                break;
            case 'hills':
                this.drawEnhancedHillsTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountain':
                this.drawEnhancedMountainTile(ctx, x, y, size, detailNoise);
                break;
            case 'snow':
                this.drawEnhancedSnowTile(ctx, x, y, size, detailNoise);
                break;
        }
    }
    
    // Arctic biome tile renderers
    drawArcticIceTile(ctx, x, y, size) {
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size);
        gradient.addColorStop(0, '#e8f4fd');
        gradient.addColorStop(0.5, '#d1e7f8');
        gradient.addColorStop(1, '#b8daf2');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Ice crystals
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
            const crystalX = x + Math.random() * size;
            const crystalY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(crystalX, crystalY, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawTundraGrassTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#8fbc8f';
        ctx.fillRect(x, y, size, size);
        
        // Sparse grass tufts
        ctx.fillStyle = '#556b2f';
        for (let i = 0; i < 4; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 2, 3);
        }
        
        // Moss patches
        if (detailNoise > 0.2) {
            ctx.fillStyle = '#9acd32';
            ctx.beginPath();
            ctx.arc(x + size * 0.6, y + size * 0.4, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawSparseForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#8fbc8f';
        ctx.fillRect(x, y, size, size);
        
        // Few scattered trees
        for (let i = 0; i < 2; i++) {
            const treeX = x + (i * size/2) + Math.random() * size/3;
            const treeY = y + Math.random() * size;
            
            // Trunk
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX - 1, treeY, 2, 8);
            
            // Conifer canopy
            ctx.fillStyle = '#228b22';
            ctx.beginPath();
            ctx.moveTo(treeX, treeY - 12);
            ctx.lineTo(treeX - 6, treeY - 2);
            ctx.lineTo(treeX + 6, treeY - 2);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    // Boreal biome tile renderers
    drawBorealLakeTile(ctx, x, y, size) {
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size);
        gradient.addColorStop(0, '#4682b4');
        gradient.addColorStop(1, '#2f4f4f');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Lake ripples
        ctx.strokeStyle = '#87ceeb';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, (i + 1) * size/6, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    
    drawWetlandTile(ctx, x, y, size, moisture) {
        ctx.fillStyle = moisture > 0.7 ? '#2e8b57' : '#6b8e23';
        ctx.fillRect(x, y, size, size);
        
        // Wetland vegetation
        ctx.fillStyle = '#228b22';
        for (let i = 0; i < 8; i++) {
            const reedX = x + Math.random() * size;
            const reedY = y + Math.random() * size;
            ctx.fillRect(reedX, reedY, 1, 6);
        }
        
        // Water patches
        ctx.fillStyle = '#4682b4';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(x + size * 0.3, y + size * 0.7, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    
    drawDenseConiferTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#013220';
        ctx.fillRect(x, y, size, size);
        
        // Very dense conifer trees
        for (let i = 0; i < 10; i++) {
            const treeX = x + (i % 3) * size/3 + Math.random() * size/4;
            const treeY = y + Math.floor(i / 3) * size/4 + Math.random() * size/4;
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX - 1, treeY, 2, 6);
            
            ctx.fillStyle = '#228b22';
            ctx.beginPath();
            ctx.moveTo(treeX, treeY - 10);
            ctx.lineTo(treeX - 4, treeY - 2);
            ctx.lineTo(treeX + 4, treeY - 2);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    drawConiferForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2d5016';
        ctx.fillRect(x, y, size, size);
        
        // Moderate conifer density
        for (let i = 0; i < 6; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/3 + Math.random() * size/3;
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX - 1, treeY, 2, 8);
            
            if (i % 2 === 0) {
                // Conifer
                ctx.fillStyle = '#228b22';
                ctx.beginPath();
                ctx.moveTo(treeX, treeY - 12);
                ctx.lineTo(treeX - 5, treeY - 2);
                ctx.lineTo(treeX + 5, treeY - 2);
                ctx.closePath();
                ctx.fill();
            } else {
                // Deciduous
                ctx.fillStyle = '#32cd32';
                ctx.beginPath();
                ctx.arc(treeX, treeY - 6, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawBorealClearingTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#9acd32';
        ctx.fillRect(x, y, size, size);
        
        // Forest clearing with some grass
        ctx.fillStyle = '#6b8e23';
        for (let i = 0; i < 12; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 2);
        }
        
        // Occasional shrub
        if (detailNoise > 0.3) {
            ctx.fillStyle = '#228b22';
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.3, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawRockyTerrainTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#708090';
        ctx.fillRect(x, y, size, size);
        
        // Rocky outcrops
        ctx.fillStyle = '#2f4f4f';
        for (let i = 0; i < 5; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            const rockSize = 2 + Math.random() * 4;
            ctx.fillRect(rockX, rockY, rockSize, rockSize);
        }
        
        // Some lichen
        if (detailNoise > 0.2) {
            ctx.fillStyle = '#9acd32';
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(x + size * 0.4, y + size * 0.6, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
    
    // Coastal biome tile renderers
    drawDeepFjordTile(ctx, x, y, size) {
        const gradient = ctx.createLinearGradient(x, y, x, y + size);
        gradient.addColorStop(0, '#191970');
        gradient.addColorStop(0.5, '#4169e1');
        gradient.addColorStop(1, '#0000cd');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Deep water effects
        ctx.fillStyle = '#4169e1';
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 3; i++) {
            const waveY = y + i * size/3 + Math.sin(Date.now() * 0.001 + i) * 2;
            ctx.fillRect(x, waveY, size, 2);
        }
        ctx.globalAlpha = 1;
    }
    
    drawRockyShoreTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#696969';
        ctx.fillRect(x, y, size, size);
        
        // Rocky shore elements
        ctx.fillStyle = '#2f4f4f';
        for (let i = 0; i < 6; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            const rockSize = 3 + Math.random() * 5;
            ctx.beginPath();
            ctx.arc(rockX, rockY, rockSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Seaweed patches
        if (detailNoise > 0.1) {
            ctx.fillStyle = '#006400';
            ctx.fillRect(x + size * 0.2, y + size * 0.8, 3, 6);
            ctx.fillRect(x + size * 0.7, y + size * 0.6, 2, 5);
        }
    }
    
    drawCoastalForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(x, y, size, size);
        
        // Coastal trees (mix of conifer and deciduous)
        for (let i = 0; i < 5; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(treeX - 1, treeY, 2, 8);
            
            if (i % 2 === 0) {
                // Conifer
                ctx.fillStyle = '#228b22';
                ctx.beginPath();
                ctx.moveTo(treeX, treeY - 12);
                ctx.lineTo(treeX - 5, treeY - 2);
                ctx.lineTo(treeX + 5, treeY - 2);
                ctx.closePath();
                ctx.fill();
            } else {
                // Deciduous
                ctx.fillStyle = '#32cd32';
                ctx.beginPath();
                ctx.arc(treeX, treeY - 6, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawSeaCliffTile(ctx, x, y, size, detailNoise) {
        const gradient = ctx.createLinearGradient(x, y, x, y + size);
        gradient.addColorStop(0, '#d3d3d3');
        gradient.addColorStop(0.6, '#a9a9a9');
        gradient.addColorStop(1, '#696969');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Cliff face detail
        ctx.strokeStyle = '#2f4f4f';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y + i * size/4);
            ctx.lineTo(x + size, y + i * size/4 + Math.random() * 4 - 2);
            ctx.stroke();
        }
        
        // Seabirds
        if (detailNoise > 0.4) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '8px Arial';
            ctx.fillText('ᵛ', x + size * 0.7, y + size * 0.3);
            ctx.fillText('ᵛ', x + size * 0.5, y + size * 0.2);
        }
    }
    
    drawCoastalGrassTile(ctx, x, y, size, moisture) {
        const grassColor = moisture > 0.6 ? '#32cd32' : '#9acd32';
        ctx.fillStyle = grassColor;
        ctx.fillRect(x, y, size, size);
        
        // Salt-resistant coastal grass
        ctx.fillStyle = '#6b8e23';
        for (let i = 0; i < 15; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 3);
        }
        
        // Salt crystals
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 5; i++) {
            const saltX = x + Math.random() * size;
            const saltY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(saltX, saltY, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Mountain biome tile renderers
    drawSnowPeakTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#fffafa';
        ctx.fillRect(x, y, size, size);
        
        // Mountain peak shape
        ctx.fillStyle = '#f0f8ff';
        ctx.beginPath();
        ctx.moveTo(x + size/2, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x + size, y + size);
        ctx.closePath();
        ctx.fill();
        
        // Snow drifts
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 8; i++) {
            const driftX = x + Math.random() * size;
            const driftY = y + Math.random() * size;
            ctx.beginPath();
            ctx.ellipse(driftX, driftY, 6, 3, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawRockyPeakTile(ctx, x, y, size, detailNoise) {
        const gradient = ctx.createLinearGradient(x, y, x, y + size);
        gradient.addColorStop(0, '#dcdcdc');
        gradient.addColorStop(0.5, '#a9a9a9');
        gradient.addColorStop(1, '#696969');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Rocky peak formations
        ctx.fillStyle = '#757575';
        for (let i = 0; i < 4; i++) {
            const rockX = x + (i % 2) * size/2 + Math.random() * size/2;
            const rockY = y + Math.floor(i / 2) * size/2 + Math.random() * size/2;
            const rockSize = 3 + Math.random() * 6;
            
            // Main rock formation
            ctx.beginPath();
            ctx.moveTo(rockX, rockY);
            ctx.lineTo(rockX + rockSize * 0.6, rockY - rockSize);
            ctx.lineTo(rockX + rockSize, rockY - rockSize * 0.3);
            ctx.lineTo(rockX + rockSize * 1.2, rockY);
            ctx.closePath();
            ctx.fill();
            
            // Rock highlighting
            ctx.fillStyle = '#9e9e9e';
            ctx.beginPath();
            ctx.moveTo(rockX, rockY);
            ctx.lineTo(rockX + rockSize * 0.3, rockY - rockSize * 0.7);
            ctx.lineTo(rockX + rockSize * 0.6, rockY - rockSize);
            ctx.lineTo(rockX + rockSize * 0.4, rockY - rockSize * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#757575';
        }
        
        // Snow caps on high peaks
        if (detailNoise > 0.3) {
            ctx.fillStyle = '#fafafa';
            ctx.beginPath();
            ctx.arc(x + size * 0.3, y + size * 0.2, 4, 0, Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.15, 3, 0, Math.PI);
            ctx.fill();
        }
    }
    
    drawAlpineForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2f4f2f';
        ctx.fillRect(x, y, size, size);
        
        // Alpine trees (hardy conifers)
        for (let i = 0; i < 4; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX - 1, treeY, 2, 6);
            
            ctx.fillStyle = '#006400';
            ctx.beginPath();
            ctx.moveTo(treeX, treeY - 10);
            ctx.lineTo(treeX - 3, treeY - 2);
            ctx.lineTo(treeX + 3, treeY - 2);
            ctx.closePath();
            ctx.fill();
        }
        
        // Alpine flowers
        if (detailNoise > 0.3) {
            const colors = ['#ff69b4', '#9370db', '#00bfff'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.8, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawRockySlopeTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#a9a9a9';
        ctx.fillRect(x, y, size, size);
        
        // Sloped rocky terrain
        ctx.fillStyle = '#696969';
        for (let i = 0; i < 6; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            const rockSize = 2 + Math.random() * 4;
            ctx.beginPath();
            ctx.ellipse(rockX, rockY, rockSize, rockSize/2, Math.PI/4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Scree (loose rock)
        ctx.fillStyle = '#778899';
        for (let i = 0; i < 10; i++) {
            const screeX = x + Math.random() * size;
            const screeY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(screeX, screeY, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawAlpineMeadowTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#adff2f';
        ctx.fillRect(x, y, size, size);
        
        // Alpine grass
        ctx.fillStyle = '#7cfc00';
        for (let i = 0; i < 20; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 2);
        }
        
        // Mountain flowers
        const flowers = ['#ff1493', '#ffd700', '#ff69b4', '#dda0dd', '#00bfff'];
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = flowers[Math.floor(Math.random() * flowers.length)];
            const flowerX = x + Math.random() * size;
            const flowerY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(flowerX, flowerY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawMountainForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Mountain forest (mixed trees)
        for (let i = 0; i < 5; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(treeX - 1, treeY, 2, 8);
            
            if (Math.random() > 0.5) {
                // Conifer
                ctx.fillStyle = '#006400';
                ctx.beginPath();
                ctx.moveTo(treeX, treeY - 12);
                ctx.lineTo(treeX - 4, treeY - 2);
                ctx.lineTo(treeX + 4, treeY - 2);
                ctx.closePath();
                ctx.fill();
            } else {
                // Deciduous
                ctx.fillStyle = '#32cd32';
                ctx.beginPath();
                ctx.arc(treeX, treeY - 6, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawMountainStreamTile(ctx, x, y, size) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Mountain stream
        ctx.strokeStyle = '#87ceeb';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y + size/4);
        ctx.quadraticCurveTo(x + size/2, y + size/2, x + size, y + 3*size/4);
        ctx.stroke();
        
        // Stream bed
        ctx.strokeStyle = '#4682b4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + size/4);
        ctx.quadraticCurveTo(x + size/2, y + size/2, x + size, y + 3*size/4);
        ctx.stroke();
        
        // Stream rocks
        ctx.fillStyle = '#696969';
        for (let i = 0; i < 4; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(rockX, rockY, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Temperate biome tile renderers
    drawRiverTile(ctx, x, y, size) {
        ctx.fillStyle = '#32cd32';
        ctx.fillRect(x, y, size, size);
        
        // River water
        ctx.strokeStyle = '#4169e1';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x, y + size/3);
        ctx.quadraticCurveTo(x + size/2, y + 2*size/3, x + size, y + size/2);
        ctx.stroke();
        
        // River banks
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + size/3 - 3);
        ctx.quadraticCurveTo(x + size/2, y + 2*size/3 - 3, x + size, y + size/2 - 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + size/3 + 3);
        ctx.quadraticCurveTo(x + size/2, y + 2*size/3 + 3, x + size, y + size/2 + 3);
        ctx.stroke();
    }
    
    drawDeciduousForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Deciduous trees with seasonal variation
        for (let i = 0; i < 6; i++) {
            const treeX = x + (i % 3) * size/3 + Math.random() * size/4;
            const treeY = y + Math.floor(i / 3) * size/2 + Math.random() * size/3;
            
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(treeX - 1, treeY, 2, 10);
            
            const leafColors = ['#32cd32', '#90ee90', '#ffff00', '#ffa500'];
            ctx.fillStyle = leafColors[Math.floor(Math.random() * leafColors.length)];
            ctx.beginPath();
            ctx.arc(treeX, treeY - 8, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawMixedForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(x, y, size, size);
        
        // Mixed forest (both conifer and deciduous)
        for (let i = 0; i < 6; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/3 + Math.random() * size/3;
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX - 1, treeY, 2, 8);
            
            if (i % 2 === 0) {
                // Conifer
                ctx.fillStyle = '#228b22';
                ctx.beginPath();
                ctx.moveTo(treeX, treeY - 12);
                ctx.lineTo(treeX - 5, treeY - 2);
                ctx.lineTo(treeX + 5, treeY - 2);
                ctx.closePath();
                ctx.fill();
            } else {
                // Deciduous
                ctx.fillStyle = '#32cd32';
                ctx.beginPath();
                ctx.arc(treeX, treeY - 6, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawDryGrasslandTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#daa520';
        ctx.fillRect(x, y, size, size);
        
        // Dry grass
        ctx.fillStyle = '#b8860b';
        for (let i = 0; i < 25; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 3);
        }
        
        // Scattered wildflowers
        if (detailNoise > 0.4) {
            const colors = ['#ff69b4', '#dda0dd'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            ctx.arc(x + size * 0.6, y + size * 0.4, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawFloweringMeadowTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#90ee90';
        ctx.fillRect(x, y, size, size);
        
        // Meadow grass
        ctx.fillStyle = '#32cd32';
        for (let i = 0; i < 18; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 2);
        }
        
        // Abundant wildflowers
        const flowers = ['#ff1493', '#ffd700', '#ff69b4', '#dda0dd', '#00bfff'];
        for (let i = 0; i < 12; i++) {
            ctx.fillStyle = flowers[Math.floor(Math.random() * flowers.length)];
            const flowerX = x + Math.random() * size;
            const flowerY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(flowerX, flowerY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawEnhancedWaterTile(ctx, x, y, size, deep, mid, light) {
        // Create realistic water with depth variation
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size);
        gradient.addColorStop(0, light);
        gradient.addColorStop(0.5, mid);
        gradient.addColorStop(1, deep);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Water movement patterns
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = light;
        for (let i = 0; i < 4; i++) {
            const waveX = x + (Math.sin((x + y + Date.now() * 0.001) * 0.02 + i) * 3);
            const waveY = y + (Math.cos((x + y + Date.now() * 0.001) * 0.02 + i) * 3);
            ctx.fillRect(waveX, waveY, size * 0.6, 2);
        }
        ctx.restore();
    }
    
    drawEnhancedBeachTile(ctx, x, y, size, moisture) {
        // Varied sand colors based on moisture
        const sandColor = moisture > 0 ? '#d4c27a' : '#f5e6a3';
        const darkSand = moisture > 0 ? '#c4b26a' : '#e6d28a';
        
        const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
        gradient.addColorStop(0, sandColor);
        gradient.addColorStop(1, darkSand);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Sand texture with varied grain sizes
        ctx.fillStyle = darkSand;
        for (let i = 0; i < 25; i++) {
            const dotX = x + Math.random() * size;
            const dotY = y + Math.random() * size;
            const radius = 0.5 + Math.random() * 1.5;
            ctx.beginPath();
            ctx.arc(dotX, dotY, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Occasional shells or debris
        if (Math.random() < 0.1) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.3, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.3, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture) {
        // Grass color variation based on moisture and detail noise
        const baseGreen = moisture > 0 ? '#4caf50' : '#7cb342';
        const lightGreen = moisture > 0 ? '#66bb6a' : '#8bc34a';
        const darkGreen = moisture > 0 ? '#388e3c' : '#689f38';
        
        // Create varied grass base
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size);
        gradient.addColorStop(0, lightGreen);
        gradient.addColorStop(0.7, baseGreen);
        gradient.addColorStop(1, darkGreen);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Grass texture patches
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = detailNoise > 0 ? lightGreen : darkGreen;
        for (let i = 0; i < 8; i++) {
            const patchX = x + Math.random() * size;
            const patchY = y + Math.random() * size;
            const patchSize = 2 + Math.random() * 4;
            ctx.fillRect(patchX, patchY, patchSize, patchSize);
        }
        ctx.globalAlpha = 1;
        
        // Varied flowers
        if (moisture > 0.3 && Math.random() < 0.2) {
            const colors = ['#ffeb3b', '#e91e63', '#9c27b0', '#ffffff'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            const flowerX = x + size * 0.3 + Math.random() * size * 0.4;
            const flowerY = y + size * 0.3 + Math.random() * size * 0.4;
            ctx.beginPath();
            ctx.arc(flowerX, flowerY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawEnhancedForestTile(ctx, x, y, size, dense, detailNoise) {
        const baseColor = dense ? '#1b5e20' : '#2e7d32';
        const canopyColor = dense ? '#0d3f0f' : '#1b5e20';
        const lightColor = dense ? '#2e7d32' : '#4caf50';
        
        // Forest floor
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, canopyColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Multiple tree layers for depth
        const treeCount = dense ? 8 : 5;
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 3) * size/3 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 3) * size/3 + Math.random() * size/3;
            const treeSize = 4 + Math.random() * (dense ? 8 : 6);
            
            // Tree shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.arc(treeX + 1, treeY + 1, treeSize * 0.8, 0, Math.PI * 2);
            ctx.fill();
            
            // Tree trunk
            ctx.fillStyle = '#3e2723';
            ctx.fillRect(treeX - 1, treeY, 2, treeSize * 0.4);
            
            // Tree canopy with layers
            ctx.fillStyle = canopyColor;
            ctx.beginPath();
            ctx.arc(treeX, treeY - treeSize * 0.2, treeSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Canopy highlight
            ctx.fillStyle = lightColor;
            ctx.beginPath();
            ctx.arc(treeX - 2, treeY - treeSize * 0.4, treeSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawEnhancedHillsTile(ctx, x, y, size, detailNoise) {
        // Rolling hills with elevation variation
        const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
        gradient.addColorStop(0, '#8d6e63');
        gradient.addColorStop(0.5, '#a1887f');
        gradient.addColorStop(1, '#6d4c41');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Hill contours
        ctx.strokeStyle = '#795548';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, (i + 1) * size/6, 0, Math.PI * 2);
            ctx.globalAlpha = 0.3;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        
        // Sparse vegetation
        if (Math.random() < 0.4) {
            ctx.fillStyle = '#4caf50';
            for (let i = 0; i < 3; i++) {
                const vegX = x + Math.random() * size;
                const vegY = y + Math.random() * size;
                ctx.beginPath();
                ctx.arc(vegX, vegY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawEnhancedMountainTile(ctx, x, y, size, detailNoise) {
        // Rocky mountain base
        const gradient = ctx.createLinearGradient(x, y, x, y + size);
        gradient.addColorStop(0, '#616161');
        gradient.addColorStop(0.3, '#424242');
        gradient.addColorStop(0.7, '#303030');
        gradient.addColorStop(1, '#212121');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Mountain peaks and rocky outcrops
        ctx.fillStyle = '#757575';
        for (let i = 0; i < 4; i++) {
            const rockX = x + (i % 2) * size/2 + Math.random() * size/2;
            const rockY = y + Math.floor(i / 2) * size/2 + Math.random() * size/2;
            const rockSize = 3 + Math.random() * 6;
            
            // Main rock formation
            ctx.beginPath();
            ctx.moveTo(rockX, rockY);
            ctx.lineTo(rockX + rockSize * 0.6, rockY - rockSize);
            ctx.lineTo(rockX + rockSize, rockY - rockSize * 0.3);
            ctx.lineTo(rockX + rockSize * 1.2, rockY);
            ctx.closePath();
            ctx.fill();
            
            // Rock highlighting
            ctx.fillStyle = '#9e9e9e';
            ctx.beginPath();
            ctx.moveTo(rockX, rockY);
            ctx.lineTo(rockX + rockSize * 0.3, rockY - rockSize * 0.7);
            ctx.lineTo(rockX + rockSize * 0.6, rockY - rockSize);
            ctx.lineTo(rockX + rockSize * 0.4, rockY - rockSize * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#757575';
        }
        
        // Snow caps on high peaks
        if (detailNoise > 0.3) {
            ctx.fillStyle = '#fafafa';
            ctx.beginPath();
            ctx.arc(x + size * 0.3, y + size * 0.2, 4, 0, Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.15, 3, 0, Math.PI);
            ctx.fill();
        }
    }
    
    drawEnhancedSnowTile(ctx, x, y, size, detailNoise) {
        // Snow base
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, '#f8f8ff');
        gradient.addColorStop(1, '#e6e6fa');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Snow texture variations
        ctx.fillStyle = '#fffafa';
        for (let i = 0; i < 12; i++) {
            const snowX = x + Math.random() * size;
            const snowY = y + Math.random() * size;
            const snowSize = 1 + Math.random() * 3;
            ctx.beginPath();
            ctx.arc(snowX, snowY, snowSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Snow drifts
        if (detailNoise > 0.2) {
            ctx.fillStyle = '#f0f8ff';
            for (let i = 0; i < 3; i++) {
                const driftX = x + Math.random() * size;
                const driftY = y + Math.random() * size;
                ctx.beginPath();
                ctx.ellipse(driftX, driftY, 6, 3, Math.random() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Sparkles in the snow
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
            const sparkleX = x + Math.random() * size;
            const sparkleY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(sparkleX, sparkleY, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawTerrainDetails(ctx, tileType, x, y, size, detailNoise) {
        ctx.globalAlpha = 0.4;
        
        // Add ambient details based on terrain type
        switch(tileType) {
            case 'grass':
                if (Math.random() < 0.3) {
                    ctx.fillStyle = '#2e7d32';
                    ctx.fillRect(x + Math.random() * size, y + Math.random() * size, 2, 1);
                }
                break;
            case 'forest':
            case 'dense_forest':
                if (Math.random() < 0.2) {
                    ctx.fillStyle = '#3e2723';
                    ctx.fillRect(x + Math.random() * size, y + Math.random() * size, 1, 3);
                }
                break;
            case 'mountain':
                if (detailNoise > 0.2) {
                    ctx.fillStyle = '#424242';
                    ctx.fillRect(x + Math.random() * size, y + Math.random() * size, 3, 2);
                }
                break;
        }
        
        ctx.globalAlpha = 1;
    }
    
    initializeFogOfWar() {
        // This method is not needed with the infinite terrain system
    }
    
    spawnInitialScout() {
        // Spawn scout at camera center position (where the player's view is focused)
        const scout = {
            x: this.camera.x + this.canvas.width / (2 * this.camera.scale),
            y: this.camera.y + this.canvas.height / (2 * this.camera.scale),
            speed: 30,
            target: null,
            exploring: false,
            health: 100,
            range: 60
        };
        
        this.scouts.push(scout);
        this.revealArea(scout.x, scout.y, 80); // Larger initial reveal radius
    }
    
    revealArea(x, y, radius) {
        const chunkCoords = this.getChunkCoords(x, y);
        const chunkKey = this.getChunkKey(chunkCoords.x, chunkCoords.y);
        const fogData = this.fogOfWar.get(chunkKey);
        
        if (!fogData) return;
        
        // Create reveal animation
        this.revealAnimations.push({
            x, y, radius: 0, targetRadius: radius,
            startTime: Date.now(),
            duration: 1000,
            chunkX: chunkCoords.x,
            chunkY: chunkCoords.y
        });
        
        // Mark area as explored
        const startX = Math.floor((x - radius) / this.tileSize) * this.tileSize;
        const endX = Math.ceil((x + radius) / this.tileSize) * this.tileSize;
        const startY = Math.floor((y - radius) / this.tileSize) * this.tileSize;
        const endY = Math.ceil((y + radius) / this.tileSize) * this.tileSize;
        
        for (let tileX = startX; tileX <= endX; tileX += this.tileSize) {
            for (let tileY = startY; tileY <= endY; tileY += this.tileSize) {
                const key = `${tileX},${tileY}`;
                this.exploredAreas.add(key);
            }
        }
    }
    
    updateRevealAnimations() {
        const now = Date.now();
        
        this.revealAnimations = this.revealAnimations.filter(anim => {
            const elapsed = now - anim.startTime;
            const progress = Math.min(elapsed / anim.duration, 1);
            
            anim.radius = anim.targetRadius * this.easeOutQuad(progress);
            
            // Get fog data for the animation's chunk
            const chunkKey = this.getChunkKey(anim.chunkX, anim.chunkY);
            const fogData = this.fogOfWar.get(chunkKey);
            const chunk = this.loadedChunks.get(chunkKey);
            
            if (fogData && chunk && isFinite(anim.radius) && anim.radius > 0) {
                const ctx = fogData.ctx;
                const localX = anim.x - chunk.worldX;
                const localY = anim.y - chunk.worldY;
                
                // Ensure all values are finite before creating gradient
                if (isFinite(localX) && isFinite(localY) && isFinite(anim.radius)) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-out';
                    
                    const gradient = ctx.createRadialGradient(localX, localY, 0, localX, localY, anim.radius);
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(localX, localY, anim.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
            
            return progress < 1;
        });
    }
    
    updateScouts(deltaTime) {
        this.scouts.forEach(scout => {
            if (scout.target) {
                // Move scout towards target
                const dx = scout.target.x - scout.x;
                const dy = scout.target.y - scout.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 5) {
                    // Normalize direction and move
                    const moveX = (dx / distance) * scout.speed * (deltaTime / 1000);
                    const moveY = (dy / distance) * scout.speed * (deltaTime / 1000);
                    
                    scout.x += moveX;
                    scout.y += moveY;
                    
                    // Reveal area as scout moves
                    this.revealArea(scout.x, scout.y, scout.range);
                } else {
                    // Scout reached target
                    scout.target = null;
                    scout.exploring = false;
                }
            }
        });
    }
    
    easeOutQuad(t) {
        return 1 - (1 - t) * (1 - t);
    }
    
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu
        
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Keyboard events (desktop and macOS)
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // macOS-specific: support Command key shortcuts
        if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
            this.isMacOS = true;
            document.addEventListener('keydown', (e) => {
                if (e.metaKey) { // Command key on macOS
                    if (e.key.toLowerCase() === 's') {
                        e.preventDefault();
                        this.saveGame();
                    }
                }
            });
        }
        
        // Building selection
        document.querySelectorAll('.building-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const buildingType = card.dataset.building;
                this.selectBuilding(buildingType);
            });
        });
        
        // Action buttons
        document.getElementById('generateMapBtn').addEventListener('click', () => {
            this.resetGameProgress();
            this.showNotification('New territory discovered! Starting fresh settlement...', 'success');
        });
        
        document.getElementById('saveGameBtn').addEventListener('click', () => {
            this.saveGame();
        });
        
        const photoBtn = document.getElementById('photoBtn');
        if (photoBtn) photoBtn.addEventListener('click', () => this.takePhoto());
        
        // Export/Import now in Settings modal
        const exportBtn = document.getElementById('settingsExportBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportSaveTxt());
        const importBtn = document.getElementById('settingsImportBtn');
        if (importBtn) importBtn.addEventListener('click', () => this.importSaveTxt());
        
        const openSettings = document.getElementById('openSettingsBtn');
        const closeSettings = document.getElementById('closeSettingsBtn');
        if (openSettings) openSettings.addEventListener('click', () => this.toggleSettings(true));
        if (closeSettings) closeSettings.addEventListener('click', () => this.toggleSettings(false));
        
        const modal = document.getElementById('settingsModal');
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) this.toggleSettings(false); });
    }
    
    setupUI() {
        this.updateResourceDisplay();
        this.updatePopulationDisplay();
        this.updateStatsDisplay();
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.placementMode && this.selectedBuilding) {
            this.tryPlaceBuilding(x, y);
        } else if (e.button === 2) { // Right click to send scout
            const worldPos = this.screenToWorld(x, y);
            this.sendScoutToExplore(worldPos.x, worldPos.y);
        } else {
            this.isDragging = true;
            this.dragStart = { x, y };
            this.cameraStart = { x: this.camera.x, y: this.camera.y };
        }
    }
    
    sendScoutToExplore(x, y) {
        if (this.scouts.length === 0) {
            this.playSound('notification_bad');
            this.showNotification('No scouts available!', 'warning');
            return;
        }

        // choose a valid idle scout if possible
        const isValidScout = s => s && isFinite(s.x) && isFinite(s.y) && isFinite(s.speed) && s.speed > 0;
        let scout = this.scouts.find(s => isValidScout(s) && (!s.exploring || !s.target)) || this.scouts.find(isValidScout) || this.scouts[0];

        scout.target = { x, y };
        scout.exploring = true;

        this.playSound('scout_move');
        this.playSound('notification_good');
        this.showNotification('Scout dispatched to explore!', 'success');
    }
    
    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const dx = x - this.dragStart.x;
        const dy = y - this.dragStart.y;
        
        this.camera.x = this.cameraStart.x - dx;
        this.camera.y = this.cameraStart.y - dy;
    }
    
    handleMouseUp(e) {
        this.isDragging = false;
    }
    
    handleWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.camera.scale = Math.max(0.3, Math.min(2, this.camera.scale * zoomFactor));
    }
    
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
    
    handleTouchEnd(e) {
        this.handleMouseUp(e);
    }
    
    handleKeyDown(e) {
        const speed = 50;
        switch(e.key.toLowerCase()) {
            case 'w': this.camera.y -= speed; break;
            case 's': this.camera.y += speed; break;
            case 'a': this.camera.x -= speed; break;
            case 'd': this.camera.x += speed; break;
            case 'escape':
                this.cancelPlacement();
                break;
        }
    }
    
    selectBuilding(buildingType) {
        this.playSound('ui_click');
        this.selectedBuilding = buildingType;
        this.placementMode = true;
        
        // Update UI
        document.querySelectorAll('.building-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        document.querySelector(`[data-building="${buildingType}"]`).classList.add('selected');
        
        this.showNotification(`Click on the map to place ${buildingType}`, 'success');
    }
    
    tryPlaceBuilding(screenX, screenY) {
        const worldPos = this.screenToWorld(screenX, screenY);
        const buildingData = this.getBuildingData(this.selectedBuilding);
        
        if (!buildingData) {
            this.playSound('ui_click');
            return;
        }
        
        // Check if we can afford it
        if (!this.canAfford(buildingData.cost)) {
            this.playSound('notification_bad');
            this.showNotification('Not enough resources!', 'error');
            // Don't proceed with placement if we can't afford it
            return;
        }
        
        // Check if position is valid
        if (!this.isValidPlacement(worldPos.x, worldPos.y)) {
            this.playSound('notification_bad'); 
            this.showNotification('Invalid placement location!', 'warning');
            return;
        }
        
        // Success sounds
        this.playSound('build_hammer');
        this.addBuilding(this.selectedBuilding, worldPos.x, worldPos.y);
        this.spendResources(buildingData.cost);
        this.cancelPlacement();
        
        this.playSound('notification_good');
        this.showNotification(`${buildingData.name} constructed!`, 'success');
    }
    
    addBuilding(type, x, y) {
        const buildingData = this.getBuildingData(type);
        if (!buildingData) return;
        
        const building = {
            type, x, y, ...buildingData, level: 1, production: 0, lastUpdate: Date.now()
        };
        
        // cache per-second production for quick rendering
        building.productionPerSec = {};
        if (buildingData.produces) {
            for (const [res, amt] of Object.entries(buildingData.produces)) {
                building.productionPerSec[res] = amt / 3; // tick every 3s
            }
        }
        
        this.buildings.push(building);
        this.updateStatsDisplay();
    }
    
    getBuildingData(type) {
        const buildings = {
            longhouse: {
                name: 'Longhouse',
                sprite: 'longhouse_sprite.png',
                cost: { wood: 20, food: 10 },
                produces: { population: 3 },
                size: 48
            },
            farm: {
                name: 'Farm',
                sprite: 'farm_sprite.png',
                cost: { wood: 15 },
                produces: { food: 2 },
                size: 40
            },
            lumbermill: {
                name: 'Lumber Mill',
                sprite: 'lumbermill_sprite.png',
                cost: { wood: 25, iron: 5 },
                produces: { wood: 3 },
                size: 44
            },
            blacksmith: {
                name: 'Blacksmith',
                sprite: 'blacksmith_sprite.png',
                cost: { wood: 30, iron: 10 },
                produces: { iron: 2 },
                size: 36
            },
            tradingpost: {
                name: 'Trading Post',
                sprite: 'tradingpost_sprite.png',
                cost: { wood: 40, gold: 5 },
                produces: { gold: 1 },
                size: 42
            },
            temple: {
                name: 'Temple',
                sprite: 'temple_sprite.png',
                cost: { wood: 50, iron: 20, gold: 15 },
                produces: { happiness: 10 },
                size: 52
            }
        };
        
        return buildings[type];
    }
    
    canAfford(cost) {
        for (const [resource, amount] of Object.entries(cost)) {
            if (this.resources[resource] < amount) {
                return false;
            }
        }
        return true;
    }
    
    spendResources(cost) {
        for (const [resource, amount] of Object.entries(cost)) {
            this.resources[resource] -= amount;
        }
        this.updateResourceDisplay();
    }
    
    isValidPlacement(x, y) {
        // Check terrain (avoid water and mountains)
        const tileType = this.getTileAt(x, y);
        if (tileType === 'deep_water' || tileType === 'shallow_water' || tileType === 'mountain') {
            return false;
        }
        
        // Check for overlapping buildings
        for (const building of this.buildings) {
            const distance = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (distance < building.size) {
                return false;
            }
        }
        
        return true;
    }
    
    getTileAt(x, y) {
        const chunkCoords = this.getChunkCoords(x, y);
        const chunkKey = this.getChunkKey(chunkCoords.x, chunkCoords.y);
        const chunk = this.loadedChunks.get(chunkKey);
        
        if (!chunk) return 'grass'; // Default for unloaded chunks
        
        const localX = x - chunk.worldX;
        const localY = y - chunk.worldY;
        const tileX = Math.floor(localX / this.tileSize) * this.tileSize;
        const tileY = Math.floor(localY / this.tileSize) * this.tileSize;
        
        const tile = chunk.tiles.find(t => t.localX === tileX && t.localY === tileY);
        return tile ? tile.type : 'grass';
    }
    
    cancelPlacement() {
        this.selectedBuilding = null;
        this.placementMode = false;
        
        document.querySelectorAll('.building-card').forEach(card => {
            card.classList.remove('selected');
        });
    }
    
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX / this.camera.scale) + this.camera.x,
            y: (screenY / this.camera.scale) + this.camera.y
        };
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.camera.x) * this.camera.scale,
            y: (worldY - this.camera.y) * this.camera.scale
        };
    }
    
    getDayNightInfo() {
        const cycleProgress = (this.gameTime % this.dayLength) / this.dayLength;
        const sunAngle = cycleProgress * Math.PI * 2; // 0..2π
        const sunAltitude = Math.sin(sunAngle - Math.PI / 2); // -1..1, 1 = noon
        const daylight = Math.max(0, sunAltitude);
        const lightLevel = 0.2 + 0.8 * daylight; // 0.2 night -> 1.0 day
        let phase = daylight === 0 ? 'night' : (daylight < 0.25 ? 'dawn' : (daylight > 0.75 ? 'dusk' : 'day'));
        const sunX = Math.cos(sunAngle);
        const sunY = sunAltitude;
        let ambientColor = phase === 'dawn' ? `rgba(255,180,120,${lightLevel*0.08})` :
                      phase === 'day'  ? `rgba(255,255,220,${lightLevel*0.04})` :
                      phase === 'dusk' ? `rgba(255,120,80,${lightLevel*0.12})` :
                                          `rgba(60,60,120,${0.35 - lightLevel*0.25})`;
        const sunColor = phase === 'dawn' ? `rgba(255,200,100,${lightLevel*0.25})` :
                     phase === 'day'  ? `rgba(255,255,200,${lightLevel*0.15})` :
                     phase === 'dusk' ? `rgba(255,150,80,${lightLevel*0.35})` :
                                        `rgba(180,180,255,0.08)`;
        return { phase, lightLevel, cycleProgress, sunAngle, sunX, sunY, ambientColor, sunColor };
    }
    
    renderSunRays(dayNightInfo) {
        if (dayNightInfo.phase === 'night') return;
        
        const { sunX, sunY, lightLevel, sunColor } = dayNightInfo;
        
        // Calculate sun position in screen space
        const screenCenterX = this.canvas.width / 2;
        const screenCenterY = this.canvas.height / 2;
        const sunScreenX = screenCenterX + sunX * this.canvas.width * 0.4;
        const sunScreenY = screenCenterY - Math.abs(sunY) * this.canvas.height * 0.3;
        
        if (sunY < 0) return; // Sun below horizon
        
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for screen-space rendering
        
        // Create sun rays
        this.ctx.globalCompositeOperation = 'screen';
        this.ctx.globalAlpha = lightLevel * 0.1;
        
        const rayCount = 8;
        const rayLength = Math.min(this.canvas.width, this.canvas.height) * 0.6;
        
        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            const rayEndX = sunScreenX + Math.cos(angle) * rayLength;
            const rayEndY = sunScreenY + Math.sin(angle) * rayLength;
            
            const gradient = this.ctx.createLinearGradient(sunScreenX, sunScreenY, rayEndX, rayEndY);
            gradient.addColorStop(0, sunColor);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(sunScreenX, sunScreenY);
            this.ctx.lineTo(rayEndX, rayEndY);
            this.ctx.stroke();
        }
        
        // Sun disc
        const sunSize = 30 * lightLevel;
        const sunGradient = this.ctx.createRadialGradient(sunScreenX, sunScreenY, 0, sunScreenX, sunScreenY, sunSize);
        sunGradient.addColorStop(0, `rgba(255, 255, 150, ${lightLevel * 0.8})`);
        sunGradient.addColorStop(0.7, `rgba(255, 200, 100, ${lightLevel * 0.4})`);
        sunGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        this.ctx.fillStyle = sunGradient;
        this.ctx.beginPath();
        this.ctx.arc(sunScreenX, sunScreenY, sunSize, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    applyDayNightLighting(dayNightInfo) {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for screen overlay
        
        const { lightLevel, ambientColor, phase } = dayNightInfo;
        
        // Night overlay
        if (phase === 'night') {
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = `rgba(50, 50, 100, ${1 - lightLevel})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else if (phase === 'dusk' || phase === 'dawn') {
            this.ctx.globalCompositeOperation = 'overlay';
            this.ctx.fillStyle = ambientColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        this.ctx.restore();
    }
    
    renderTimeOfDay() {
        const dayNightInfo = this.getDayNightInfo();
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(this.canvas.width - 150, 10, 140, 40);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Space Mono';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Phase: ${dayNightInfo.phase}`, this.canvas.width - 14, 26);
        this.ctx.fillText(`Time: ${(dayNightInfo.cycleProgress * 24).toFixed(1)}h`, this.canvas.width - 14, 42);
        this.ctx.restore();
    }
    
    renderTerrain() {
        const v = { l: this.camera.x, r: this.camera.x + this.canvas.width / this.camera.scale, t: this.camera.y, b: this.camera.y + this.canvas.height / this.camera.scale };
        for (const [chunkKey, chunk] of this.loadedChunks) {
            if (chunk.worldX + this.chunkSize < v.l || chunk.worldX > v.r || chunk.worldY + this.chunkSize < v.t || chunk.worldY > v.b) continue;
            this.ctx.drawImage(chunk.textureCanvas, chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
            this.ctx.drawImage(chunk.detailCanvas,  chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
        }
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const dni = this.getDayNightInfo();
        this.ctx.save(); this.ctx.scale(this.camera.scale, this.camera.scale); this.ctx.translate(-this.camera.x, -this.camera.y);
        this.renderTerrain(); this.renderBuildings(); this.renderScouts(); this.renderLightning(); this.renderFogOfWar();
        this.renderProductionPopups(); // floating numbers
        this.ctx.restore(); this.applyDayNightLighting(dni); this.renderSunRays(dni); this.renderTimeOfDay(); this.renderExplorationUI();
    }
    
    update(deltaTime) {
        // Update game time for day/night cycle
        this.gameTime += (deltaTime / 1000) * this.timeSpeed;
        
        // Load nearby chunks based on camera position
        this.loadNearbyChunks();
        
        // Update resource production with sound effects
        const now = Date.now();
        
        this.buildings.forEach(building => {
            const timeSince = now - building.lastUpdate;
            if (timeSince > 3000) { // Produce every 3 seconds
                if (building.produces) {
                    let producedSomething = false;
                    for (const [resource, amount] of Object.entries(building.produces)) {
                        if (resource === 'population') {
                            this.population += amount;
                            producedSomething = true;
                            this.addProductionPopup(building, `+${amount} pop`, '#d4af37');
                        } else if (this.resources.hasOwnProperty(resource)) {
                            this.resources[resource] += amount;
                            producedSomething = true;
                            const color = resource === 'food' ? '#66bb6a' :
                                          resource === 'wood' ? '#a1887f' :
                                          resource === 'iron' ? '#b0bec5' :
                                          resource === 'gold' ? '#ffd54f' : '#ffffff';
                            this.addProductionPopup(building, `+${amount} ${resource}`, color);
                        }
                    }
                    
                    // Play resource collection sound occasionally
                    if (producedSomething && Math.random() < 0.3) {
                        this.playSound('resource_collect', 0.4, 0.9 + Math.random() * 0.2);
                    }
                }
                building.lastUpdate = now;
            }
        });
        
        // Update scouts and exploration
        this.updateScouts(deltaTime);
        this.updateRevealAnimations();
        
        // Update lightning system
        this.updateLightning(deltaTime);
        
        this.updateResourceDisplay();
        this.updatePopulationDisplay();
    }
    
    updateLightning(deltaTime) {
        const now = Date.now();
        const dayNightInfo = this.getDayNightInfo();
        
        // Determine lightning chance based on conditions
        let lightningChance = this.lightningSystem.normalChance;
        if (dayNightInfo.phase === 'night' || dayNightInfo.phase === 'dusk') {
            lightningChance *= 2; // More dramatic at night
        }
        
        // Random weather patterns (simple simulation)
        const weatherNoise = this.seededNoise(now * 0.0001, this.seed);
        const isStormy = weatherNoise > 0.3;
        if (isStormy) {
            lightningChance = this.lightningSystem.stormChance;
        }
        
        // Check if it's time for lightning
        if (now > this.lightningSystem.nextStrike && Math.random() < lightningChance) {
            this.createLightningStrike();
            
            // Schedule next potential strike
            const interval = this.lightningSystem.minInterval + 
                           Math.random() * (this.lightningSystem.maxInterval - this.lightningSystem.minInterval);
            this.lightningSystem.nextStrike = now + interval;
        }
        
        // Update active lightning strikes
        this.lightningSystem.strikes = this.lightningSystem.strikes.filter(strike => {
            strike.age += deltaTime;
            strike.alpha = Math.max(0, 1 - (strike.age / strike.duration));
            return strike.age < strike.duration;
        });
    }
    
    createLightningStrike() {
        // Random position in visible area
        const screenBounds = {
            left: this.camera.x,
            right: this.camera.x + this.canvas.width / this.camera.scale,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height / this.camera.scale
        };
        
        const startX = screenBounds.left + Math.random() * (screenBounds.right - screenBounds.left);
        const startY = screenBounds.top - 200; // Start above visible area
        const endX = startX + (Math.random() - 0.5) * 300; // Some horizontal variance
        const endY = screenBounds.bottom + 100; // End below visible area
        
        // Create lightning bolt with branches
        const lightning = {
            segments: this.generateLightningPath(startX, startY, endX, endY),
            branches: this.generateLightningBranches(startX, startY, endX, endY),
            color: `hsl(${200 + Math.random() * 60}, 100%, ${80 + Math.random() * 20}%)`, // Blue-white variations
            width: 3 + Math.random() * 5,
            alpha: 1,
            age: 0,
            duration: 200 + Math.random() * 300, // 200-500ms
            flash: {
                intensity: 0.8 + Math.random() * 0.2,
                duration: 100 + Math.random() * 100,
                age: 0
            }
        };
        
        this.lightningSystem.strikes.push(lightning);
        
        // Play thunder sound with delay
        if (Math.random() < 0.7) {
            setTimeout(() => {
                this.playSound('thunder_distant', 0.6, 0.8 + Math.random() * 0.4);
            }, 300 + Math.random() * 2000);
        }
    }
    
    generateLightningPath(startX, startY, endX, endY) {
        const segments = [];
        const numSegments = 20 + Math.floor(Math.random() * 20);
        
        let currentX = startX;
        let currentY = startY;
        
        for (let i = 0; i < numSegments; i++) {
            const progress = i / numSegments;
            const targetX = startX + (endX - startX) * progress;
            const targetY = startY + (endY - startY) * progress;
            
            // Add randomness to create jagged lightning appearance
            const jitterX = (Math.random() - 0.5) * 50 * (1 - progress * 0.5);
            const jitterY = (Math.random() - 0.5) * 30;
            
            const nextX = targetX + jitterX;
            const nextY = targetY + jitterY;
            
            segments.push({
                startX: currentX,
                startY: currentY,
                endX: nextX,
                endY: nextY
            });
            
            currentX = nextX;
            currentY = nextY;
        }
        
        return segments;
    }
    
    generateLightningBranches(mainStartX, mainStartY, mainEndX, mainEndY) {
        const branches = [];
        const numBranches = 2 + Math.floor(Math.random() * 4);
        
        for (let i = 0; i < numBranches; i++) {
            const branchPoint = 0.2 + Math.random() * 0.6; // Branch somewhere in middle 60%
            const branchStartX = mainStartX + (mainEndX - mainStartX) * branchPoint;
            const branchStartY = mainStartY + (mainEndY - mainStartY) * branchPoint;
            
            const branchAngle = (Math.random() - 0.5) * Math.PI * 0.8; // Random angle
            const branchLength = 100 + Math.random() * 200;
            
            const branchEndX = branchStartX + Math.cos(branchAngle) * branchLength;
            const branchEndY = branchStartY + Math.sin(branchAngle) * branchLength;
            
            // Generate segments for branch (shorter than main bolt)
            const branchSegments = this.generateLightningPath(branchStartX, branchStartY, branchEndX, branchEndY);
            branches.push({
                segments: branchSegments.slice(0, branchSegments.length / 2), // Shorter branches
                alpha: 0.6 + Math.random() * 0.3
            });
        }
        
        return branches;
    }
    
    renderLightning() {
        if (!this.lightningSystem.enabled || this.lightningSystem.strikes.length === 0) return;
        
        this.ctx.save();
        
        this.lightningSystem.strikes.forEach(lightning => {
            this.ctx.globalAlpha = lightning.alpha;
            this.ctx.strokeStyle = lightning.color;
            this.ctx.lineWidth = lightning.width;
            this.ctx.lineCap = 'round';
            this.ctx.shadowColor = lightning.color;
            this.ctx.shadowBlur = 10;
            
            // Render main lightning bolt
            this.ctx.beginPath();
            lightning.segments.forEach((segment, index) => {
                if (index === 0) {
                    this.ctx.moveTo(segment.startX, segment.startY);
                }
                this.ctx.lineTo(segment.endX, segment.endY);
            });
            this.ctx.stroke();
            
            // Render branches
            lightning.branches.forEach(branch => {
                this.ctx.globalAlpha = lightning.alpha * branch.alpha;
                this.ctx.lineWidth = lightning.width * 0.6;
                
                this.ctx.beginPath();
                branch.segments.forEach((segment, index) => {
                    if (index === 0) {
                        this.ctx.moveTo(segment.startX, segment.startY);
                    }
                    this.ctx.lineTo(segment.endX, segment.endY);
                });
                this.ctx.stroke();
            });
            
            // Screen flash effect
            if (lightning.flash.age < lightning.flash.duration) {
                const flashAlpha = (1 - (lightning.flash.age / lightning.flash.duration)) * lightning.flash.intensity * 0.3;
                
                this.ctx.save();
                this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for screen flash
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = flashAlpha;
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.restore();
                
                lightning.flash.age += 16; // Approximate frame time
            }
        });
        
        this.ctx.restore();
    }
    
    renderBuildings() {
        this.buildings.forEach(building => {
            const screenPos = { x: building.x, y: building.y };
            
            // Building shadow
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.fillRect(screenPos.x + 3, screenPos.y + 3, building.size, building.size);
            
            // Load and render building sprite via cache
            if (building.sprite) {
                if (!this.spriteCache[building.sprite]) this.loadSprite(building.sprite);
                building.spriteImage = this.spriteCache[building.sprite]?.img;
            }
            if (building.spriteImage && this.spriteCache[building.sprite]?.loaded) {
                this.ctx.drawImage(building.spriteImage, screenPos.x, screenPos.y, building.size, building.size);
            } else {
                // Fallback rendering while sprite loads
                this.ctx.fillStyle = '#8b4513';
                this.ctx.fillRect(screenPos.x, screenPos.y, building.size, building.size);
                
                // Building icon as fallback
                this.ctx.fillStyle = '#f0f0f0';
                this.ctx.font = `${building.size * 0.6}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(
                    building.icon || '🏘️',
                    screenPos.x + building.size / 2,
                    screenPos.y + building.size * 0.7
                );
            }
            
            // per-building production rate label(s)
            if (building.productionPerSec && Object.keys(building.productionPerSec).length) {
                this.ctx.save();
                this.ctx.font = '10px Space Mono';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                let offset = 6;
                for (const [res, rate] of Object.entries(building.productionPerSec)) {
                    const line = `+${rate.toFixed(1)} ${res}/s`;
                    // outline for readability
                    this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    this.ctx.fillText(line, screenPos.x + building.size/2 + 1, screenPos.y - offset + 1);
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.fillText(line, screenPos.x + building.size/2, screenPos.y - offset);
                    offset += 12;
                }
                this.ctx.restore();
            }
        });
    }
    
    preloadSprites() {
        const list = Object.values({ ...this.getBuildingData('longhouse'), ...{} }) && ['longhouse','farm','lumbermill','blacksmith','tradingpost','temple']
            .map(t => this.getBuildingData(t)?.sprite).filter(Boolean);
        list.forEach(src => this.loadSprite(src));
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
            const entry = this.spriteCache[src];
            if (entry.retries < 3) {
                entry.retries++;
                setTimeout(() => { img.src = resolved + (resolved.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 300 * entry.retries);
            }
        };
        img.src = resolved;
    }
    
    renderScouts() {
        this.scouts.forEach(scout => {
            // Scout shadow
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.beginPath();
            this.ctx.arc(scout.x + 2, scout.y + 2, 8, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Scout body
            this.ctx.fillStyle = scout.exploring ? '#ff5722' : '#2196f3';
            this.ctx.beginPath();
            this.ctx.arc(scout.x, scout.y, 8, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Scout direction indicator
            if (scout.target) {
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([3, 3]);
                this.ctx.beginPath();
                this.ctx.moveTo(scout.x, scout.y);
                this.ctx.lineTo(scout.target.x, scout.target.y);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
            
            // Scout icon
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('🚶', scout.x, scout.y + 4);
        });
    }
    
    renderFogOfWar() {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Render fog for visible chunks
        const viewBounds = {
            left: this.camera.x,
            right: this.camera.x + this.canvas.width / this.camera.scale,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height / this.camera.scale
        };
        
        for (const [chunkKey, chunk] of this.loadedChunks) {
            // Check if chunk is visible
            if (chunk.worldX + this.chunkSize < viewBounds.left || 
                chunk.worldX > viewBounds.right ||
                chunk.worldY + this.chunkSize < viewBounds.top || 
                chunk.worldY > viewBounds.bottom) {
                continue;
            }
            
            const fogData = this.fogOfWar.get(chunkKey);
            if (fogData) {
                this.ctx.drawImage(fogData.canvas, chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
            }
        }
        
        this.ctx.restore();
    }
    
    renderExplorationUI() {
        // Exploration instructions
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, this.canvas.height - 80, 300, 60);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '14px Space Mono';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('Right-click to send scouts exploring', 20, this.canvas.height - 50);
        this.ctx.fillText('WASD or drag to navigate the map', 20, this.canvas.height - 30);
        
        this.ctx.restore();
    }
    
    renderProductionPopups() {
        const now = Date.now();
        this.productionPopups = this.productionPopups.filter(p => {
            const t = (now - p.start) / p.duration;
            if (t >= 1) return false;
            const alpha = 1 - t;
            const y = p.y - t * 20;
            this.ctx.save();
            this.ctx.font = '12px Space Mono';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            // outline
            this.ctx.globalAlpha = alpha * 0.8;
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            this.ctx.fillText(p.text, p.x + 1, y + 1);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = alpha;
            this.ctx.fillText(p.text, p.x, y);
            this.ctx.restore();
            return true;
        });
    }
    
    addProductionPopup(building, text, color = '#ffffff') {
        this.productionPopups.push({
            x: building.x + building.size / 2,
            y: building.y - 8,
            text,
            color,
            start: Date.now(),
            duration: 1000
        });
    }
    
    updateResourceDisplay() {
        // Calculate production rates per second
        const productionRates = {
            food: 0,
            wood: 0,
            iron: 0,
            gold: 0
        };
        
        // Calculate population growth rate
        let populationRate = 0;
        
        // Calculate total production from all buildings
        this.buildings.forEach(building => {
            if (building.produces) {
                for (const [resource, amount] of Object.entries(building.produces)) {
                    if (productionRates.hasOwnProperty(resource)) {
                        productionRates[resource] += amount / 3; // Per second (buildings produce every 3 seconds)
                    } else if (resource === 'population') {
                        populationRate += amount / 3; // Population growth rate
                    }
                }
            }
        });
        
        // Update display with production rates
        document.getElementById('food').textContent = Math.floor(this.resources.food);
        document.querySelector('#food').nextElementSibling.textContent = `(${productionRates.food > 0 ? '+' : ''}${productionRates.food.toFixed(1)}/ps)`;
        
        document.getElementById('wood').textContent = Math.floor(this.resources.wood);
        document.querySelector('#wood').nextElementSibling.textContent = `(${productionRates.wood > 0 ? '+' : ''}${productionRates.wood.toFixed(1)}/ps)`;
        
        document.getElementById('iron').textContent = Math.floor(this.resources.iron);
        document.querySelector('#iron').nextElementSibling.textContent = `(${productionRates.iron > 0 ? '+' : ''}${productionRates.iron.toFixed(1)}/ps)`;
        
        document.getElementById('gold').textContent = Math.floor(this.resources.gold);
        document.querySelector('#gold').nextElementSibling.textContent = `(${productionRates.gold > 0 ? '+' : ''}${productionRates.gold.toFixed(1)}/ps)`;
        
        // Update population display
        document.getElementById('population').textContent = this.population;
        document.querySelector('#population').nextElementSibling.textContent = `(${populationRate > 0 ? '+' : ''}${populationRate.toFixed(1)}/ps)`;
    }
    
    updatePopulationDisplay() {
        document.getElementById('population').textContent = this.population;
    }
    
    updateStatsDisplay() {
        // Calculate happiness based on buildings
        const temples = this.buildings.filter(b => b.type === 'temple').length;
        const calcHappiness = Math.min(100, 50 + temples * 15);

        const blacksmiths = this.buildings.filter(b => b.type === 'blacksmith').length;
        const calcDefense = Math.min(100, blacksmiths * 20);

        const tradingPosts = this.buildings.filter(b => b.type === 'tradingpost').length;
        const calcProsperity = Math.min(100, 30 + tradingPosts * 25);

        // Never decrease below persisted values; allow increases to persist
        const happiness = Math.max(this.settlementStatus.happiness ?? 0, calcHappiness);
        const defense = Math.max(this.settlementStatus.defense ?? 0, calcDefense);
        const prosperity = Math.max(this.settlementStatus.prosperity ?? 0, calcProsperity);

        this.settlementStatus = { happiness, defense, prosperity };
        this.savePersistentStats();

        document.getElementById('happinessBar').style.width = `${happiness}%`;
        document.getElementById('defenseBar').style.width = `${defense}%`;
        document.getElementById('prosperityBar').style.width = `${prosperity}%`;
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.getElementById('notifications').appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
        
        // Play appropriate notification sound
        if (type === 'success') {
            this.playSound('notification_good', 0.7);
        } else if (type === 'error' || type === 'warning') {
            this.playSound('notification_bad', 0.7);
        } else {
            this.playSound('ui_click', 0.5);
        }
    }
    
    saveGame() {
        try {
            // Convert fog of war data to serializable format
            const fogOfWarData = {};
            for (const [chunkKey, fogData] of this.fogOfWar) {
                // Convert canvas to base64 data URL for storage
                fogOfWarData[chunkKey] = fogData.canvas.toDataURL();
            }

            const gameState = {
                version: '1.0.1', // Added version for compatibility
                resources: this.resources,
                population: this.population,
                buildings: this.buildings,
                camera: this.camera,
                scouts: this.scouts,
                seed: this.seed,
                exploredAreas: Array.from(this.exploredAreas),
                fogOfWarData: fogOfWarData,
                saveTime: Date.now(),
                kingName: this.kingName,
                gameTime: this.gameTime,
                settlementStatus: this.settlementStatus
            };
            
            localStorage.setItem('vikingSettlement', JSON.stringify(gameState));
            this.showNotification('Game saved!', 'success');
            // Steam Cloud sync (Electron only; safe no-op otherwise)
            try { window.SteamCloud?.syncFromLocal?.('vikingSettlement'); } catch {}
        } catch (error) {
            console.error('Failed to save game:', error);
            this.showNotification('Failed to save game!', 'error');
        }
    }
    
    loadGame() {
        try {
            const saved = localStorage.getItem('vikingSettlement');
            if (!saved) return false;

            const gameState = JSON.parse(saved);
            
            // Check version compatibility
            if (!gameState.version) {
                console.warn('Loading legacy save without version');
                this.showNotification('Loading old save format...', 'warning');
            }

            // Validate save data integrity
            if (!this.validateSaveData(gameState)) {
                this.showNotification('Save data corrupted, starting fresh', 'error');
                localStorage.removeItem('vikingSettlement');
                return false;
            }

            this.resources = gameState.resources || { food: 100, wood: 50, iron: 25, gold: 10 };
            this.population = gameState.population || 5;
            this.buildings = gameState.buildings || [];
            
            // Restore camera position BEFORE loading chunks
            if (gameState.camera) {
                this.camera = { ...gameState.camera };
            }

            // Clear existing scouts before restoring from save
            this.scouts = [];

            // Restore scouts from save or spawn one if none exist
            if (gameState.scouts && gameState.scouts.length > 0) {
                this.scouts = gameState.scouts;
            } else {
                // Only spawn if no scouts in save data
                this.spawnInitialScout();
            }
            
            // Restore seed for consistent terrain generation
            if (typeof gameState.seed !== 'undefined') {
                this.seed = gameState.seed;
            }
            
            if (typeof gameState.gameTime === 'number') {
                this.gameTime = gameState.gameTime;
            }
            
            // Restore explored areas
            if (gameState.exploredAreas) {
                this.exploredAreas = new Set(gameState.exploredAreas);
            }
            
            // Load chunks around the saved camera position
            this.loadNearbyChunks();
            
            // Restore fog of war data
            if (gameState.fogOfWarData) {
                this.restoreFogOfWarFromSave(gameState.fogOfWarData);
            } else {
                // Fallback to old restoration method
                this.restoreFogOfWar();
            }
            
            if (gameState.settlementStatus) {
                // Merge saved status with persistent store; persistent wins if higher
                const saved = gameState.settlementStatus;
                this.settlementStatus = {
                    happiness: Math.max(this.settlementStatus.happiness ?? 0, saved.happiness ?? 0),
                    defense: Math.max(this.settlementStatus.defense ?? 0, saved.defense ?? 0),
                    prosperity: Math.max(this.settlementStatus.prosperity ?? 0, saved.prosperity ?? 0),
                };
                this.savePersistentStats();
            }
            
            this.updateResourceDisplay();
            this.updatePopulationDisplay();
            this.updateStatsDisplay();
            
            this.showNotification('Game loaded successfully!', 'success');
            return true;
        } catch (error) {
            console.error('Failed to load game:', error);
            this.showNotification('Failed to load save data!', 'error');
            localStorage.removeItem('vikingSettlement');
            return false;
        }
    }

    validateSaveData(gameState) {
        try {
            // Check if required fields exist and are of correct type
            if (typeof gameState.resources !== 'object' || gameState.resources === null) return false;
            if (typeof gameState.population !== 'number') return false;
            if (!Array.isArray(gameState.buildings)) return false;
            if (typeof gameState.camera !== 'object' || gameState.camera === null) return false;
            if (!Array.isArray(gameState.scouts)) return false;
            if (typeof gameState.seed !== 'number') return false;
            
            // Validate resources
            const requiredResources = ['food', 'wood', 'iron', 'gold'];
            for (const resource of requiredResources) {
                if (typeof gameState.resources[resource] !== 'number') return false;
            }
            
            // Validate camera
            if (typeof gameState.camera.x !== 'number' || 
                typeof gameState.camera.y !== 'number' || 
                typeof gameState.camera.scale !== 'number') return false;
            
            return true;
        } catch (error) {
            console.error('Save data validation failed:', error);
            return false;
        }
    }

    restoreFogOfWarFromSave(fogOfWarData) {
        try {
            for (const [chunkKey, dataURL] of Object.entries(fogOfWarData)) {
                // Create new image from saved data
                const img = new Image();
                img.onload = () => {
                    // Get or create fog canvas for this chunk
                    let fogData = this.fogOfWar.get(chunkKey);
                    if (!fogData) {
                        const [chunkX, chunkY] = chunkKey.split(',').map(Number);
                        this.initializeChunkFogOfWar(chunkX, chunkY);
                        fogData = this.fogOfWar.get(chunkKey);
                    }
                    
                    if (fogData) {
                        // Clear the canvas and draw the saved fog data
                        fogData.ctx.clearRect(0, 0, this.chunkSize, this.chunkSize);
                        fogData.ctx.drawImage(img, 0, 0);
                    }
                };
                img.src = dataURL;
            }
        } catch (error) {
            console.error('Failed to restore fog of war:', error);
            // Fallback to basic restoration
            this.restoreFogOfWar();
        }
    }
    
    restoreFogOfWar() {
        // Clear existing fog of war for explored areas
        for (const areaKey of this.exploredAreas) {
            const [tileX, tileY] = areaKey.split(',').map(Number);
            const chunkCoords = this.getChunkCoords(tileX, tileY);
            const chunkKey = this.getChunkKey(chunkCoords.x, chunkCoords.y);
            const fogData = this.fogOfWar.get(chunkKey);
            const chunk = this.loadedChunks.get(chunkKey);
            
            if (fogData && chunk) {
                const ctx = fogData.ctx;
                const localX = tileX - chunk.worldX;
                const localY = tileY - chunk.worldY;
                
                // Clear fog in a small area around this tile
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(localX - this.tileSize/2, localY - this.tileSize/2, this.tileSize, this.tileSize);
                ctx.restore();
            }
        }
    }
    
    resetGameProgress() {
        try {
            // Reset resources to initial values
            this.resources = {
                food: 100,
                wood: 50,
                iron: 25,
                gold: 10
            };
            
            // Reset population
            this.population = 5;
            
            // Clear all buildings
            this.buildings = [];
            
            // Reset camera position
            this.camera = { x: 0, y: 0, scale: 1 };
            
            // Clear scouts BEFORE spawning new ones
            this.scouts = [];
            
            // Clear explored areas
            this.exploredAreas.clear();
            
            // Clear reveal animations
            this.revealAnimations = [];
            
            // Clear loaded chunks and fog of war
            this.loadedChunks.clear();
            this.fogOfWar.clear();
            
            // Generate new seed for different terrain
            this.seed = Math.random() * 10000;
            
            // Load initial chunks
            this.loadNearbyChunks();
            
            // Spawn new scout at camera position (after clearing)
            this.spawnInitialScout();
            
            // Play horn for new game
            this.playSound('viking_horn');
            
            // Update UI displays
            this.updateResourceDisplay();
            this.updatePopulationDisplay();
            
            // reset settlement stats for a fresh start
            localStorage.removeItem(this.settlementStatusKey);
            this.settlementStatus = { happiness: 0, defense: 0, prosperity: 0 };
            document.getElementById('happinessBar').style.width = '0%';
            document.getElementById('defenseBar').style.width = '0%';
            document.getElementById('prosperityBar').style.width = '0%';
            
            this.savePersistentStats();
            
            // Cancel any building placement
            this.cancelPlacement();
            
            // Clear save data
            localStorage.removeItem('vikingSettlement');
        } catch (error) {
            console.error('Failed to reset game:', error);
            this.showNotification('Reset failed, please refresh page', 'error');
        }
    }
    
    ensureKingName() {
        const key = 'vikingKingName';
        let name = localStorage.getItem(key);
        if (!name) {
            name = (prompt('Hail, Jarl! Bestow thy name:', '') || '').trim();
            if (!name) name = 'Unnamed';
            localStorage.setItem(key, name);
        }
        this.kingName = name;
    }
    
    toggleSettings(show) {
        const m = document.getElementById('settingsModal');
        if (!m) return;
        m.classList.toggle('active', !!show);
    }
    
    loadPersistentStats() {
        try { const s = localStorage.getItem(this.settlementStatusKey); return s ? JSON.parse(s) : null; } catch { return null; }
    }
    savePersistentStats() {
        try { localStorage.setItem(this.settlementStatusKey, JSON.stringify(this.settlementStatus)); } catch {}
    }
    
    takePhoto() {
        try {
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = this.canvas.width;
            exportCanvas.height = this.canvas.height;
            const ex = exportCanvas.getContext('2d');

            // Draw current game canvas
            ex.drawImage(this.canvas, 0, 0);

            // Watermark
            const pad = 16;
            const text = `Jarl ${this.kingName} • ${new Date().toLocaleString()}`;
            ex.save();
            ex.font = '18px Space Mono';
            ex.textAlign = 'right';
            ex.textBaseline = 'bottom';
            // background box
            const metrics = ex.measureText(text);
            const boxW = metrics.width + 16;
            const boxH = 28;
            ex.fillStyle = 'rgba(0,0,0,0.5)';
            ex.fillRect(exportCanvas.width - boxW - pad, exportCanvas.height - boxH - pad, boxW, boxH);
            // text
            ex.fillStyle = '#ffffff';
            ex.fillText(text, exportCanvas.width - pad - 8, exportCanvas.height - pad - 6);
            ex.restore();

            exportCanvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const safeName = (this.kingName || 'Jarl').replace(/[^a-z0-9_-]+/gi, '_');
                a.download = `VikingTycoon_${safeName}_${Date.now()}.png`;
                a.href = url;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                this.showNotification('Photo saved!', 'success');
            }, 'image/png');
        } catch (e) {
            console.error('Photo export failed', e);
            this.showNotification('Failed to save photo', 'error');
        }
    }
    
    exportSaveTxt() {
        try {
            if (!localStorage.getItem('vikingSettlement')) this.saveGame();
            const raw = localStorage.getItem('vikingSettlement') || '{}';
            const b64 = this.encodeB64(raw);
            const blob = new Blob([b64], { type: 'text/plain' });
            const a = document.createElement('a');
            a.download = `VikingTycoon_Save_${Date.now()}.txt`;
            a.href = URL.createObjectURL(blob);
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 0);
            this.showNotification('Exported save to TXT', 'success');
        } catch { 
            this.showNotification('Export failed', 'error');
        }
    }
    
    encodeB64(str) { return btoa(unescape(encodeURIComponent(str))); }
    decodeB64(b64) { return decodeURIComponent(escape(atob(b64))); }
    
    importSaveTxt() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,text/plain';
        input.onchange = async () => {
            try {
                const file = input.files?.[0]; if (!file) return;
                const text = await file.text();
                const jsonStr = this.decodeB64(text.trim());
                const data = JSON.parse(jsonStr);
                if (!this.validateSaveData(data)) throw new Error('invalid');
                localStorage.setItem('vikingSettlement', jsonStr);
                this.showNotification('Import successful - loading...', 'success');
                this.loadGame();
            } catch { this.showNotification('Import failed', 'error'); }
        };
        input.click();
    }
    
    gameLoop() {
        const now = performance.now();
        if (!this.lastUpdate) this.lastUpdate = now;
        const timestep = 1000 / 30;
        this._acc = (this._acc || 0) + Math.min(1000, now - this.lastUpdate);
        let steps = 0; const maxSteps = 5;
        while (this._acc >= timestep && steps < maxSteps) { this.update(timestep); this._acc -= timestep; steps++; }
        this._lastRender = this._lastRender || 0;
        if (now - this._lastRender >= timestep - 1) { this.render(); this._lastRender = now; }
        this.lastUpdate = now; if (!this.externalLoop) requestAnimationFrame(() => this.gameLoop());
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    const splash = document.getElementById('splashScreen');
    const container = document.getElementById('gameContainer');
    const flameCanvas = document.getElementById('splashFlames'); const flameCtx = flameCanvas?.getContext('2d');
    let rafId = null, particles = []; function rs(){ if(!flameCanvas) return; const r = flameCanvas.getBoundingClientRect(); flameCanvas.width = r.width; flameCanvas.height = r.height; } rs(); window.addEventListener('resize', rs);
    function spawn(){ if(!flameCanvas) return; for(let i=0;i<12;i++){ particles.push({ x: (flameCanvas.width*0.5)+(Math.random()*120-60), y: flameCanvas.height*0.9+Math.random()*10, vx:(Math.random()-0.5)*0.4, vy:-(1.2+Math.random()*1.6), r: 2+Math.random()*4, a: 0.9, h: 25+Math.random()*10 }); } }
    function step(){ if(!flameCanvas) return; flameCtx.clearRect(0,0,flameCanvas.width,flameCanvas.height); if(Math.random()<0.8) spawn(); particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.r*=0.996; p.a*=0.96; p.h+=0.6; const grd=flameCtx.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(1,p.r*3)); grd.addColorStop(0,`hsla(${p.h},100%,60%,${p.a})`); grd.addColorStop(1,`hsla(${p.h},100%,50%,0)`); flameCtx.fillStyle=grd; flameCtx.beginPath(); flameCtx.arc(p.x,p.y,Math.max(1,p.r*3),0,Math.PI*2); flameCtx.fill(); }); particles=particles.filter(p=>p.a>0.05 && p.y>flameCanvas.height*0.1); rafId=requestAnimationFrame(step); }
    const startFlames = ()=>{ if(flameCanvas){ particles=[]; cancelAnimationFrame(rafId); step(); } };
    const stopFlames = ()=>{ cancelAnimationFrame(rafId); if(flameCtx){ flameCtx.clearRect(0,0,flameCanvas.width,flameCanvas.height); } };
    const start = () => {
        container.style.display = 'flex';
        const game = new VikingSettlementTycoon(); window.vikingGame = game;
        // Try Steam Cloud -> local sync before loading
        try {
            if (window.SteamCloud?.init?.()) {
                window.SteamCloud.trySyncToLocal('vikingSettlement').then(() => game.loadGame()).catch(() => game.loadGame());
            } else {
                setTimeout(() => game.loadGame(), 100);
            }
        } catch { setTimeout(() => game.loadGame(), 100); }
    };
    if (splash) { startFlames(); setTimeout(() => { splash.classList.add('fade-out'); setTimeout(() => { stopFlames(); splash.style.display = 'none'; start(); }, 500); }, 3000); } else { start(); window.vikingGame.externalLoop = true; VSync30.start(() => window.vikingGame.gameLoop()); }
});