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

const scheduleSection = document.getElementById('schedule-section');
const popularSection = document.getElementById('popular-section');
const popularCarousel = document.getElementById('popular-carousel');

const dbCount = document.getElementById('db-count');
const syncStatusIndicator = document.getElementById('sync-status-indicator');
const lastSyncTime = document.getElementById('last-sync-time');
const consoleLog = document.getElementById('console-log');

const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatDrawer = document.getElementById('chat-drawer');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadDatabase();
    setupEventListeners();
    checkSyncStatusOnStart();
    
    // Admin mode check to display Sync Hub button
    if (window.location.search.includes('admin=true') || window.location.hash.includes('admin')) {
        if (openSyncBtn) openSyncBtn.style.display = 'inline-flex';
    } else {
        if (openSyncBtn) openSyncBtn.style.display = 'none';
    }
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

        // Render Popular Today carousel
        renderPopularCarousel();

        // Setup daily schedule buttons
        setupScheduleButtons();
        
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
                if (c && typeof c === 'string' && c.trim().length > 0 && c.length < 25 && !c.includes('Episode') && !c.includes('Subtitle')) {
                    categoriesSet.add(c.trim());
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
        const matchesSearch = !keyword || 
                              video.title.toLowerCase().includes(keyword) || 
                              (video.description && video.description.toLowerCase().includes(keyword));
        
        const matchesCategory = activeFilter === 'All' || 
                                (video.categories && video.categories.includes(activeFilter));
        
        // Filter by release day if active
        let matchesDay = true;
        if (activeScheduleDay) {
            matchesDay = video.pubDate && video.pubDate.includes(activeScheduleDay);
        }
        
        return matchesSearch && matchesCategory && matchesDay;
    });

    // If there is a search keyword, sort results by search relevance score
    if (keyword) {
        filteredVideos.sort((a, b) => {
            const scoreA = getSearchScore(a, keyword);
            const scoreB = getSearchScore(b, keyword);
            
            if (scoreB !== scoreA) {
                return scoreB - scoreA; // Higher relevance score first
            }
            
            // If scores are equal, keep newer publication date first
            const dateA = new Date(a.pubDate);
            const dateB = new Date(b.pubDate);
            return (isNaN(dateB.getTime()) ? 0 : dateB) - (isNaN(dateA.getTime()) ? 0 : dateA);
        });
    }

    renderCatalogGrid();
}

// Calculate search relevance score for ranking results
function getSearchScore(video, keyword) {
    const title = video.title.toLowerCase();
    const desc = video.description ? video.description.toLowerCase() : '';
    let score = 0;
    
    // 1. Exact title match (highest priority)
    if (title === keyword) {
        score += 200;
    }
    // 2. Title starts with keyword phrase
    else if (title.startsWith(keyword)) {
        score += 150;
    }
    // 3. Title contains full keyword phrase
    else if (title.includes(keyword)) {
        score += 100;
    }
    
    // 4. Word boundary matches (e.g. searching 'Episode 1' matches 'Episode 1' but scores higher than 'Episode 10')
    try {
        const escaped = escapeRegExp(keyword);
        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
        if (regex.test(title)) {
            score += 50;
        }
    } catch (e) {
        // Fallback if regex generation fails
    }
    
    // 5. Multi-term match (individual terms matching)
    const terms = keyword.split(/\s+/).filter(t => t.length > 1);
    let matchedTerms = 0;
    terms.forEach(term => {
        if (title.includes(term)) {
            matchedTerms++;
        }
    });
    if (terms.length > 0) {
        score += (matchedTerms / terms.length) * 30;
    }
    
    // 6. Description match (low priority helper)
    if (desc.includes(keyword)) {
        score += 10;
    }
    
    return score;
}

