/* app.js */
/* Frontend Script for AnimeXin Cloned Portal */

// Global State
let allVideos = [];
let filteredVideos = [];
let activeFilter = 'All';
let isSyncing = false;
let syncIntervalId = null;
let catalogLayout = 'grid'; // 'grid' or 'list'

// DOM Elements
const logoBtn = document.getElementById('logo-btn');
const searchInput = document.getElementById('search-input');
const navAll = document.getElementById('nav-all');
const openSyncBtn = document.getElementById('open-sync-btn');
const closeSyncBtn = document.getElementById('close-sync-btn');
const syncOverlay = document.getElementById('sync-overlay');
const triggerSyncBtn = document.getElementById('trigger-sync-btn');

const syncBanner = document.getElementById('sync-banner');
const syncBannerText = document.getElementById('sync-banner-text');
const watchSection = document.getElementById('watch-section');
const playerContainer = document.getElementById('player-container');
const watchTitle = document.getElementById('watch-title');
const watchDate = document.getElementById('watch-date');
const mirrorSelect = document.getElementById('mirror-select');
const watchDescription = document.getElementById('watch-description');
const watchCategories = document.getElementById('watch-categories');
const sidebarList = document.getElementById('sidebar-list');

const catalogSection = document.getElementById('catalog-section');
const catalogHeading = document.getElementById('catalog-heading');
const catalogGrid = document.getElementById('catalog-grid');
const genreFilters = document.getElementById('genre-filters');
const layoutGridBtn = document.getElementById('layout-grid-btn');
const layoutListBtn = document.getElementById('layout-list-btn');

const dbCount = document.getElementById('db-count');
const syncStatusIndicator = document.getElementById('sync-status-indicator');
const lastSyncTime = document.getElementById('last-sync-time');
const consoleLog = document.getElementById('console-log');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadDatabase();
    setupEventListeners();
    checkSyncStatusOnStart();
});

// Load catalog data from local videos.json
async function loadDatabase() {
    try {
        const response = await fetch('videos.json?t=' + new Date().getTime());
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allVideos = await response.json();
        
        // Sort by publication date descending (newest first)
        allVideos.sort((a, b) => {
            const dateA = new Date(a.pubDate);
            const dateB = new Date(b.pubDate);
            return (isNaN(dateB.getTime()) ? 0 : dateB) - (isNaN(dateA.getTime()) ? 0 : dateA);
        });
        
        // Update database count
        dbCount.textContent = `${allVideos.length} Synced Videos`;
        
        // Extract filter tags
        generateFilterTags();
        
        // Render initial UI
        applyFiltersAndSearch();
        
        // Handle initial hash routing
        handleHashRoute();
    } catch (error) {
        console.error('Failed to load videos database:', error);
        catalogGrid.innerHTML = `
            <div class="loading-state">
                <p style="color: var(--danger)">❌ Failed to load local database.</p>
                <p style="font-size: 0.9rem">Run the Sync Hub to scrape initial videos from animexin.dev.</p>
            </div>
        `;
    }
}

// Generate category tags from the video list dynamically
function generateFilterTags() {
    const categoriesSet = new Set();
    allVideos.forEach(v => {
        if (v.categories && Array.isArray(v.categories)) {
            v.categories.forEach(c => {
                // Keep tags clean (avoid long tags or title tags)
                if (c && c.length < 25 && !c.includes('Episode') && !c.includes('Subtitle')) {
                    categoriesSet.add(c);
                }
            });
        }
    });

    const categories = ['All', ...Array.from(categoriesSet).sort()];
    
    genreFilters.innerHTML = '';
    categories.forEach(genre => {
        const badge = document.createElement('button');
        badge.className = `filter-badge ${genre === activeFilter ? 'active' : ''}`;
        badge.textContent = genre;
        badge.addEventListener('click', () => {
            document.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
            badge.classList.add('active');
            activeFilter = genre;
            applyFiltersAndSearch();
        });
        genreFilters.appendChild(badge);
    });
}

// Apply searches and filter badges
function applyFiltersAndSearch() {
    const keyword = searchInput.value.toLowerCase().trim();
    
    filteredVideos = allVideos.filter(video => {
        const matchesSearch = video.title.toLowerCase().includes(keyword) || 
                              (video.description && video.description.toLowerCase().includes(keyword));
        
        const matchesCategory = activeFilter === 'All' || 
                                (video.categories && video.categories.includes(activeFilter));
        
        return matchesSearch && matchesCategory;
    });

    renderCatalogGrid();
}

