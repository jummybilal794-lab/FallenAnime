/* app.js */
/* Frontend Script for AnimeXin Cloned Portal */

// Global State
let allVideos = [];
let filteredVideos = [];
let activeFilter = 'All';
let isSyncing = false;
let syncIntervalId = null;
let catalogLayout = 'grid'; // 'grid' or 'list'

let currentPage = 1;
const itemsPerPage = 24;

// Firebase Configuration (to be filled by the user)
const firebaseConfig = {
  apiKey: "AIzaSyAJw32edVN_6VA1Al-BvgN97zAMv34Swm8",
  authDomain: "fallenanime-20ea1.firebaseapp.com",
  projectId: "fallenanime-20ea1",
  storageBucket: "fallenanime-20ea1.firebasestorage.app",
  messagingSenderId: "737557456886",
  appId: "1:737557456886:web:8d3cacc26097b6381189d7",
  measurementId: "G-M0V80EJSPX"
};

// Global Firebase Instance Pointers
let firebaseApp = null;
let auth = null;
let db = null;

// User Account and History State
let currentUser = null;
let userFavorites = [];
let userWatched = [];
let activeNavFilter = 'All'; // 'All' or 'Favorites'

function sanitizeTitle(title) {
    if (!title) return '';
    return title
        .replace(/\s*[-–]\s*AnimeXin(?:\.dev)?/gi, '')
        .replace(/\s*Subtitle\s*[-–]\s*AnimeXin(?:\.dev)?/gi, '')
        .replace(/AnimeXin(?:\.dev)?/gi, 'FallenAnime')
        .trim();
}

