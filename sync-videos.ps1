# sync-videos.ps1
# Script to synchronize videos from Animexin.dev using RSS feed or sitemap crawling.

param(
    [int]$MaxPages = 5,
    [switch]$Full = $false,
    [int]$Limit = 500
)

$videosPath = Join-Path $PSScriptRoot "videos.json"
$logPath = Join-Path $PSScriptRoot "sync.log"
$targetFeedUrl = "https://animexin.dev/feed/"

# Clear or create sync.log at start
New-Item -Path $logPath -ItemType File -Force | Out-Null

function Log-Message($msg, $level = "info") {
    $timestamp = Get-Date -Format "HH:mm:ss"
    $prefix = "[$timestamp]"
    if ($level -eq "warning") {
        $prefix = "[$timestamp] [Warning]"
    } elseif ($level -eq "error") {
        $prefix = "[$timestamp] [Error]"
    }
    
    $line = "$prefix $msg"
    
    # Write to console
    if ($level -eq "error") {
        Write-Error $line
    } elseif ($level -eq "warning") {
        Write-Warning $line
    } else {
        Write-Host $line
    }
    
    # Append to sync.log
    Add-Content -Path $logPath -Value $line -Encoding utf8
}

Log-Message "=========================================="
Log-Message "Starting Video Sync: $(Get-Date)"
Log-Message "Mode: $(if ($Full) { 'Deep Sync (Sitemaps)' } else { 'Incremental Sync (RSS)' })"
Log-Message "=========================================="

# 1. Load existing videos
if (Test-Path $videosPath) {
    try {
        $jsonContent = Get-Content $videosPath -Raw -Encoding utf8
        if ([string]::IsNullOrWhiteSpace($jsonContent)) {
            $videos = @()
        } else {
            $videos = ConvertFrom-Json $jsonContent
        }
        
        # Auto-generate catalog.json if missing on start
        $catalogPath = Join-Path $PSScriptRoot "catalog.json"
        if (-not (Test-Path $catalogPath) -and $videos.Count -gt 0) {
            Log-Message "catalog.json not found. Generating initial catalog.json..."
            $catalog = foreach ($v in $videos) {
                [PSCustomObject]@{
                    title      = $v.title
                    link       = $v.link
                    pubDate    = $v.pubDate
                    categories = $v.categories
                    thumbnail  = $v.thumbnail
                }
            }
            $catalogJson = $catalog | ConvertTo-Json -Compress -Depth 5
            [System.IO.File]::WriteAllText($catalogPath, $catalogJson, [System.Text.Encoding]::UTF8)
            Log-Message "Initial catalog.json generated successfully."
        }
    } catch {
        Log-Message "Failed to parse videos.json, starting fresh. Error: $_" "warning"
        $videos = @()
    }
} else {
    $catalogPath = Join-Path $PSScriptRoot "catalog.json"
    if (Test-Path $catalogPath) {
        Log-Message "videos.json not found. Loading existing video entries from catalog.json..."
        try {
            $jsonContent = Get-Content $catalogPath -Raw -Encoding utf8
            if ([string]::IsNullOrWhiteSpace($jsonContent)) {
                $videos = @()
            } else {
                $videos = ConvertFrom-Json $jsonContent
            }
        } catch {
            Log-Message "Failed to parse catalog.json: $_" "warning"
            $videos = @()
        }
    } else {
        $videos = @()
    }
}

Log-Message "Loaded $($videos.Count) existing videos from local database."

# Create a lookup set for existing links for O(1) checks
$existingLinks = @{}
foreach ($v in $videos) {
    if ($v.link) {
        $existingLinks[$v.link] = $true
    }
}

$newItems = @()

