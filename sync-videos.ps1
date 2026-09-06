# sync-videos.ps1
# Script to synchronize videos from Animexin.dev using RSS feed or sitemap crawling.

param(
    [int]$MaxPages = 5,
    [switch]$Full = $false,
    [int]$Limit = 500
)

$videosPath = Join-Path $PSScriptRoot "videos.json"
$logPath = Join-Path $PSScriptRoot "sync.log"
$sources = @(
    @{
        name = "Animexin"
        feedUrl = "https://animexin.dev/feed/"
        sitemapUrl = "https://animexin.dev/sitemap.xml"
        sitemapPattern = 'https://animexin\.dev/post-sitemap\d*\.xml'
        baseUrl = "https://animexin.dev/"
    }
)

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

function Get-Episode-Key($title) {
    # 1. Clean title of branding and html
    $t = $title -replace '<[^>]+>', ''
    $t = $t -replace '\s*[-–]\s*AnimeXin(\.dev)?', ''
    $t = $t -replace '\s*Subtitle\s*[-–]\s*AnimeXin(\.dev)?', ''
    $t = $t -replace '\s*[-–]\s*Lucifer\s*Donghua', ''
    $t = $t -replace '\s*Lucifer\s*Donghua', ''
    $t = $t.Trim()
    
    # 2. Extract series name and episode number
    $cleanTitle = $t -replace '\[\d+\]', ''
    
    # Extract episode number
    $epNum = ""
    if ($cleanTitle -match '(?i)(?:Episode|Ep)\s*(\d+)') {
        $epNum = $Matches[1]
    }
    
    # Extract base series name
    $seriesName = $cleanTitle
    if ($cleanTitle -match '(?i)(.*?)\s*(?:Episode|Ep)\s*\d+') {
        $seriesName = $Matches[1].Trim()
    }
    
    # Normalize series name
    $normalizedSeries = $seriesName.ToLower()
    $normalizedSeries = $normalizedSeries -replace '\[[^\]]+\]', '' # remove [...]
    $normalizedSeries = $normalizedSeries -replace '\([^\)]+\)', '' # remove (...)
    $normalizedSeries = $normalizedSeries -replace '[^\w\s]', '' # remove special chars
    $normalizedSeries = [regex]::Replace($normalizedSeries, '\s+', ' ').Trim()
    
    if ($normalizedSeries -and $epNum) {
        $normEp = [int]$epNum
        return "${normalizedSeries}_ep${normEp}"
    }
    return $null
}