// Helper to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        
        const formattedDate = formatDate(video.pubDate);
        const epText = extractEpisodeText(video.title);
        
        card.innerHTML = `
            <div class="card-thumb-wrapper">
                <img src="${video.thumbnail || 'https://via.placeholder.com/350x220/0a0b10/d50000?text=FallenAnime'}" alt="${video.title}" loading="lazy">
                <span class="card-badge-top-left">ONA</span>
                <span class="card-badge-bottom-left">${epText}</span>
                <span class="card-badge-bottom-right">Sub</span>
            </div>
            <div class="card-details">
                <h3 class="card-title">${video.title}</h3>
                <div class="card-meta">
                    <span class="card-time-badge">📅 ${formattedDate}</span>
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
    
    // Default: Catalog View (Player hidden)
    hideWatchView();
}

// Show watch view and render player
function showWatchView(index, scroll = true) {
    const video = allVideos[index];
    if (!video) return;

    // Show watch section, collapse catalog view spacing
    watchSection.style.display = 'block';
    catalogHeading.textContent = 'Browse More Episodes';
    
    // Hide home sections
    scheduleSection.style.display = 'none';
    popularSection.style.display = 'none';
    
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
    if (video.categories && Array.isArray(video.categories)) {
        video.categories.forEach(c => {
            if (c && typeof c === 'string' && c.trim().length > 0) {
                const tag = document.createElement('span');
                tag.className = 'category-tag';
                tag.textContent = c.trim();
                watchCategories.appendChild(tag);
            }
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

        // Populate download/source links
        const downloadBox = document.getElementById('download-box');
        const downloadLinksGrid = document.getElementById('download-links-grid');
        if (downloadBox && downloadLinksGrid) {
            downloadLinksGrid.innerHTML = '';
            downloadBox.style.display = 'block';
            video.mirrors.forEach((mirror) => {
                const url = mirror.embedUrl || "";
                if (url) {
                    const link = document.createElement('a');
                    link.className = 'btn';
                    link.target = '_blank';
                    link.href = url;
                    link.style.fontSize = '0.85rem';
                    link.style.padding = '0.5rem 1rem';
                    link.style.borderRadius = '50px';
                    link.style.backgroundColor = 'var(--bg-tertiary)';
                    link.style.border = '1px solid var(--border-color)';
                    link.style.color = 'var(--text-primary)';
                    link.style.display = 'inline-flex';
                    link.style.alignItems = 'center';
                    link.style.gap = '6px';
                    link.style.transition = 'var(--transition)';
                    
                    let label = mirror.label || "Mirror";
                    let icon = "🔗";
                    if (label.toLowerCase().includes('mega')) {
                        icon = "🔴";
                    } else if (label.toLowerCase().includes('odysee')) {
                        icon = "🚀";
                    } else if (label.toLowerCase().includes('dailymotion')) {
                        icon = "📺";
                    } else if (label.toLowerCase().includes('ok.ru')) {
                        icon = "🆗";
                    } else if (label.toLowerCase().includes('rumble')) {
                        icon = "🟢";
                    } else if (label.toLowerCase().includes('streamwish')) {
                        icon = "✨";
                    } else if (label.toLowerCase().includes('dood')) {
                        icon = "🐶";
                    }
                    
                    link.innerHTML = `<span>${icon}</span> <span>Download (${label})</span>`;
                    
                    // Hover animation
                    link.onmouseenter = () => {
                        link.style.borderColor = 'var(--accent-red)';
                        link.style.boxShadow = '0 0 10px var(--accent-red-glow)';
                        link.style.transform = 'translateY(-2px)';
                    };
                    link.onmouseleave = () => {
                        link.style.borderColor = 'var(--border-color)';
                        link.style.boxShadow = 'none';
                        link.style.transform = 'translateY(0)';
                    };
                    
                    downloadLinksGrid.appendChild(link);
                }
            });
        // Populate share links
        const shareBox = document.getElementById('share-box');
        const shareLinksGrid = document.getElementById('share-links-grid');
        if (shareBox && shareLinksGrid) {
            shareLinksGrid.innerHTML = '';
            shareBox.style.display = 'block';
            
            const currentUrl = encodeURIComponent(window.location.href);
            const shareText = encodeURIComponent(`Watch ${video.title} on FallenAnime!`);
            
            const platforms = [
                {
                    name: 'WhatsApp',
                    icon: '💬',
                    url: `https://api.whatsapp.com/send?text=${shareText}%20${currentUrl}`,
                    color: '#25D366'
                },
                {
                    name: 'Telegram',
                    icon: '✈️',
                    url: `https://t.me/share/url?url=${currentUrl}&text=${shareText}`,
                    color: '#0088cc'
                },
                {
                    name: 'Twitter / X',
                    icon: '🐦',
                    url: `https://twitter.com/intent/tweet?text=${shareText}&url=${currentUrl}`,
                    color: '#1DA1F2'
                },
                {
                    name: 'Facebook',
                    icon: '👥',
                    url: `https://www.facebook.com/sharer/sharer.php?u=${currentUrl}`,
                    color: '#1877F2'
                }
            ];
            
            platforms.forEach(p => {
                const link = document.createElement('a');
                link.className = 'btn';
                link.target = '_blank';
                link.href = p.url;
                link.style.fontSize = '0.85rem';
                link.style.padding = '0.5rem 1rem';
                link.style.borderRadius = '50px';
                link.style.backgroundColor = 'var(--bg-tertiary)';
                link.style.border = '1px solid var(--border-color)';
                link.style.color = 'var(--text-primary)';
                link.style.display = 'inline-flex';
                link.style.alignItems = 'center';
                link.style.gap = '6px';
                link.style.transition = 'var(--transition)';
                
                link.innerHTML = `<span>${p.icon}</span> <span>${p.name}</span>`;
                
                link.onmouseenter = () => {
                    link.style.borderColor = p.color;
                    link.style.boxShadow = `0 0 10px ${p.color}80`;
                    link.style.transform = 'translateY(-2px)';
                };
                link.onmouseleave = () => {
                    link.style.borderColor = 'var(--border-color)';
                    link.style.boxShadow = 'none';
                    link.style.transform = 'translateY(0)';
                };
                
                shareLinksGrid.appendChild(link);
            });
            
            // Add a "Copy Link" button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn';
            copyBtn.style.fontSize = '0.85rem';
            copyBtn.style.padding = '0.5rem 1rem';
            copyBtn.style.borderRadius = '50px';
            copyBtn.style.backgroundColor = 'var(--bg-tertiary)';
            copyBtn.style.border = '1px solid var(--border-color)';
            copyBtn.style.color = 'var(--text-primary)';
            copyBtn.style.display = 'inline-flex';
            copyBtn.style.alignItems = 'center';
            copyBtn.style.gap = '6px';
            copyBtn.style.cursor = 'pointer';
            copyBtn.style.transition = 'var(--transition)';
            
            copyBtn.innerHTML = `<span>🔗</span> <span>Copy Link</span>`;
            
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    copyBtn.innerHTML = `<span>✅</span> <span>Copied!</span>`;
                    copyBtn.style.borderColor = 'var(--success)';
                    setTimeout(() => {
                        copyBtn.innerHTML = `<span>🔗</span> <span>Copy Link</span>`;
                        copyBtn.style.borderColor = 'var(--border-color)';
                    }, 2000);
                }).catch(err => {
                    console.error('Could not copy link:', err);
                });
            });
            
            copyBtn.onmouseenter = () => {
                copyBtn.style.borderColor = 'var(--accent-red)';
                copyBtn.style.boxShadow = '0 0 10px var(--accent-red-glow)';
                copyBtn.style.transform = 'translateY(-2px)';
            };
            copyBtn.onmouseleave = () => {
                copyBtn.style.borderColor = 'var(--border-color)';
                copyBtn.style.boxShadow = 'none';
                copyBtn.style.transform = 'translateY(0)';
            };
            
            shareLinksGrid.appendChild(copyBtn);
        }
    } else {
        const downloadBox = document.getElementById('download-box');
        if (downloadBox) downloadBox.style.display = 'none';
        const shareBox = document.getElementById('share-box');
        if (shareBox) shareBox.style.display = 'none';
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
    catalogHeading.textContent = 'Latest Release';
    playerContainer.innerHTML = `
        <div class="player-placeholder">
            <p>Select an episode or mirror to begin playback.</p>
        </div>
    `;
    
    // Show home sections
    scheduleSection.style.display = 'block';
    popularSection.style.display = 'block';
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
        activeScheduleDay = null;
        document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
        window.location.hash = '';
        hideWatchView();
        applyFiltersAndSearch();
    });
    
    navAll.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        activeFilter = 'All';
        activeScheduleDay = null;
        document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
        window.location.hash = '';
        hideWatchView();
        applyFiltersAndSearch();
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

    // Chat drawer controls
    chatToggleBtn.addEventListener('click', () => {
        chatDrawer.classList.toggle('active');
    });

    chatCloseBtn.addEventListener('click', () => {
        chatDrawer.classList.remove('active');
    });
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