if ($Full) {
    # 2. Deep Sync: Fetch URLs from sitemaps
    Log-Message "Fetching sitemap index from: https://animexin.dev/sitemap.xml"
    try {
        $sitemapWeb = Invoke-WebRequest -Uri "https://animexin.dev/sitemap.xml" -UseBasicParsing -TimeoutSec 15
        $sitemapXml = $sitemapWeb.Content
        $postSitemaps = [regex]::Matches($sitemapXml, 'https://animexin\.dev/post-sitemap\d*\.xml') | ForEach-Object { $_.Value }
        
        Log-Message "Found $($postSitemaps.Count) sitemap pages. Checking for missing episodes..."
        
        $urlsToScrape = @()
        foreach ($sitemapUrl in $postSitemaps) {
            Log-Message "Checking sitemap: $sitemapUrl"
            try {
                $subWeb = Invoke-WebRequest -Uri $sitemapUrl -UseBasicParsing -TimeoutSec 15
                $subXml = $subWeb.Content
                
                $urlBlocks = [regex]::Matches($subXml, '(?s)<url>(.*?)</url>')
                foreach ($block in $urlBlocks) {
                    $blockHtml = $block.Groups[1].Value
                    $loc = ""
                    $lastmod = ""
                    if ($blockHtml -match '(?s)<loc>([^<]+)</loc>') {
                        $loc = $Matches[1].Trim()
                    }
                    if ($blockHtml -match '(?s)<lastmod>([^<]+)</lastmod>') {
                        $lastmod = $Matches[1].Trim()
                    }
                    
                    if ($loc -and $loc -ne "https://animexin.dev/") {
                        if (-not $existingLinks.ContainsKey($loc)) {
                            $urlsToScrape += @{
                                link = $loc
                                pubDate = $lastmod
                                title = "" # Will extract from HTML
                            }
                        }
                    }
                }
            } catch {
                Log-Message "Failed to fetch sitemap page ${sitemapUrl}: $_" "warning"
            }
        }
        
        Log-Message "Total candidate URLs found: $($urlsToScrape.Count)"
        $newItems = $urlsToScrape
        
        # Apply Limit if set
        if ($Limit -gt 0 -and $newItems.Count -gt $Limit) {
            Log-Message "Limiting Deep Sync to crawl $Limit new episodes (out of $($newItems.Count) total missing)."
            $newItems = $newItems[0..($Limit-1)]
        }
    } catch {
        Log-Message "Failed to fetch sitemap index: $_" "error"
        exit 1
    }
} else {
    # 2. Incremental Sync: Fetch RSS feed pages
    $feedItems = @()
    for ($page = 1; $page -le $MaxPages; $page++) {
        $url = $targetFeedUrl
        if ($page -gt 1) {
            $url = "${targetFeedUrl}?paged=$page"
        }
        
        Log-Message "Fetching RSS feed page $page from: $url"
        try {
            $feed = Invoke-RestMethod -Uri $url -TimeoutSec 15
            if ($feed) {
                $feedItems += @($feed)
            }
        } catch {
            Log-Message "No more pages or failed to fetch feed page ${page}: $_" "warning"
            break
        }
    }
    if ($feedItems.Count -eq 0) {
        Log-Message "No items found in the RSS feed."
        exit 0
    }
    
    Log-Message "Found $($feedItems.Count) items in the feed. Checking for updates..."
    
    # Identify new items (in reverse order to process oldest new item first)
    for ($i = $feedItems.Count - 1; $i -ge 0; $i--) {
        $item = $feedItems[$i]
        if (-not $existingLinks.ContainsKey($item.link)) {
            $newItems += $item
        }
    }
}

if ($newItems.Count -eq 0) {
    Log-Message "No new episodes found. Database is up to date."
    exit 0
}

Log-Message "Found $($newItems.Count) new episodes to scrape."