// DOM Elements
const logoBtn = document.getElementById('logo-btn');
const searchInput = document.getElementById('search-input');
const navAll = document.getElementById('nav-all');
const navFavorites = document.getElementById('nav-favorites');
const navHistory = document.getElementById('nav-history');
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
    initAuth();
    loadDatabase();
    setupEventListeners();
    checkSyncStatusOnStart();
    initChatCounter();
    
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
    currentPage = 1;
    const keyword = searchInput.value.toLowerCase().trim();
    
    filteredVideos = allVideos.filter(video => {
        const matchesSearch = !keyword || 
                              video.title.toLowerCase().includes(keyword) || 
                              (video.description && video.description.toLowerCase().includes(keyword));
        
        const matchesCategory = activeFilter === 'All' || 
                                (video.categories && video.categories.includes(activeFilter));
        
        let matchesNavFilter = true;
        if (activeNavFilter === 'Favorites') {
            matchesNavFilter = userFavorites.includes(video.link);
        } else if (activeNavFilter === 'History') {
            matchesNavFilter = userWatched.includes(video.link);
        }
        
        // Filter by release day if active
        let matchesDay = true;
        if (activeScheduleDay) {
            matchesDay = video.pubDate && video.pubDate.includes(activeScheduleDay);
        }
        
        return matchesSearch && matchesCategory && matchesDay && matchesNavFilter;
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
    
    const paginationContainer = document.getElementById('pagination-container');
    
    if (filteredVideos.length === 0) {
        catalogGrid.innerHTML = `
            <div class="loading-state">
                <p>🔍 No videos match your current search/filters.</p>
            </div>
        `;
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }
    
    const visibleVideos = filteredVideos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    
    visibleVideos.forEach((video) => {
        const mainIndex = allVideos.indexOf(video);
        
        const card = document.createElement('div');
        card.className = 'video-card';
        card.id = `video-card-${mainIndex}`;
        
        const formattedDate = formatDate(video.pubDate);
        const epText = extractEpisodeText(video.title);
        const titleClean = sanitizeTitle(video.title);
        
        const isWatched = userWatched.includes(video.link);
        const watchedBadge = isWatched ? `<span class="card-badge-watched">✓ Watched</span>` : '';
        
        card.innerHTML = `
            <div class="card-thumb-wrapper">
                <img src="${video.thumbnail || 'https://via.placeholder.com/350x220/0a0b10/d50000?text=FallenAnime'}" alt="${titleClean}" loading="lazy">
                ${watchedBadge}
                <span class="card-badge-top-left">ONA</span>
                <span class="card-badge-bottom-left">${epText}</span>
                <span class="card-badge-bottom-right">Sub</span>
            </div>
            <div class="card-details">
                <h3 class="card-title">${titleClean}</h3>
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

    // Render Pagination
    const totalPages = Math.ceil(filteredVideos.length / itemsPerPage);
    if (totalPages > 1) {
        if (paginationContainer) {
            paginationContainer.style.display = 'flex';
            renderPaginationControls(totalPages);
        }
    } else {
        if (paginationContainer) paginationContainer.style.display = 'none';
    }
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

    // Update Document Title and Meta details for SEO
    const episodeTitle = sanitizeTitle(video.title);
    const episodeDesc = (video.description ? video.description.substring(0, 160).trim() + '...' : `Watch ${episodeTitle} in high quality with English and Indonesian subtitles.`).replace(/AnimeXin/gi, 'FallenAnime');
    const episodeUrl = `${window.location.origin}${window.location.pathname}#watch?idx=${index}`;
    const episodeThumb = video.thumbnail || "https://jummybilal794-lab.github.io/FallenAnime/wp-content/uploads/2021/04/Lord-of-the-Ancient-God-Grave-Subtitle.webp";

    document.title = `${episodeTitle} - FallenAnime`;
    
    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', episodeDesc);
    
    const canonicalLink = document.getElementById('link-canonical');
    if (canonicalLink) canonicalLink.setAttribute('href', episodeUrl);
    
    // Update OpenGraph details
    const ogTitle = document.getElementById('meta-og-title');
    if (ogTitle) ogTitle.setAttribute('content', `${episodeTitle} - FallenAnime`);
    
    const ogDesc = document.getElementById('meta-og-description');
    if (ogDesc) ogDesc.setAttribute('content', episodeDesc);
    
    const ogImage = document.getElementById('meta-og-image');
    if (ogImage) ogImage.setAttribute('content', episodeThumb);
    
    const ogUrl = document.getElementById('meta-og-url');
    if (ogUrl) ogUrl.setAttribute('content', episodeUrl);
    
    // Update Twitter details
    const twTitle = document.getElementById('meta-tw-title');
    if (twTitle) twTitle.setAttribute('content', `${episodeTitle} - FallenAnime`);
    
    const twDesc = document.getElementById('meta-tw-description');
    if (twDesc) twDesc.setAttribute('content', episodeDesc);
    
    const twImage = document.getElementById('meta-tw-image');
    if (twImage) twImage.setAttribute('content', episodeThumb);

    // Inject dynamic JSON-LD VideoObject schema for Google Video Search indexing
    let schemaScript = document.getElementById('schema-video-object');
    if (!schemaScript) {
        schemaScript = document.createElement('script');
        schemaScript.type = 'application/ld+json';
        schemaScript.id = 'schema-video-object';
        document.head.appendChild(schemaScript);
    }
    
    const defaultEmbedUrl = video.mirrors && video.mirrors.length > 0 ? (video.mirrors[0].embedUrl || "") : "";
    
    const videoSchema = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": episodeTitle,
        "description": (video.description || `Watch ${episodeTitle} on FallenAnime with English and Indonesian subtitles.`).replace(/AnimeXin/gi, 'FallenAnime'),
        "thumbnailUrl": [
            episodeThumb
        ],
        "uploadDate": video.pubDate ? new Date(video.pubDate).toISOString() : new Date().toISOString(),
        "embedUrl": defaultEmbedUrl
    };
    
    schemaScript.textContent = JSON.stringify(videoSchema, null, 2);
    
    // Hide home sections
    scheduleSection.style.display = 'none';
    popularSection.style.display = 'none';
    
    // Scroll to player smooth if requested
    if (scroll) {
        watchSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Populate Details
    watchTitle.textContent = sanitizeTitle(video.title);
    watchDate.textContent = `Published: ${formatDate(video.pubDate)}`;
    watchDescription.textContent = (video.description || 'No synopsis details available.').replace(/AnimeXin/gi, 'FallenAnime');
    
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
                loadMirrorPlayer(mirror, video.title);
            }
        };

        // Load first mirror as default
        loadMirrorPlayer(video.mirrors[0], video.title);

        // Populate download/source links
        const downloadBox = document.getElementById('download-box');
        const downloadLinksGrid = document.getElementById('download-links-grid');
        if (downloadBox && downloadLinksGrid) {
            downloadLinksGrid.innerHTML = '';
            downloadBox.style.display = 'block';
            
            // Render high-quality direct downloads if present
            if (video.downloads && video.downloads.length > 0) {
                video.downloads.forEach((dl) => {
                    const url = dl.url || "";
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
                        
                        let label = dl.label || "Download";
                        let icon = "📥";
                        if (label.toLowerCase().includes('mediafire')) {
                            icon = "🔥";
                        } else if (label.toLowerCase().includes('terabox')) {
                            icon = "📦";
                        } else if (label.toLowerCase().includes('mirror')) {
                            icon = "🔗";
                        }
                        
                        const langLabel = dl.language ? ` [${dl.language.replace('Subtitle ', '')}]` : '';
                        link.innerHTML = `<span>${icon}</span> <span>${label}${langLabel}</span>`;
                        
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
            } else {
                // Fallback to mirrors
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
            }
        }
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

    // Track watch history and update Favorites Button state
    if (video.link) {
        markEpisodeWatched(video.link);
        updateFavoriteButtonState(video.link);
        loadCommentsForEpisode(video.link);
    }
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

    // Reset SEO Metadata to default
    document.title = 'FallenAnime';
    
    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', 'Watch high-quality Donghua and Anime with English and Indonesian subtitles. Automatically synced from FallenAnime.');
    
    const canonicalLink = document.getElementById('link-canonical');
    if (canonicalLink) canonicalLink.setAttribute('href', 'https://jummybilal794-lab.github.io/FallenAnime/');
    
    const ogTitle = document.getElementById('meta-og-title');
    if (ogTitle) ogTitle.setAttribute('content', 'FallenAnime - Watch Free Donghua & Anime Sub');
    
    const ogDesc = document.getElementById('meta-og-description');
    if (ogDesc) ogDesc.setAttribute('content', 'Watch high-quality Donghua and Anime with English and Indonesian subtitles. Automatically synced from FallenAnime.');
    
    const ogImage = document.getElementById('meta-og-image');
    if (ogImage) ogImage.setAttribute('content', 'https://jummybilal794-lab.github.io/FallenAnime/wp-content/uploads/2021/04/Lord-of-the-Ancient-God-Grave-Subtitle.webp');
    
    const ogUrl = document.getElementById('meta-og-url');
    if (ogUrl) ogUrl.setAttribute('content', 'https://jummybilal794-lab.github.io/FallenAnime/');
    
    const twTitle = document.getElementById('meta-tw-title');
    if (twTitle) twTitle.setAttribute('content', 'FallenAnime - Watch Free Donghua & Anime Sub');
    
    const twDesc = document.getElementById('meta-tw-description');
    if (twDesc) twDesc.setAttribute('content', 'Watch high-quality Donghua and Anime with English and Indonesian subtitles. Automatically synced from FallenAnime.');
    
    const twImage = document.getElementById('meta-tw-image');
    if (twImage) twImage.setAttribute('content', 'https://jummybilal794-lab.github.io/FallenAnime/wp-content/uploads/2021/04/Lord-of-the-Ancient-God-Grave-Subtitle.webp');
    
    // Remove dynamic VideoObject schema
    const schemaScript = document.getElementById('schema-video-object');
    if (schemaScript) {
        schemaScript.remove();
    }
}

// Load mirror HTML/Iframe into container
function loadMirrorPlayer(mirror, videoTitle) {
    if (!mirror) return;
    
    // Inject mirror html safely
    let embedHtml = mirror.embedHtml || '';
    if (embedHtml) {
        // Sanitize any instances of AnimeXin in titles/attributes inside iframe
        embedHtml = embedHtml.replace(/title="([^"]*)"/g, (match, titleContent) => {
            const sanitizedTitle = titleContent.replace(/AnimeXin(?:\.dev)?/gi, 'FallenAnime');
            return `title="${sanitizedTitle}"`;
        });
        embedHtml = embedHtml.replace(/itemprop="name"\s+content="([^"]*)"/g, (match, content) => {
            return `itemprop="name" content="${content.replace(/AnimeXin(?:\.dev)?/gi, 'FallenAnime')}"`;
        });
        embedHtml = embedHtml.replace(/itemprop="description"\s+content="([^"]*)"/g, (match, content) => {
            return `itemprop="description" content="${content.replace(/AnimeXin(?:\.dev)?/gi, 'FallenAnime')}"`;
        });
        playerContainer.innerHTML = embedHtml;
    } else if (mirror.embedUrl) {
        playerContainer.innerHTML = `<iframe src="${mirror.embedUrl}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
    } else {
        playerContainer.innerHTML = `<div class="player-placeholder"><p>No play method available for this server.</p></div>`;
        return;
    }

    // Append FallenAnime custom premium title bar to overlay and mask uploader's logo & text
    if (videoTitle) {
        const titleClean = sanitizeTitle(videoTitle);
        const titleBar = document.createElement('div');
        titleBar.className = 'player-title-bar';
        titleBar.innerHTML = `
            <span class="player-title-logo"><span class="logo-accent">Fallen</span>Anime</span>
            <span class="player-title-divider">|</span>
            <span class="player-title-text">${titleClean}</span>
        `;
        playerContainer.appendChild(titleBar);
    }
}

// Extract base series name from video title
function getSeriesName(title) {
    let cleaned = title;
    const parts = title.split(/(?:Episode|Ep)\s*\d+/i);
    if (parts.length > 0) {
        cleaned = parts[0];
    }
    cleaned = cleaned.replace(/Season\s*\d+/i, '');
    cleaned = cleaned.replace(/S\d+/i, '');
    cleaned = cleaned.trim();
    cleaned = cleaned.replace(/[\s-–,]+$/, '').trim();
    return cleaned;
}

// Extract episode number
function getEpisodeNumber(title) {
    const match = title.match(/Episode\s*(\d+(\.\d+)?)/i) || title.match(/Ep\s*(\d+(\.\d+)?)/i);
    return match ? parseFloat(match[1]) : 0;
}

// Global state for sidebar pagination
let currentPlayingIndexForSidebar = null;
let currentSidebarPage = 1;
const sidebarItemsPerPage = 20;

// Render sidebar episodes list
function renderSidebarList(currentPlayingIdx) {
    if (currentPlayingIdx !== undefined) {
        currentPlayingIndexForSidebar = currentPlayingIdx;
    }
    
    sidebarList.innerHTML = '';
    const currentVideo = allVideos[currentPlayingIndexForSidebar];
    if (!currentVideo) return;

    const seriesName = getSeriesName(currentVideo.title);
    
    // Filter related episodes from the same series
    let relatedVideos = [];
    if (seriesName) {
        relatedVideos = allVideos.filter(video => {
            return video.title.toLowerCase().includes(seriesName.toLowerCase());
        });
    }

    // Sort related videos by episode number descending
    relatedVideos.sort((a, b) => {
        const epA = getEpisodeNumber(a.title);
        const epB = getEpisodeNumber(b.title);
        return epB - epA;
    });

    const sidebarHeading = document.querySelector('.watch-sidebar .sidebar-heading');
    let isFallback = false;
    
    // Fallback if no other related episodes are found
    if (relatedVideos.length <= 1) {
        relatedVideos = allVideos.slice(0, 100);
        isFallback = true;
    }
    
    if (sidebarHeading) {
        sidebarHeading.textContent = isFallback ? 'Latest Episodes' : 'Related Episodes';
    }
    
    // Calculate pagination details
    const totalItems = relatedVideos.length;
    const totalPages = Math.ceil(totalItems / sidebarItemsPerPage);
    
    // Ensure current page is in bounds
    if (currentSidebarPage > totalPages) currentSidebarPage = totalPages;
    if (currentSidebarPage < 1) currentSidebarPage = 1;

    // Slice for current page
    const startIdx = (currentSidebarPage - 1) * sidebarItemsPerPage;
    const endIdx = startIdx + sidebarItemsPerPage;
    const visibleRelated = relatedVideos.slice(startIdx, endIdx);
    
    visibleRelated.forEach((video) => {
        const mainIndex = allVideos.indexOf(video);
        const isCurrent = mainIndex === currentPlayingIndexForSidebar;
        
        const item = document.createElement('div');
        item.className = `sidebar-item ${isCurrent ? 'playing' : ''}`;
        
        const sanitizedTitle = sanitizeTitle(video.title);
        
        item.innerHTML = `
            <div class="sidebar-item-thumb">
                <img src="${video.thumbnail}" alt="${sanitizedTitle}">
            </div>
            <div class="sidebar-item-details">
                <h4 class="sidebar-item-title" style="${isCurrent ? 'color: var(--accent-blue)' : ''}">${sanitizedTitle}</h4>
                <span class="sidebar-item-date">${formatDate(video.pubDate)}</span>
            </div>
        `;
        
        item.addEventListener('click', () => {
            window.location.hash = `#watch?idx=${mainIndex}`;
            currentSidebarPage = 1; // Reset to page 1 on new video click
        });
        
        sidebarList.appendChild(item);
    });

    // Render sidebar pagination controls
    renderSidebarPagination(totalPages);
}