// ============================================================================
// REDESIGN HELPERS & HANDLERS
// ============================================================================

// Extract episode number from title (e.g. "Against the Gods Episode 43" -> "Ep 43")
function extractEpisodeText(title) {
    const match = title.match(/Episode\s*(\d+)/i) || title.match(/Ep\s*(\d+)/i);
    return match ? `Ep ${match[1]}` : 'Ep 1';
}

// Render the Popular Today carousel
function renderPopularCarousel() {
    popularCarousel.innerHTML = '';
    
    // Select popular shows (latest episode of each unique popular show title)
    const popularShowKeywords = [
        'Against the Gods',
        'Renegade Immortal',
        'Shrouding the Heavens',
        'Perfect World',
        'Soul Land',
        'Martial Master',
        'Big Brother',
        'Battle Through the Heavens',
        'Stellar Transformation',
        'Swallowed Star',
        'Great Ruler',
        'Demon Hunter'
    ];
    
    const renderedShows = new Set();
    const popularVideos = [];
    
    for (const video of allVideos) {
        for (const kw of popularShowKeywords) {
            if (video.title.toLowerCase().includes(kw.toLowerCase()) && !renderedShows.has(kw)) {
                popularVideos.push(video);
                renderedShows.add(kw);
                break;
            }
        }
        if (popularVideos.length >= 8) break; // Limit to 8 popular shows in carousel
    }
    
    if (popularVideos.length === 0) {
        popularSection.style.display = 'none';
        return;
    }
    
    popularSection.style.display = 'block';
    
    popularVideos.forEach(video => {
        const mainIndex = allVideos.indexOf(video);
        const card = document.createElement('div');
        card.className = 'popular-card';
        
        const epText = extractEpisodeText(video.title);
        
        card.innerHTML = `
            <div class="card-thumb-wrapper">
                <img src="${video.thumbnail || 'https://via.placeholder.com/350x220/0a0b10/d50000?text=FallenAnime'}" alt="${video.title}" loading="lazy">
                <span class="card-badge-top-left">ONA</span>
                <span class="card-badge-bottom-left">${epText}</span>
                <span class="card-badge-bottom-right">Sub</span>
            </div>
            <div class="card-details">
                <h3 class="card-title">${video.title}</h3>
            </div>
        `;
        
        card.addEventListener('click', () => {
            window.location.hash = `#watch?idx=${mainIndex}`;
        });
        
        popularCarousel.appendChild(card);
    });
}

let activeScheduleDay = null; // null means no schedule filter active

// Set up daily schedule buttons filter
function setupScheduleButtons() {
    const scheduleBtns = document.querySelectorAll('.schedule-btn');
    
    scheduleBtns.forEach(btn => {
        // Remove existing listeners if any by cloning
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            const day = newBtn.getAttribute('data-day');
            
            if (day === 'Random') {
                // Pick a random episode and play it!
                if (allVideos.length > 0) {
                    const randomIdx = Math.floor(Math.random() * allVideos.length);
                    window.location.hash = `#watch?idx=${randomIdx}`;
                }
                return;
            }
            
            // Toggle active state
            if (activeScheduleDay === day) {
                activeScheduleDay = null;
                newBtn.classList.remove('active');
            } else {
                document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
                activeScheduleDay = day;
                newBtn.classList.add('active');
            }
            
            applyFiltersAndSearch();
        });
    });
}