# Checkpoint Save Function
function Save-Database($newVideos) {
    if ($newVideos.Count -eq 0) { return }
    
    $newObjects = foreach ($v in $newVideos) {
        [PSCustomObject]$v
    }
    
    if (Test-Path $videosPath) {
        try {
            $jsonContent = Get-Content $videosPath -Raw -Encoding utf8
            if (-not [string]::IsNullOrWhiteSpace($jsonContent)) {
                $originalVideos = ConvertFrom-Json $jsonContent
            } else {
                $originalVideos = @()
            }
        } catch {
            $originalVideos = @()
        }
    } else {
        $catalogPath = Join-Path $PSScriptRoot "catalog.json"
        if (Test-Path $catalogPath) {
            try {
                $jsonContent = Get-Content $catalogPath -Raw -Encoding utf8
                if (-not [string]::IsNullOrWhiteSpace($jsonContent)) {
                    $originalVideos = ConvertFrom-Json $jsonContent
                } else {
                    $originalVideos = @()
                }
            } catch {
                $originalVideos = @()
            }
        } else {
            $originalVideos = @()
        }
    }
    
    $existingMergedLinks = @{}
    foreach ($v in $originalVideos) {
        if ($v.link) { $existingMergedLinks[$v.link] = $true }
    }
    
    $filteredNew = @()
    foreach ($v in $newObjects) {
        if (-not $existingMergedLinks.ContainsKey($v.link)) {
            $filteredNew = @($v) + $filteredNew # Keep newest first when merging
        }
    }
    
    if ($filteredNew.Count -gt 0) {
        $updatedVideos = @($filteredNew) + $originalVideos
        try {
            $updatedJson = $updatedVideos | ConvertTo-Json -Depth 5
            [System.IO.File]::WriteAllText($videosPath, $updatedJson, [System.Text.Encoding]::UTF8)
            Log-Message "Checkpoint: Saved $($filteredNew.Count) new items to videos.json (Total database: $($updatedVideos.Count) items)."
            
            # Save individual episode files
            $episodesDir = Join-Path $PSScriptRoot "episodes"
            if (-not (Test-Path $episodesDir)) {
                New-Item -ItemType Directory -Path $episodesDir -Force | Out-Null
            }
            foreach ($v in $filteredNew) {
                if ($v.link) {
                    $slug = $v.link.Replace("https://animexin.dev/", "").Replace("/", "")
                    if ($slug) {
                        $epFile = Join-Path $episodesDir "$slug.json"
                        $epData = [PSCustomObject]@{
                            title = $v.title
                            link = $v.link
                            description = $v.description
                            mirrors = $v.mirrors
                            downloads = $v.downloads
                        }
                        $json = $epData | ConvertTo-Json -Depth 10
                        [System.IO.File]::WriteAllText($epFile, $json, [System.Text.Encoding]::UTF8)
                    }
                }
            }
            
            # Generate and save lightweight catalog.json (minified)
            $catalog = foreach ($v in $updatedVideos) {
                [PSCustomObject]@{
                    title      = $v.title
                    link       = $v.link
                    pubDate    = $v.pubDate
                    categories = $v.categories
                    thumbnail  = $v.thumbnail
                }
            }
            $catalogJson = $catalog | ConvertTo-Json -Compress -Depth 5
            $catalogPath = Join-Path $PSScriptRoot "catalog.json"
            [System.IO.File]::WriteAllText($catalogPath, $catalogJson, [System.Text.Encoding]::UTF8)
            Log-Message "Checkpoint: Generated and saved catalog.json (Size: $(([System.IO.FileInfo]$catalogPath).Length / 1KB -as [int]) KB)."
        } catch {
            Log-Message "Error writing checkpoint database: $_" "error"
        }
    }
}

# 4. Scrape details for each new episode
$newVideosList = @()
$count = 0
$uncommittedVideos = @()