// Render pagination buttons in watch sidebar
function renderSidebarPagination(totalPages) {
    const container = document.getElementById('sidebar-pagination');
    if (!container) return;
    container.innerHTML = '';

    // If only 1 page, don't show pagination controls
    if (totalPages <= 1) return;

    // Helper to create page button
    function createSidebarPageBtn(text, pageNum, className = '', disabled = false) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${className}`;
        if (disabled) btn.classList.add('disabled');
        btn.innerHTML = text;
        btn.style.padding = '0.35rem 0.75rem';
        btn.style.fontSize = '0.8rem';
        
        if (!disabled) {
            btn.addEventListener('click', () => {
                currentSidebarPage = pageNum;
                renderSidebarList(); // Re-render sidebar list
                
                // Scroll watch sidebar section header into view smoothly
                const watchSidebar = document.querySelector('.watch-sidebar');
                if (watchSidebar) {
                    watchSidebar.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
        return btn;
    }

    // Prev Button
    container.appendChild(createSidebarPageBtn('‹', currentSidebarPage - 1, 'prev-btn', currentSidebarPage === 1));

    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentSidebarPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        container.appendChild(createSidebarPageBtn('1', 1, currentSidebarPage === 1 ? 'active' : ''));
        if (startPage > 2) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.className = 'page-dots';
            dots.style.color = 'var(--text-muted)';
            dots.style.alignSelf = 'center';
            container.appendChild(dots);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        container.appendChild(createSidebarPageBtn(i.toString(), i, currentSidebarPage === i ? 'active' : ''));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.className = 'page-dots';
            dots.style.color = 'var(--text-muted)';
            dots.style.alignSelf = 'center';
            container.appendChild(dots);
        }
        container.appendChild(createSidebarPageBtn(totalPages.toString(), totalPages, currentSidebarPage === totalPages ? 'active' : ''));
    }

    // Next Button
    container.appendChild(createSidebarPageBtn('›', currentSidebarPage + 1, 'next-btn', currentSidebarPage === totalPages));
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
    
    // Helper to scroll to catalog section cleanly without overlapping fixed header
    const scrollToCatalog = () => {
        const catalogSection = document.getElementById('catalog-section');
        if (catalogSection) {
            const header = document.querySelector('.header');
            const headerHeight = header ? header.offsetHeight : 80;
            const offset = catalogSection.getBoundingClientRect().top + window.pageYOffset - headerHeight - 15;
            window.scrollTo({
                top: offset,
                behavior: 'smooth'
            });
        }
    };
    
    // Search Enter key scroll trigger
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (window.location.hash.startsWith('#watch')) {
                window.location.hash = '';
                hideWatchView();
            }
            applyFiltersAndSearch();
            setTimeout(() => {
                scrollToCatalog();
            }, 50);
        }
    });

    // Search button click scroll trigger
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (window.location.hash.startsWith('#watch')) {
                window.location.hash = '';
                hideWatchView();
            }
            applyFiltersAndSearch();
            setTimeout(() => {
                scrollToCatalog();
            }, 50);
        });
    }
    
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

    // Load More button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            renderCatalogGrid();
        });
    }

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
    
    const deepSyncCheckbox = document.getElementById('deep-sync-checkbox');
    const isDeepSync = deepSyncCheckbox ? deepSyncCheckbox.checked : false;
    
    logToConsole(`[Client] Initiating sync request (Mode: ${isDeepSync ? 'Deep Sync' : 'Normal Sync'})...`);
    triggerSyncBtn.disabled = true;
    triggerSyncBtn.textContent = 'Syncing...';
    
    try {
        const res = await fetch(`/api/sync?full=${isDeepSync}`);
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

// Dynamic Chat Viewer Counter
function initChatCounter() {
    const chatToggleSpan = document.querySelector('#chat-toggle-btn span');
    if (!chatToggleSpan) return;

    let baseCount = Math.floor(Math.random() * 15) + 15; // Start with 15-30 people
    chatToggleSpan.textContent = `💬 FallenAnime Chat 👤 ${baseCount}`;

    setInterval(() => {
        // Fluctuates by -2, -1, 0, 1, 2
        const change = Math.floor(Math.random() * 5) - 2;
        baseCount = Math.max(8, baseCount + change);
        chatToggleSpan.textContent = `💬 FallenAnime Chat 👤 ${baseCount}`;
    }, 10000); // Update every 10 seconds
}

// Start polling for sync completion
function startPollingSyncStatus() {
    isSyncing = true;
    syncBanner.style.display = 'block';
    syncStatusIndicator.innerHTML = '<span class="dot dot-orange"></span> Active (Syncing)';
    
    if (syncIntervalId) clearInterval(syncIntervalId);
    
    syncIntervalId = setInterval(async () => {
        try {
            const res = await fetch('/api/sync-status');
            const data = await res.json();
            
            // Fetch live console log from server
            try {
                const logRes = await fetch('/api/sync-log');
                const logData = await logRes.json();
                if (logData.log) {
                    consoleLog.textContent = logData.log;
                    consoleLog.scrollTop = consoleLog.scrollHeight;
                }
            } catch (logErr) {
                console.warn('Failed to fetch sync logs:', logErr);
            }
            
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
        const sanitizedTitle = sanitizeTitle(video.title);
        
        card.innerHTML = `
            <div class="card-thumb-wrapper">
                <img src="${video.thumbnail || 'https://via.placeholder.com/350x220/0a0b10/d50000?text=FallenAnime'}" alt="${sanitizedTitle}" loading="lazy">
                <span class="card-badge-top-left">ONA</span>
                <span class="card-badge-bottom-left">${epText}</span>
                <span class="card-badge-bottom-right">Sub</span>
            </div>
            <div class="card-details">
                <h3 class="card-title">${sanitizedTitle}</h3>
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

// Initialize User Auth & Database Connection
function initAuth() {
    const authBtn = document.getElementById('auth-btn');
    const userMenu = document.getElementById('user-menu');
    const userEmailText = document.getElementById('user-email-text');
    const userDropdown = document.getElementById('user-dropdown');
    const menuFavorites = document.getElementById('menu-favorites');
    const menuLogout = document.getElementById('menu-logout');
    const authModal = document.getElementById('auth-modal');
    const authModalClose = document.getElementById('auth-modal-close');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLoginBtn = document.getElementById('tab-login-btn');
    const tabRegisterBtn = document.getElementById('tab-register-btn');
    const tabGoogleBtn = document.getElementById('tab-google-btn');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // 1. Initialize Firebase if config is configured
    try {
        if (typeof firebase !== 'undefined' && firebaseConfig && firebaseConfig.apiKey !== "YOUR_API_KEY") {
            firebaseApp = firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
            
            // Listen for authentication state changes
            auth.onAuthStateChanged(async (user) => {
                currentUser = user;
                const commentFormContainer = document.getElementById('comment-form-container');
                const commentLoginPrompt = document.getElementById('comment-login-prompt');
                const navbarUserAvatar = document.getElementById('navbar-user-avatar');
                
                if (user) {
                    // Logged in
                    if (authBtn) authBtn.style.display = 'none';
                    if (userMenu) userMenu.style.display = 'inline-block';
                    if (userEmailText) userEmailText.textContent = user.displayName ? user.displayName : user.email.split('@')[0];
                    if (navFavorites) navFavorites.style.display = 'inline-block';
                    if (navHistory) navHistory.style.display = 'inline-block';
                    if (navbarUserAvatar) {
                        const avatarVal = user.photoURL || "👤";
                        if (avatarVal.startsWith('http')) {
                            navbarUserAvatar.innerHTML = `<img src="${avatarVal}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                        } else {
                            navbarUserAvatar.textContent = avatarVal;
                        }
                    }
                    
                    if (commentFormContainer) commentFormContainer.style.display = 'block';
                    if (commentLoginPrompt) commentLoginPrompt.style.display = 'none';
                    
                    // Fetch favorites and history from Firestore
                    await syncFromFirestore();
                } else {
                    // Logged out
                    if (authBtn) authBtn.style.display = 'inline-block';
                    if (userMenu) userMenu.style.display = 'none';
                    if (navFavorites) navFavorites.style.display = 'none';
                    if (navHistory) navHistory.style.display = 'none';
                    if (navbarUserAvatar) navbarUserAvatar.textContent = "👤";
                    
                    if (commentFormContainer) commentFormContainer.style.display = 'none';
                    if (commentLoginPrompt) commentLoginPrompt.style.display = 'block';
                    
                    // Fall back to local storage
                    loadFromLocalStorage();
                }
                applyFiltersAndSearch();
                
                // Refresh comments if watch page is currently active
                const currentVideo = getCurrentVideo();
                if (currentVideo) {
                    loadCommentsForEpisode(currentVideo.link);
                }
            });
        } else {
            // No Firebase configured, fall back to Local Storage
            loadFromLocalStorage();
            applyFiltersAndSearch();
        }
    } catch (e) {
        console.error("Firebase init error, using LocalStorage:", e);
        loadFromLocalStorage();
        applyFiltersAndSearch();
    }

    // 2. Auth Modal Event Listeners
    if (authBtn && authModal) {
        authBtn.addEventListener('click', () => {
            authModal.style.display = 'flex';
            showAuthTab('login');
        });
    }

    if (authModalClose && authModal) {
        authModalClose.addEventListener('click', () => {
            authModal.style.display = 'none';
        });
    }

    // Toggle dropdown user menu
    const userBtnEl = document.getElementById('user-btn');
    if (userBtnEl && userDropdown) {
        userBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
        
        // Hide dropdown when clicking elsewhere
        window.addEventListener('click', () => {
            userDropdown.classList.remove('show');
        });
    }

    // Tab Switching
    if (tabLoginBtn && tabRegisterBtn && tabGoogleBtn) {
        tabLoginBtn.addEventListener('click', () => showAuthTab('login'));
        tabRegisterBtn.addEventListener('click', () => showAuthTab('register'));
        tabGoogleBtn.addEventListener('click', () => {
            // Google tab triggers click on the main Google SSO button
            const btnGoogle = document.getElementById('btn-google-signin');
            if (btnGoogle) btnGoogle.click();
        });
    }

    // Login Form Submit
    if (loginForm && authModal && loginError) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            loginError.style.display = 'none';

            if (auth) {
                try {
                    const userCredential = await auth.signInWithEmailAndPassword(email, password);
                    const user = userCredential.user;
                    
                    // Enforce email verification check
                    if (!user.emailVerified) {
                        loginError.innerHTML = `Your email is not verified! Please click the verification link in your inbox. <a href="#" id="resend-verification" style="color: var(--accent-red); font-weight: 700; text-decoration: underline; margin-left: 5px;">Resend Verification Link</a>`;
                        loginError.style.display = 'block';
                        
                        // Bind resend click handler
                        setTimeout(() => {
                            const resendBtn = document.getElementById('resend-verification');
                            if (resendBtn) {
                                resendBtn.addEventListener('click', async (evt) => {
                                    evt.preventDefault();
                                    try {
                                        await user.sendEmailVerification();
                                        alert("Verification link resent to your email inbox!");
                                    } catch (resendErr) {
                                        alert("Error resending verification link: " + resendErr.message);
                                    }
                                });
                            }
                        }, 100);
                        
                        await auth.signOut();
                        return;
                    }
                    
                    authModal.style.display = 'none';
                    loginForm.reset();
                } catch (err) {
                    loginError.textContent = err.message;
                    loginError.style.display = 'block';
                }
            } else {
                loginError.textContent = "Authentication server not configured. Please see settings.";
                loginError.style.display = 'block';
            }
        });
    }

    // Register Form Submit
    if (registerForm && authModal && registerError) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;
            registerError.style.display = 'none';

            if (password !== confirmPassword) {
                registerError.textContent = "Passwords do not match!";
                registerError.style.display = 'block';
                return;
            }

            if (auth) {
                try {
                    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                    const user = userCredential.user;
                    
                    // Send verification email on account creation
                    await user.sendEmailVerification();
                    alert("Account created successfully! A verification email has been sent. Please verify your email before logging in.");
                    
                    // Log out immediately until verified
                    await auth.signOut();
                    
                    authModal.style.display = 'none';
                    registerForm.reset();
                } catch (err) {
                    registerError.textContent = err.message;
                    registerError.style.display = 'block';
                }
            } else {
                registerError.textContent = "Authentication server not configured. Please see settings.";
                registerError.style.display = 'block';
            }
        });
    }

    // Logout click
    if (menuLogout) {
        menuLogout.addEventListener('click', (e) => {
            e.preventDefault();
            if (auth) {
                auth.signOut();
            } else {
                currentUser = null;
                loadFromLocalStorage();
                if (authBtn) authBtn.style.display = 'inline-block';
                if (userMenu) userMenu.style.display = 'none';
                if (navFavorites) navFavorites.style.display = 'none';
                applyFiltersAndSearch();
            }
        });
    }

    // Navigation filter for Favorites
    if (navFavorites) {
        navFavorites.addEventListener('click', (e) => {
            e.preventDefault();
            if (navAll) navAll.classList.remove('active');
            if (navHistory) navHistory.classList.remove('active');
            navFavorites.classList.add('active');
            activeNavFilter = 'Favorites';
            activeFilter = 'All';
            searchInput.value = '';
            hideWatchView();
            applyFiltersAndSearch();
        });
    }
    
    // Navigation filter for Watch History
    if (navHistory) {
        navHistory.addEventListener('click', (e) => {
            e.preventDefault();
            if (navAll) navAll.classList.remove('active');
            if (navFavorites) navFavorites.classList.remove('active');
            navHistory.classList.add('active');
            activeNavFilter = 'History';
            activeFilter = 'All';
            searchInput.value = '';
            hideWatchView();
            applyFiltersAndSearch();
        });
    }
    
    if (navAll) {
        navAll.addEventListener('click', (e) => {
            e.preventDefault();
            if (navFavorites) navFavorites.classList.remove('active');
            if (navHistory) navHistory.classList.remove('active');
            navAll.classList.add('active');
            activeNavFilter = 'All';
            applyFiltersAndSearch();
        });
    }

    // Favorites Menu Click
    if (menuFavorites) {
        menuFavorites.addEventListener('click', (e) => {
            e.preventDefault();
            if (navAll) navAll.classList.remove('active');
            if (navHistory) navHistory.classList.remove('active');
            if (navFavorites) navFavorites.classList.add('active');
            activeNavFilter = 'Favorites';
            activeFilter = 'All';
            searchInput.value = '';
            hideWatchView();
            applyFiltersAndSearch();
        });
    }
    
    // Watch History Menu Click
    const menuHistory = document.getElementById('menu-history');
    if (menuHistory) {
        menuHistory.addEventListener('click', (e) => {
            e.preventDefault();
            if (navAll) navAll.classList.remove('active');
            if (navFavorites) navFavorites.classList.remove('active');
            if (navHistory) navHistory.classList.add('active');
            activeNavFilter = 'History';
            activeFilter = 'All';
            searchInput.value = '';
            hideWatchView();
            applyFiltersAndSearch();
        });
    }

    // Change Username click handler
    const menuChangeUsername = document.getElementById('menu-change-username');
    if (menuChangeUsername) {
        menuChangeUsername.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentUser) {
                alert("Please Sign In to change your username!");
                return;
            }
            
            const newUsername = prompt("Enter your new username:", currentUser.displayName || currentUser.email.split('@')[0]);
            if (newUsername === null) return; // User cancelled
            
            const cleanedUsername = newUsername.trim();
            if (!cleanedUsername) {
                alert("Username cannot be empty!");
                return;
            }
            
            if (auth && currentUser) {
                try {
                    await currentUser.updateProfile({
                        displayName: cleanedUsername
                    });
                    if (userEmailText) userEmailText.textContent = cleanedUsername;
                    alert("Username updated successfully to: " + cleanedUsername);
                } catch (err) {
                    console.error("Failed to update username:", err);
                    alert("Failed to update username: " + err.message);
                }
            } else {
                alert("Authentication server not configured.");
            }
        });
    }

    // Change Avatar click handler and modal listeners
    const menuChangeAvatar = document.getElementById('menu-change-avatar');
    const avatarModal = document.getElementById('avatar-modal');
    const avatarModalClose = document.getElementById('avatar-modal-close');
    const btnSaveAvatar = document.getElementById('btn-save-avatar');
    const avatarOptions = document.querySelectorAll('.avatar-option');
    const navbarUserAvatar = document.getElementById('navbar-user-avatar');
    let selectedAvatar = "👤";

    if (menuChangeAvatar && avatarModal && avatarModalClose && btnSaveAvatar) {
        menuChangeAvatar.addEventListener('click', (e) => {
            e.preventDefault();
            if (!currentUser) {
                alert("Please Sign In to choose your profile avatar!");
                return;
            }
            
            selectedAvatar = currentUser.photoURL || "👤";
            
            // Highlight current selected avatar in modal
            avatarOptions.forEach(opt => {
                if (opt.getAttribute('data-avatar') === selectedAvatar) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });
            
            avatarModal.style.display = 'flex';
        });

        // Close modal
        avatarModalClose.addEventListener('click', () => {
            avatarModal.style.display = 'none';
        });

        // Handle selection within grid
        avatarOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                avatarOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                selectedAvatar = opt.getAttribute('data-avatar');
            });
        });

        // Save selected avatar
        btnSaveAvatar.addEventListener('click', async () => {
            if (auth && currentUser) {
                try {
                    await currentUser.updateProfile({
                        photoURL: selectedAvatar
                    });
                    if (navbarUserAvatar) {
                        if (selectedAvatar.startsWith('http')) {
                            navbarUserAvatar.innerHTML = `<img src="${selectedAvatar}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                        } else {
                            navbarUserAvatar.textContent = selectedAvatar;
                        }
                    }
                    avatarModal.style.display = 'none';
                    alert("Profile avatar updated successfully to: " + selectedAvatar);
                } catch (err) {
                    console.error("Failed to update avatar:", err);
                    alert("Failed to update avatar: " + err.message);
                }
            } else {
                alert("Authentication server not configured.");
            }
        });
    }

    // Favorite Button Click handler
    const favBtn = document.getElementById('favorite-btn');
    if (favBtn) {
        favBtn.addEventListener('click', () => {
            const currentVideo = getCurrentVideo();
            if (!currentVideo) return;
            
            // If Firebase is active and user is NOT logged in, open Auth modal
            if (auth && !currentUser) {
                if (authModal) {
                    authModal.style.display = 'flex';
                    showAuthTab('login');
                }
                alert("Please Sign In to save your favorites!");
                return;
            }
            
            const link = currentVideo.link;
            const index = userFavorites.indexOf(link);
            if (index > -1) {
                userFavorites.splice(index, 1);
            } else {
                userFavorites.push(link);
            }
            
            saveFavorites();
            updateFavoriteButtonState(link);
        });
    }

    // Google Sign-In button click listener
    const btnGoogleSignin = document.getElementById('btn-google-signin');
    if (btnGoogleSignin) {
        btnGoogleSignin.addEventListener('click', async () => {
            if (auth) {
                const provider = new firebase.auth.GoogleAuthProvider();
                try {
                    await auth.signInWithPopup(provider);
                    if (authModal) authModal.style.display = 'none';
                } catch (err) {
                    console.error("Google SSO failed:", err);
                    alert("Google Sign-In failed: " + err.message);
                }
            } else {
                alert("Authentication server not configured.");
            }
        });
    }

    // Comment Login prompt link click handler
    const commentLoginLink = document.getElementById('comment-login-link');
    if (commentLoginLink) {
        commentLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (authModal) {
                authModal.style.display = 'flex';
                showAuthTab('login');
            }
        });
    }

    // Comment Form Submission listener
    const commentForm = document.getElementById('comment-form');
    if (commentForm) {
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const textarea = document.getElementById('comment-textarea');
            if (!textarea) return;
            const content = textarea.value.trim();
            if (!content) return;
            
            const currentVideo = getCurrentVideo();
            if (!currentVideo) return;
            
            await postCommentForEpisode(currentVideo.link, content);
            textarea.value = '';
        });
    }
}

