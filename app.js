/* app.js */
/* Frontend Script for AnimeXin Cloned Portal */

// Global helper to decode HTML entities efficiently (reusing a single element to avoid DOM thrashing)
const tempTextArea = document.createElement('textarea');
function decodeHTMLEntities(str) {
    if (!str) return '';
    if (!str.includes('&')) return str; // Fast path for strings without entities
    tempTextArea.innerHTML = str;
    return tempTextArea.value;
}

// Global State
let allVideos = [];
let filteredVideos = [];
let filteredSeries = [];
let fullVideoDetails = [];
let isFullDetailsLoaded = false;
let isFullDetailsLoading = false;
let activeFilter = 'All';
let isSyncing = false;
let syncIntervalId = null;
let catalogLayout = 'grid'; // 'grid' or 'list'
let currentView = 'episodes'; // 'episodes' or 'anime'
let currentDetailedVideo = null;
let autoSwitchInterval = null;

const safeLocalStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn("localStorage not available:", e);
            return null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn("localStorage write failed:", e);
        }
    }
};

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
const floatingScrollDownBtn = document.getElementById('floating-scroll-down-btn');
const sidebarList = document.getElementById('sidebar-list');

const catalogSection = document.getElementById('catalog-section');
const catalogHeading = document.getElementById('catalog-heading');
const catalogGrid = document.getElementById('catalog-grid');
const genreFilters = document.getElementById('genre-filters');
const layoutGridBtn = document.getElementById('layout-grid-btn');
const layoutListBtn = document.getElementById('layout-list-btn');
const navAnime = document.getElementById('nav-anime');
const drawerNavAnime = document.getElementById('drawer-nav-anime');
const sortContainer = document.getElementById('sort-container');
const catalogSort = document.getElementById('catalog-sort');

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
    initLiveChat();
    
    // Admin mode check to display Sync Hub button
    if (window.location.search.includes('admin=true') || window.location.hash.includes('admin')) {
        if (openSyncBtn) openSyncBtn.style.display = 'inline-flex';
    } else {
        if (openSyncBtn) openSyncBtn.style.display = 'none';
    }
});

// Fix image URL to route through fast global jsDelivr CDN
function fixThumbnailUrl(url) {
    if (!url || url === 'logo.png') return 'logo.png';
    if (url.startsWith('thumbnails/')) {
        return 'https://cdn.jsdelivr.net/gh/jummybilal794-lab/FallenAnime@main/' + url;
    }
    if (url.includes('raw.githubusercontent.com/jummybilal794-lab/FallenAnime/main/')) {
        return url.replace('https://raw.githubusercontent.com/jummybilal794-lab/FallenAnime/main/', 'https://cdn.jsdelivr.net/gh/jummybilal794-lab/FallenAnime@main/');
    }
    if (url.includes('animexin.dev/wp-content/uploads/') || url.includes('animexin.vip/wp-content/uploads/')) {
        const file = url.split('/').pop();
        return 'https://cdn.jsdelivr.net/gh/jummybilal794-lab/FallenAnime@main/thumbnails/' + file;
    }
    if (url.includes('luciferdonghua.in/wp-content/uploads/') && !url.includes('wp.com')) {
        return url.replace('https://luciferdonghua.in/', 'https://i0.wp.com/luciferdonghua.in/');
    }
    return url;
}