foreach ($item in $newItems) {
    $count++
    
    try {
        # Fetch page HTML
        $webRequest = Invoke-WebRequest -Uri $item.link -UseBasicParsing -TimeoutSec 15
        $html = $webRequest.Content
        
        # Extract title if not present in sitemap item
        $title = ""
        if ($item.title) {
            $title = $item.title
        } elseif ($html -match '(?s)<h1 class="entry-title">\s*(.*?)\s*</h1>') {
            $title = $Matches[1].Trim()
        } elseif ($html -match '(?s)<meta property="og:title" content="([^"]+)"') {
            $title = $Matches[1].Trim()
        }
        
        # Clean title (remove html tags if any and AnimeXin branding suffix)
        if ($title) {
            $title = $title -replace '<[^>]+>', ''
            $title = $title -replace '\s*[-–]\s*AnimeXin(\.dev)?', ''
            $title = $title -replace '\s*Subtitle\s*[-–]\s*AnimeXin(\.dev)?', ''
            $title = $title.Trim()
        } else {
            $title = "Episode (No Title)"
        }
        
        Log-Message "[$count/$($newItems.Count)] Scraping: $title"
        Log-Message "URL: $($item.link)"
        
        # Extract OpenGraph Image (thumbnail)
        $thumbnail = ""
        if ($html -match '<meta property="og:image" content="([^"]+)"') {
            $thumbnail = $Matches[1]
        }
        
        # Extract Select class="mirror" dropdown options
        $mirrors = @()
        if ($html -match '(?s)<select class="mirror"[^>]*>(.*?)</select>') {
            $selectContent = $Matches[1]
            $optionMatches = [regex]::Matches($selectContent, '(?s)<option value="([^"]+)" data-index="(\d+)">\s*(.*?)\s*</option>')
            
            foreach ($m in $optionMatches) {
                $base64Val = $m.Groups[1].Value.Trim()
                $index = $m.Groups[2].Value
                $label = $m.Groups[3].Value.Trim()
                
                if ($base64Val) {
                    try {
                        # Decode base64 embed HTML
                        $bytes = [System.Convert]::FromBase64String($base64Val)
                        $embedHtml = [System.Text.Encoding]::UTF8.GetString($bytes)
                        
                        # Extract iframe URL
                        $embedUrl = ""
                        if ($embedHtml -match 'src="([^"]+)"') {
                            $embedUrl = $Matches[1]
                            if ($embedUrl.StartsWith("//")) {
                                $embedUrl = "https:" + $embedUrl
                            }
                        }
                        
                        $mirrors += @{
                            index = [int]$index
                            label = $label
                            embedHtml = $embedHtml
                            embedUrl = $embedUrl
                        }
                    } catch {
                        Log-Message "Failed to decode base64 mirror index $index for page $($item.link)" "warning"
                    }
                }
            }
        } else {
            Log-Message "No mirror dropdown select found for this page." "warning"
        }
        
        # Parse categories from item (RSS feed)
        $categories = @()
        if ($item.category) {
            $catItems = @()
            if ($item.category -is [array]) {
                $catItems = $item.category
            } else {
                $catItems = @($item.category)
            }
            foreach ($cat in $catItems) {
                $val = ""
                if ($cat -is [System.Xml.XmlElement]) {
                    $val = $cat.InnerText
                } elseif ($cat -is [string]) {
                    $val = $cat
                } elseif ($cat) {
                    $val = $cat.ToString()
                }
                if (-not [string]::IsNullOrWhiteSpace($val)) {
                    $categories += $val.Trim()
                }
            }
        }
        
        # Extract categories dynamically from HTML if sitemap was used (categories list is empty)
        if ($categories.Count -eq 0) {
            # 1. Show Name
            if ($html -match '(?s)<h2 itemprop="partOfSeries">([^<]+)</h2>') {
                $showName = $Matches[1].Trim()
                if ($showName) {
                    $categories += $showName
                }
            }
            # 2. Genres
            if ($html -match '(?s)<div class="genxed">(.*?)</div>') {
                $genHtml = $Matches[1]
                $genMatches = [regex]::Matches($genHtml, '(?s)<a[^>]* rel="tag">([^<]+)</a>')
                foreach ($gm in $genMatches) {
                    $genText = $gm.Groups[1].Value.Trim()
                    if ($genText -and $genText -notmatch 'Subtitle' -and $genText -notmatch 'Episode') {
                        $categories += $genText
                    }
                }
            }
            # 3. Type
            if ($html -match '(?s)<b>Type:</b>\s*([^<]+)\s*</span>') {
                $typeVal = $Matches[1].Trim()
                if ($typeVal) {
                    $categories += $typeVal
                }
            }
        }
        
        # Parse direct subtitle download links (Mediafire, Terabox, Mirrored)
        $downloads = @()
        if ($html -match '(?s)<div class="mctnx">(.*?)</div>\s*</div>\s*</div>\s*<div class="single-info') {
            $mctnxContent = $Matches[1]
            $divMatches = [regex]::Matches($mctnxContent, '(?s)<div class="soraddlx[^>]*>(.*?)</div>\s*</div>')
            foreach ($divMatch in $divMatches) {
                $divHtml = $divMatch.Groups[1].Value
                $subLang = ""
                if ($divHtml -match '(?s)<div class="sorattlx">\s*<h3>(.*?)</h3>\s*</div>') {
                    $subLang = $Matches[1].Trim()
                }
                
                # Skip VIP
                if ($subLang -match 'VIP' -or $subLang -match 'Membership') {
                    continue
                }
                
                $aMatches = [regex]::Matches($divHtml, '(?s)<a href="([^"]+)"[^>]*>\s*(.*?)\s*</a>')
                foreach ($aMatch in $aMatches) {
                    $url = $aMatch.Groups[1].Value.Trim()
                    $label = $aMatch.Groups[2].Value.Trim()
                    
                    if ($label -and $url -and $label -notmatch 'VIP' -and $label -notmatch 'Membership' -and $url -notmatch 'ko-fi\.com' -and $url -notmatch 'patreon\.com') {
                        $downloads += @{
                            language = $subLang
                            label = $label
                            url = $url
                        }
                    }
                }
            }
        }
        
        # Clean description (remove html tags)
        $desc = ""
        if ($item.description) {
            $descText = $item.description
            if ($item.description -is [System.Xml.XmlElement]) {
                $descText = $item.description.InnerText
            }
            $desc = $descText -replace '<[^>]+>', ''
            $desc = $desc.Trim()
        } elseif ($html -match '(?s)<div class="desc[^>]*>(.*?)</div>') {
            $desc = $Matches[1] -replace '<[^>]+>', ''
            $desc = $desc.Trim()
        }
        
        # Extract pubDate if not in feed item
        $pubDate = ""
        if ($item.pubDate) {
            $pubDate = $item.pubDate
        } elseif ($html -match '<meta property="article:published_time" content="([^"]+)"') {
            $pubDate = $Matches[1]
        }
        if ([string]::IsNullOrEmpty($pubDate)) {
            $pubDate = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        }
        
        # Construct video object
        $videoObj = @{
            title = $title
            link = $item.link
            pubDate = $pubDate
            description = $desc
            categories = $categories
            thumbnail = $thumbnail
            mirrors = $mirrors
            downloads = $downloads
            syncedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        }
        
        $uncommittedVideos = @($videoObj) + $uncommittedVideos
        Log-Message "Success: Scraped $($mirrors.Count) mirrors and $($downloads.Count) download links."
        
        # Periodic Save Checkpoint (every 20 items)
        if ($uncommittedVideos.Count -ge 20) {
            Save-Database $uncommittedVideos
            $uncommittedVideos = @()
        }
    } catch {
        Log-Message "Failed to scrape page $($item.link): $_" "error"
    }
    
    # Brief pause to avoid rate limiting
    Start-Sleep -Milliseconds 150
}

# Final DB write
if ($uncommittedVideos.Count -gt 0) {
    Save-Database $uncommittedVideos
}

Log-Message "=========================================="
Log-Message "Sync Completed: $(Get-Date)"
Log-Message "=========================================="