function Get-Episode-Key-Unified($title, $link) {
    if ($title) {
        $key = Get-Episode-Key $title
        if ($key) { return $key }
    }
    
    if ($link) {
        $slug = $link.Replace("https://animexin.dev/", "").Replace("https://luciferdonghua.in/", "").Replace("/", "")
        $cleanSlug = $slug -replace '-(?:lucifer-donghua|indonesia-english-sub|indonesia|english-sub|english|subtitle|sub)$', ''
        $cleanSlug = $cleanSlug -replace '-lucifer-donghua', ''
        $cleanSlug = $cleanSlug -replace '-indonesia.*', ''
        $cleanSlug = $cleanSlug -replace '-english.*', ''
        $cleanSlug = $cleanSlug -replace '-sub.*', ''
        
        $epNum = ""
        if ($cleanSlug -match '(?:episode|ep)-(\d+)') {
            $epNum = $Matches[1]
        }
        
        $seriesName = $cleanSlug
        if ($cleanSlug -match '(.*?)-(?:episode|ep)-\d+') {
            $seriesName = $Matches[1]
        }
        
        $normalizedSeries = $seriesName.Replace("-", " ").ToLower().Trim()
        $normalizedSeries = $normalizedSeries -replace '[^\w\s]', ''
        $normalizedSeries = [regex]::Replace($normalizedSeries, '\s+', ' ').Trim()
        
        if ($normalizedSeries -and $epNum) {
            $normEp = [int]$epNum
            return "${normalizedSeries}_ep${normEp}"
        }
    }
    return $null
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

# 1b. De-duplicate existing database entries (keeping the first one, which is the newest/preferred)
$deduplicatedVideos = @()
$seenKeys = @{}
$duplicateCount = 0
foreach ($v in $videos) {
    if ($v.title) {
        $key = Get-Episode-Key $v.title
        if ($key) {
            if ($seenKeys.ContainsKey($key)) {
                $duplicateCount++
                continue # Skip this duplicate entry!
            }
            $seenKeys[$key] = $true
        }
    }
    $deduplicatedVideos += $v
}

if ($duplicateCount -gt 0) {
    Log-Message "Cleaned up $duplicateCount duplicate episode entries from the database."
    $videos = $deduplicatedVideos
    
    # Save the cleaned database back to files
    $videosJson = $videos | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($videosPath, $videosJson, [System.Text.Encoding]::UTF8)
    
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
}

# Create a lookup set for existing links for O(1) checks
$existingLinks = @{}
$existingKeys = @{}
foreach ($v in $videos) {
    if ($v.link) {
        $existingLinks[$v.link] = $true
    }
    if ($v.title) {
        $key = Get-Episode-Key $v.title
        if ($key) {
            $existingKeys[$key] = $v
        }
    }
}

$newItems = @()
$candidateLinks = @{}

# Always scan latest release HTML pages (Pages 1 to 10) directly from Animexin
Log-Message "Scanning recent release pages from Animexin..."

# Animexin latest release pages
for ($p = 1; $p -le 10; $p++) {
    $url = if ($p -eq 1) { "https://animexin.dev/" } else { "https://animexin.dev/page/$p/" }
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -TimeoutSec 15
        $matches = [regex]::Matches($resp.Content, '<a[^>]+href="(https://animexin\.dev/[^"/]+/?)"[^>]+title="([^"]+)"')
        foreach ($m in $matches) {
            $link = $m.Groups[1].Value.Trim()
            $title = $m.Groups[2].Value.Trim()
            if ($link -match '/blog/' -or $link -match '/anime/' -or $link -match '/genre/' -or $link -match '/category/' -or $link -match '/season/' -or $link -match '/author/') { continue }
            if ($link -match 'episode|sub' -and -not $candidateLinks.ContainsKey($link)) {
                $candidateLinks[$link] = $true
                $newItems += [PSCustomObject]@{
                    link = $link
                    title = $title
                    pubDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
                }
            }
        }
    } catch {
        Log-Message "Failed to fetch Animexin recent page ${p}: $_" "warning"
    }
}

if ($Full) {
    # 3. Deep Sync: Fetch URLs from sitemaps
    foreach ($source in $sources) {
        Log-Message "Fetching sitemap index from: $($source.sitemapUrl)"
        try {
            $sitemapWeb = Invoke-WebRequest -Uri $source.sitemapUrl -UseBasicParsing -TimeoutSec 15
            $sitemapXml = $sitemapWeb.Content
            $postSitemaps = [regex]::Matches($sitemapXml, $source.sitemapPattern) | ForEach-Object { $_.Value } | Sort-Object {
                if ($_ -match 'post-sitemap(\d+)\.xml') { [int]$Matches[1] } else { 0 }
            } -Descending
            
            Log-Message "[$($source.name)] Found $($postSitemaps.Count) sitemap pages (ordered newest first). Checking for missing episodes..."
            
            $urlsToScrape = @()
            foreach ($sitemapUrl in $postSitemaps) {
                Log-Message "[$($source.name)] Checking sitemap: $sitemapUrl"
                try {
                    $subWeb = Invoke-WebRequest -Uri $sitemapUrl -UseBasicParsing -TimeoutSec 15
                    $subXml = $subWeb.Content
                    
                    $rawUrlBlocks = [regex]::Matches($subXml, '(?s)<url>(.*?)</url>')
                    $urlBlocks = @($rawUrlBlocks)
                    [array]::Reverse($urlBlocks)
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
                        
                        if ($loc -and $loc -ne $source.baseUrl) {
                            if (-not $candidateLinks.ContainsKey($loc)) {
                                $candidateLinks[$loc] = $true
                                $urlsToScrape += @{
                                    link = $loc
                                    pubDate = $lastmod
                                    title = "" # Will extract from HTML
                                }
                            }
                        }
                    }
                } catch {
                    Log-Message "[$($source.name)] Failed to fetch sitemap page ${sitemapUrl}: $_" "warning"
                }
            }
            
            Log-Message "[$($source.name)] Total candidate URLs found: $($urlsToScrape.Count)"
            $newItems += $urlsToScrape
        } catch {
            Log-Message "[$($source.name)] Failed to fetch sitemap index: $_" "warning"
        }
    }
} else {
    # 3. Incremental Sync: Fetch RSS feed pages
    $feedItems = @()
    foreach ($source in $sources) {
        for ($page = 1; $page -le $MaxPages; $page++) {
            $url = $source.feedUrl
            if ($page -gt 1) {
                $url = "$($source.feedUrl)?paged=$page"
            }
            
            Log-Message "[$($source.name)] Fetching RSS feed page $page from: $url"
            try {
                $feed = Invoke-RestMethod -Uri $url -TimeoutSec 15
                if ($feed) {
                    $feedItems += @($feed)
                }
            } catch {
                Log-Message "[$($source.name)] No more pages or failed to fetch feed page ${page}: $_" "warning"
            }
        }
    }
    
    foreach ($item in $feedItems) {
        if (-not $candidateLinks.ContainsKey($item.link)) {
            $candidateLinks[$item.link] = $true
            $newItems += $item
        }
    }
}