// Show specific tab in modal
function showAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLoginBtn = document.getElementById('tab-login-btn');
    const tabRegisterBtn = document.getElementById('tab-register-btn');
    const tabGoogleBtn = document.getElementById('tab-google-btn');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    if (tab === 'login') {
        if (tabLoginBtn) tabLoginBtn.classList.add('active');
        if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
        if (tabGoogleBtn) tabGoogleBtn.classList.remove('active');
        if (loginForm) loginForm.style.display = 'flex';
        if (registerForm) registerForm.style.display = 'none';
        if (loginError) loginError.style.display = 'none';
    } else {
        if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
        if (tabLoginBtn) tabLoginBtn.classList.remove('active');
        if (tabGoogleBtn) tabGoogleBtn.classList.remove('active');
        if (registerForm) registerForm.style.display = 'flex';
        if (loginForm) loginForm.style.display = 'none';
        if (registerError) registerError.style.display = 'none';
    }
}

// Helper: Get currently playing video object
function getCurrentVideo() {
    const hash = window.location.hash;
    if (hash.startsWith('#watch?idx=')) {
        const index = parseInt(hash.split('idx=')[1]);
        if (!isNaN(index) && allVideos[index]) {
            return allVideos[index];
        }
    }
    return null;
}

// Save & Sync favorites list
async function saveFavorites() {
    // 1. Save to Local Storage
    localStorage.setItem('fallenanime_favorites', JSON.stringify(userFavorites));
    
    // 2. Sync to Firebase Firestore if logged in
    if (db && currentUser) {
        try {
            await db.collection('users').doc(currentUser.uid).set({
                favorites: userFavorites
            }, { merge: true });
        } catch (err) {
            console.error("Firestore favorites sync failed:", err);
        }
    }
}