// Render cards grid
function renderCatalogGrid() {
    catalogGrid.innerHTML = '';
    
    if (catalogLayout === 'list') {
        catalogGrid.classList.add('list-view');
    } else {
        catalogGrid.classList.remove('list-view');
    }
    
    if (filteredVideos.length === 0) {
        catalogGrid.innerHTML = `
            <div class="loading-state">
                <p>🔍 No videos match your current search/filters.</p>
            </div>
        `;
        return;
    }
    
    filteredVideos.forEach((video, index) => {
        // Find index in main list for routing
        const mainIndex = allVideos.indexOf(video);
        
        const card = document.createElement('div');
        card.className = 'video-card';
        card.id = `video-card-${mainIndex}`;
        
        const badgeText = video.categories && video.categories.length > 0 ? video.categories[0] : 'Donghua';
        const formattedDate = formatDate(video.pubDate);
        
        card.innerHTML = `
            <div class="card-thumb-wrapper">
                <img src="${video.thumbnail || 'https://via.placeholder.com/350x220/0a0b10/d50000?text=FallenAnime'}" alt="${video.title}" loading="lazy">
                <span class="card-badge">${badgeText}</span>
            </div>
            <div class="card-details">
                <div class="card-time-badge">📅 ${formattedDate}</div>
                <h3 class="card-title">${video.title}</h3>
                <div class="card-meta">
                    <span>🔗 ${video.mirrors ? video.mirrors.length : 0} Mirrors</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            window.location.hash = `#watch?idx=${mainIndex}`;
        });
        
        catalogGrid.appendChild(card);
    });
}

// Handle Hash Routing
function handleHashRoute() {
    const hash = window.location.hash;
    if (hash.startsWith('#watch?idx=')) {
        const index = parseInt(hash.split('idx=')[1]);
        if (!isNaN(index) && allVideos[index]) {
            showWatchView(index, true);
            return;
        }
    }
    
    // Default: Show the latest episode player immediately without jumpy scroll
    if (allVideos.length > 0) {
        showWatchView(0, false);
    } else {
        hideWatchView();
    }
}

// Show watch view and render player
function showWatchView(index, scroll = true) {
    const video = allVideos[index];
    if (!video) return;

    // Show watch section, collapse catalog view spacing
    watchSection.style.display = 'block';
    catalogHeading.textContent = 'Browse More Episodes';
    
    // Scroll to player smooth if requested
    if (scroll) {
        watchSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Populate Details
    watchTitle.textContent = video.title;
    watchDate.textContent = `Published: ${formatDate(video.pubDate)}`;
    watchDescription.textContent = video.description || 'No synopsis details available.';
    
    // Highlight currently playing card in grid if visible
    document.querySelectorAll('.video-card').forEach(c => c.classList.remove('playing'));
    const activeCard = document.getElementById(`video-card-${index}`);
    if (activeCard) activeCard.classList.add('playing');

    // Populate Categories
    watchCategories.innerHTML = '';
    if (video.categories) {
        video.categories.forEach(c => {
            const tag = document.createElement('span');
            tag.className = 'category-tag';
            tag.textContent = c;
            watchCategories.appendChild(tag);
        });
    }

    // Populate Mirrors dropdown
    mirrorSelect.innerHTML = '';
    if (video.mirrors && video.mirrors.length > 0) {
        video.mirrors.forEach((mirror) => {
            const opt = document.createElement('option');
            opt.value = mirror.index;
            opt.textContent = mirror.label;
            mirrorSelect.appendChild(opt);
        });
        
        // Listen to mirror changes
        mirrorSelect.onchange = () => {
            const selectedIdx = mirrorSelect.value;
            const mirror = video.mirrors.find(m => m.index == selectedIdx);
            if (mirror) {
                loadMirrorPlayer(mirror);
            }
        };

        // Load first mirror as default
        loadMirrorPlayer(video.mirrors[0]);
    } else {
        playerContainer.innerHTML = `
            <div class="player-placeholder">
                <p style="color: var(--danger)">❌ No video stream mirrors found for this episode.</p>
            </div>
        `;
    }

    // Populate Sidebar playlist (Up Next)
    renderSidebarList(index);
}

// Hide watch section
function hideWatchView() {
    watchSection.style.display = 'none';
    catalogHeading.textContent = 'Latest Updates';
    playerContainer.innerHTML = `
        <div class="player-placeholder">
            <p>Select an episode or mirror to begin playback.</p>
        </div>
    `;
}

// Load mirror HTML/Iframe into container
function loadMirrorPlayer(mirror) {
    if (!mirror) return;
    
    // Inject mirror html safely
    if (mirror.embedHtml) {
        playerContainer.innerHTML = mirror.embedHtml;
    } else if (mirror.embedUrl) {
        playerContainer.innerHTML = `<iframe src="${mirror.embedUrl}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
    } else {
        playerContainer.innerHTML = `<div class="player-placeholder"><p>No play method available for this server.</p></div>`;
    }
}

// Render sidebar episodes list
function renderSidebarList(currentPlayingIdx) {
    sidebarList.innerHTML = '';
    
    // Show top 15 latest episodes, excluding the current one if desired, or keep it listed
    allVideos.slice(0, 15).forEach((video) => {
        const mainIndex = allVideos.indexOf(video);
        const isCurrent = mainIndex === currentPlayingIdx;
        
        const item = document.createElement('div');
        item.className = `sidebar-item ${isCurrent ? 'playing' : ''}`;
        
        item.innerHTML = `
            <div class="sidebar-item-thumb">
                <img src="${video.thumbnail}" alt="${video.title}">
            </div>
            <div class="sidebar-item-details">
                <h4 class="sidebar-item-title" style="${isCurrent ? 'color: var(--accent-blue)' : ''}">${video.title}</h4>
                <span class="sidebar-item-date">${formatDate(video.pubDate)}</span>
            </div>
        `;
        
        item.addEventListener('click', () => {
            window.location.hash = `#watch?idx=${mainIndex}`;
        });
        
        sidebarList.appendChild(item);
    });
}