# Filter to genuinely missing items
$filteredNewItems = @()
foreach ($item in $newItems) {
    if (-not $existingLinks.ContainsKey($item.link)) {
        # Check for title key duplicate
        $key = if ($item.title) { Get-Episode-Key $item.title } else { Get-Episode-Key-Unified "" $item.link }
        if ($key -and $existingKeys.ContainsKey($key)) {
            $existingVal = $existingKeys[$key]
            if ($item.link -like "*animexin.dev*" -and $existingVal.link -like "*luciferdonghua.in*") {
                Log-Message "Found Animexin item for existing Lucifer Donghua episode: $($item.link). Allowing overwrite!"
                $filteredNewItems += $item
                continue
            }
            continue
        }
        $filteredNewItems += $item
    }
}
$newItems = $filteredNewItems

# Apply Limit if set
if ($Limit -gt 0 -and $newItems.Count -gt $Limit) {
    Log-Message "Limiting crawl to $Limit new episodes (out of $($newItems.Count) total missing)."
    $newItems = $newItems[0..($Limit-1)]
}

# 3. Deduplicate new items prioritizing Animexin over Lucifer Donghua
$dedupedNewItems = @()
$seenNewKeys = @{}

# First pass: Add all Animexin items to ensure they are prioritized and seen first
foreach ($item in $newItems) {
    if ($item.link -like "*animexin.dev*") {
        $key = Get-Episode-Key-Unified $item.title $item.link
        if ($key) {
            $seenNewKeys[$key] = $true
        }
        $dedupedNewItems += $item
    }
}

# Second pass: Add Lucifer Donghua items only if their key has not been seen in Animexin
foreach ($item in $newItems) {
    if ($item.link -like "*luciferdonghua.in*") {
        $key = Get-Episode-Key-Unified $item.title $item.link
        if ($key) {
            if (-not $seenNewKeys.ContainsKey($key)) {
                $seenNewKeys[$key] = $true
                $dedupedNewItems += $item
            } else {
                Log-Message "Prioritizing Animexin version; discarding Lucifer Donghua duplicate for: $($item.title) / $($item.link)"
            }
        } else {
            # If no key could be parsed, keep it to be safe
            $dedupedNewItems += $item
        }
    }
}