// Mark an episode as watched and save
async function markEpisodeWatched(link) {
    if (!link) return;
    if (!userWatched.includes(link)) {
        userWatched.push(link);
        
        // Save locally
        localStorage.setItem('fallenanime_watched', JSON.stringify(userWatched));
        
        // Sync to Firebase
        if (db && currentUser) {
            try {
                await db.collection('users').doc(currentUser.uid).set({
                    watched: userWatched
                }, { merge: true });
            } catch (err) {
                console.error("Firestore watched history sync failed:", err);
            }
        }
        
        // Refresh catalog cards if they are rendered in the background
        const cardElements = document.querySelectorAll('.video-card');
        if (cardElements.length > 0) {
            applyFiltersAndSearch();
        }
    }
}

// Load from LocalStorage fallback
function loadFromLocalStorage() {
    const cachedFavs = localStorage.getItem('fallenanime_favorites');
    userFavorites = cachedFavs ? JSON.parse(cachedFavs) : [];
    
    const cachedWatched = localStorage.getItem('fallenanime_watched');
    userWatched = cachedWatched ? JSON.parse(cachedWatched) : [];
}

// Sync from Firestore Cloud Database
async function syncFromFirestore() {
    if (!db || !currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            
            // Merge local storage and cloud favorites
            const cloudFavs = data.favorites || [];
            userFavorites = Array.from(new Set([...userFavorites, ...cloudFavs]));
            
            // Merge local storage and cloud watched list
            const cloudWatched = data.watched || [];
            userWatched = Array.from(new Set([...userWatched, ...cloudWatched]));
            
            // Save merged back to Firestore & Local Storage
            await db.collection('users').doc(currentUser.uid).set({
                favorites: userFavorites,
                watched: userWatched
            }, { merge: true });
            
            localStorage.setItem('fallenanime_favorites', JSON.stringify(userFavorites));
            localStorage.setItem('fallenanime_watched', JSON.stringify(userWatched));
        } else {
            // First time login - upload current local storage to Firestore
            await db.collection('users').doc(currentUser.uid).set({
                favorites: userFavorites,
                watched: userWatched
            });
        }
    } catch (err) {
        console.error("Error fetching data from Firestore:", err);
    }
}

