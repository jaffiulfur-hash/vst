class MobileVikingSettlementTycoon {
    constructor() {
        this.gameVersion = '1.0.0';
        
        // Initialize Cordova device detection first
        this.cordovaSupported = false;
        this.deviceInfo = this.collectDeviceInfo();
        
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false; // avoid tile seams on mobile
        
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
        
        // Day/Night cycle (mobile optimized)
        this.gameTime = 0;
        this.dayLength = 3600; // 60 minutes per full day/night cycle (30 min day + 30 min night) 
        this.timeSpeed = 1; // Normal speed for realistic experience
        
        // Mobile-specific properties
        this.activeTab = 'buildings';
        // Enhanced touch handling for zoom
        this.touchStartTime = 0;
        this.longPressThreshold = 800; // 800ms for long press
        this.longPressTimer = null;
        this.lastTapTime = 0;
        this.doubleTapThreshold = 300; // 300ms for double tap
        this.pinchStartDistance = 0;
        this.pinchStartScale = 1;
        this.isPinching = false;
        
        // Mobile-optimized sound system
        this.soundSystem = {
            enabled: true,
            masterVolume: 0.6, // Lower default for mobile
            musicVolume: 0.3,  // Quieter music on mobile
            sfxVolume: 0.7,
            currentAmbient: null,
            sounds: {},
            musicTracks: {},
            loadingPromises: [],
            mobileOptimized: true
        };
        
        // Enhanced infinite terrain system (mobile optimized)
        this.chunkSize = 256; // Smaller chunks for mobile performance
        this.tileSize = 16; // Smaller tiles for mobile optimization
        this.loadedChunks = new Map(); // Map of chunk coordinates to chunk data
        this.chunkLoadRadius = 2; // Reduced for mobile performance
        this.seed = Math.random() * 10000; // Seed for consistent generation
        
        // Exploration system
        this.fogOfWar = new Map(); // Map of chunk coordinates to fog canvas
        this.scouts = [];
        this.exploredAreas = new Set();
        this.revealAnimations = [];
        
        // Lightning system (mobile optimized)
        this.lightningSystem = {
            enabled: true,
            strikes: [],
            nextStrike: 0,
            minInterval: 8000,  // Longer intervals for mobile
            maxInterval: 45000,
            stormChance: 0.25,  // Slightly reduced for performance
            normalChance: 0.015 // Reduced frequency
        };
        
        // Sprite cache to prevent emoji fallback when offline
        this.spriteCache = {};
        
        // Touch handling
        this.touchState = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            startTime: 0
        };
        
        // Game loop
        this.lastUpdate = 0;
        this.gameRunning = true;
        
        // Initialize splashscreen
        this.initSplashScreen();
        
        this.saveKey = 'vikingSettlementMobile';
        this.backupKey = 'vikingSettlementMobile_backup';
        this.schemaVersion = 2;
        this.kingName = null;
        this.persistentStatsKey = 'vikingSettlementMobilePersistentStats';
        this.settlementStatus = this.loadPersistentStats() || { happiness: 75, defense: 40, prosperity: 60 };
    }
    
    initSplashScreen() {
        // Show animated splashscreen for 5 seconds with 60fps optimization
        const splashScreen = document.getElementById('splashScreen');
        const gameContainer = document.getElementById('gameContainer');
        const splashGif = document.querySelector('.splash-gif');
        
        // Force hardware acceleration and optical flow for smooth playback
        if (splashGif) {
            splashGif.style.willChange = 'transform';
            splashGif.style.transform = 'translateZ(0)';
            splashGif.style.backfaceVisibility = 'hidden';
            splashGif.style.imageRendering = '-webkit-optimize-contrast';
            
            // Enable optical flow smoothing if supported
            if ('MSHyperlinkAuditingEnabled' in window || 'chrome' in window) {
                splashGif.style.filter += ' contrast(1.05) saturate(1.05)';
            }
        }
        
        setTimeout(() => {
            // Fade out splashscreen
            splashScreen.classList.add('fade-out');
            
            // Show game container after fade transition
            setTimeout(() => {
                splashScreen.style.display = 'none';
                gameContainer.style.display = 'flex';
                
                // Initialize game after splashscreen
                this.externalLoop = true;
                this.init();
                VSync30.start(() => this.gameLoop());
            }, 500); // Wait for fade transition
        }, 5000); // 5 second delay to prevent looping
    }
    
    collectDeviceInfo() {
        // Enhanced device info with Cordova support
        const info = {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            pixelRatio: window.devicePixelRatio || 1,
            platform: this.getPlatformInfo(),
            browser: this.getBrowserInfo(),
            touchSupport: 'ontouchstart' in window,
            orientation: screen.orientation ? screen.orientation.type : 'unknown',
            // Cordova device info (will be populated when available)
            deviceModel: 'Unknown',
            devicePlatform: 'Unknown',
            deviceVersion: 'Unknown',
            deviceManufacturer: 'Unknown',
            appVersion: this.gameVersion,
            cordovaVersion: 'Not Available'
        };
        
        // Check for Cordova and populate device info
        this.initializeCordova(info);
        
        return info;
    }
    
    initializeCordova(deviceInfo) {
        // Wait for deviceready event if Cordova is present
        if (window.cordova) {
            this.cordovaSupported = true;
            document.addEventListener('deviceready', () => {
                this.onDeviceReady(deviceInfo);
            }, false);
        } else {
            // Check periodically for Cordova availability
            let checkCount = 0;
            const checkCordova = () => {
                checkCount++;
                if (window.cordova && checkCount < 10) {
                    this.cordovaSupported = true;
                    document.addEventListener('deviceready', () => {
                        this.onDeviceReady(deviceInfo);
                    }, false);
                } else if (checkCount < 10) {
                    setTimeout(checkCordova, 500);
                }
            };
            checkCordova();
        }
    }
    
    onDeviceReady(deviceInfo) {
        try {
            // Get device information using cordova-plugin-device
            if (window.device) {
                deviceInfo.deviceModel = window.device.model || 'Unknown';
                deviceInfo.devicePlatform = window.device.platform || 'Unknown';
                deviceInfo.deviceVersion = window.device.version || 'Unknown';
                deviceInfo.deviceManufacturer = window.device.manufacturer || 'Unknown';
                deviceInfo.cordovaVersion = window.device.cordova || 'Unknown';
            }
            
            // Get app version using cordova-plugin-app-version
            if (window.cordova && window.cordova.getAppVersion) {
                window.cordova.getAppVersion.getVersionNumber().then((version) => {
                    deviceInfo.appVersion = version;
                    this.updateDeviceInfoDisplay();
                }).catch((error) => {
                    console.warn('Could not get app version:', error);
                });
            }
            
            // Update UI with Cordova device info
            this.updateDeviceInfoDisplay();
            
            console.log('Cordova device info loaded:', deviceInfo);
            
        } catch (error) {
            console.warn('Error accessing Cordova device info:', error);
        }
    }
    
    updateDeviceInfoDisplay() {
        // Update the device info modal with Cordova data
        const elements = {
            gameVersion: this.deviceInfo.appVersion,
            screenSize: `${this.deviceInfo.screenWidth}×${this.deviceInfo.screenHeight}`,
            platformInfo: `${this.deviceInfo.devicePlatform} ${this.deviceInfo.deviceVersion}`,
            browserInfo: this.deviceInfo.browser,
            deviceModel: this.deviceInfo.deviceModel,
            deviceManufacturer: this.deviceInfo.deviceManufacturer,
            cordovaVersion: this.deviceInfo.cordovaVersion
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }
    
    getPlatformInfo() {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('android')) return 'Android';
        if (userAgent.includes('iphone')) return 'iOS (iPhone)';
        if (userAgent.includes('ipad')) return 'iOS (iPad)';
        if (userAgent.includes('macintosh') || userAgent.includes('mac os x')) {
            return navigator.maxTouchPoints > 0 ? 'iPadOS' : 'macOS';
        }
        if (userAgent.includes('mobile')) return 'Mobile';
        return 'Unknown';
    }
    
    getBrowserInfo() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    }
    
    init() {
        this.setupCanvas();
        this.setupMobileUI();
        this.loadNearbyChunks();
        this.ensureKingName();
        const nameEl = document.getElementById('mobileKingNameDisplay');
        if (nameEl) nameEl.textContent = `Jarl: ${this.kingName}`;
        
        // Preload sprites early so drawImage succeeds without network
        this.preloadSprites();
        
        // Check for saved game
        const hasSavedGame = localStorage.getItem(this.saveKey);
        if (!hasSavedGame) {
            this.spawnInitialScout();
            // Remove automatic building placement for new players
            this.showMobileNotification('Welcome to Viking Settlement Tycoon! Build your settlement from scratch!', 'success');
        } else {
            this.loadGame();
        }
        
        this.setupMobileEventListeners();
        this.gameLoop();
        
        this.initializeMobileSoundSystem();
    }
    
    initializeMobileSoundSystem() {
        try {
            // Mobile-specific audio initialization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Essential sounds only for mobile performance
            const soundAssets = {
                'ui_click': 'ui_click.mp3',
                'notification_good': 'notification_good.mp3',
                'notification_bad': 'notification_bad.mp3',
                'build_hammer': 'build_hammer.mp3',
                'resource_collect': 'resource_collect.mp3',
                'viking_horn': 'viking_horn.mp3',
                'thunder_distant': 'thunder_distant.mp3',
                'ambient_forest': 'ambient_forest.mp3'
            };
            
            // Load sounds with mobile optimization
            for (const [key, filename] of Object.entries(soundAssets)) {
                this.loadMobileSound(key, filename);
            }
            
            // Setup mobile audio controls
            this.setupMobileSoundControls();
            
            // Handle mobile audio context requirements
            this.setupMobileAudioInteraction();
            
        } catch (error) {
            console.warn('Mobile audio not supported:', error);
            this.soundSystem.enabled = false;
        }
    }
    
    loadMobileSound(key, filename) {
        try {
            const audio = new Audio(filename);
            audio.preload = 'metadata'; // Lighter preloading for mobile
            audio.volume = this.soundSystem.sfxVolume * this.soundSystem.masterVolume;
            
            this.soundSystem.sounds[key] = {
                audio: audio,
                instances: [audio], // Single instance for mobile
                currentInstance: 0
            };
            
            if (key.startsWith('ambient_')) {
                audio.loop = true;
                this.soundSystem.musicTracks[key] = audio;
            }
            
        } catch (error) {
            console.warn(`Failed to load mobile sound ${key}:`, error);
        }
    }
    
    setupMobileAudioInteraction() {
        // Mobile browsers require user interaction to start audio
        const startAudio = () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    console.log('Mobile audio context resumed');
                    this.playAmbientMusic('ambient_forest');
                });
            }
            
            // iOS-specific: ensure audio unlock
            if (this.deviceInfo.platform.includes('iOS') || this.deviceInfo.platform.includes('iPadOS')) {
                if (!this.iosAudioUnlocked && this.audioContext) {
                    const buffer = this.audioContext.createBuffer(1, 1, 22050);
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);
                    source.start(0);
                    this.iosAudioUnlocked = true;
                }
            }
            
            // Remove listeners after first interaction
            document.removeEventListener('touchstart', startAudio);
            document.removeEventListener('click', startAudio);
        };
        
        document.addEventListener('touchstart', startAudio, { once: true });
        document.addEventListener('click', startAudio, { once: true });
    }
    
    playMobileSound(soundKey, volume = 1.0) {
        if (!this.soundSystem.enabled) return;
        
        const soundData = this.soundSystem.sounds[soundKey];
        if (!soundData) return;
        
        try {
            const instance = soundData.audio;
            instance.currentTime = 0;
            instance.volume = Math.max(0, Math.min(1, 
                volume * this.soundSystem.sfxVolume * this.soundSystem.masterVolume
            ));
            
            const playPromise = instance.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Silently handle mobile audio errors
                    console.debug(`Mobile audio play error for ${soundKey}`);
                });
            }
        } catch (error) {
            console.debug(`Mobile sound error ${soundKey}:`, error);
        }
    }
    
    playAmbientMusic(trackKey) {
        if (!this.soundSystem.enabled) return;
        
        const track = this.soundSystem.musicTracks[trackKey];
        if (!track) return;
        
        try {
            // Stop current ambient
            if (this.soundSystem.currentAmbient) {
                const currentTrack = this.soundSystem.musicTracks[this.soundSystem.currentAmbient];
                if (currentTrack) {
                    currentTrack.pause();
                }
            }
            
            track.volume = this.soundSystem.musicVolume * this.soundSystem.masterVolume;
            track.currentTime = 0;
            
            const playPromise = track.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.soundSystem.currentAmbient = trackKey;
                }).catch(error => {
                    console.debug(`Mobile ambient play error: ${trackKey}`);
                });
            }
        } catch (error) {
            console.debug(`Mobile ambient error ${trackKey}:`, error);
        }
    }
    
    setupMobileSoundControls() {
        // Add sound toggle to mobile UI
        const soundToggleHtml = `
            <button id="mobileSoundToggle" class="mobile-sound-toggle" 
                    style="position: absolute; top: 10px; right: 50px; background: rgba(0,0,0,0.7); 
                           color: white; border: none; padding: 10px; border-radius: 5px; font-size: 16px;">
                ${this.soundSystem.enabled ? '🔊' : '🔇'}
            </button>
        `;
        
        document.body.insertAdjacentHTML('beforeend', soundToggleHtml);
        
        document.getElementById('mobileSoundToggle').addEventListener('click', () => {
            this.toggleMobileSound();
        });
    }
    
    toggleMobileSound() {
        this.soundSystem.enabled = !this.soundSystem.enabled;
        
        if (!this.soundSystem.enabled) {
            Object.values(this.soundSystem.musicTracks).forEach(track => {
                track.pause();
            });
        } else {
            this.playAmbientMusic('ambient_forest');
        }
        
        document.getElementById('mobileSoundToggle').textContent = 
            this.soundSystem.enabled ? '🔊' : '🔇';
        
        this.showMobileNotification(
            this.soundSystem.enabled ? 'Sound enabled' : 'Sound disabled', 
            'info'
        );
    }
    
    setupCanvas() {
        const resize = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            
            // iOS-specific viewport fix
            if (this.deviceInfo.platform.includes('iOS') || this.deviceInfo.platform.includes('iPadOS')) {
                // Account for safe area insets on iOS devices
                const safeAreaTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0');
                const safeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');
                if (safeAreaTop || safeAreaBottom) {
                    this.canvas.height = rect.height - safeAreaTop - safeAreaBottom;
                }
            }
        };
        
        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', () => {
            setTimeout(resize, 100);
        });
        
        // iOS-specific: prevent elastic scrolling
        if (this.deviceInfo.platform.includes('iOS') || this.deviceInfo.platform.includes('iPadOS')) {
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.height = '100%';
            document.body.style.overflow = 'hidden';
        }
    }
    
    setupMobileUI() {
        // Update device info display
        document.getElementById('gameVersion').textContent = this.deviceInfo.appVersion;
        document.getElementById('screenSize').textContent = `${this.deviceInfo.screenWidth}×${this.deviceInfo.screenHeight}`;
        document.getElementById('platformInfo').textContent = this.deviceInfo.devicePlatform;
        document.getElementById('browserInfo').textContent = this.deviceInfo.browser;
        
        this.updateMobileResourceDisplay();
        this.updateMobilePopulationDisplay();
        this.updateMobileStatsDisplay();
    }
    
    setupMobileEventListeners() {
        // Tab navigation
        document.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tn = (e.currentTarget || e.target).dataset.tab;
                this.switchTab(tn);
            });
        });
        
        // Building selection
        document.querySelectorAll('.mobile-building-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const buildingType = card.dataset.building;
                this.selectMobileBuilding(buildingType);
            });
        });
        
        // Action buttons
        document.getElementById('mobileNewTerritoryBtn').addEventListener('click', () => {
            this.resetGameProgress();
            this.showMobileNotification('New territory discovered!', 'success');
        });
        
        document.getElementById('mobileSaveBtn').addEventListener('click', () => {
            this.saveMobileGame();
        });
        
        document.getElementById('mobileInfoBtn').addEventListener('click', () => {
            this.showDeviceInfoModal();
        });
        
        document.getElementById('mobileHelpBtn').addEventListener('click', () => {
            this.showHelpModal();
        });
        
        const mSettingsBtn = document.getElementById('mobileSettingsBtn');
        if (mSettingsBtn) mSettingsBtn.addEventListener('click', () => document.getElementById('mobileSettingsModal').classList.add('active'));
        const mSettingsClose = document.querySelector('#mobileSettingsModal .mobile-modal-close');
        if (mSettingsClose) mSettingsClose.addEventListener('click', () => document.getElementById('mobileSettingsModal').classList.remove('active'));
        const mExport = document.getElementById('mobileExportSaveBtn');
        if (mExport) mExport.addEventListener('click', () => this.exportMobileSaveTxt());
        const mImport = document.getElementById('mobileImportSaveBtn');
        if (mImport) mImport.addEventListener('click', () => this.importMobileSaveTxt());
        
        // Modal close buttons
        document.querySelectorAll('.mobile-modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.mobile-modal').classList.remove('active');
            });
        });
        
        // Canvas touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        
        // Prevent context menu on long press
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        const photoBtn = document.getElementById('mobilePhotoBtn');
        if (photoBtn) photoBtn.addEventListener('click', () => this.takeMobilePhoto());
    }
    
    switchTab(tabName) {
        this.playMobileSound('ui_click', 0.5);
        
        // Update tab buttons
        document.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.mobile-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`mobile${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`).classList.add('active');
        
        this.activeTab = tabName;
    }
    
    selectMobileBuilding(buildingType) {
        this.playMobileSound('ui_click');
        this.selectedBuilding = buildingType;
        this.placementMode = true;
        
        // Update UI
        document.querySelectorAll('.mobile-building-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        document.querySelector(`[data-building="${buildingType}"]`).classList.add('selected');
        
        this.showMobileNotification(`Tap the map to place ${buildingType}`, 'success');
    }
    
    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getTouchCenter(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    handleTouchStart(e) {
        // iOS Safari requires passive: false for preventDefault to work
        if (e.cancelable) {
            e.preventDefault();
        }
        
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            
            // Check for double tap
            const now = Date.now();
            if (now - this.lastTapTime < this.doubleTapThreshold) {
                this.handleDoubleTap(touch.clientX - rect.left, touch.clientY - rect.top);
                this.lastTapTime = 0; // Reset to prevent triple tap
                return;
            }
            this.lastTapTime = now;
            
            this.touchState = {
                active: true,
                startX: touch.clientX - rect.left,
                startY: touch.clientY - rect.top,
                currentX: touch.clientX - rect.left,
                currentY: touch.clientY - rect.top,
                startTime: Date.now()
            };
            
            // Start long press timer
            this.longPressTimer = setTimeout(() => {
                if (this.touchState.active) {
                    this.handleLongPress();
                }
            }, this.longPressThreshold);
        } else if (e.touches.length === 2) {
            // Start pinch zoom
            this.isPinching = true;
            this.pinchStartDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            this.pinchStartScale = this.camera.scale;
            
            // Clear any existing timers
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }
    }
    
    handleTouchMove(e) {
        // iOS Safari requires passive: false for preventDefault to work
        if (e.cancelable) {
            e.preventDefault();
        }
        
        if (e.touches.length === 1 && this.touchState.active && !this.isPinching) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            
            this.touchState.currentX = touch.clientX - rect.left;
            this.touchState.currentY = touch.clientY - rect.top;
            
            // Calculate movement distance
            const dx = this.touchState.currentX - this.touchState.startX;
            const dy = this.touchState.currentY - this.touchState.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If moved too much, cancel long press
            if (distance > 20 && this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            
            // Pan camera
            this.camera.x -= dx * 0.8 / this.camera.scale;
            this.camera.y -= dy * 0.8 / this.camera.scale;
            
            this.touchState.startX = this.touchState.currentX;
            this.touchState.startY = this.touchState.currentY;
        } else if (e.touches.length === 2 && this.isPinching) {
            // Handle pinch zoom
            const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            const scaleFactor = currentDistance / this.pinchStartDistance;
            
            // Apply zoom with limits
            const newScale = Math.max(0.3, Math.min(3, this.pinchStartScale * scaleFactor));
            
            // Get touch center for zoom focus
            const rect = this.canvas.getBoundingClientRect();
            const center = this.getTouchCenter(e.touches[0], e.touches[1]);
            const centerX = center.x - rect.left;
            const centerY = center.y - rect.top;
            
            // Convert to world coordinates
            const worldX = (centerX / this.camera.scale) + this.camera.x;
            const worldY = (centerY / this.camera.scale) + this.camera.y;
            
            // Apply new scale
            const oldScale = this.camera.scale;
            this.camera.scale = newScale;
            
            // Adjust camera position to zoom towards touch center
            this.camera.x = worldX - (centerX / this.camera.scale);
            this.camera.y = worldY - (centerY / this.camera.scale);
        }
    }
    
    handleTouchEnd(e) {
        // iOS Safari requires passive: false for preventDefault to work
        if (e.cancelable) {
            e.preventDefault();
        }
        
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        if (e.touches.length === 0) {
            // All touches ended
            if (this.touchState.active && !this.isPinching) {
                const touchDuration = Date.now() - this.touchState.startTime;
                const dx = Math.abs(this.touchState.currentX - this.touchState.startX);
                const dy = Math.abs(this.touchState.currentY - this.touchState.startY);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // If it was a quick tap (not a drag or long press)
                if (touchDuration < this.longPressThreshold && distance < 20) {
                    // Wait a bit to check for double tap, otherwise handle as single tap
                    setTimeout(() => {
                        if (Date.now() - this.lastTapTime > this.doubleTapThreshold) {
                            this.handleTap(this.touchState.currentX, this.touchState.currentY);
                        }
                    }, this.doubleTapThreshold + 50);
                }
            }
            
            this.touchState.active = false;
            this.isPinching = false;
        } else if (e.touches.length === 1 && this.isPinching) {
            // One finger lifted during pinch, end pinch mode
            this.isPinching = false;
        }
    }
    
    handleDoubleTap(x, y) {
        // Zoom in on double tap
        const zoomFactor = this.camera.scale < 1.5 ? 1.8 : 0.6;
        
        // Convert tap position to world coordinates
        const worldX = (x / this.camera.scale) + this.camera.x;
        const worldY = (y / this.camera.scale) + this.camera.y;
        
        // Apply new scale with limits
        this.camera.scale = Math.max(0.3, Math.min(3, this.camera.scale * zoomFactor));
        
        // Adjust camera to keep the tapped point centered
        this.camera.x = worldX - (x / this.camera.scale);
        this.camera.y = worldY - (y / this.camera.scale);
        
        this.showMobileNotification(
            this.camera.scale > 1.5 ? 'Zoomed in!' : 'Zoomed out!', 
            'success'
        );
    }
    
    handleTap(x, y) {
        if (this.placementMode && this.selectedBuilding) {
            this.tryPlaceMobileBuilding(x, y);
        }
    }
    
    handleLongPress() {
        const worldPos = this.screenToWorld(this.touchState.currentX, this.touchState.currentY);
        this.sendScoutToExplore(worldPos.x, worldPos.y);
    }
    
    sendScoutToExplore(x, y) {
        try {
            if (this.scouts.length === 0) {
                this.playMobileSound('notification_bad');
                this.showMobileNotification('No scouts available - creating new scout!', 'warning');
                this.spawnInitialScout();
                return;
            }
            
            // Validate coordinates
            if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 500000 || Math.abs(y) > 500000) {
                this.showMobileNotification('Invalid exploration target!', 'error');
                return;
            }
            
            const scout = this.scouts[0];
            
            // Validate scout before assigning target
            if (!this.validateScoutData(scout)) {
                console.error('Scout corrupted, creating new one');
                this.scouts.splice(0, 1);
                this.spawnInitialScout();
                this.showMobileNotification('Scout was corrupted - created new one', 'warning');
                return;
            }
            
            // Check if scout is already exploring
            if (scout.exploring && scout.target) {
                this.showMobileNotification('Scout is already exploring - wait for completion', 'info');
                return;
            }

            // Add pathfinding validation to prevent scouts from getting stuck
            const dx = x - scout.x;
            const dy = y - scout.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check if target is too close (might cause issues)
            if (distance < 10) {
                this.showMobileNotification('Target too close - choose a farther location', 'warning');
                return;
            }
            
            // Check if target is reasonable distance
            if (distance > 2000) {
                this.showMobileNotification('Target too far - choose a closer location', 'warning');
                return;
            }
            
            scout.target = { x, y };
            scout.exploring = true;
            
            this.playMobileSound('notification_good');
            this.showMobileNotification('Scout dispatched to explore!', 'success');
            
            // Auto-save after scout dispatch to prevent corruption
            setTimeout(() => {
                this.saveMobileGame();
            }, 1000);
            
        } catch (error) {
            console.error('Error dispatching scout:', error);
            this.showMobileNotification('Failed to dispatch scout - please try again', 'error');
        }
    }
    
    tryPlaceMobileBuilding(screenX, screenY) {
        const worldPos = this.screenToWorld(screenX, screenY);
        const buildingData = this.getBuildingData(this.selectedBuilding);
        
        if (!buildingData) return;
        
        if (!this.canAfford(buildingData.cost)) {
            this.playMobileSound('notification_bad');
            this.showMobileNotification('Not enough resources!', 'error');
            return;
        }
        
        if (!this.isValidPlacement(worldPos.x, worldPos.y)) {
            this.playMobileSound('notification_bad');
            this.showMobileNotification('Invalid location!', 'warning');
            return;
        }
        
        this.playMobileSound('build_hammer');
        this.addBuilding(this.selectedBuilding, worldPos.x, worldPos.y);
        this.spendResources(buildingData.cost);
        this.cancelMobilePlacement();
        
        this.playMobileSound('notification_good');
        this.showMobileNotification(`${buildingData.name} built!`, 'success');
    }
    
    cancelMobilePlacement() {
        this.selectedBuilding = null;
        this.placementMode = false;
        
        document.querySelectorAll('.mobile-building-card').forEach(card => {
            card.classList.remove('selected');
        });
    }
    
    showMobileNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `mobile-notification ${type}`;
        notification.textContent = message;
        
        document.getElementById('mobileNotifications').appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
        
        // Play appropriate notification sound
        if (type === 'success') {
            this.playMobileSound('notification_good', 0.6);
        } else if (type === 'error' || type === 'warning') {
            this.playMobileSound('notification_bad', 0.6);
        }
    }
    
    showDeviceInfoModal() {
        document.getElementById('mobileDeviceModal').classList.add('active');
    }
    
    showHelpModal() {
        document.getElementById('mobileHelpModal').classList.add('active');
    }
    
    updateMobileResourceDisplay() {
        // Calculate production rates
        const productionRates = { food: 0, wood: 0, iron: 0, gold: 0 };
        
        this.buildings.forEach(building => {
            if (building.produces) {
                for (const [resource, amount] of Object.entries(building.produces)) {
                    if (productionRates.hasOwnProperty(resource)) {
                        productionRates[resource] += amount / 3;
                    }
                }
            }
        });
        
        document.getElementById('mobileFood').textContent = Math.floor(this.resources.food);
        document.querySelector('#mobileFood').nextElementSibling.textContent = `(${productionRates.food > 0 ? '+' : ''}${productionRates.food.toFixed(1)}/s)`;
        
        document.getElementById('mobileWood').textContent = Math.floor(this.resources.wood);
        document.querySelector('#mobileWood').nextElementSibling.textContent = `(${productionRates.wood > 0 ? '+' : ''}${productionRates.wood.toFixed(1)}/s)`;
        
        document.getElementById('mobileIron').textContent = Math.floor(this.resources.iron);
        document.querySelector('#mobileIron').nextElementSibling.textContent = `(${productionRates.iron > 0 ? '+' : ''}${productionRates.iron.toFixed(1)}/s)`;
        
        document.getElementById('mobileGold').textContent = Math.floor(this.resources.gold);
        document.querySelector('#mobileGold').nextElementSibling.textContent = `(${productionRates.gold > 0 ? '+' : ''}${productionRates.gold.toFixed(1)}/s)`;
    }
    
    updateMobilePopulationDisplay() {
        document.getElementById('mobilePop').textContent = this.population;
    }
    
    updateMobileStatsDisplay() {
        // Calculate stats based on buildings
        const temples = this.buildings.filter(b => b.type === 'temple').length;
        const calcHappiness = Math.min(100, 50 + temples * 15);

        const blacksmiths = this.buildings.filter(b => b.type === 'blacksmith').length;
        const calcDefense = Math.min(100, blacksmiths * 20);

        const tradingPosts = this.buildings.filter(b => b.type === 'tradingpost').length;
        const calcProsperity = Math.min(100, 30 + tradingPosts * 25);

        // Preserve best values across resets
        const happiness = Math.max(this.settlementStatus.happiness ?? 0, calcHappiness);
        const defense = Math.max(this.settlementStatus.defense ?? 0, calcDefense);
        const prosperity = Math.max(this.settlementStatus.prosperity ?? 0, calcProsperity);

        this.settlementStatus = { happiness, defense, prosperity };
        this.savePersistentStats();

        document.getElementById('mobileHappinessBar').style.width = `${happiness}%`;
        document.getElementById('mobileDefenseBar').style.width = `${defense}%`;
        document.getElementById('mobileProsperityBar').style.width = `${prosperity}%`;
    }
    
    saveMobileGame() {
        try {
            // Validate critical data before saving
            if (!this.validateGameStateBeforeSave()) {
                this.showMobileNotification('Game state validation failed - save aborted', 'error');
                return false;
            }
            
            // Convert fog of war data to serializable format (simplified approach)
            const fogOfWarData = {};
            for (const [chunkKey, fogData] of this.fogOfWar) {
                try {
                    // Only save if canvas exists and is valid
                    if (fogData && fogData.canvas && fogData.canvas.width > 0) {
                        fogOfWarData[chunkKey] = fogData.canvas.toDataURL();
                    }
                } catch (canvasError) {
                    console.warn(`Failed to serialize fog canvas for chunk ${chunkKey}:`, canvasError);
                    // Skip this chunk's fog data
                    continue;
                }
            }

            const gameState = {
                version: this.gameVersion,
                resources: this.resources,
                population: this.population,
                buildings: this.buildings.map(building => ({
                    type: building.type,
                    x: building.x,
                    y: building.y,
                    level: building.level || 1,
                    lastUpdate: building.lastUpdate || Date.now()
                })),
                camera: {
                    x: this.camera.x,
                    y: this.camera.y,
                    scale: Math.max(0.3, Math.min(3, this.camera.scale))
                },
                scouts: this.scouts.map(scout => ({
                    x: scout.x,
                    y: scout.y,
                    speed: scout.speed,
                    health: scout.health || 100,
                    range: scout.range || 40,
                    exploring: false, // Don't save exploring state to prevent corruption
                    target: null      // Don't save target to prevent corruption
                })),
                seed: this.seed,
                exploredAreas: Array.from(this.exploredAreas),
                fogOfWarData: fogOfWarData,
                gameTime: this.gameTime || 0,
                deviceInfo: this.deviceInfo,
                saveTime: Date.now(),
                kingName: this.kingName,
                settlementStatus: this.settlementStatus
            };
            
            // Test if the data can be stringified before saving
            const testString = JSON.stringify(gameState);
            if (testString.length > 5000000) { // 5MB limit
                throw new Error('Save data too large');
            }
            
            const payload = { schema: this.schemaVersion, checksum: this.computeChecksum(testString), data: gameState };
            const payloadString = JSON.stringify(payload);
            localStorage.setItem(this.saveKey, payloadString);
            localStorage.setItem(this.backupKey, payloadString);
            this.showMobileNotification('Game saved successfully!', 'success');
            console.log('Mobile game saved successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to save mobile game:', error);
            
            // Try to save without fog of war data as fallback
            try {
                const fallbackState = {
                    version: this.gameVersion, resources: this.resources, population: this.population,
                    buildings: this.buildings.map(b => ({ type: b.type, x: b.x, y: b.y, level: b.level || 1, lastUpdate: b.lastUpdate || Date.now() })),
                    camera: { x: this.camera.x, y: this.camera.y, scale: Math.max(0.3, Math.min(3, this.camera.scale)) },
                    scouts: this.scouts.map(s => ({ x: s.x, y: s.y, speed: s.speed, health: s.health || 100, range: s.range || 40, exploring: false, target: null })),
                    seed: this.seed, exploredAreas: Array.from(this.exploredAreas), gameTime: this.gameTime || 0, deviceInfo: this.deviceInfo, saveTime: Date.now(),
                    kingName: this.kingName,
                    settlementStatus: this.settlementStatus
                };
                const fsStr = JSON.stringify(fallbackState);
                const payload = { schema: this.schemaVersion, checksum: this.computeChecksum(fsStr), data: fallbackState };
                localStorage.setItem(this.saveKey, JSON.stringify(payload));
                this.showMobileNotification('Game saved (limited data)!', 'warning');
                console.log('Mobile game saved with fallback method');
                return true;
                
            } catch (fallbackError) {
                console.error('Fallback save also failed:', fallbackError);
                this.showMobileNotification('❌ FAILED TO SAVE GAME', 'error');
                return false;
            }
        }
    }

    validateGameStateBeforeSave() {
        try {
            // Check basic game state
            if (!this.resources || typeof this.resources !== 'object') return false;
            if (typeof this.population !== 'number' || !isFinite(this.population)) return false;
            if (!Array.isArray(this.buildings)) return false;
            if (!this.camera || typeof this.camera !== 'object') return false;
            if (!Array.isArray(this.scouts)) return false;
            
            // Validate scouts before saving
            for (let scout of this.scouts) {
                if (!this.validateScoutData(scout)) {
                    console.error('Invalid scout found before save:', scout);
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            console.error('Game state validation error:', error);
            return false;
        }
    }

    validateScoutData(scoutData) {
        try {
            if (!scoutData || typeof scoutData !== 'object') return false;
            if (typeof scoutData.x !== 'number' || !isFinite(scoutData.x)) return false;
            if (typeof scoutData.y !== 'number' || !isFinite(scoutData.y)) return false;
            if (typeof scoutData.speed !== 'number' || !isFinite(scoutData.speed) || scoutData.speed <= 0) return false;
            if (typeof scoutData.health !== 'number' || !isFinite(scoutData.health)) return false;
            if (typeof scoutData.range !== 'number' || !isFinite(scoutData.range) || scoutData.range <= 0) return false;
            
            // Check for reasonable bounds
            if (Math.abs(scoutData.x) > 1000000 || Math.abs(scoutData.y) > 1000000) return false;
            if (scoutData.speed > 1000 || scoutData.health > 10000 || scoutData.range > 1000) return false;
            
            return true;
        } catch (error) {
            console.error('Scout validation error:', error);
            return false;
        }
    }
    
    loadGame() {
        try {
            const saved = localStorage.getItem(this.saveKey);
            if (!saved) {
                this.showMobileNotification('No saved game found, starting fresh!', 'info');
                return false;
            }
            let parsed = JSON.parse(saved);
            let gameState;
            if (parsed && parsed.data && parsed.checksum) {
                const dataStr = JSON.stringify(parsed.data);
                if (parsed.checksum !== this.computeChecksum(dataStr)) {
                    console.warn('Primary save checksum failed, trying backup');
                    const backup = localStorage.getItem(this.backupKey);
                    if (backup) {
                        const p2 = JSON.parse(backup);
                        if (p2 && p2.data && p2.checksum && p2.checksum === this.computeChecksum(JSON.stringify(p2.data))) {
                            parsed = p2;
                        } else {
                            throw new Error('Backup checksum failed');
                        }
                    } else {
                        throw new Error('No backup available');
                    }
                }
                gameState = parsed.data;
            } else {
                gameState = parsed; // legacy save (no checksum)
            }
            
            // Verify version compatibility
            if (!gameState.version || gameState.version !== this.gameVersion) {
                console.warn('Version mismatch or missing version in save');
                this.showMobileNotification('Save from different version - may have issues', 'warning');
            }

            // Validate save data integrity
            if (!this.validateSaveData(gameState)) {
                this.showMobileNotification('⚠️ SAVE DATA CORRUPTED - Starting Fresh Game', 'error');
                localStorage.removeItem(this.saveKey);
                this.resetGameProgress();
                return false;
            }
            
            // Restore basic game state
            this.resources = gameState.resources || { food: 100, wood: 50, iron: 25, gold: 10 };
            this.population = gameState.population || 5;
            
            // Restore buildings with proper data structure
            this.buildings = [];
            if (gameState.buildings && Array.isArray(gameState.buildings)) {
                gameState.buildings.forEach(savedBuilding => {
                    const buildingData = this.getBuildingData(savedBuilding.type);
                    if (buildingData) {
                        const building = {
                            type: savedBuilding.type,
                            x: savedBuilding.x,
                            y: savedBuilding.y,
                            level: savedBuilding.level || 1,
                            lastUpdate: savedBuilding.lastUpdate || Date.now(),
                            ...buildingData
                        };
                        this.buildings.push(building);
                    }
                });
            }
            
            // Restore camera
            if (gameState.camera) {
                this.camera = {
                    x: gameState.camera.x || 0,
                    y: gameState.camera.y || 0,
                    scale: Math.max(0.3, Math.min(3, gameState.camera.scale || 1))
                };
            }
            
            // Restore scouts with corruption detection
            this.scouts = [];
            if (gameState.scouts && Array.isArray(gameState.scouts)) {
                try {
                    gameState.scouts.forEach(savedScout => {
                        // Validate scout data
                        if (this.validateScoutData(savedScout)) {
                            const scout = {
                                x: savedScout.x || 0,
                                y: savedScout.y || 0,
                                speed: savedScout.speed || 20,
                                health: savedScout.health || 100,
                                range: savedScout.range || 40,
                                exploring: false, // Always reset to prevent stuck scouts
                                target: null      // Always reset target to prevent corruption
                            };
                            this.scouts.push(scout);
                        } else {
                            console.warn('Invalid scout data detected, skipping');
                        }
                    });
                } catch (scoutError) {
                    console.error('Scout data corrupted:', scoutError);
                    this.showMobileNotification('Scout data corrupted - creating new scout', 'warning');
                    this.scouts = [];
                }
            }
            
            // Ensure at least one scout exists
            if (this.scouts.length === 0) {
                this.spawnInitialScout();
                this.showMobileNotification('Created new scout - your previous scout was corrupted', 'warning');
            }
            
            // Restore other properties
            if (typeof gameState.seed === 'number') {
                this.seed = gameState.seed;
            }
            
            if (typeof gameState.gameTime === 'number') {
                this.gameTime = gameState.gameTime;
            }
            
            if (gameState.exploredAreas && Array.isArray(gameState.exploredAreas)) {
                this.exploredAreas = new Set(gameState.exploredAreas);
            }
            
            // Load chunks after restoring state
            this.loadNearbyChunks();
            
            // Restore fog of war data if available
            if (gameState.fogOfWarData && typeof gameState.fogOfWarData === 'object') {
                this.restoreFogOfWarFromSave(gameState.fogOfWarData);
            } else {
                // Fallback to basic restoration
                this.restoreFogOfWar();
            }
            
            // Restore king name
            if (gameState.kingName) this.kingName = gameState.kingName;
            if (!this.kingName) this.ensureKingName();
            const nameEl = document.getElementById('mobileKingNameDisplay');
            if (nameEl) nameEl.textContent = `Jarl: ${this.kingName}`;
            
            // Restore persistent stats
            if (gameState.settlementStatus) {
                const saved = gameState.settlementStatus;
                this.settlementStatus = {
                    happiness: Math.max(this.settlementStatus.happiness ?? 0, saved.happiness ?? 0),
                    defense: Math.max(this.settlementStatus.defense ?? 0, saved.defense ?? 0),
                    prosperity: Math.max(this.settlementStatus.prosperity ?? 0, saved.prosperity ?? 0),
                };
                this.savePersistentStats();
            }
            
            // Update displays
            this.updateMobileResourceDisplay();
            this.updateMobilePopulationDisplay();
            this.updateMobileStatsDisplay();
            
            this.showMobileNotification('Game loaded successfully!', 'success');
            console.log('Mobile game loaded successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to load mobile game:', error);
            
            // Show clear error message to user
            this.showMobileNotification('⚠️ SAVE GAME CORRUPTED - Starting Fresh', 'error');
            
            // Try to recover by removing corrupted save
            try {
                localStorage.removeItem(this.saveKey);
                localStorage.removeItem(this.backupKey);
                this.resetGameProgress();
                this.showMobileNotification('Corrupted save removed - fresh game started', 'info');
            } catch (cleanupError) {
                console.error('Failed to cleanup corrupted save:', cleanupError);
                this.showMobileNotification('Failed to clean corrupted save - please clear app data', 'error');
            }
            
            return false;
        }
    }

    validateSaveData(gameState) {
        try {
            // Check if required fields exist and are of correct type
            if (!gameState || typeof gameState !== 'object') return false;
            if (typeof gameState.resources !== 'object' || gameState.resources === null) return false;
            if (typeof gameState.population !== 'number' || !isFinite(gameState.population)) return false;
            if (!Array.isArray(gameState.buildings)) return false;
            if (typeof gameState.camera !== 'object' || gameState.camera === null) return false;
            if (!Array.isArray(gameState.scouts)) return false;
            if (typeof gameState.seed !== 'number' || !isFinite(gameState.seed)) return false;
            
            // Validate resources
            const requiredResources = ['food', 'wood', 'iron', 'gold'];
            for (const resource of requiredResources) {
                if (typeof gameState.resources[resource] !== 'number' || !isFinite(gameState.resources[resource])) {
                    return false;
                }
            }
            
            // Validate camera
            if (typeof gameState.camera.x !== 'number' || !isFinite(gameState.camera.x) ||
                typeof gameState.camera.y !== 'number' || !isFinite(gameState.camera.y) ||
                typeof gameState.camera.scale !== 'number' || !isFinite(gameState.camera.scale)) {
                return false;
            }
            
            // Validate buildings array
            if (gameState.buildings.length > 1000) return false; // Sanity check
            
            // Validate scouts array  
            if (gameState.scouts.length > 100) return false; // Sanity check
            
            return true;
        } catch (error) {
            console.error('Mobile save data validation failed:', error);
            return false;
        }
    }

    restoreFogOfWarFromSave(fogOfWarData) {
        try {
            let restoredCount = 0;
            const maxRestore = 50; // Limit restoration for performance
            
            for (const [chunkKey, dataURL] of Object.entries(fogOfWarData)) {
                if (restoredCount >= maxRestore) break;
                
                try {
                    // Validate chunk key format
                    const chunkCoords = chunkKey.split(',');
                    if (chunkCoords.length !== 2) continue;
                    
                    const chunkX = parseInt(chunkCoords[0]);
                    const chunkY = parseInt(chunkCoords[1]);
                    
                    if (!isFinite(chunkX) || !isFinite(chunkY)) continue;
                    
                    // Create image from saved data
                    const img = new Image();
                    img.onload = () => {
                        try {
                            // Get or create fog canvas for this chunk
                            let fogData = this.fogOfWar.get(chunkKey);
                            if (!fogData) {
                                this.initializeChunkFogOfWar(chunkX, chunkY);
                                fogData = this.fogOfWar.get(chunkKey);
                            }
                            
                            if (fogData && fogData.ctx) {
                                // Clear the canvas and draw the saved fog data
                                fogData.ctx.clearRect(0, 0, this.chunkSize, this.chunkSize);
                                fogData.ctx.drawImage(img, 0, 0);
                            }
                        } catch (drawError) {
                            console.warn(`Failed to restore fog for chunk ${chunkKey}:`, drawError);
                        }
                    };
                    
                    img.onerror = () => {
                        console.warn(`Invalid fog data for chunk ${chunkKey}`);
                    };
                    
                    if (typeof dataURL === 'string' && dataURL.startsWith('data:image')) {
                        img.src = dataURL;
                        restoredCount++;
                    }
                } catch (chunkError) {
                    console.warn(`Failed to process fog chunk ${chunkKey}:`, chunkError);
                    continue;
                }
            }
            
            console.log(`Restored fog of war for ${restoredCount} chunks`);
        } catch (error) {
            console.error('Failed to restore mobile fog of war:', error);
            // Fallback to basic restoration
            this.restoreFogOfWar();
        }
    }
    
    getBuildingData(type) {
        const buildings = {
            longhouse: {
                name: 'Longhouse',
                sprite: 'longhouse_sprite.png',
                cost: { wood: 20, food: 10 },
                produces: { population: 3 },
                size: 32
            },
            farm: {
                name: 'Farm',
                sprite: 'farm_sprite.png',
                cost: { wood: 15 },
                produces: { food: 2 },
                size: 28
            },
            lumbermill: {
                name: 'Lumber Mill',
                sprite: 'lumbermill_sprite.png',
                cost: { wood: 25, iron: 5 },
                produces: { wood: 3 },
                size: 30
            },
            blacksmith: {
                name: 'Blacksmith',
                sprite: 'blacksmith_sprite.png',
                cost: { wood: 30, iron: 10 },
                produces: { iron: 2 },
                size: 26
            },
            tradingpost: {
                name: 'Trading Post',
                sprite: 'tradingpost_sprite.png',
                cost: { wood: 40, gold: 5 },
                produces: { gold: 1 },
                size: 30
            },
            temple: {
                name: 'Temple',
                sprite: 'temple_sprite.png',
                cost: { wood: 50, iron: 20, gold: 15 },
                produces: { happiness: 10 },
                size: 36
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
        this.updateMobileResourceDisplay();
    }
    
    addBuilding(type, x, y) {
        const buildingData = this.getBuildingData(type);
        if (!buildingData) return;
        
        const building = { type, x, y, ...buildingData, level: 1, production: 0, lastUpdate: Date.now() };
        building.productionPerSec = {};
        if (buildingData.produces) {
            for (const [res, amt] of Object.entries(buildingData.produces)) {
                building.productionPerSec[res] = amt / 3;
            }
        }
        
        this.buildings.push(building);
        this.updateMobileStatsDisplay();
    }
    
    isValidPlacement(x, y) {
        // Simplified validation for mobile
        for (const building of this.buildings) {
            const distance = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (distance < building.size) {
                return false;
            }
        }
        return true;
    }
    
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX / this.camera.scale) + this.camera.x,
            y: (screenY / this.camera.scale) + this.camera.y
        };
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
    
    getChunkCoords(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.chunkSize),
            y: Math.floor(worldY / this.chunkSize)
        };
    }
    
    getChunkKey(chunkX, chunkY) {
        return `${chunkX},${chunkY}`;
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
                    moisture: biomeData.moisture,
                    noise: this.seededNoise(worldTileX * 0.02, worldTileY * 0.02),
                    detailNoise: this.seededNoise(worldTileX * 0.05, worldTileY * 0.05)
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
        
        for (let i = 0; i < 3; i++) { // Reduced octaves for mobile performance
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
    
    drawEnhancedTerrainTile(ctx, tileType, x, y, size, noise, detailNoise, moisture) {
        switch (tileType) {
            // Basic terrain types
            case 'grass':
                this.drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture);
                break;
            case 'snow':
                this.drawEnhancedSnowTile(ctx, x, y, size, detailNoise);
                break;
            case 'water':
            case 'shallow_water':
                this.drawEnhancedWaterTile(ctx, x, y, size, '#1976d2', '#2196f3', '#64b5f6');
                break;
            case 'deep_fjord_water':
                this.drawDeepFjordTile(ctx, x, y, size);
                break;
            case 'beach':
                this.drawEnhancedBeachTile(ctx, x, y, size, moisture);
                break;
            case 'hills':
                this.drawEnhancedHillsTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountains':
            case 'highland_mountains':
                this.drawEnhancedMountainTile(ctx, x, y, size, detailNoise);
                break;
            
            // Forest types
            case 'conifer_forest':
                this.drawConiferForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'dense_conifer_forest':
                this.drawDenseConiferTile(ctx, x, y, size, detailNoise);
                break;
            case 'deciduous_forest':
                this.drawDeciduousForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'mixed_forest':
                this.drawMixedForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'sparse_forest':
                this.drawSparseForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'alpine_forest':
                this.drawAlpineForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountain_forest':
                this.drawMountainForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'coastal_forest':
                this.drawCoastalForestTile(ctx, x, y, size, detailNoise);
                break;
            
            // Arctic biome
            case 'arctic_ice':
                this.drawArcticIceTile(ctx, x, y, size);
                break;
            case 'tundra_grass':
                this.drawTundraGrassTile(ctx, x, y, size, detailNoise);
                break;
            
            // Boreal biome
            case 'boreal_lake':
                this.drawBorealLakeTile(ctx, x, y, size);
                break;
            case 'wetland':
                this.drawWetlandTile(ctx, x, y, size, moisture);
                break;
            case 'boreal_clearing':
                this.drawBorealClearingTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_terrain':
                this.drawRockyTerrainTile(ctx, x, y, size, detailNoise);
                break;
            
            // Coastal biome
            case 'rocky_shore':
                this.drawRockyShoreTile(ctx, x, y, size, detailNoise);
                break;
            case 'sea_cliff':
                this.drawSeaCliffTile(ctx, x, y, size, detailNoise);
                break;
            case 'coastal_grass':
                this.drawCoastalGrassTile(ctx, x, y, size, moisture);
                break;
            
            // Mountain biome
            case 'snow_peak':
                this.drawSnowPeakTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_peak':
                this.drawRockyPeakTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_slope':
                this.drawRockySlopeTile(ctx, x, y, size, detailNoise);
                break;
            case 'alpine_meadow':
                this.drawAlpineMeadowTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountain_stream':
                this.drawMountainStreamTile(ctx, x, y, size);
                break;
            
            // Temperate biome
            case 'river':
                this.drawRiverTile(ctx, x, y, size);
                break;
            case 'dry_grassland':
                this.drawDryGrasslandTile(ctx, x, y, size, detailNoise);
                break;
            case 'flowering_meadow':
                this.drawFloweringMeadowTile(ctx, x, y, size, detailNoise);
                break;
            
            // Default fallback
            default:
                this.drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture);
                break;
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
        for (let i = 0; i < Math.max(2, Math.floor(size / 4)); i++) {
            const patchX = x + Math.random() * size;
            const patchY = y + Math.random() * size;
            const patchSize = Math.max(1, 2 + Math.random() * 2);
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
            ctx.arc(flowerX, flowerY, Math.max(1, size / 16), 0, Math.PI * 2);
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
        for (let i = 0; i < Math.max(3, Math.floor(size / 4)); i++) {
            const snowX = x + Math.random() * size;
            const snowY = y + Math.random() * size;
            const snowSize = Math.max(1, 1 + Math.random() * 2);
            ctx.beginPath();
            ctx.arc(snowX, snowY, snowSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Snow drifts
        if (detailNoise > 0.2) {
            ctx.fillStyle = '#f0f8ff';
            for (let i = 0; i < Math.max(1, Math.floor(size / 12)); i++) {
                const driftX = x + Math.random() * size;
                const driftY = y + Math.random() * size;
                ctx.beginPath();
                ctx.ellipse(driftX, driftY, Math.max(2, size / 6), Math.max(1, size / 8), Math.random() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Sparkles in the snow
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < Math.max(2, Math.floor(size / 6)); i++) {
            const sparkleX = x + Math.random() * size;
            const sparkleY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(sparkleX, sparkleY, 0.5, 0, Math.PI * 2);
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
        
        // Water movement patterns (mobile optimized)
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = light;
        for (let i = 0; i < Math.max(1, Math.floor(size / 8)); i++) {
            const waveX = x + (Math.sin((x + y + Date.now() * 0.001) * 0.02 + i) * 2);
            const waveY = y + (Math.cos((x + y + Date.now() * 0.001) * 0.02 + i) * 2);
            ctx.fillRect(waveX, waveY, size * 0.6, 1);
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
        
        // Sand texture with varied grain sizes (mobile optimized)
        ctx.fillStyle = darkSand;
        for (let i = 0; i < Math.max(6, Math.floor(size * 0.6)); i++) {
            const dotX = x + Math.random() * size;
            const dotY = y + Math.random() * size;
            const radius = Math.max(0.5, 0.5 + Math.random() * 1);
            ctx.beginPath();
            ctx.arc(dotX, dotY, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Occasional shells or debris
        if (Math.random() < 0.1) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.3, Math.max(1, size / 16), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawConiferForestTile(ctx, x, y, size, detailNoise) {
        // Base forest floor
        ctx.fillStyle = '#1b5e20';
        ctx.fillRect(x, y, size, size);
        
        // Coniferous trees (pine/spruce style)
        const treeCount = Math.max(2, Math.floor(size / 8));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            const treeHeight = Math.max(3, size / 5);
            
            // Tree trunk
            ctx.fillStyle = '#3e2723';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            // Conifer shape (triangular)
            ctx.fillStyle = '#0d4f0d';
            ctx.beginPath();
            ctx.moveTo(treeX, treeY - treeHeight * 1.5);
            ctx.lineTo(treeX - size/10, treeY - 1);
            ctx.lineTo(treeX + size/10, treeY - 1);
            ctx.closePath();
            ctx.fill();
            
            // Tree shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.moveTo(treeX + 1, treeY - treeHeight * 1.4);
            ctx.lineTo(treeX - size/12, treeY);
            ctx.lineTo(treeX + size/8, treeY);
            ctx.closePath();
            ctx.fill();
        }
        
        // Forest floor details
        if (detailNoise > 0.2) {
            ctx.fillStyle = '#2e4d2e';
            for (let i = 0; i < Math.max(3, Math.floor(size / 6)); i++) {
                const detailX = x + Math.random() * size;
                const detailY = y + Math.random() * size;
                ctx.fillRect(detailX, detailY, 1, 1);
            }
        }
    }

    drawDenseConiferTile(ctx, x, y, size, detailNoise) {
        // Darker base for dense forest
        ctx.fillStyle = '#0d3f0f';
        ctx.fillRect(x, y, size, size);
        
        // More trees packed together
        const treeCount = Math.max(4, Math.floor(size / 6));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 3) * size/3 + Math.random() * size/4;
            const treeY = y + Math.floor(i / 3) * size/3 + Math.random() * size/4;
            const treeHeight = Math.max(2, size / 6);
            
            // Tree trunk
            ctx.fillStyle = '#2d1b14';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            // Dense conifer canopy
            ctx.fillStyle = '#0a3a0a';
            ctx.beginPath();
            ctx.moveTo(treeX, treeY - treeHeight * 1.3);
            ctx.lineTo(treeX - size/12, treeY - 1);
            ctx.lineTo(treeX + size/12, treeY - 1);
            ctx.closePath();
            ctx.fill();
        }
        
        // Very dense undergrowth
        ctx.fillStyle = '#1a4d1a';
        for (let i = 0; i < Math.max(5, Math.floor(size * 0.8)); i++) {
            const undergrowthX = x + Math.random() * size;
            const undergrowthY = y + Math.random() * size;
            ctx.fillRect(undergrowthX, undergrowthY, 1, Math.max(1, size / 12));
        }
    }

    drawSparseForestTile(ctx, x, y, size, detailNoise) {
        // Grass base with scattered trees
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(x, y, size, size);
        
        // Few scattered coniferous trees
        const treeCount = Math.max(1, Math.floor(size / 12));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + Math.random() * size;
            const treeY = y + Math.random() * size;
            const treeHeight = Math.max(3, size / 4);
            
            // Tree trunk
            ctx.fillStyle = '#5d4037';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            // Sparse conifer
            ctx.fillStyle = '#2e7d32';
            ctx.beginPath();
            ctx.moveTo(treeX, treeY - treeHeight * 1.2);
            ctx.lineTo(treeX - size/14, treeY - 1);
            ctx.lineTo(treeX + size/14, treeY - 1);
            ctx.closePath();
            ctx.fill();
        }
        
        // Grass details
        ctx.fillStyle = '#66bb6a';
        for (let i = 0; i < Math.max(4, Math.floor(size * 0.5)); i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, Math.max(1, size / 8));
        }
    }

    drawCoastalForestTile(ctx, x, y, size, detailNoise) {
        // Coastal forest base (mixed grass/sand)
        ctx.fillStyle = '#7cb342';
        ctx.fillRect(x, y, size, size);
        
        // Coastal trees (adapted to salt air)
        const treeCount = Math.max(2, Math.floor(size / 10));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            const treeHeight = Math.max(3, size / 6);
            
            // Weathered trunk
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            // Wind-bent coastal conifer
            ctx.fillStyle = '#388e3c';
            ctx.beginPath();
            ctx.moveTo(treeX + size/20, treeY - treeHeight * 1.4); // Slightly bent
            ctx.lineTo(treeX - size/12, treeY - 1);
            ctx.lineTo(treeX + size/8, treeY - 1);
            ctx.closePath();
            ctx.fill();
        }
        
        // Coastal vegetation
        if (detailNoise > 0.1) {
            const coastalColors = ['#8bc34a', '#cddc39', '#ffeb3b'];
            ctx.fillStyle = coastalColors[Math.floor(Math.random() * coastalColors.length)];
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.3, Math.max(1, size / 16), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawDeciduousForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Deciduous trees with seasonal variation (mobile optimized)
        const treeCount = Math.max(2, Math.floor(size / 10));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            const treeHeight = Math.max(3, size / 6);
            
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            const leafColors = ['#32cd32', '#90ee90', '#ffff00', '#ffa500'];
            ctx.fillStyle = leafColors[Math.floor(Math.random() * leafColors.length)];
            ctx.beginPath();
            ctx.arc(treeX, treeY - treeHeight/2, Math.max(2, size / 10), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawMixedForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(x, y, size, size);
        
        // Mixed forest (both conifer and deciduous) (mobile optimized)
        const treeCount = Math.max(2, Math.floor(size / 12));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/3 + Math.random() * size/3;
            const treeHeight = Math.max(3, size / 6);
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            if (i % 2 === 0) {
                // Conifer
                ctx.fillStyle = '#228b22';
                ctx.beginPath();
                ctx.moveTo(treeX, treeY - treeHeight * 1.5);
                ctx.lineTo(treeX - size/12, treeY - 1);
                ctx.lineTo(treeX + size/12, treeY - 1);
                ctx.closePath();
                ctx.fill();
            } else {
                // Deciduous
                ctx.fillStyle = '#32cd32';
                ctx.beginPath();
                ctx.arc(treeX, treeY - treeHeight/2, Math.max(2, size / 12), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawAlpineForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2f4f2f';
        ctx.fillRect(x, y, size, size);
        
        // Alpine trees (hardy conifers) (mobile optimized)
        const treeCount = Math.max(1, Math.floor(size / 12));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            const treeHeight = Math.max(2, size / 8);
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            ctx.fillStyle = '#006400';
            ctx.beginPath();
            ctx.moveTo(treeX, treeY - treeHeight * 1.5);
            ctx.lineTo(treeX - size/16, treeY - 1);
            ctx.lineTo(treeX + size/16, treeY - 1);
            ctx.closePath();
            ctx.fill();
        }
        
        // Alpine flowers
        if (detailNoise > 0.3) {
            const colors = ['#ff69b4', '#9370db', '#00bfff'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            ctx.arc(x + size * 0.7, y + size * 0.8, Math.max(1, size / 20), 0, Math.PI);
            ctx.fill();
        }
    }
    
    drawMountainForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Mountain forest (mixed trees) (mobile optimized)
        const treeCount = Math.max(1, Math.floor(size / 10));
        for (let i = 0; i < treeCount; i++) {
            const treeX = x + (i % 2) * size/2 + Math.random() * size/3;
            const treeY = y + Math.floor(i / 2) * size/2 + Math.random() * size/3;
            const treeHeight = Math.max(3, size / 6);
            
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(treeX - 1, treeY, 1, treeHeight);
            
            if (Math.random() > 0.5) {
                // Conifer
                ctx.fillStyle = '#006400';
                ctx.beginPath();
                ctx.moveTo(treeX, treeY - treeHeight * 1.5);
                ctx.lineTo(treeX - size/12, treeY - 1);
                ctx.lineTo(treeX + size/12, treeY - 1);
                ctx.closePath();
                ctx.fill();
            } else {
                // Deciduous
                ctx.fillStyle = '#32cd32';
                ctx.beginPath();
                ctx.arc(treeX, treeY - treeHeight/2, Math.max(2, size / 12), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawSnowPeakTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#fffafa';
        ctx.fillRect(x, y, size, size);
        
        // Mountain peak shape (mobile optimized)
        ctx.fillStyle = '#f0f8ff';
        ctx.beginPath();
        ctx.moveTo(x + size/2, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x + size, y + size);
        ctx.closePath();
        ctx.fill();
        
        // Snow drifts
        ctx.fillStyle = '#ffffff';
        const driftCount = Math.max(2, Math.floor(size / 6));
        for (let i = 0; i < driftCount; i++) {
            const driftX = x + Math.random() * size;
            const driftY = y + Math.random() * size;
            const driftSize = Math.max(1, size / 12);
            ctx.beginPath();
            ctx.ellipse(driftX, driftY, driftSize, driftSize/2, Math.random() * Math.PI, 0, Math.PI * 2);
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
        
        // Rocky peak formations (mobile optimized)
        ctx.fillStyle = '#757575';
        const rockCount = Math.max(1, Math.floor(size / 10));
        for (let i = 0; i < rockCount; i++) {
            const rockX = x + (i % 2) * size/2 + Math.random() * size/2;
            const rockY = y + Math.floor(i / 2) * size/2 + Math.random() * size/2;
            const rockSize = Math.max(2, 2 + Math.random() * (size / 8));
            
            // Main rock formation
            ctx.beginPath();
            ctx.moveTo(rockX, rockY);
            ctx.lineTo(rockX + rockSize * 0.6, rockY - rockSize);
            ctx.lineTo(rockX + rockSize, rockY - rockSize * 0.3);
            ctx.lineTo(rockX + rockSize * 1.2, rockY);
            ctx.closePath();
            ctx.fill();
        }
        
        // Snow caps on high peaks
        if (detailNoise > 0.3) {
            ctx.fillStyle = '#fafafa';
            ctx.beginPath();
            ctx.arc(x + size * 0.3, y + size * 0.2, Math.max(1, size / 20), 0, Math.PI);
            ctx.fill();
        }
    }
    
    drawRockySlopeTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#a9a9a9';
        ctx.fillRect(x, y, size, size);
        
        // Sloped rocky terrain (mobile optimized)
        ctx.fillStyle = '#696969';
        const rockCount = Math.max(2, Math.floor(size / 8));
        for (let i = 0; i < rockCount; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            const rockSize = Math.max(1, 1 + Math.random() * (size / 8));
            ctx.beginPath();
            ctx.ellipse(rockX, rockY, rockSize, rockSize/2, Math.PI/4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Scree (loose rock)
        ctx.fillStyle = '#778899';
        const screeCount = Math.max(3, Math.floor(size / 6));
        for (let i = 0; i < screeCount; i++) {
            const screeX = x + Math.random() * size;
            const screeY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(screeX, screeY, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawAlpineMeadowTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#adff2f';
        ctx.fillRect(x, y, size, size);
        
        // Alpine grass (mobile optimized)
        ctx.fillStyle = '#7cfc00';
        const grassCount = Math.max(5, Math.floor(size * 0.6));
        for (let i = 0; i < grassCount; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, Math.max(1, size / 10));
        }
        
        // Mountain flowers
        const flowers = ['#ff1493', '#ffd700', '#ff69b4', '#dda0dd', '#00bfff'];
        const flowerCount = Math.max(2, Math.floor(size / 8));
        for (let i = 0; i < flowerCount; i++) {
            ctx.fillStyle = flowers[Math.floor(Math.random() * flowers.length)];
            const flowerX = x + Math.random() * size;
            const flowerY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(flowerX, flowerY, Math.max(1, size / 16), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawMountainStreamTile(ctx, x, y, size) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Mountain stream (mobile optimized)
        ctx.strokeStyle = '#87ceeb';
        ctx.lineWidth = Math.max(1, size / 8);
        ctx.beginPath();
        ctx.moveTo(x, y + size/4);
        ctx.quadraticCurveTo(x + size/2, y + size/2, x + size, y + 3*size/4);
        ctx.stroke();
        
        // Stream bed
        ctx.strokeStyle = '#4682b4';
        ctx.lineWidth = Math.max(1, size / 12);
        ctx.beginPath();
        ctx.moveTo(x, y + size/4);
        ctx.quadraticCurveTo(x + size/2, y + size/2, x + size, y + 3*size/4);
        ctx.stroke();
        
        // Stream rocks
        ctx.fillStyle = '#696969';
        const rockCount = Math.max(1, Math.floor(size / 10));
        for (let i = 0; i < rockCount; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(rockX, rockY, Math.max(1, size / 16), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawRiverTile(ctx, x, y, size) {
        ctx.fillStyle = '#32cd32';
        ctx.fillRect(x, y, size, size);
        
        // River water (mobile optimized)
        ctx.strokeStyle = '#4169e1';
        ctx.lineWidth = Math.max(2, size / 6);
        ctx.beginPath();
        ctx.moveTo(x, y + size/3);
        ctx.quadraticCurveTo(x + size/2, y + 2*size/3, x + size, y + size/2);
        ctx.stroke();
        
        // River banks
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = Math.max(1, size / 16);
        ctx.beginPath();
        ctx.moveTo(x, y + size/3 - 2);
        ctx.quadraticCurveTo(x + size/2, y + 2*size/3 - 2, x + size, y + size/2 - 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + size/3 + 2);
        ctx.quadraticCurveTo(x + size/2, y + 2*size/3 + 2, x + size, y + size/2 + 2);
        ctx.stroke();
    }
    
    drawDryGrasslandTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#daa520';
        ctx.fillRect(x, y, size, size);
        
        // Dry grass (mobile optimized)
        ctx.fillStyle = '#b8860b';
        const grassCount = Math.max(6, Math.floor(size * 0.8));
        for (let i = 0; i < grassCount; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, Math.max(1, size / 8));
        }
        
        // Scattered wildflowers
        if (detailNoise > 0.4) {
            const colors = ['#ff69b4', '#dda0dd'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            ctx.arc(x + size * 0.6, y + size * 0.4, Math.max(1, size / 16), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawFloweringMeadowTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#90ee90';
        ctx.fillRect(x, y, size, size);
        
        // Meadow grass (mobile optimized)
        ctx.fillStyle = '#32cd32';
        const grassCount = Math.max(5, Math.floor(size * 0.6));
        for (let i = 0; i < grassCount; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, Math.max(1, size / 10));
        }
        
        // Abundant wildflowers
        const flowers = ['#ff1493', '#ffd700', '#ff69b4', '#dda0dd', '#00bfff'];
        const flowerCount = Math.max(3, Math.floor(size / 6));
        for (let i = 0; i < flowerCount; i++) {
            ctx.fillStyle = flowers[Math.floor(Math.random() * flowers.length)];
            const flowerX = x + Math.random() * size;
            const flowerY = y + Math.random() * size;
            ctx.beginPath();
            ctx.arc(flowerX, flowerY, Math.max(1, size / 16), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawCoastalGrassTile(ctx, x, y, size, moisture) {
        // Coastal grass with salt-tolerant characteristics
        const baseColor = moisture > 0.5 ? '#9ccc65' : '#8bc34a';
        const lightColor = moisture > 0.5 ? '#aed581' : '#9ccc65';
        const darkColor = '#689f38';
        
        // Base gradient
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size);
        gradient.addColorStop(0, lightColor);
        gradient.addColorStop(0.7, baseColor);
        gradient.addColorStop(1, darkColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Coastal grass patches (hardy, wind-bent)
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = darkColor;
        for (let i = 0; i < Math.max(3, Math.floor(size / 5)); i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            const grassSize = Math.max(1, 1 + Math.random() * 2);
            // Slightly bent grass (coastal wind effect)
            ctx.fillRect(grassX, grassY, grassSize, Math.max(2, size / 6));
            ctx.fillRect(grassX + 1, grassY - 1, 1, Math.max(1, size / 8));
        }
        ctx.globalAlpha = 1;
        
        // Salt-resistant plants
        if (moisture < 0.4 && Math.random() < 0.15) {
            ctx.fillStyle = '#cddc39';
            const plantX = x + size * 0.3 + Math.random() * size * 0.4;
            const plantY = y + size * 0.3 + Math.random() * size * 0.4;
            ctx.beginPath();
            ctx.arc(plantX, plantY, Math.max(1, size / 20), 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Occasional driftwood or beach debris
        if (Math.random() < 0.08) {
            ctx.fillStyle = '#8d6e63';
            ctx.fillRect(x + size * 0.6, y + size * 0.7, Math.max(2, size / 8), Math.max(1, size / 16));
        }
    }
    
    drawTerrainDetails(ctx, tileType, x, y, size, detailNoise) {
        ctx.globalAlpha = 0.4;
        
        // Add ambient details based on terrain type
        switch(tileType) {
            case 'grass':
                if (Math.random() < 0.3) {
                    ctx.fillStyle = '#2e7d32';
                    ctx.fillRect(x + Math.random() * size, y + Math.random() * size, 1, 1);
                }
                break;
            case 'conifer_forest':
            case 'dense_conifer_forest':
                if (Math.random() < 0.2) {
                    ctx.fillStyle = '#3e2723';
                    ctx.fillRect(x + Math.random() * size, y + Math.random() * size, 1, 2);
                }
                break;
        }
        
        ctx.globalAlpha = 1;
    }
    
    unloadDistantChunks(centerChunkX, centerChunkY) {
        const unloadDistance = this.chunkLoadRadius + 1;
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
    
    initializeChunkFogOfWar(chunkX, chunkY) {
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        
        const fogCanvas = document.createElement('canvas');
        fogCanvas.width = this.chunkSize;
        fogCanvas.height = this.chunkSize;
        const fogCtx = fogCanvas.getContext('2d');
        
        fogCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        fogCtx.fillRect(0, 0, this.chunkSize, this.chunkSize);
        
        this.fogOfWar.set(chunkKey, { canvas: fogCanvas, ctx: fogCtx });
    }
    
    spawnInitialScout() {
        const scout = {
            x: this.camera.x + this.canvas.width / (2 * this.camera.scale),
            y: this.camera.y + this.canvas.height / (2 * this.camera.scale),
            speed: 20,
            target: null,
            exploring: false,
            health: 100,
            range: 40
        };
        
        this.scouts.push(scout);
        this.revealArea(scout.x, scout.y, 60);
    }
    
    revealArea(x, y, radius) {
        const chunkCoords = this.getChunkCoords(x, y);
        const chunkKey = this.getChunkKey(chunkCoords.x, chunkCoords.y);
        const fogData = this.fogOfWar.get(chunkKey);
        
        if (!fogData) return;
        
        this.revealAnimations.push({
            x, y, radius: 0, targetRadius: radius,
            startTime: Date.now(),
            duration: 800,
            chunkX: chunkCoords.x,
            chunkY: chunkCoords.y
        });
    }
    
    resetGameProgress() {
        try {
            this.playMobileSound('viking_horn', 0.8);
            
            this.resources = { food: 100, wood: 50, iron: 25, gold: 10 };
            this.population = 5;
            this.buildings = [];
            this.camera = { x: 0, y: 0, scale: 1 };
            this.scouts = [];
            this.exploredAreas.clear();
            this.revealAnimations = [];
            this.loadedChunks.clear();
            this.fogOfWar.clear();
            this.seed = Math.random() * 10000;
            
            this.loadNearbyChunks();
            this.spawnInitialScout();
            
            this.updateMobileResourceDisplay();
            this.updateMobilePopulationDisplay();
            this.updateMobileStatsDisplay();
            
            this.cancelMobilePlacement();
            
            // Do NOT clear persistent stats; keep across new territory
            // localStorage.removeItem(this.persistentStatsKey); // intentionally not called
            
            // Clear mobile save data
            localStorage.removeItem(this.saveKey);
            localStorage.removeItem(this.backupKey);
        } catch (error) {
            console.error('Failed to reset mobile game:', error);
            this.showMobileNotification('Reset failed, please refresh', 'error');
        }
    }
    
    restoreFogOfWar() {
        // Simplified fog restoration for mobile
        for (const areaKey of this.exploredAreas) {
            const [tileX, tileY] = areaKey.split(',').map(Number);
            this.revealArea(tileX, tileY, 30);
        }
    }
    
    preloadSprites() {
        const types = ['longhouse','farm','lumbermill','blacksmith','tradingpost','temple'];
        types.forEach(t => {
            const data = this.getBuildingData(t);
            if (data?.sprite) this.loadSprite(data.sprite);
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
            const entry = this.spriteCache[src];
            if (entry.retries < 3) {
                entry.retries++;
                setTimeout(() => { img.src = resolved + (resolved.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 300 * entry.retries);
            }
        };
        img.src = resolved;
    }
    
    computeChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
        return hash.toString();
    }
    
    getDayNightInfo() {
        const cycleProgress = (this.gameTime % this.dayLength) / this.dayLength;
        const sunAngle = cycleProgress * Math.PI * 2; // 0..2π
        const sunAltitude = Math.sin(sunAngle - Math.PI / 2); // -1..1
        const daylight = Math.max(0, sunAltitude);
        const lightLevel = 0.25 + 0.75 * daylight; // slightly brighter baseline for mobile
        let phase = daylight === 0 ? 'night' : (daylight < 0.25 ? 'dawn' : (daylight > 0.75 ? 'dusk' : 'day'));
        const sunX = Math.cos(sunAngle);
        const sunY = sunAltitude;
        let ambientColor = phase === 'dawn' ? `rgba(255,180,120,${lightLevel*0.06})` :
                      phase === 'day'  ? `rgba(255,255,220,${lightLevel*0.03})` :
                      phase === 'dusk' ? `rgba(255,120,80,${lightLevel*0.10})` :
                                          `rgba(60,60,120,${0.28 - lightLevel*0.20})`;
        const sunColor = phase === 'dawn' ? `rgba(255,200,100,${lightLevel*0.2})` :
                     phase === 'day'  ? `rgba(255,255,200,${lightLevel*0.12})` :
                     phase === 'dusk' ? `rgba(255,150,80,${lightLevel*0.28})` :
                                        `rgba(180,180,255,0.06)`;
        return { phase, lightLevel, cycleProgress, sunAngle, sunX, sunY, ambientColor, sunColor };
    }
    
    update(deltaTime) {
        // Update game time for day/night cycle
        this.gameTime += (deltaTime / 1000) * this.timeSpeed;
        
        this.loadNearbyChunks();
        
        const now = Date.now();
        this.buildings.forEach(building => {
            const timeSince = now - building.lastUpdate;
            if (timeSince > 3000) {
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
                            const color = resource === 'food' ? '#66bb6a' : resource === 'wood' ? '#a1887f' : resource === 'iron' ? '#b0bec5' : resource === 'gold' ? '#ffd54f' : '#ffffff';
                            this.addProductionPopup(building, `+${amount} ${resource}`, color);
                        }
                    }
                    
                    if (producedSomething && Math.random() < 0.2) {
                        this.playMobileSound('resource_collect', 0.3);
                    }
                }
                building.lastUpdate = now;
            }
        });
        
        // Update lightning system
        this.updateLightning(deltaTime);
        
        this.updateScouts(deltaTime);
        this.updateRevealAnimations();
        
        this.updateMobileResourceDisplay();
        this.updateMobilePopulationDisplay();
    }
    
    updateLightning(deltaTime) {
        const now = Date.now();
        const dayNightInfo = this.getDayNightInfo();
        
        // Determine lightning chance based on conditions
        let lightningChance = this.lightningSystem.normalChance;
        if (dayNightInfo.phase === 'night' || dayNightInfo.phase === 'dusk') {
            lightningChance *= 1.5; // Less dramatic increase for mobile
        }
        
        // Simple weather simulation
        const weatherNoise = this.seededNoise(now * 0.0001, this.seed);
        const isStormy = weatherNoise > 0.4; // Higher threshold for mobile
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
        // Random position in visible area (mobile optimized)
        const screenBounds = {
            left: this.camera.x,
            right: this.camera.x + this.canvas.width / this.camera.scale,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height / this.camera.scale
        };
        
        const startX = screenBounds.left + Math.random() * (screenBounds.right - screenBounds.left);
        const startY = screenBounds.top - 150; // Start above visible area
        const endX = startX + (Math.random() - 0.5) * 200; // Less variance for mobile
        const endY = screenBounds.bottom + 50; // End below visible area
        
        // Play thunder with mobile-optimized delay
        if (Math.random() < 0.5) { // Less frequent for mobile
            setTimeout(() => {
                this.playMobileSound('thunder_distant', 0.4);
            }, 500 + Math.random() * 1500);
        }
        
        // Create lightning bolt (simplified for mobile)
        const lightning = {
            segments: this.generateLightningPath(startX, startY, endX, endY),
            branches: this.generateLightningBranches(startX, startY, endX, endY),
            color: `hsl(${200 + Math.random() * 60}, 100%, ${80 + Math.random() * 20}%)`,
            width: 2 + Math.random() * 3, // Thinner for mobile
            alpha: 1,
            age: 0,
            duration: 150 + Math.random() * 200, // Shorter duration
            flash: {
                intensity: 0.6 + Math.random() * 0.3, // Less intense flash
                duration: 80 + Math.random() * 80,
                age: 0
            }
        };
        
        this.lightningSystem.strikes.push(lightning);
        
        // Optional haptic feedback for mobile
        if ('vibrate' in navigator) {
            navigator.vibrate(50); // Short vibration
        }
    }
    
    generateLightningPath(startX, startY, endX, endY) {
        const segments = [];
        const numSegments = 12 + Math.floor(Math.random() * 10); // Fewer segments for mobile
        
        let currentX = startX;
        let currentY = startY;
        
        for (let i = 0; i < numSegments; i++) {
            const progress = i / numSegments;
            const targetX = startX + (endX - startX) * progress;
            const targetY = startY + (endY - startY) * progress;
            
            // Reduced jitter for mobile performance
            const jitterX = (Math.random() - 0.5) * 30 * (1 - progress * 0.5);
            const jitterY = (Math.random() - 0.5) * 20;
            
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
        const numBranches = 1 + Math.floor(Math.random() * 2); // Fewer branches for mobile
        
        for (let i = 0; i < numBranches; i++) {
            const branchPoint = 0.3 + Math.random() * 0.4;
            const branchStartX = mainStartX + (mainEndX - mainStartX) * branchPoint;
            const branchStartY = mainStartY + (mainEndY - mainStartY) * branchPoint;
            
            const branchAngle = (Math.random() - 0.5) * Math.PI * 0.6;
            const branchLength = 60 + Math.random() * 120; // Shorter branches
            
            const branchEndX = branchStartX + Math.cos(branchAngle) * branchLength;
            const branchEndY = branchStartY + Math.sin(branchAngle) * branchLength;
            
            const branchSegments = this.generateLightningPath(branchStartX, branchStartY, branchEndX, branchEndY);
            branches.push({
                segments: branchSegments.slice(0, Math.max(3, branchSegments.length / 3)), // Much shorter
                alpha: 0.5 + Math.random() * 0.3
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
            this.ctx.shadowBlur = 6; // Reduced blur for mobile
            
            // Render main lightning bolt
            this.ctx.beginPath();
            lightning.segments.forEach((segment, index) => {
                if (index === 0) {
                    this.ctx.moveTo(segment.startX, segment.startY);
                }
                this.ctx.lineTo(segment.endX, segment.endY);
            });
            this.ctx.stroke();
            
            // Render branches (simplified)
            lightning.branches.forEach(branch => {
                this.ctx.globalAlpha = lightning.alpha * branch.alpha;
                this.ctx.lineWidth = lightning.width * 0.5;
                
                this.ctx.beginPath();
                branch.segments.forEach((segment, index) => {
                    if (index === 0) {
                        this.ctx.moveTo(segment.startX, segment.startY);
                    }
                    this.ctx.lineTo(segment.endX, segment.endY);
                });
                this.ctx.stroke();
            });
            
            // Screen flash effect (reduced for mobile)
            if (lightning.flash.age < lightning.flash.duration) {
                const flashAlpha = (1 - (lightning.flash.age / lightning.flash.duration)) * lightning.flash.intensity * 0.2;
                
                this.ctx.save();
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = flashAlpha;
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.restore();
                
                lightning.flash.age += 16;
            }
        });
        
        this.ctx.restore();
    }
    
    renderSunRays(dayNightInfo) {
        if (dayNightInfo.phase === 'night') return;
        
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Sun position on screen
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 3;
        
        // Create sun rays gradient
        const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(this.canvas.width, this.canvas.height));
        gradient.addColorStop(0, dayNightInfo.sunColor);
        gradient.addColorStop(0.3, `rgba(255, 220, 150, ${dayNightInfo.lightLevel * 0.02})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.restore();
    }
    
    applyDayNightLighting(dayNightInfo) {
        // Apply day/night overlay
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        if (dayNightInfo.phase === 'night') {
            // Night overlay
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = `rgba(80, 80, 150, ${0.7 - dayNightInfo.lightLevel * 0.3})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else if (dayNightInfo.phase === 'dawn' || dayNightInfo.phase === 'dusk') {
            // Twilight overlay
            const twilightColor = dayNightInfo.phase === 'dawn' ? 
                `rgba(255, 180, 120, ${0.2 - dayNightInfo.lightLevel * 0.1})` :
                `rgba(255, 120, 80, ${0.25 - dayNightInfo.lightLevel * 0.1})`;
            
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = twilightColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        this.ctx.restore();
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const dayNightInfo = this.getDayNightInfo();
        
        this.ctx.save();
        this.ctx.scale(this.camera.scale, this.camera.scale);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        this.renderTerrain();
        this.renderBuildings();
        this.renderScouts();
        this.renderLightning();
        this.renderFogOfWar();
        this.renderProductionPopups();
        
        this.ctx.restore();
        
        // Apply day/night lighting
        this.applyDayNightLighting(dayNightInfo);
        
        // Render sun rays
        this.renderSunRays(dayNightInfo);
        
        // Mobile time display in status bar
        this.renderMobileTimeDisplay(dayNightInfo);
    }
    
    renderMobileTimeDisplay(dayNightInfo) {
        const timePercent = (this.gameTime % this.dayLength) / this.dayLength;
        
        let timeString = '';
        if (timePercent < 0.25) {
            const nightProgress = timePercent / 0.25;
            const hour = Math.floor(21 + nightProgress * 9) % 24;
            timeString = `${hour.toString().padStart(2, '0')}:00`;
        } else if (timePercent < 0.5) {
            const morningProgress = (timePercent - 0.25) / 0.25;
            const hour = Math.floor(6 + morningProgress * 6);
            timeString = `${hour.toString().padStart(2, '0')}:00`;
        } else if (timePercent < 0.75) {
            const dayProgress = (timePercent - 0.5) / 0.25;
            const hour = Math.floor(12 + dayProgress * 6);
            timeString = `${hour.toString().padStart(2, '0')}:00`;
        } else {
            const eveningProgress = (timePercent - 0.75) / 0.25;
            const hour = Math.floor(18 + eveningProgress * 3);
            timeString = `${hour.toString().padStart(2, '0')}:00`;
        }
        
        // Update DOM element for mobile time display
        const timeElement = document.getElementById('mobileTime');
        if (timeElement) {
            timeElement.textContent = `${dayNightInfo.phase} ${timeString}`;
        }
    }
    
    renderBuildings() {
        this.buildings.forEach(building => {
            // Building shadow
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.fillRect(building.x + 2, building.y + 2, building.size, building.size);
            
            // Use cached sprite
            if (building.sprite) {
                if (!this.spriteCache[building.sprite]) this.loadSprite(building.sprite);
                building.spriteImage = this.spriteCache[building.sprite]?.img;
            }
            if (building.spriteImage && this.spriteCache[building.sprite]?.loaded) {
                this.ctx.drawImage(building.spriteImage, building.x, building.y, building.size, building.size);
            } else {
                // Fallback rendering while sprite loads
                this.ctx.fillStyle = '#8b4513';
                this.ctx.fillRect(building.x, building.y, building.size, building.size);
                
                // Building icon as fallback
                this.ctx.fillStyle = '#f0f0f0';
                this.ctx.font = `${building.size * 0.6}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(
                    building.icon || '🏘️',
                    building.x + building.size / 2,
                    building.y + building.size * 0.7
                );
            }
        });
    }
    
    renderScouts() {
        this.scouts.forEach(scout => {
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.beginPath();
            this.ctx.arc(scout.x + 1, scout.y + 1, 6, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = scout.exploring ? '#ff5722' : '#2196f3';
            this.ctx.beginPath();
            this.ctx.arc(scout.x, scout.y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('👤', scout.x, scout.y + 3);
        });
    }
    
    renderFogOfWar() {
        const viewBounds = {
            left: this.camera.x,
            right: this.camera.x + this.canvas.width / this.camera.scale,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height / this.camera.scale
        };
        
        for (const [chunkKey, chunk] of this.loadedChunks) {
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
    }
    
    renderProductionPopups() {
        const now = Date.now();
        this.productionPopups = (this.productionPopups || []).filter(p => {
            const t = (now - p.start) / p.duration; if (t >= 1) return false;
            const alpha = 1 - t, y = p.y - t * 18;
            this.ctx.save();
            this.ctx.font = '10px Space Mono';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.globalAlpha = alpha * 0.8; this.ctx.fillStyle = 'rgba(0,0,0,0.6)'; this.ctx.fillText(p.text, p.x + 1, y + 1);
            this.ctx.globalAlpha = alpha; this.ctx.fillStyle = p.color; this.ctx.fillText(p.text, p.x, y);
            this.ctx.restore();
            return true;
        });
    }
    
    addProductionPopup(building, text, color = '#ffffff') {
        this.productionPopups = this.productionPopups || [];
        this.productionPopups.push({ x: building.x + building.size / 2, y: building.y - 6, text, color, start: Date.now(), duration: 900 });
    }
    
    renderTerrain() {
        const v = { l: this.camera.x, r: this.camera.x + this.canvas.width / this.camera.scale, t: this.camera.y, b: this.camera.y + this.canvas.height / this.camera.scale };
        for (const [chunkKey, chunk] of this.loadedChunks) {
            if (chunk.worldX + this.chunkSize < v.l || chunk.worldX > v.r || chunk.worldY + this.chunkSize < v.t || chunk.worldY > v.b) continue;
            this.ctx.drawImage(chunk.textureCanvas, chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
            this.ctx.drawImage(chunk.detailCanvas,  chunk.worldX, chunk.worldY, this.chunkSize + 1, this.chunkSize + 1);
        }
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
    
    takeMobilePhoto() {
        try {
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = this.canvas.width;
            exportCanvas.height = this.canvas.height;
            const ex = exportCanvas.getContext('2d');
            ex.drawImage(this.canvas, 0, 0);

            const pad = 12;
            const text = `Jarl ${this.kingName} • ${new Date().toLocaleString()}`;
            ex.save();
            ex.font = '16px Space Mono';
            ex.textAlign = 'right';
            ex.textBaseline = 'bottom';
            const metrics = ex.measureText(text);
            const boxW = metrics.width + 14;
            const boxH = 26;
            ex.fillStyle = 'rgba(0,0,0,0.5)';
            ex.fillRect(exportCanvas.width - boxW - pad, exportCanvas.height - boxH - pad, boxW, boxH);
            ex.fillStyle = '#ffffff';
            ex.fillText(text, exportCanvas.width - pad - 7, exportCanvas.height - pad - 6);
            ex.restore();

            exportCanvas.toBlob(async (blob) => {
                if (!blob) return;
                try {
                    if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'viking.png', { type: 'image/png' })] })) {
                        const file = new File([blob], 'viking_photo.png', { type: 'image/png' });
                        await navigator.share({ files: [file], title: 'Viking Settlement Tycoon', text: `Jarl ${this.kingName}` });
                        this.showMobileNotification('Photo shared!', 'success');
                        return;
                    }
                } catch {}
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeName = (this.kingName || 'Jarl').replace(/[^a-z0-9_-]+/gi, '_');
                a.download = `VikingTycoon_${safeName}_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                this.showMobileNotification('Photo saved!', 'success');
            }, 'image/png');
        } catch (e) {
            console.error('Photo export failed', e);
            this.showMobileNotification('Failed to save photo', 'error');
        }
    }
    
    exportMobileSaveTxt() {
        try {
            if (!localStorage.getItem(this.saveKey)) this.saveMobileGame();
            const raw = localStorage.getItem(this.saveKey) || '{}';
            const b64 = this.encodeB64(raw);
            const blob = new Blob([b64], { type: 'text/plain' });
            const a = document.createElement('a');
            a.download = `VikingTycoon_MobileSave_${Date.now()}.txt`;
            a.href = URL.createObjectURL(blob);
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 0);
            this.showMobileNotification('Exported save to TXT', 'success');
        } catch { this.showMobileNotification('Export failed', 'error'); }
    }
    
    importMobileSaveTxt() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.txt,text/plain';
        input.onchange = async () => {
            try {
                const file = input.files?.[0]; if (!file) return;
                const text = await file.text();
                const jsonStr = this.decodeB64(text.trim());
                const parsed = JSON.parse(jsonStr);
                const valid = parsed && (parsed.data ? this.validateSaveData(parsed.data) : this.validateSaveData(parsed));
                if (!valid) throw new Error('invalid');
                localStorage.setItem(this.saveKey, jsonStr);
                localStorage.setItem(this.backupKey, jsonStr);
                this.showMobileNotification('Import successful - loading...', 'success');
                this.loadGame();
            } catch { this.showMobileNotification('Import failed', 'error'); }
        };
        input.click();
    }
    
    encodeB64(str) { return btoa(unescape(encodeURIComponent(str))); }
    decodeB64(b64) { return decodeURIComponent(escape(atob(b64))); }
    
    loadPersistentStats() {
        try { return JSON.parse(localStorage.getItem(this.persistentStatsKey)); } catch { return null; }
    }
    
    savePersistentStats() {
        try { localStorage.setItem(this.persistentStatsKey, JSON.stringify(this.settlementStatus)); } catch {}
    }
}

// Start the mobile game when page loads
window.addEventListener('load', () => {
    const game = new MobileVikingSettlementTycoon();
    
    // Auto-save every 2 minutes
    setInterval(() => {
        game.saveMobileGame();
    }, 120000);
    
    // Try to load saved game after initialization
    setTimeout(() => {
        game.loadGame();
    }, 100);
});