// Format date nicely (RFC2822 to standard locale date/time string)
function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        const datePart = date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        
        const timePart = date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        return `${datePart} at ${timePart}`;
    } catch {
        return dateStr;
    }
}

// Set up UI Event listeners
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', applyFiltersAndSearch);
    
    // Logo / Brand clicks
    logoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        activeFilter = 'All';
        window.location.hash = '';
        loadDatabase(); // reload catalog fresh
    });
    
    navAll.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        activeFilter = 'All';
        window.location.hash = '';
        loadDatabase();
    });

    // Layout buttons
    layoutGridBtn.addEventListener('click', () => {
        if (catalogLayout === 'grid') return;
        catalogLayout = 'grid';
        layoutGridBtn.classList.add('active');
        layoutListBtn.classList.remove('active');
        renderCatalogGrid();
    });

    layoutListBtn.addEventListener('click', () => {
        if (catalogLayout === 'list') return;
        catalogLayout = 'list';
        layoutListBtn.classList.add('active');
        layoutGridBtn.classList.remove('active');
        renderCatalogGrid();
    });

    // Hash change router
    window.addEventListener('hashchange', handleHashRoute);
    
    // Modal controls
    openSyncBtn.addEventListener('click', () => {
        syncOverlay.classList.add('active');
    });
    
    closeSyncBtn.addEventListener('click', () => {
        syncOverlay.classList.remove('active');
    });
    
    syncOverlay.addEventListener('click', (e) => {
        if (e.target === syncOverlay) {
            syncOverlay.classList.remove('active');
        }
    });

    // Trigger Sync button
    triggerSyncBtn.addEventListener('click', triggerSync);
}

// Trigger background synchronization API
async function triggerSync() {
    if (isSyncing) return;
    
    logToConsole('[Client] Initiating sync request...');
    triggerSyncBtn.disabled = true;
    triggerSyncBtn.textContent = 'Syncing...';
    
    try {
        const res = await fetch('/api/sync');
        const data = await res.json();
        
        if (data.status === 'started' || data.status === 'running') {
            logToConsole(`[Server] ${data.message}`);
            startPollingSyncStatus();
        } else {
            logToConsole(`[Server] Unexpected status: ${data.status}. Msg: ${data.message}`);
            triggerSyncBtn.disabled = false;
            triggerSyncBtn.textContent = 'Sync New Videos Now';
        }
    } catch (error) {
        logToConsole(`[Error] Failed to connect to local server endpoint: ${error}`);
        triggerSyncBtn.disabled = false;
        triggerSyncBtn.textContent = 'Sync New Videos Now';
    }
}

// Check if a sync job is already active on page load
async function checkSyncStatusOnStart() {
    try {
        const res = await fetch('/api/sync-status');
        const data = await res.json();
        
        if (data.status === 'running') {
            logToConsole('[System] Detected active background synchronization job. Hooking up monitor...');
            startPollingSyncStatus();
        }
    } catch (e) {
        console.warn('Could not verify startup sync status:', e);
    }
}

// Start polling for sync completion
function startPollingSyncStatus() {
    isSyncing = true;
    syncBanner.style.display = 'block';
    syncStatusIndicator.innerHTML = '<span class="dot dot-orange"></span> Active (Syncing)';
    
    if (syncIntervalId) clearInterval(syncIntervalId);
    
    let dots = '';
    syncIntervalId = setInterval(async () => {
        try {
            const res = await fetch('/api/sync-status');
            const data = await res.json();
            
            // Console loading indicator
            dots = dots.length >= 3 ? '' : dots + '.';
            logToConsole(`[Sync Agent] Checking database updates${dots}`);
            
            if (data.status !== 'running') {
                clearInterval(syncIntervalId);
                isSyncing = false;
                syncBanner.style.display = 'none';
                triggerSyncBtn.disabled = false;
                triggerSyncBtn.textContent = 'Sync New Videos Now';
                syncStatusIndicator.innerHTML = '<span class="dot dot-green"></span> Idle (Standby)';
                
                const timeStr = new Date().toLocaleTimeString();
                lastSyncTime.textContent = timeStr;
                logToConsole(`[Sync Agent] Sync job finished with status: ${data.status.toUpperCase()} at ${timeStr}.`);
                
                // Reload catalog dynamic
                logToConsole('[System] Re-fetching videos.json to load new episodes...');
                await loadDatabase();
                logToConsole('[System] Database loaded and UI successfully refreshed!');
            }
        } catch (error) {
            console.error('Error polling sync status:', error);
        }
    }, 2000);
}

// Write to modal pseudo console logger
function logToConsole(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}\n`;
    consoleLog.textContent += line;
    consoleLog.scrollTop = consoleLog.scrollHeight;
}