// Update the visual state of the Favorites button
function updateFavoriteButtonState(link) {
    const favBtn = document.getElementById('favorite-btn');
    if (!favBtn) return;
    
    const isFav = userFavorites.includes(link);
    if (isFav) {
        favBtn.classList.add('active');
        favBtn.innerHTML = `<span class="heart-icon">♥</span> Favorited`;
    } else {
        favBtn.classList.remove('active');
        favBtn.innerHTML = `<span class="heart-icon">☆</span> Favorite`;
    }
}

// Render dynamic pagination control buttons
function renderPaginationControls(totalPages) {
    const container = document.getElementById('pagination-container');
    if (!container) return;
    container.innerHTML = '';
    
    // Helper to create a page button
    function createButton(text, pageNum, className = '', disabled = false) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${className}`;
        if (disabled) btn.classList.add('disabled');
        btn.innerHTML = text;
        
        if (!disabled) {
            btn.addEventListener('click', () => {
                currentPage = pageNum;
                renderCatalogGrid();
                const catSection = document.getElementById('catalog-section');
                if (catSection) {
                    const header = document.querySelector('.header');
                    const headerHeight = header ? header.offsetHeight : 80;
                    const offset = catSection.getBoundingClientRect().top + window.pageYOffset - headerHeight - 15;
                    window.scrollTo({
                        top: offset,
                        behavior: 'smooth'
                    });
                }
            });
        }
        return btn;
    }
    
    // 1. Prev Button
    container.appendChild(createButton('‹ Prev', currentPage - 1, '', currentPage === 1));
    
    // Smart page numbers display
    const range = 2; // Show active page +/- 2 pages
    
    // Always show First Page (Page 1)
    container.appendChild(createButton('1', 1, currentPage === 1 ? 'active' : ''));
    
    if (currentPage - range > 2) {
        const dots = document.createElement('span');
        dots.className = 'page-ellipsis';
        dots.textContent = '...';
        container.appendChild(dots);
    }
    
    // Middle Pages
    const start = Math.max(2, currentPage - range);
    const end = Math.min(totalPages - 1, currentPage + range);
    
    for (let i = start; i <= end; i++) {
        container.appendChild(createButton(i.toString(), i, currentPage === i ? 'active' : ''));
    }
    
    if (currentPage + range < totalPages - 1) {
        const dots = document.createElement('span');
        dots.className = 'page-ellipsis';
        dots.textContent = '...';
        container.appendChild(dots);
    }
    
    // Always show Last Page
    if (totalPages > 1) {
        container.appendChild(createButton(totalPages.toString(), totalPages, currentPage === totalPages ? 'active' : ''));
    }
    
    // 2. Next Button
    container.appendChild(createButton('Next ›', currentPage + 1, '', currentPage === totalPages));
}

// Global Firestore Comments Listener unsubscriber pointer
let commentsUnsubscribe = null;

// Fetch and listen to comments for a specific episode in real-time
function loadCommentsForEpisode(videoLink) {
    const commentsList = document.getElementById('comments-list');
    if (!commentsList) return;
    
    // Unsubscribe from previous listener if active
    if (commentsUnsubscribe) {
        commentsUnsubscribe();
        commentsUnsubscribe = null;
    }
    
    if (!db) {
        commentsList.innerHTML = `<p class="no-comments-prompt">Comments are only available when Firebase is configured.</p>`;
        return;
    }
    
    // Hash or encode the link to create a safe document ID
    const episodeId = btoa(videoLink).replace(/=/g, '').substring(0, 100);
    
    commentsList.innerHTML = `<div class="loading-comments" style="text-align: center; color: var(--text-secondary); padding: 1rem 0;">Loading comments...</div>`;
    
    // Query comments ordered by timestamp descending (newest comments first)
    commentsUnsubscribe = db.collection('episodes').doc(episodeId).collection('comments')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            commentsList.innerHTML = '';
            
            if (snapshot.empty) {
                commentsList.innerHTML = `<p class="no-comments-prompt">No comments yet. Be the first to share your thoughts!</p>`;
                return;
            }
            
            snapshot.forEach((doc) => {
                const comment = doc.data();
                const card = document.createElement('div');
                card.className = 'comment-card';
                
                let avatarHtml = '';
                if (comment.avatar) {
                    if (comment.avatar.startsWith('http')) {
                        avatarHtml = `<div class="comment-avatar"><img src="${comment.avatar}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"></div>`;
                    } else {
                        avatarHtml = `<div class="comment-avatar">${comment.avatar}</div>`;
                    }
                } else {
                    const initials = comment.username ? comment.username.charAt(0).toUpperCase() : '?';
                    avatarHtml = `<div class="comment-avatar">${initials}</div>`;
                }
                
                const formattedDate = comment.timestamp ? new Date(comment.timestamp.seconds * 1000).toLocaleString() : 'Just now';
                
                card.innerHTML = `
                    ${avatarHtml}
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-username">${comment.username || 'Anonymous User'}</span>
                            <span class="comment-date">🕒 ${formattedDate}</span>
                        </div>
                        <p class="comment-body">${escapeHtml(comment.body)}</p>
                    </div>
                `;
                commentsList.appendChild(card);
            });
        }, (error) => {
            console.error("Firestore comments subscription failed:", error);
            commentsList.innerHTML = `<p class="no-comments-prompt">Failed to load comments: ${error.message}</p>`;
        });
}

// Post a new comment
async function postCommentForEpisode(videoLink, content) {
    if (!db || !currentUser) return;
    
    const episodeId = btoa(videoLink).replace(/=/g, '').substring(0, 100);
    const username = currentUser.displayName || currentUser.email.split('@')[0];
    const userAvatar = currentUser.photoURL || "👤";
    
    try {
        await db.collection('episodes').doc(episodeId).collection('comments').add({
            username: username,
            uid: currentUser.uid,
            body: content,
            avatar: userAvatar,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error("Failed to post comment:", err);
        alert("Failed to post comment: " + err.message);
    }
}

// Simple HTML Escaper helper
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