// Normalizes and maps thumbnails to clean series versions by source (Animexin vs LuciferDonghua)
function normalizeThumbnails() {
    const cleanThumbsAnimexin = {};
    const cleanThumbsLucifer = {};

    const animexinFallbackMap = {
        "beyond time": "Beyond-Time-Gaze-S2.webp",
        "mortal": "A-record-Mortal-Journey-2026.jpg",
        "battle through the heavens": "BTTH-S5-Ax.jpg",
        "ancient god sovereign": "Ancient-God-Sovereign.jpg",
        "against the sky supreme": "against-the-sky-supreme.webp",
        "against the gods": "Against-the-Gods.jpg",
        "spiritual realm walker": "Spiritual-Realm-Walker.jpg",
        "yi nian yong heng": "A-Will-Eternal.jpg",
        "a will eternal": "A-Will-Eternal.jpg",
        "raised by demons": "Raised-by-Demons-Panda-Li.jpg",
        "panda li": "Raised-by-Demons-Panda-Li.jpg",
        "aliens among immortals": "Aliens-Among-Immortals.jpg",
        "under the gate": "Under-the-Gate.jpg",
        "the great ruler": "The-Great-Ruler-3D.jpg",
        "eternal supreme": "The-Eternal-Supreme-Li-Yunxiao-New.jpg",
        "li yunxiao": "The-Eternal-Supreme-Li-Yunxiao-New.jpg",
        "li yun xiao": "The-Eternal-Supreme-Li-Yunxiao-New.jpg",
        "lingwu": "Lingwu-Continent-2024.jpg",
        "renegade immortal": "Renegade-Immortal-Ascendant.jpg",
        "martial master": "Martial-Master-2026.jpg",
        "tales of herding gods": "Tales-of-Herding-Gods-Arc.jpg",
        "golden curse": "Golden-Curse.jpg",
        "ten thousand worlds": "Wan-Jie-Du-Zun-2026.jpg",
        "wan jie du zun": "Wan-Jie-Du-Zun-2026.jpg",
        "tales of demons and gods": "Tales-of-Demons-and-Gods.jpg",
        "refining qi": "100-000-Years-of-Refining-Qi.jpg",
        "100.000": "100-000-Years-of-Refining-Qi.jpg",
        "100,000": "100-000-Years-of-Refining-Qi.jpg",
        "a good day to ascend": "A-Good-Day-to-Ascend.jpg",
        "soul land 2": "Soul-Land-2-Tang-Sect.jpg",
        "the demon hunter": "The-Demon-Hunter.jpg",
        "supreme god emperor": "Supreme-God-Emperor.jpg",
        "perfect world": "perfect-world-04-26.jpg",
        "shrouding the heavens": "Shrouding-the-Heavens-Arc.jpg",
        "swallowed star": "Swallowed-Star-S5.jpg",
        "throne of seal": "Throne-of-Seal-Shen-Yin-Wangzuo.webp",
        "gu an": "Gu-An.jpg",
        "bu liang ren": "Bu-Liang-Ren.jpg",
        "kings avatar": "The-Kings-Avatar-For-The-Glory.jpg",
        "king's avatar": "The-Kings-Avatar-For-The-Glory.jpg",
        "hundred demons": "Manual-of-Hundred-Demons.jpg",
        "my cultivator girlfriend": "My-Cultivator-Girlfriend.jpg",
        "wings of the world": "Wings-of-the-World.jpg",
        "demon spirit seed manual": "Demon-Spirit-Seed-Manual.jpg",
        "battle through": "BTTH-S5-Ax.jpg"
    };

    const luciferFallbackMap = {
        "supreme god emperor": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2020/05/supreme-god-emperor-wu-shang-shen-di-season-02.webp",
        "wu shang shen di": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2020/05/supreme-god-emperor-wu-shang-shen-di-season-02.webp",
        "ten thousand worlds": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/04/ten-thousand-worlds-season-2-lucifer-donghua.webp",
        "wan jie du zun": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/04/ten-thousand-worlds-season-2-lucifer-donghua.webp",
        "immortal tomb": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2022/10/immortal-tomb-lucifer-donghua.webp",
        "xian mu": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2022/10/immortal-tomb-lucifer-donghua.webp",
        "a will eternal": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/02/a-will-eternal-season-2.webp",
        "yi nian yong heng": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/02/a-will-eternal-season-2.webp",
        "swallowed star": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2026/02/swallowed-star-season-2-lucifer-donghua.webp",
        "perfect world": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/04/perfect-world-lucifer-donghua.webp",
        "wanmei shijie": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/04/perfect-world-lucifer-donghua.webp",
        "renegade immortal": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/09/renegade-immortal-lucifer-donghua.webp",
        "xian ni": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/09/renegade-immortal-lucifer-donghua.webp",
        "martial master": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2020/03/martial-master-lucifer-donghua.webp",
        "wu shen zhu zai": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2020/03/martial-master-lucifer-donghua.webp",
        "tales of demons and gods": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/01/tales-of-demons-and-gods-season-7-lucifer-donghua.webp",
        "yao shen ji": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/01/tales-of-demons-and-gods-season-7-lucifer-donghua.webp",
        "battle through the heavens": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2022/07/battle-through-the-heavens-season-5-lucifer-donghua.webp",
        "doupo cangqiong": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2022/07/battle-through-the-heavens-season-5-lucifer-donghua.webp",
        "against the sky supreme": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/07/against-the-sky-supreme-lucifer-donghua.webp",
        "ni tian zhizun": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2021/07/against-the-sky-supreme-lucifer-donghua.webp",
        "shrouding the heavens": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/05/shrouding-the-heavens-lucifer-donghua.webp",
        "zhe tian": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/05/shrouding-the-heavens-lucifer-donghua.webp",
        "the great ruler": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/07/the-great-ruler-3d-lucifer-donghua.webp",
        "da zhu zai": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/07/the-great-ruler-3d-lucifer-donghua.webp",
        "soul land 2": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/06/soul-land-2-the-peerless-tang-sect-lucifer-donghua.webp",
        "peerless tang sect": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/06/soul-land-2-the-peerless-tang-sect-lucifer-donghua.webp",
        "the demon hunter": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/06/the-demon-hunter-lucifer-donghua.webp",
        "chang yuan tu": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/06/the-demon-hunter-lucifer-donghua.webp",
        "eternal supreme": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/05/the-eternal-supreme-lucifer-donghua.webp",
        "wan gu shen hua": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/05/the-eternal-supreme-lucifer-donghua.webp",
        "qi refining": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/02/one-hundred-thousand-years-of-qi-refining-lucifer-donghua.webp",
        "refining qi": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2023/02/one-hundred-thousand-years-of-qi-refining-lucifer-donghua.webp",
        "tales of herding gods": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2024/10/tales-of-herding-gods-lucifer-donghua.webp",
        "mu shen ji": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2024/10/tales-of-herding-gods-lucifer-donghua.webp",
        "lingwu": "https://i0.wp.com/luciferdonghua.in/wp-content/uploads/2024/07/lingwu-continent-2024-luifer-donghua.webp",
        "magic chef": "https://i1.wp.com/luciferdonghua.in/wp-content/uploads/2021/12/the-magic-chef-of-ice-and-fire-LUCIFER-DONGHUA.webp",
        "empyrean xuan emperor": "https://i2.wp.com/luciferdonghua.in/wp-content/uploads/2022/05/the-success-of-empyrean-xuan-emperor-season-2-lucifer-donghua.webp",
        "leveling up in a fantasy world": "https://i1.wp.com/luciferdonghua.in/wp-content/uploads/2022/10/leveling-up-in-a-fantasy-world-lucifer-donghua.webp",
        "supreme lord of galaxy": "https://i2.wp.com/luciferdonghua.in/wp-content/uploads/2022/04/supreme-lord-of-galaxy-season-2-lucifer-donghua.webp",
        "myriad realms supreme": "https://i3.wp.com/luciferdonghua.in/wp-content/uploads/2022/11/myriad-realms-supreme-luicfer-donghua.webp"
    };

    const getSeriesKey = (title) => {
        if (!title) return '';
        return title.toLowerCase()
            .replace(/indonesia.*/g, '')
            .replace(/english.*/g, '')
            .replace(/subtitle.*/g, '')
            .replace(/episode.*/g, '')
            .replace(/ep\s*\d.*/g, '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/\([^\)]+\)/g, '')
            .replace(/season\s*\d+/g, '')
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // First pass: collect clean high-definition thumbnails per source
    allVideos.forEach(v => {
        if (v.thumbnail && v.thumbnail !== 'logo.png') {
            const key = getSeriesKey(v.title);
            if (key) {
                const fixed = fixThumbnailUrl(v.thumbnail);
                if (v.link && v.link.includes('luciferdonghua')) {
                    if (!cleanThumbsLucifer[key] || fixed.includes('luciferdonghua')) {
                        cleanThumbsLucifer[key] = fixed;
                    }
                } else {
                    if (!cleanThumbsAnimexin[key] || fixed.includes('jsdelivr')) {
                        cleanThumbsAnimexin[key] = fixed;
                    }
                }
            }
        }
    });

    // Second pass: assign thumbnails and normalize titles strictly based on source
    allVideos.forEach(v => {
        if (v.title) {
            v.title = v.title.replace(/[\u2019’]|â\u0080\u0099|â|\?\?/g, "'");
            if (v.title.toLowerCase().includes('beyond time')) {
                v.title = v.title.replace(/Beyond Time[^\s]+s Gaze/i, "Beyond Time's Gaze");
            }
        }
        
        const key = getSeriesKey(v.title);
        const titleLower = (v.title || '').toLowerCase();
        const isLucifer = v.link && v.link.includes('luciferdonghua');
        
        if (isLucifer) {
            // Lucifer Donghua source handling
            if (v.thumbnail && (v.thumbnail.includes('luciferdonghua') || v.thumbnail.includes('wp.com'))) {
                v.thumbnail = fixThumbnailUrl(v.thumbnail);
            } else if (key && cleanThumbsLucifer[key]) {
                v.thumbnail = cleanThumbsLucifer[key];
            } else {
                let matched = false;
                for (const [k, imgUrl] of Object.entries(luciferFallbackMap)) {
                    if (titleLower.includes(k)) {
                        v.thumbnail = imgUrl;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    v.thumbnail = v.thumbnail ? fixThumbnailUrl(v.thumbnail) : 'logo.png';
                }
            }
        } else {
            // Animexin source handling
            if (v.thumbnail && v.thumbnail.includes('jsdelivr')) {
                v.thumbnail = fixThumbnailUrl(v.thumbnail);
            } else if (key && cleanThumbsAnimexin[key]) {
                v.thumbnail = cleanThumbsAnimexin[key];
            } else {
                let matched = false;
                for (const [k, img] of Object.entries(animexinFallbackMap)) {
                    if (titleLower.includes(k)) {
                        v.thumbnail = 'https://cdn.jsdelivr.net/gh/jummybilal794-lab/FallenAnime@main/thumbnails/' + img;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    v.thumbnail = v.thumbnail ? fixThumbnailUrl(v.thumbnail) : 'logo.png';
                }
            }
        }
        
        v._timestamp = v.pubDate ? (Date.parse(v.pubDate) || 0) : 0;
    });
}

// Load catalog data from local catalog.json (Fast Initial Load)
async function loadDatabase() {
    try {
        const response = await fetch('catalog.json?t=' + new Date().getTime());
        if (!response.ok) {
            // Fallback to videos.json if catalog.json is missing
            return await loadDatabaseFallback();
        }
        allVideos = await response.json();
        
        // Normalize and clean up thumbnails
        normalizeThumbnails();
        
        allVideos.sort((a, b) => b._timestamp - a._timestamp);
        
        // Update database count
        dbCount.textContent = `${allVideos.length} Synced Videos`;

        // Render Popular Today carousel
        renderPopularCarousel();

        // Setup daily schedule buttons
        setupScheduleButtons();
        
        // Extract filter tags
        generateFilterTags();
        
        // Populate navigation drawer accordions (Genres and Donghuas)
        populateDrawerAccordions();
        
        // Render initial UI
        applyFiltersAndSearch();
        
        // Handle initial hash routing
        handleHashRoute();
    } catch (error) {
        console.error('Failed to load catalog database, falling back:', error);
        await loadDatabaseFallback();
    }
}

async function loadDatabaseFallback() {
    try {
        const response = await fetch('videos.json?t=' + new Date().getTime());
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allVideos = await response.json();
        
        // Normalize and clean up thumbnails
        normalizeThumbnails();
        
        allVideos.sort((a, b) => b._timestamp - a._timestamp);
        dbCount.textContent = `${allVideos.length} Synced Videos`;
        renderPopularCarousel();
        setupScheduleButtons();
        generateFilterTags();
        populateDrawerAccordions();
        applyFiltersAndSearch();
        handleHashRoute();
        fullVideoDetails = allVideos;
        isFullDetailsLoaded = true;
    } catch (err) {
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

    // Build a set of all base series names to exclude them from main category badges
    const seriesNamesSet = new Set();
    allVideos.forEach(v => {
        const sName = getSeriesName(v.title);
        if (sName) {
            const decodedName = decodeHTMLEntities(sName).trim().toLowerCase();
            seriesNamesSet.add(decodedName);
        }
    });

    const categoriesSet = new Set();
    const REAL_GENRES = new Set([
        'action', 'adventure', 'comedy', 'cultivation', 'demon', 'demon hunter', 
        'donghua', 'drama', 'fantasy', 'game', 'historical', 'isekai', 'magic', 
        'martial arts', 'movie', 'mystery', 'ona', 'ova', 'reincarnation', 
        'romance', 'school', 'sci-fi', 'supernatural', 'special', 'slice of life', 
        'thriller', 'mecha', 'military', 'music', 'system', 'xianxia', 
        'xuanhuan', 'harem'
    ]);

    // Helper to format string to Title Case (e.g. "martial arts" -> "Martial Arts")
    const toTitleCase = (str) => {
        if (!str) return '';
        return str.split(' ').map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    };

    allVideos.forEach(v => {
        if (v.categories && Array.isArray(v.categories)) {
            v.categories.forEach(c => {
                if (c && typeof c === 'string' && c.trim().length > 0) {
                    const decodedTag = decodeHTMLEntities(c).trim();
                    const decodedTagLower = decodedTag.toLowerCase();
                    
                    // Keep tags clean and whitelist actual genres
                    if (decodedTag.length < 25 && 
                        !decodedTag.includes('Episode') && 
                        !decodedTag.includes('Subtitle') &&
                        REAL_GENRES.has(decodedTagLower)) {
                        categoriesSet.add(toTitleCase(decodedTag));
                    }
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
    if (currentView === 'anime') {
        applyFiltersAndSearchAnime();
    } else {
        applyFiltersAndSearchEpisodes();
    }
}

function applyFiltersAndSearchEpisodes() {
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
            if (video.pubDate) {
                const dateObj = new Date(video.pubDate);
                if (!isNaN(dateObj.getTime())) {
                    const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const videoDayName = daysMap[dateObj.getDay()];
                    matchesDay = (videoDayName === activeScheduleDay);
                } else {
                    matchesDay = false;
                }
            } else {
                matchesDay = false;
            }
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

function applyFiltersAndSearchAnime() {
    const keyword = searchInput.value.toLowerCase().trim();
    
    // Group allVideos by series name
    const seriesMap = {};
    allVideos.forEach(v => {
        const sName = getSeriesName(v.title);
        if (sName) {
            const decodedName = decodeHTMLEntities(sName).trim();
            if (decodedName.length > 0) {
                const lowerName = decodedName.toLowerCase();
                if (!seriesMap[lowerName]) {
                    seriesMap[lowerName] = {
                        name: decodedName,
                        thumbnail: v.thumbnail,
                        pubDate: v.pubDate,
                        _timestamp: v._timestamp,
                        categories: v.categories || [],
                        episodes: []
                    };
                }
                // Keep the latest thumbnail and pubDate
                if (v._timestamp > seriesMap[lowerName]._timestamp) {
                    seriesMap[lowerName].thumbnail = v.thumbnail;
                    seriesMap[lowerName].pubDate = v.pubDate;
                    seriesMap[lowerName]._timestamp = v._timestamp;
                }
                seriesMap[lowerName].episodes.push(v);
            }
        }
    });
    
    const allSeries = Object.values(seriesMap);
    
    // Filter
    filteredSeries = allSeries.filter(series => {
        const matchesSearch = !keyword || series.name.toLowerCase().includes(keyword);
        const matchesCategory = activeFilter === 'All' || 
                                (series.categories && series.categories.includes(activeFilter));
        return matchesSearch && matchesCategory;
    });
    
    // Sort
    const sortVal = catalogSort ? catalogSort.value : 'newest';
    if (sortVal === 'newest') {
        filteredSeries.sort((a, b) => b._timestamp - a._timestamp);
    } else if (sortVal === 'oldest') {
        filteredSeries.sort((a, b) => a._timestamp - b._timestamp);
    } else if (sortVal === 'az') {
        filteredSeries.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortVal === 'za') {
        filteredSeries.sort((a, b) => b.name.localeCompare(a.name));
    }
    
    renderCatalogGridAnime();
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
    if (currentView === 'anime') {
        renderCatalogGridAnime();
    } else {
        renderCatalogGridEpisodes();
    }
}

function renderCatalogGridEpisodes() {
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
                <img src="${video.thumbnail || 'logo.png'}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='logo.png'; this.style.objectFit='contain'; this.style.padding='20px'; this.style.backgroundColor='#0d0e15';" alt="${titleClean}" loading="lazy">
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

function renderCatalogGridAnime() {
    catalogGrid.innerHTML = '';
    
    if (catalogLayout === 'list') {
        catalogGrid.classList.add('list-view');
    } else {
        catalogGrid.classList.remove('list-view');
    }
    
    const paginationContainer = document.getElementById('pagination-container');
    
    if (filteredSeries.length === 0) {
        catalogGrid.innerHTML = `
            <div class="loading-state">
                <p>🎬 No anime series match your current search/filters.</p>
            </div>
        `;
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }
    
    const visibleSeries = filteredSeries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    
    visibleSeries.forEach((series) => {
        // Find the maximum episode number in this series
        let maxEpNum = 0;
        series.episodes.forEach(e => {
            const num = getEpisodeNumber(e.title);
            if (num > maxEpNum) maxEpNum = num;
        });
        const epText = maxEpNum > 0 ? `Ep ${maxEpNum}` : 'Latest';
        
        const formattedDate = formatDate(series.pubDate);
        const titleClean = series.name;
        
        const card = document.createElement('div');
        card.className = 'video-card anime-series-card';
        
        card.innerHTML = `
            <div class="card-thumb-wrapper">
                <img src="${series.thumbnail || 'logo.png'}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='logo.png'; this.style.objectFit='contain'; this.style.padding='20px'; this.style.backgroundColor='#0d0e15';" alt="${titleClean}" loading="lazy">
                <span class="card-badge-top-left">Series</span>
                <span class="card-badge-bottom-left">${epText}</span>
                <span class="card-badge-bottom-right">Sub</span>
            </div>
            <div class="card-details">
                <h3 class="card-title">${titleClean}</h3>
                <div class="card-meta">
                    <span class="card-time-badge">📅 Updated: ${formattedDate}</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            searchInput.value = series.name;
            currentView = 'episodes';
            if (sortContainer) sortContainer.style.display = 'none';
            catalogHeading.textContent = 'Latest Release';
            
            // Sync nav styling to "All Episodes"
            syncActiveNavState('All');
            activeNavFilter = 'All';
            
            applyFiltersAndSearch();
            scrollToCatalog();
        });
        
        catalogGrid.appendChild(card);
    });
    
    // Render Pagination
    const totalPages = Math.ceil(filteredSeries.length / itemsPerPage);
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

    // Find detailed video with mirrors and description from dynamic loading
    let detailedVideo = null;
    if (video.mirrors) {
        video.mirrors = reorderMirrors(video.mirrors);
        detailedVideo = video;
        currentDetailedVideo = video;
    }

    if (!video.mirrors && !video._isLoadingMirrors) {
        video._isLoadingMirrors = true;
        const slug = video.link.replace('https://animexin.dev/', '').replace('https://luciferdonghua.in/', '').replace(/\/$/, '');
        fetch(`episodes/${slug}.json`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to load episode details");
                return res.json();
            })
            .then(data => {
                video.mirrors = reorderMirrors(data.mirrors || []);
                video.downloads = data.downloads || [];
                video.description = data.description || "";
                video._isLoadingMirrors = false;
                
                // If user is still on this watch page, refresh watch view
                const currentHash = window.location.hash;
                if (currentHash.startsWith('#watch?idx=')) {
                    const currentIdx = parseInt(currentHash.split('idx=')[1]);
                    if (currentIdx === index) {
                        showWatchView(index, false); // Re-render watch view without resetting scroll
                    }
                }
            })
            .catch(err => {
                console.error("Error loading episode details:", err);
                video._isLoadingMirrors = false;
                if (mirrorSelect) mirrorSelect.innerHTML = '<option>Failed to load players</option>';
                if (playerContainer) {
                    playerContainer.innerHTML = `
                        <div class="player-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 360px;">
                            <p style="color: var(--danger); font-size: 0.95rem; font-weight: 600;">❌ Failed to load players and mirrors for this episode.</p>
                            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 5px;">Please try reloading the page or select another episode.</p>
                        </div>
                    `;
                }
            });
    }

    // Update Document Title and Meta details for SEO
    const episodeTitle = sanitizeTitle(video.title);
    const episodeDesc = detailedVideo && detailedVideo.description 
        ? detailedVideo.description.substring(0, 160).trim() + '...' 
        : `Watch ${episodeTitle} in high quality with English and Indonesian subtitles.`;
    const cleanedDesc = episodeDesc.replace(/AnimeXin/gi, 'FallenAnime');
    const episodeUrl = `${window.location.origin}${window.location.pathname}#watch?idx=${index}`;
    const episodeThumb = video.thumbnail || "https://jummybilal794-lab.github.io/FallenAnime/wp-content/uploads/2021/04/Lord-of-the-Ancient-God-Grave-Subtitle.webp";

    document.title = `${episodeTitle} - FallenAnime`;
    
    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', cleanedDesc);
    
    const canonicalLink = document.getElementById('link-canonical');
    if (canonicalLink) canonicalLink.setAttribute('href', episodeUrl);
    
    // Update OpenGraph details
    const ogTitle = document.getElementById('meta-og-title');
    if (ogTitle) ogTitle.setAttribute('content', `${episodeTitle} - FallenAnime`);
    
    const ogDesc = document.getElementById('meta-og-description');
    if (ogDesc) ogDesc.setAttribute('content', cleanedDesc);
    
    const ogImage = document.getElementById('meta-og-image');
    if (ogImage) ogImage.setAttribute('content', episodeThumb);
    
    const ogUrl = document.getElementById('meta-og-url');
    if (ogUrl) ogUrl.setAttribute('content', episodeUrl);
    
    // Update Twitter details
    const twTitle = document.getElementById('meta-tw-title');
    if (twTitle) twTitle.setAttribute('content', `${episodeTitle} - FallenAnime`);
    
    const twDesc = document.getElementById('meta-tw-description');
    if (twDesc) twDesc.setAttribute('content', cleanedDesc);
    
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
    
    const defaultEmbedUrl = detailedVideo && detailedVideo.mirrors && detailedVideo.mirrors.length > 0 
        ? (detailedVideo.mirrors[0].embedUrl || "") 
        : "";
    
    const videoSchema = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": episodeTitle,
        "description": detailedVideo && detailedVideo.description 
            ? detailedVideo.description.replace(/AnimeXin/gi, 'FallenAnime') 
            : `Watch ${episodeTitle} on FallenAnime with English and Indonesian subtitles.`,
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
    watchDescription.textContent = detailedVideo 
        ? (detailedVideo.description || 'No synopsis details available.').replace(/AnimeXin/gi, 'FallenAnime')
        : 'Loading synopsis details...';
    
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

    // Populate Mirrors dropdown & Player
    mirrorSelect.innerHTML = '';
    
    if (!detailedVideo) {
        // Show Loading State
        mirrorSelect.innerHTML = '<option>Loading video mirrors...</option>';
        const downloadBox = document.getElementById('download-box');
        if (downloadBox) downloadBox.style.display = 'none';
        const shareBox = document.getElementById('share-box');
        if (shareBox) shareBox.style.display = 'none';
        
        playerContainer.innerHTML = `
            <div class="player-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 360px;">
                <div style="width: 40px; height: 40px; border: 4px solid rgba(229, 9, 20, 0.1); border-top-color: var(--accent-red); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1.25rem;"></div>
                <p style="color: var(--text-secondary); font-size: 0.95rem; font-weight: 600;">Loading video players and mirrors... Please wait a moment.</p>
            </div>
        `;
    } else if (detailedVideo.mirrors && detailedVideo.mirrors.length > 0) {
        // Mirrors are already prioritized by English Sub and reliable CDN via reorderMirrors
        detailedVideo.mirrors.forEach((mirror) => {
            const opt = document.createElement('option');
            opt.value = mirror.index;
            opt.textContent = mirror.label;
            mirrorSelect.appendChild(opt);
        });
        
        // Listen to mirror changes
        mirrorSelect.onchange = () => {
            const selectedIdx = mirrorSelect.value;
            const mirror = detailedVideo.mirrors.find(m => m.index == selectedIdx);
            if (mirror) {
                loadMirrorPlayer(mirror, detailedVideo.title);
            }
        };

        // Wire up manual Next Working Mirror button
        const switchBtn = document.getElementById('btn-switch-next-mirror');
        if (switchBtn) {
            switchBtn.onclick = (e) => {
                e.preventDefault();
                switchToNextWorkingMirror("User clicked switch button");
            };
        }

        // Load highest-priority mirror (English Sub #1) as default
        loadMirrorPlayer(detailedVideo.mirrors[0], detailedVideo.title);

        // Populate download/source links
        const downloadBox = document.getElementById('download-box');
        const downloadLinksGrid = document.getElementById('download-links-grid');
        if (downloadBox && downloadLinksGrid) {
            downloadLinksGrid.innerHTML = '';
            downloadBox.style.display = 'block';
            
            // Render high-quality direct downloads if present
            if (detailedVideo.downloads && detailedVideo.downloads.length > 0) {
                detailedVideo.downloads.forEach((dl) => {
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
                // Fallback to mirrors for download
                detailedVideo.mirrors.forEach((mirror) => {
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
            const shareText = encodeURIComponent(`Watch ${detailedVideo.title} on FallenAnime!`);
            
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

    // Setup Episode Navigation (Prev / Next)
    const epPrevBtn = document.getElementById('ep-prev-btn');
    const epListBtn = document.getElementById('ep-list-btn');
    const epNextBtn = document.getElementById('ep-next-btn');

    if (epPrevBtn && epListBtn && epNextBtn) {
        // Clone buttons to clear existing listeners
        const newPrev = epPrevBtn.cloneNode(true);
        const newNext = epNextBtn.cloneNode(true);
        const newList = epListBtn.cloneNode(true);
        
        epPrevBtn.parentNode.replaceChild(newPrev, epPrevBtn);
        epNextBtn.parentNode.replaceChild(newNext, epNextBtn);
        epListBtn.parentNode.replaceChild(newList, epListBtn);

        // Find related videos from same series
        const seriesName = getSeriesName(video.title);
        let relatedVideos = [];
        if (seriesName) {
            relatedVideos = allVideos.filter(v => {
                return v.title.toLowerCase().includes(seriesName.toLowerCase());
            });
        }
        
        // Sort related videos by episode number descending (Newest first, e.g. Ep 3, Ep 2, Ep 1)
        relatedVideos.sort((a, b) => {
            const epA = getEpisodeNumber(a.title);
            const epB = getEpisodeNumber(b.title);
            return epB - epA;
        });

        // Find current video index in series list
        const currentIdxInRelated = relatedVideos.findIndex(v => v.link === video.link);

        if (currentIdxInRelated !== -1) {
            // Next Episode (higher number, index decreases in descending list)
            const nextVideoObj = relatedVideos[currentIdxInRelated - 1];
            if (nextVideoObj) {
                newNext.disabled = false;
                newNext.onclick = () => {
                    const mainIndex = allVideos.findIndex(v => v.link === nextVideoObj.link);
                    if (mainIndex !== -1) window.location.hash = `#watch?idx=${mainIndex}`;
                };
            } else {
                newNext.disabled = true;
            }

            // Previous Episode (lower number, index increases in descending list)
            const prevVideoObj = relatedVideos[currentIdxInRelated + 1];
            if (prevVideoObj) {
                newPrev.disabled = false;
                newPrev.onclick = () => {
                    const mainIndex = allVideos.findIndex(v => v.link === prevVideoObj.link);
                    if (mainIndex !== -1) window.location.hash = `#watch?idx=${mainIndex}`;
                };
            } else {
                newPrev.disabled = true;
            }
        } else {
            newPrev.disabled = true;
            newNext.disabled = true;
        }

        // List button scroll to sidebar
        newList.onclick = () => {
            const sidebarSection = document.querySelector('.watch-sidebar');
            if (sidebarSection) {
                sidebarSection.scrollIntoView({ behavior: 'smooth' });
            }
        };
    }

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

// Check if mirror is a placeholder / not released yet
function isPlaceholderMirror(mirror) {
    if (!mirror) return false;
    const url = (mirror.embedUrl || '').toLowerCase();
    const html = (mirror.embedHtml || '').toLowerCase();
    const label = (mirror.label || '').toLowerCase();
    
    if (url.includes('t.co/') || url.includes('bit.ly/') || url.includes('tinyurl.com/')) return true;
    if (html.includes('t.co/') || html.includes('bit.ly/') || html.includes('tinyurl.com/')) return true;
    if (label.includes('today evening') || label.includes('released soon') || label.includes('placeholder')) return true;
    
    return false;
}

// Global set to track failed mirrors for the current episode session
window._failedMirrors = window._failedMirrors || new Set();

// Shows a non-intrusive floating toast notification when switching mirrors
function showMirrorSwitchToast(message, isError = false) {
    let toast = document.getElementById('mirror-switch-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mirror-switch-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid var(--accent-red, #e50914);
            border-left: 5px solid var(--accent-red, #e50914);
            color: #ffffff;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 100000;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            transform: translateY(-20px);
            opacity: 0;
            pointer-events: none;
            backdrop-filter: blur(8px);
        `;
        document.body.appendChild(toast);
    }
    
    toast.innerHTML = `<span style="font-size: 1.2rem;">${isError ? '⚠️' : '⚡'}</span> <span>${message}</span>`;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
    
    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
    }, 4000);
}

// Switches to the next available working mirror (prioritizing English Sub)
function switchToNextWorkingMirror(reason = "Server unavailable") {
    if (!currentDetailedVideo || !currentDetailedVideo.mirrors || currentDetailedVideo.mirrors.length <= 1) {
        showMirrorSwitchToast("No alternative mirror servers available for this episode.", true);
        return;
    }
    
    const currentIdx = parseInt(mirrorSelect ? mirrorSelect.value : "1") || 1;
    window._failedMirrors.add(currentIdx);
    
    // Find next untried mirror (mirrors are already sorted by English Sub priority via reorderMirrors)
    let nextMirror = currentDetailedVideo.mirrors.find(m => !window._failedMirrors.has(m.index) && !isPlaceholderMirror(m));
    
    // If all untried mirrors are exhausted, reset failed tracking and cycle to next mirror
    if (!nextMirror) {
        window._failedMirrors.clear();
        const curListIdx = currentDetailedVideo.mirrors.findIndex(m => m.index == currentIdx);
        const nextListIdx = (curListIdx + 1) % currentDetailedVideo.mirrors.length;
        nextMirror = currentDetailedVideo.mirrors[nextListIdx];
    }
    
    if (nextMirror) {
        console.log(`[Mirror Auto-Failover] ${reason}. Switching from mirror ${currentIdx} to mirror ${nextMirror.index} (${nextMirror.label})`);
        if (mirrorSelect) mirrorSelect.value = nextMirror.index;
        showMirrorSwitchToast(`Switching to backup server: ${nextMirror.label}`);
        loadMirrorPlayer(nextMirror, currentDetailedVideo.title);
    }
}

// Load mirror HTML/Iframe into container
function loadMirrorPlayer(mirror, videoTitle) {
    if (!mirror) return;
    
    // Clear any active auto-switch timers
    if (autoSwitchInterval) {
        clearInterval(autoSwitchInterval);
        autoSwitchInterval = null;
    }
    
    // If this mirror is a placeholder, check if there's another non-placeholder mirror available
    if (isPlaceholderMirror(mirror)) {
        if (currentDetailedVideo && currentDetailedVideo.mirrors) {
            const nonPlaceholder = currentDetailedVideo.mirrors.find(m => !isPlaceholderMirror(m));
            if (nonPlaceholder && nonPlaceholder.index !== mirror.index) {
                console.log(`[Mirror Failover] Mirror ${mirror.index} is placeholder. Auto-switching to working mirror ${nonPlaceholder.index}`);
                if (mirrorSelect) mirrorSelect.value = nonPlaceholder.index;
                loadMirrorPlayer(nonPlaceholder, videoTitle);
                return;
            }
        }
        
        playerContainer.innerHTML = `
            <div class="player-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 360px;">
                <div style="font-size: 3.5rem; margin-bottom: 1rem; animation: pulse 2s infinite;">⏳</div>
                <p style="color: var(--accent); font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem 0;">Episode Not Released Yet</p>
                <p style="font-size: 0.9rem; color: var(--text-muted); max-width: 380px; margin: 0; line-height: 1.5;">This episode is currently a placeholder on the source server. The full video will play automatically once it is officially released by the subbers!</p>
            </div>
        `;
        return;
    }
    
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

    // Attach error detection listener on the iframe
    const iframeEl = playerContainer.querySelector('iframe');
    if (iframeEl) {
        iframeEl.onerror = () => {
            console.warn(`[Iframe Error] Player failed to load for mirror ${mirror.index}`);
            switchToNextWorkingMirror("Player iframe error");
        };
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
    // Normalize apostrophes
    cleaned = cleaned.replace(/[\u2019’]|â\u0080\u0099|â|\?\?/g, "'");
    const parts = cleaned.split(/(?:Episode|Ep)\s*\d+/i);
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
                <img src="${video.thumbnail || 'logo.png'}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='logo.png'; this.style.objectFit='contain'; this.style.padding='5px'; this.style.backgroundColor='#0d0e15';" alt="${sanitizedTitle}">
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

function syncActiveNavState(filterName) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelectorAll('.drawer-nav-link').forEach(link => link.classList.remove('active'));
    
    if (filterName === 'All') {
        if (navAll) navAll.classList.add('active');
        const dAll = document.getElementById('drawer-nav-all');
        if (dAll) dAll.classList.add('active');
    } else if (filterName === 'Anime') {
        if (navAnime) navAnime.classList.add('active');
        const dAnime = document.getElementById('drawer-nav-anime');
        if (dAnime) dAnime.classList.add('active');
    } else if (filterName === 'Favorites') {
        if (navFavorites) navFavorites.classList.add('active');
        const dFav = document.getElementById('drawer-nav-favorites');
        if (dFav) dFav.classList.add('active');
    } else if (filterName === 'History') {
        if (navHistory) navHistory.classList.add('active');
        const dHist = document.getElementById('drawer-nav-history');
        if (dHist) dHist.classList.add('active');
    }
}

function updateDrawerAuthState(user) {
    const drawerProfile = document.getElementById('drawer-profile');
    const drawerUsername = document.getElementById('drawer-username');
    const drawerUserEmail = document.getElementById('drawer-user-email');
    const drawerUserAvatar = document.getElementById('drawer-user-avatar');
    const drawerNavFavorites = document.getElementById('drawer-nav-favorites');
    const drawerNavHistory = document.getElementById('drawer-nav-history');
    const drawerNavSync = document.getElementById('drawer-nav-sync');
    const drawerAuthBtn = document.getElementById('drawer-auth-btn');
    const drawerLogoutBtn = document.getElementById('drawer-logout-btn');

    if (user) {
        if (drawerProfile) drawerProfile.style.display = 'flex';
        if (drawerUsername) drawerUsername.textContent = user.displayName ? user.displayName : user.email.split('@')[0];
        if (drawerUserEmail) drawerUserEmail.textContent = user.email;
        if (drawerUserAvatar) {
            const avatarVal = user.photoURL || "👤";
            if (avatarVal.startsWith('http')) {
                drawerUserAvatar.innerHTML = `<img src="${avatarVal}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            } else {
                drawerUserAvatar.textContent = avatarVal;
            }
        }
        if (drawerNavFavorites) drawerNavFavorites.style.display = 'flex';
        if (drawerNavHistory) drawerNavHistory.style.display = 'flex';
        if (drawerNavSync) {
            if (window.location.search.includes('admin=true') || window.location.hash.includes('admin')) {
                drawerNavSync.style.display = 'flex';
            } else {
                drawerNavSync.style.display = 'none';
            }
        }
        if (drawerAuthBtn) drawerAuthBtn.style.display = 'none';
        if (drawerLogoutBtn) drawerLogoutBtn.style.display = 'block';
    } else {
        if (drawerProfile) drawerProfile.style.display = 'none';
        if (drawerNavFavorites) drawerNavFavorites.style.display = 'none';
        if (drawerNavHistory) drawerNavHistory.style.display = 'none';
        if (drawerNavSync) drawerNavSync.style.display = 'none';
        if (drawerAuthBtn) drawerAuthBtn.style.display = 'block';
        if (drawerLogoutBtn) drawerLogoutBtn.style.display = 'none';
    }
}

function populateDrawerAccordions() {
    const genresContent = document.getElementById('drawer-genres-content');
    const donghuasContent = document.getElementById('drawer-donghuas-content');
    if (!genresContent || !donghuasContent) return;

    genresContent.innerHTML = '';
    donghuasContent.innerHTML = '';


    // Helper to close drawer
    const closeDrawer = () => {
        const drawer = document.getElementById('nav-drawer');
        const drawerOverlay = document.getElementById('nav-drawer-overlay');
        if (drawer) drawer.classList.remove('active');
        if (drawerOverlay) drawerOverlay.classList.remove('active');
    };

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

    // Helper to format string to Title Case (e.g. "martial arts" -> "Martial Arts")
    const toTitleCase = (str) => {
        if (!str) return '';
        return str.split(' ').map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    };

    // Build a clean, unique set of all series names first (decoded)
    const seriesNamesSet = new Set();
    const seriesListDecoded = new Set();
    const seriesThumbnails = {};
    
    allVideos.forEach(v => {
        const sName = getSeriesName(v.title);
        if (sName) {
            const decodedName = decodeHTMLEntities(sName).trim();
            if (decodedName.length > 0) {
                seriesNamesSet.add(decodedName.toLowerCase());
                seriesListDecoded.add(decodedName);
                if (!seriesThumbnails[decodedName]) {
                    seriesThumbnails[decodedName] = v.thumbnail;
                }
            }
        }
    });

    // 1. Extract Unique Genres (excluding series names, episode names, and subtitles)
    const genres = new Set();
    const REAL_GENRES = new Set([
        'action', 'adventure', 'comedy', 'cultivation', 'demon', 'demon hunter', 
        'donghua', 'drama', 'fantasy', 'game', 'historical', 'isekai', 'magic', 
        'martial arts', 'movie', 'mystery', 'ona', 'ova', 'reincarnation', 
        'romance', 'school', 'sci-fi', 'supernatural', 'special', 'slice of life', 
        'thriller', 'mecha', 'military', 'music', 'system', 'xianxia', 
        'xuanhuan', 'harem'
    ]);

    allVideos.forEach(v => {
        if (v.categories && Array.isArray(v.categories)) {
            v.categories.forEach(c => {
                if (c && typeof c === 'string' && c.trim().length > 0) {
                    const decodedTag = decodeHTMLEntities(c).trim();
                    const decodedTagLower = decodedTag.toLowerCase();
                    
                    if (decodedTag.length < 25 && 
                        !decodedTag.includes('Episode') && 
                        !decodedTag.includes('Subtitle') &&
                        REAL_GENRES.has(decodedTagLower)) {
                        genres.add(toTitleCase(decodedTag));
                    }
                }
            });
        }
    });
    
    // Convert to sorted array
    const sortedGenres = Array.from(genres).sort();
    sortedGenres.forEach(genre => {
        const btn = document.createElement('button');
        btn.className = 'drawer-sub-item';
        btn.textContent = genre;
        btn.addEventListener('click', () => {
            closeDrawer();
            // Filter by this genre
            activeFilter = genre;
            activeNavFilter = 'All';
            activeScheduleDay = null;
            document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
            
            // Highlight active state in genre badge list
            document.querySelectorAll('.filter-badge').forEach(b => {
                if (b.textContent === genre) b.classList.add('active');
                else b.classList.remove('active');
            });
            
            applyFiltersAndSearch();
            scrollToCatalog();
        });
        genresContent.appendChild(btn);
    });

    // 2. Extract Unique Series Names (Donghuas) with Thumbnails
    const sortedSeries = Array.from(seriesListDecoded).sort();
    sortedSeries.forEach(series => {
        const card = document.createElement('div');
        card.className = 'drawer-series-card';
        
        // Thumbnail Image
        const img = document.createElement('img');
        img.src = seriesThumbnails[series] || 'logo.png';
        img.onerror = function() {
            this.onerror = null;
            this.src = 'logo.png';
            this.style.objectFit = 'contain';
            this.style.padding = '5px';
            this.style.backgroundColor = '#0d0e15';
        };
        img.alt = series;
        img.className = 'drawer-series-thumb';
        img.loading = 'lazy';
        
        // Title Text
        const titleSpan = document.createElement('span');
        titleSpan.className = 'drawer-series-title';
        titleSpan.textContent = series;
        
        card.appendChild(img);
        card.appendChild(titleSpan);
        
        card.addEventListener('click', () => {
            closeDrawer();
            currentView = 'episodes';
            if (sortContainer) sortContainer.style.display = 'none';
            catalogHeading.textContent = 'Latest Release';
            // Set search bar to this series name and filter
            searchInput.value = series;
            activeFilter = 'All';
            activeNavFilter = 'All';
            activeScheduleDay = null;
            document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
            
            applyFiltersAndSearch();
            scrollToCatalog();
        });
        donghuasContent.appendChild(card);
    });
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
    
    // Hamburger Menu Drawer Event Listeners
    const hamburgerBtn = document.getElementById('hamburger-menu-btn');
    const drawer = document.getElementById('nav-drawer');
    const drawerOverlay = document.getElementById('nav-drawer-overlay');
    const drawerCloseBtn = document.getElementById('nav-drawer-close-btn');
    
    const openDrawer = () => {
        if (drawer) drawer.classList.add('active');
        if (drawerOverlay) drawerOverlay.classList.add('active');
    };
    
    const closeDrawer = () => {
        if (drawer) drawer.classList.remove('active');
        if (drawerOverlay) drawerOverlay.classList.remove('active');
    };
    
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openDrawer);
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

    const drawerNavAll = document.getElementById('drawer-nav-all');
    const drawerNavFavorites = document.getElementById('drawer-nav-favorites');
    const drawerNavHistory = document.getElementById('drawer-nav-history');
    const drawerNavSync = document.getElementById('drawer-nav-sync');
    const drawerAuthBtn = document.getElementById('drawer-auth-btn');
    const drawerLogoutBtn = document.getElementById('drawer-logout-btn');

    if (drawerNavAll) {
        drawerNavAll.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
            navAll.click();
            syncActiveNavState('All');
        });
    }

    if (drawerNavAnime) {
        drawerNavAnime.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
            if (navAnime) navAnime.click();
            syncActiveNavState('Anime');
        });
    }

    if (drawerNavFavorites) {
        drawerNavFavorites.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
            navFavorites.click();
            syncActiveNavState('Favorites');
        });
    }

    if (drawerNavHistory) {
        drawerNavHistory.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
            navHistory.click();
            syncActiveNavState('History');
        });
    }

    if (drawerNavSync) {
        drawerNavSync.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
            openSyncBtn.click();
        });
    }

    if (drawerAuthBtn) {
        drawerAuthBtn.addEventListener('click', () => {
            closeDrawer();
            const authBtnHeader = document.getElementById('auth-btn');
            if (authBtnHeader) authBtnHeader.click();
        });
    }

    if (drawerLogoutBtn) {
        drawerLogoutBtn.addEventListener('click', () => {
            closeDrawer();
            const menuLogoutHeader = document.getElementById('menu-logout');
            if (menuLogoutHeader) menuLogoutHeader.click();
        });
    }

    // Release Schedule Event Listener
    const drawerNavSchedule = document.getElementById('drawer-nav-schedule');
    const scheduleModal = document.getElementById('schedule-modal');
    const scheduleModalClose = document.getElementById('schedule-modal-close');
    const scheduleList = document.getElementById('schedule-list');

    if (drawerNavSchedule && scheduleModal && scheduleList) {
        drawerNavSchedule.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
            
            // Build the schedule list HTML
            const releaseSchedule = [
                { day: 'Monday', series: [] },
                { day: 'Tuesday', series: [
                    { name: 'Martial Master', time: '03:15', syncTime: '03:17' },
                    { name: 'Shrouding the Heavens', time: '13:00', syncTime: '13:17' }
                ] },
                { day: 'Wednesday', series: [
                    { name: 'A Will Eternal', time: '05:00', syncTime: '05:17' },
                    { name: 'Throne of Seal', time: '13:00', syncTime: '13:17' }
                ] },
                { day: 'Thursday', series: [] },
                { day: 'Friday', series: [
                    { name: 'The Great Ruler', time: '01:30', syncTime: '02:17' },
                    { name: 'Perfect World', time: '02:30', syncTime: '03:17' },
                    { name: 'Soul Land 2: The Peerless Tang Sect', time: '13:00', syncTime: '13:17' }
                ] },
                { day: 'Saturday', series: [
                    { name: 'Battle Through the Heavens', time: '12:00', syncTime: '12:17' }
                ] },
                { day: 'Sunday', series: [
                    { name: 'Beyond Time\'s Gaze', time: '02:30', syncTime: '03:17' },
                    { name: 'Martial Master', time: '03:15', syncTime: '03:17' },
                    { name: 'Tales of Herding Gods', time: '04:00', syncTime: '04:17' },
                    { name: 'Renegade Immortal', time: '12:00', syncTime: '12:17' }
                ] }
            ];

            const now = new Date();
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayName = daysOfWeek[now.getDay()];

            // Helper to get local time
            const getLocalReleaseTime = (utcTimeStr) => {
                const [hours, minutes] = utcTimeStr.split(':').map(Number);
                const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes));
                return utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            };

            let scheduleHtml = '';
            
            // 1. Generate "Today's Releases" section first at the top
            const todaySchedule = releaseSchedule.find(item => item.day === todayName);
            if (todaySchedule && todaySchedule.series.length > 0) {
                scheduleHtml += `
                    <div class="schedule-today-box">
                        <h3 class="schedule-today-title">🔥 Uploading Today (${todayName})</h3>
                        <ul class="schedule-series-list">
                `;
                todaySchedule.series.forEach(s => {
                    const localTime = getLocalReleaseTime(s.time);
                    const localSync = getLocalReleaseTime(s.syncTime);
                    scheduleHtml += `
                        <li class="schedule-series-item" style="border-bottom: 1px solid rgba(239, 68, 68, 0.15); padding: 12px 15px; flex-wrap: wrap; gap: 8px;">
                            <span class="schedule-series-name" style="font-weight: bold; color: white;">${s.name}</span>
                            <div style="display: flex; gap: 10px; align-items: center; margin-left: auto;">
                                <span style="font-size: 0.75rem; color: var(--text-muted);">Released: <strong style="color: var(--text-normal);">${localTime}</strong></span>
                                <span class="schedule-series-time" style="background: var(--accent-red); color: white; box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);">On Site: ${localSync}</span>
                            </div>
                        </li>
                    `;
                });
                scheduleHtml += `
                        </ul>
                    </div>
                `;
            } else {
                scheduleHtml += `
                    <div class="schedule-today-box" style="background: rgba(255, 255, 255, 0.02); border-color: var(--border-color); box-shadow: none; padding: 12px 15px;">
                        <h3 class="schedule-today-title" style="color: var(--text-muted);">📅 Uploading Today (${todayName})</h3>
                        <div style="font-size: 0.85rem; color: var(--text-muted); padding: 5px 0;">
                            No new episodes scheduled to release today. Check the weekly list below!
                        </div>
                    </div>
                `;
            }

            // 2. Generate weekly list below it
            releaseSchedule.forEach(item => {
                const isToday = item.day === todayName;
                const todayHeaderClass = isToday ? 'schedule-day-header today' : 'schedule-day-header';
                const todayIndicator = isToday ? '<span style="font-size: 0.75rem; background: var(--accent-red); color: white; padding: 2px 6px; border-radius: 4px; font-weight: 800; text-transform: uppercase;">Today</span>' : '';
                
                scheduleHtml += `
                    <div class="schedule-day-block">
                        <div class="${todayHeaderClass}">
                            <span>${item.day}</span>
                            ${todayIndicator}
                        </div>
                        <ul class="schedule-series-list">
                `;

                if (item.series.length > 0) {
                    item.series.forEach(s => {
                        const localTime = getLocalReleaseTime(s.time);
                        const localSync = getLocalReleaseTime(s.syncTime);
                        scheduleHtml += `
                            <li class="schedule-series-item" style="flex-wrap: wrap; gap: 8px;">
                                <span class="schedule-series-name">${s.name}</span>
                                <div style="display: flex; gap: 10px; align-items: center; margin-left: auto;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">Released: <strong style="color: var(--text-normal);">${localTime}</strong></span>
                                    <span class="schedule-series-time">On Site: ${localSync}</span>
                                </div>
                            </li>
                        `;
                    });
                } else {
                    scheduleHtml += `
                        <li class="schedule-series-item" style="color: var(--text-muted); font-style: italic; font-size: 0.85rem; padding: 12px 15px;">
                            No releases scheduled
                        </li>
                    `;
                }

                scheduleHtml += `
                        </ul>
                    </div>
                `;
            });

            scheduleList.innerHTML = scheduleHtml;
            scheduleModal.style.display = 'flex';
        });
    }

    if (scheduleModalClose && scheduleModal) {
        scheduleModalClose.addEventListener('click', () => {
            scheduleModal.style.display = 'none';
        });
        
        // Close modal when clicking outside card
        scheduleModal.addEventListener('click', (e) => {
            if (e.target === scheduleModal) {
                scheduleModal.style.display = 'none';
            }
        });
    }

    // Drawer Accordion Toggles
    const genresToggle = document.getElementById('drawer-genres-toggle');
    const genresContent = document.getElementById('drawer-genres-content');
    const donghuasToggle = document.getElementById('drawer-donghuas-toggle');
    const donghuasContent = document.getElementById('drawer-donghuas-content');
    
    if (genresToggle && genresContent) {
        genresToggle.addEventListener('click', () => {
            genresToggle.classList.toggle('active');
            genresContent.classList.toggle('active');
        });
    }
    
    if (donghuasToggle && donghuasContent) {
        donghuasToggle.addEventListener('click', () => {
            donghuasToggle.classList.toggle('active');
            donghuasContent.classList.toggle('active');
        });
    }
    
    // Search Enter key scroll trigger
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (window.location.hash.startsWith('#watch')) {
                window.location.hash = '';
                hideWatchView();
            }
            applyFiltersAndSearch();
            if (floatingScrollDownBtn) floatingScrollDownBtn.style.display = 'flex';
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
            if (floatingScrollDownBtn) floatingScrollDownBtn.style.display = 'flex';
            setTimeout(() => {
                scrollToCatalog();
            }, 50);
        });
    }

    // Floating Scroll Down Button Handler
    if (floatingScrollDownBtn) {
        floatingScrollDownBtn.addEventListener('click', () => {
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'smooth'
            });
            floatingScrollDownBtn.style.display = 'none';
        });

        // Hide when scrolled near the bottom (within 150px)
        window.addEventListener('scroll', () => {
            if (floatingScrollDownBtn.style.display === 'flex') {
                if ((window.innerHeight + window.pageYOffset) >= document.documentElement.scrollHeight - 150) {
                    floatingScrollDownBtn.style.display = 'none';
                }
            }
        });
    }
    
    // Logo / Brand clicks
    logoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentView = 'episodes';
        if (sortContainer) sortContainer.style.display = 'none';
        catalogHeading.textContent = 'Latest Release';
        searchInput.value = '';
        activeFilter = 'All';
        activeScheduleDay = null;
        document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
        window.location.hash = '';
        hideWatchView();
        if (floatingScrollDownBtn) floatingScrollDownBtn.style.display = 'none';
        applyFiltersAndSearch();
    });
    
    navAll.addEventListener('click', (e) => {
        e.preventDefault();
        currentView = 'episodes';
        if (sortContainer) sortContainer.style.display = 'none';
        catalogHeading.textContent = 'Latest Release';
        searchInput.value = '';
        activeFilter = 'All';
        activeScheduleDay = null;
        document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
        window.location.hash = '';
        hideWatchView();
        if (floatingScrollDownBtn) floatingScrollDownBtn.style.display = 'none';
        applyFiltersAndSearch();
    });

    if (navAnime) {
        navAnime.addEventListener('click', (e) => {
            e.preventDefault();
            currentView = 'anime';
            syncActiveNavState('Anime');
            if (sortContainer) sortContainer.style.display = 'flex';
            catalogHeading.textContent = 'All Anime Series';
            searchInput.value = '';
            activeFilter = 'All';
            activeScheduleDay = null;
            document.querySelectorAll('.schedule-btn').forEach(b => b.classList.remove('active'));
            window.location.hash = '';
            hideWatchView();
            if (floatingScrollDownBtn) floatingScrollDownBtn.style.display = 'none';
            applyFiltersAndSearch();
        });
    }

    if (catalogSort) {
        catalogSort.addEventListener('change', () => {
            currentPage = 1;
            applyFiltersAndSearch();
        });
    }

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
                <img src="${video.thumbnail || 'logo.png'}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='logo.png'; this.style.objectFit='contain'; this.style.padding='20px'; this.style.backgroundColor='#0d0e15';" alt="${sanitizedTitle}" loading="lazy">
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
                updateDrawerAuthState(user);
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
            currentView = 'episodes';
            if (sortContainer) sortContainer.style.display = 'none';
            catalogHeading.textContent = 'My Favorites';
            syncActiveNavState('Favorites');
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
            currentView = 'episodes';
            if (sortContainer) sortContainer.style.display = 'none';
            catalogHeading.textContent = 'Watch History';
            syncActiveNavState('History');
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
            currentView = 'episodes';
            if (sortContainer) sortContainer.style.display = 'none';
            catalogHeading.textContent = 'Latest Release';
            syncActiveNavState('All');
            activeNavFilter = 'All';
            applyFiltersAndSearch();
        });
    }

    // Favorites Menu Click
    if (menuFavorites) {
        menuFavorites.addEventListener('click', (e) => {
            e.preventDefault();
            syncActiveNavState('Favorites');
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
            syncActiveNavState('History');
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
    safeLocalStorage.setItem('fallenanime_favorites', JSON.stringify(userFavorites));
    
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
        safeLocalStorage.setItem('fallenanime_watched', JSON.stringify(userWatched));
        
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
    const cachedFavs = safeLocalStorage.getItem('fallenanime_favorites');
    userFavorites = cachedFavs ? JSON.parse(cachedFavs) : [];
    
    const cachedWatched = safeLocalStorage.getItem('fallenanime_watched');
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
            
            safeLocalStorage.setItem('fallenanime_favorites', JSON.stringify(userFavorites));
            safeLocalStorage.setItem('fallenanime_watched', JSON.stringify(userWatched));
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

// Live Chat Room with 1-day message retention
// Live Chat Room with 1-day message retention & Local AI Chatbot Fallback
function initLiveChat() {
    const messagesArea = document.getElementById('chat-messages-area');
    const messageInput = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('chat-send-btn');
    
    if (!messagesArea || !messageInput || !sendBtn) return;
    
    let isLocalMode = false;
    let localMessages = [];
    
    // Helper to render a message
    function appendMessage(username, text, timestamp, userId, isBot = false) {
        let timeStr = "";
        if (timestamp) {
            const dateObj = new Date(timestamp);
            timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        const isSelf = currentUser && currentUser.uid === userId;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message${isSelf ? ' self' : ''}${isBot ? ' bot-msg' : ''}`;
        msgDiv.innerHTML = `
            <div class="chat-msg-header">
                <span class="chat-msg-user" style="${isBot ? 'color: var(--accent-red, #e50914); font-weight: bold;' : ''}">${escapeHtml(username)} ${isBot ? '<span class="bot-badge" style="background: var(--accent-red, #e50914); color: #fff; font-size: 0.65rem; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">BOT</span>' : ''}</span>
                <span class="chat-msg-time">${timeStr}</span>
            </div>
            <div class="chat-msg-body">${escapeHtml(text)}</div>
        `;
        messagesArea.appendChild(msgDiv);
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
    
    function loadLocalMessages() {
        try {
            const stored = localStorage.getItem('local_chat_messages');
            if (stored) {
                localMessages = JSON.parse(stored);
            }
        } catch (e) {
            localMessages = [];
        }
        
        messagesArea.innerHTML = '';
        if (localMessages.length === 0) {
            messagesArea.innerHTML = '<div class="chat-system-message">Welcome to FallenAnime Chat! Connect with others or chat with our assistant bot 🤖.</div>';
            setTimeout(() => {
                appendMessage('FallenBot', 'Hello! I am FallenBot, your virtual anime assistant. How can I help you today?', Date.now(), 'bot', true);
            }, 500);
        } else {
            localMessages.forEach(m => {
                appendMessage(m.username, m.text, m.timestamp, m.userId, m.isBot);
            });
        }
    }
    
    function enableLocalMode() {
        isLocalMode = true;
        loadLocalMessages();
        messageInput.disabled = false;
        sendBtn.disabled = false;
    }
    
    function triggerBotResponse(userText, toFirebase = false) {
        const textLower = userText.toLowerCase();
        let reply = "";
        
        if (textLower.includes('help') || textLower.includes('how to') || textLower.includes('work')) {
            reply = "I am here to help! You can watch episodes in the player, switch mirrors using the dropdown, or save anime to your favorites list.";
        } else if (textLower.includes('hello') || textLower.includes('hi') || textLower.includes('hey') || textLower.includes('yo')) {
            reply = "Hello fellow cultivator! Welcome to FallenAnime. What cultivation series are you watching today?";
        } else if (textLower.includes('renegade') || textLower.includes('immortal') || textLower.includes('perfect world') || textLower.includes('herding gods') || textLower.includes('shrouding') || textLower.includes('throne of seal')) {
            reply = "That's an absolute masterpiece! Top tier action and incredible storylines. You can find all the latest subbed episodes right here!";
        } else if (textLower.includes('mirror') || textLower.includes('player') || textLower.includes('slow') || textLower.includes('buffer') || textLower.includes('not working') || textLower.includes('broken')) {
            reply = "If a mirror is buffering or down, please try switching players via the dropdown above the video. We recommend Dailymotion first! You can also use the high-speed download links at the bottom of the page.";
        } else if (textLower.includes('thank') || textLower.includes('nice') || textLower.includes('good') || textLower.includes('great')) {
            reply = "You're welcome! Happy to assist you. Enjoy your anime! 🎬";
        } else if (textLower.includes('latest') || textLower.includes('new ep') || textLower.includes('when')) {
            reply = "New episodes are synced automatically as soon as subbers release them. Check out the schedule tab for release days!";
        } else {
            reply = "I am FallenBot, your AI helper! Let me know if you need any recommendations or help navigating the site.";
        }
        
        setTimeout(async () => {
            const timestamp = Date.now();
            if (toFirebase) {
                try {
                    await db.collection('chat_messages').add({
                        userId: 'bot',
                        username: 'FallenBot',
                        text: reply,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        isBot: true
                    });
                } catch (e) {
                    console.error("Failed to send bot response to Firebase:", e);
                }
            } else {
                appendMessage('FallenBot', reply, timestamp, 'bot', true);
                localMessages.push({ username: 'FallenBot', text: reply, timestamp: timestamp, userId: 'bot', isBot: true });
                if (localMessages.length > 50) localMessages.shift();
                localStorage.setItem('local_chat_messages', JSON.stringify(localMessages));
            }
        }, 1200);
    }
    
    // 1. Initialize Firebase or Fallback to Local Mode
    if (typeof firebase === 'undefined' || !db) {
        enableLocalMode();
    } else {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        db.collection('chat_messages')
            .where('timestamp', '>=', oneDayAgo)
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                messagesArea.innerHTML = '';
                
                if (snapshot.empty) {
                    messagesArea.innerHTML = '<div class="chat-system-message">No messages in the last 24 hours. Start the conversation!</div>';
                    // Show a welcome tip from the bot locally
                    appendMessage('FallenBot', 'Welcome! Ask me any questions or chat with other viewers! (Tag me with @bot to ask me questions).', Date.now(), 'bot', true);
                    return;
                }
                
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    if (!data.text) return;
                    
                    const t = data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) : Date.now();
                    appendMessage(data.username || 'Guest', data.text, t, data.userId, data.isBot);
                });
                
                messagesArea.scrollTop = messagesArea.scrollHeight;
            }, (error) => {
                console.error("Firestore chat subscription error, switching to local mode:", error);
                enableLocalMode();
            });
    }
        
    // 2. Setup Message Sender Action
    async function handleSend() {
        const text = messageInput.value.trim();
        if (!text) return;
        
        let username = "Guest";
        let userId = "guest_" + Math.random().toString(36).substring(2, 9);
        
        if (currentUser) {
            username = currentUser.displayName || currentUser.email.split('@')[0];
            userId = currentUser.uid;
        } else {
            const storedNick = localStorage.getItem('chat_nickname');
            if (storedNick) {
                username = storedNick;
            } else {
                const nick = prompt("Enter a nickname to chat:", "Guest_" + Math.floor(Math.random() * 900 + 100));
                if (nick && nick.trim()) {
                    username = nick.trim().substring(0, 20);
                    localStorage.setItem('chat_nickname', username);
                } else {
                    return; // Cancel
                }
            }
        }
        
        messageInput.value = '';
        const timestamp = Date.now();
        
        if (isLocalMode) {
            appendMessage(username, text, timestamp, userId, false);
            localMessages.push({ username, text, timestamp, userId, isBot: false });
            if (localMessages.length > 50) localMessages.shift();
            localStorage.setItem('local_chat_messages', JSON.stringify(localMessages));
            
            triggerBotResponse(text, false);
        } else {
            try {
                await db.collection('chat_messages').add({
                    userId: userId,
                    username: username,
                    text: text,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    isBot: false
                });
                
                if (text.toLowerCase().includes('@bot') || text.toLowerCase().includes('@fallenbot')) {
                    triggerBotResponse(text, true);
                }
                
                const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const oldQuery = await db.collection('chat_messages').where('timestamp', '<', cutoff).limit(10).get();
                if (!oldQuery.empty) {
                    const batch = db.batch();
                    oldQuery.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            } catch (err) {
                console.error("Failed to send chat message:", err);
                appendMessage(username, text, timestamp, userId, false);
            }
        }
    }
    
    sendBtn.addEventListener('click', handleSend);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    });
}

// Reorders mirrors to strictly prioritize English Sub and fast, reliable video hosts
function reorderMirrors(mirrors) {
    if (!mirrors || !Array.isArray(mirrors)) return [];
    
    const getScore = (mirror) => {
        const label = (mirror.label || '').toLowerCase();
        const html = (mirror.embedHtml || '').toLowerCase();
        const url = (mirror.embedUrl || '').toLowerCase();
        const fullText = `${label} ${html} ${url}`;
        
        let score = 0;
        
        // 1. Language & Host Specific Priority
        // Priority #1: Hardsub English Odysee
        // Priority #2: Hardsub English Dailymotion
        // Then other English Sub hosts, then All Sub, then Indo Sub
        const isEnglish = label.includes('english') || label.includes('eng') || label.includes('hardsub english') || label.includes('[eng]') || fullText.includes('english sub') || fullText.includes('eng sub');
        const isAllSub = label.includes('all sub') || label.includes('multi') || label.includes('softsub');
        const isIndo = label.includes('indonesia') || label.includes('indo') || label.includes('hardsub indonesia');
        
        if (isEnglish) {
            if (fullText.includes('odysee')) {
                score += 3000; // #1 Priority: Hardsub English Odysee
            } else if (fullText.includes('dailymotion') || fullText.includes('daylimotion') || fullText.includes('dmcdn') || fullText.includes('geo.dailymotion')) {
                score += 2800; // #2 Priority: Hardsub English Dailymotion
            } else if (fullText.includes('youtube') || fullText.includes('youtu.be')) {
                score += 2600;
            } else if (fullText.includes('ok.ru') || fullText.includes('videoembed')) {
                score += 2500;
            } else if (fullText.includes('streamwish') || fullText.includes('seekplayer') || fullText.includes('vidhide') || fullText.includes('streamsb') || fullText.includes('sbbrisk') || fullText.includes('streamhub') || fullText.includes('filelions')) {
                score += 2400;
            } else if (fullText.includes('rumble')) {
                score += 2300;
            } else if (fullText.includes('mega.nz') || fullText.includes('mega.co') || fullText.includes('mega.io')) {
                score += 2200;
            } else if (fullText.includes('archive.org')) {
                score += 2100;
            } else {
                score += 2000;
            }
        } else if (isAllSub) {
            if (fullText.includes('odysee')) {
                score += 1500;
            } else if (fullText.includes('dailymotion') || fullText.includes('daylimotion') || fullText.includes('dmcdn') || fullText.includes('geo.dailymotion')) {
                score += 1400;
            } else if (fullText.includes('streamwish') || fullText.includes('seekplayer') || fullText.includes('vidhide') || fullText.includes('streamsb') || fullText.includes('sbbrisk')) {
                score += 1300;
            } else if (fullText.includes('rumble')) {
                score += 1200;
            } else if (fullText.includes('mega')) {
                score += 1100;
            } else {
                score += 1000;
            }
        } else if (isIndo) {
            if (fullText.includes('odysee')) {
                score += 500;
            } else if (fullText.includes('dailymotion') || fullText.includes('daylimotion') || fullText.includes('dmcdn')) {
                score += 450;
            } else if (fullText.includes('ok.ru')) {
                score += 400;
            } else if (fullText.includes('mega')) {
                score += 350;
            } else if (fullText.includes('rumble')) {
                score += 300;
            } else {
                score += 200;
            }
        } else {
            score += 100;
        }
        
        // Severely penalize placeholders
        if (isPlaceholderMirror(mirror)) {
            score -= 5000;
        }
        
        return score;
    };
    
    // Sort mirrors by score in descending order (highest score first)
    const sorted = [...mirrors].sort((a, b) => getScore(b) - getScore(a));
    
    // Re-index mirrors so their options match their sorted order
    sorted.forEach((m, idx) => {
        m.index = idx + 1;
    });
    
    return sorted;
}