$newItems = $dedupedNewItems

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
    # Deduplicate old Lucifer Donghua episodes replaced by new Animexin ones
    $cleanOriginals = @()
    $episodesDir = Join-Path $PSScriptRoot "episodes"
    foreach ($orig in $originalVideos) {
        $shouldKeep = $true
        if ($orig.title -and $orig.link -like "*luciferdonghua.in*") {
            $origKey = Get-Episode-Key $orig.title
            if ($origKey) {
                foreach ($newV in $newObjects) {
                    if ($newV.link -like "*animexin.dev*") {
                        $newKey = Get-Episode-Key $newV.title
                        if ($newKey -eq $origKey) {
                            Log-Message "Overwriting existing Lucifer Donghua version with new Animexin version for: $($newV.title)"
                            $shouldKeep = $false
                            $slug = $orig.link.Replace("https://luciferdonghua.in/", "").Replace("/", "")
                            if ($slug) {
                                $oldEpFile = Join-Path $episodesDir "$slug.json"
                                if (Test-Path $oldEpFile) {
                                    Remove-Item -Path $oldEpFile -Force
                                    Log-Message "Deleted Lucifer Donghua JSON file: $oldEpFile"
                                }
                            }
                            break
                        }
                    }
                }
            }
        }
        if ($shouldKeep) {
            $cleanOriginals += $orig
        }
    }
    $originalVideos = $cleanOriginals
    
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
                    $slug = $v.link.Replace("https://animexin.dev/", "").Replace("https://luciferdonghua.in/", "").Replace("/", "")
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
        
        # Clean title (remove html tags if any and branding suffixes)
        if ($title) {
            $title = $title -replace '<[^>]+>', ''
            $title = $title -replace '\s*[-–]\s*AnimeXin(\.dev)?', ''
            $title = $title -replace '\s*Subtitle\s*[-–]\s*AnimeXin(\.dev)?', ''
            $title = $title -replace '\s*[-–]\s*Lucifer\s*Donghua', ''
            $title = $title -replace '\s*Lucifer\s*Donghua', ''
            $title = $title.Trim()
        } else {
            $title = "Episode (No Title)"
        }
        
        # Check for title key duplicate (in case sitemap gave us different link for existing title)
        $key = Get-Episode-Key $title
        if ($key -and $existingKeys.ContainsKey($key)) {
            $existingVal = $existingKeys[$key]
            if ($item.link -like "*animexin.dev*" -and $existingVal.link -like "*luciferdonghua.in*") {
                Log-Message "Allowing Animexin scrape for existing Lucifer Donghua episode: $title"
            } else {
                Log-Message "Skipping duplicate episode by title key: $title"
                continue
            }
        }
        
        Log-Message "[$count/$($newItems.Count)] Scraping: $title"
        Log-Message "URL: $($item.link)"
        
        # Extract OpenGraph Image (thumbnail) with fallbacks for Yoast SEO changes
        $thumbnail = ""
        if ($html -match '<meta property="og:image" content="([^"]+)"') {
            $thumbnail = $Matches[1]
        } elseif ($html -match 'class="[^"]*wp-post-image[^"]*"\s+alt="[^"]*"\s+decoding="[^"]*"\s+fetchpriority="[^"]*"\s+src="([^"]+)"') {
            $thumbnail = $Matches[1]
        } elseif ($html -match '<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"') {
            $thumbnail = $Matches[1]
        } elseif ($html -match '<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"') {
            $thumbnail = $Matches[1]
        } elseif ($html -match '(?s)<div class="thumb">\s*<img src="([^"]+)"') {
            $thumbnail = $Matches[1]
        }
        
        if ($thumbnail -and $thumbnail.StartsWith("https://animexin.dev/")) {
            $thumbnail = $thumbnail -replace "https://animexin\.dev/", "https://animexin.vip/"
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
                        $embedHtml = ""
                        $embedUrl = ""
                        if ($base64Val.StartsWith("http://") -or $base64Val.StartsWith("https://")) {
                            Log-Message "Fetching mirror subpage: $base64Val"
                            $subWebRequest = Invoke-WebRequest -Uri $base64Val -UseBasicParsing -TimeoutSec 10
                            $subHtml = $subWebRequest.Content
                            if ($subHtml -match '(?s)<iframe[^>]+src=\"([^\"]+)\"') {
                                $embedUrl = $Matches[1]
                                if ($embedUrl.StartsWith("//")) {
                                    $embedUrl = "https:" + $embedUrl
                                }
                                $embedHtml = "<iframe src=""$embedUrl"" width=""640"" height=""360"" frameborder=""0"" allowfullscreen></iframe>"
                            }
                        } else {
                            # Decode base64 embed HTML (Animexin method)
                            $bytes = [System.Convert]::FromBase64String($base64Val)
                            $embedHtml = [System.Text.Encoding]::UTF8.GetString($bytes)
                            
                            if ($embedHtml -match 'src="([^"]+)"') {
                                $embedUrl = $Matches[1]
                                if ($embedUrl.StartsWith("//")) {
                                    $embedUrl = "https:" + $embedUrl
                                }
                            }
                        }
                        
                        if ($embedUrl) {
                            $mirrors += @{
                                index = [int]$index
                                label = $label
                                embedHtml = $embedHtml
                                embedUrl = $embedUrl
                            }
                        }
                    } catch {
                        Log-Message "Failed to parse mirror index $index for page $($item.link): $_" "warning"
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
            if ($html -match '(?s)<a class="series" href="[^"]+"[^>]*>([^<]+)</a>') {
                $showName = $Matches[1].Trim()
                if ($showName) {
                    $categories += $showName
                }
            } elseif ($html -match '(?s)<h2 itemprop="partOfSeries">([^<]+)</h2>') {
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
        
        $key = Get-Episode-Key $title
        if ($key) {
            $existingKeys[$key] = $true
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
