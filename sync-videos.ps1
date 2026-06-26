# sync-videos.ps1
# Script to synchronize latest videos from Animexin.dev using RSS feed and page scraping.

param(
    [int]$MaxPages = 5
)

$videosPath = Join-Path $PSScriptRoot "videos.json"
$targetFeedUrl = "https://animexin.dev/feed/"

Write-Host "=========================================="
Write-Host "Starting Video Sync: $(Get-Date)"
Write-Host "=========================================="

# 1. Load existing videos
if (Test-Path $videosPath) {
    try {
        $jsonContent = Get-Content $videosPath -Raw -Encoding utf8
        if ([string]::IsNullOrWhiteSpace($jsonContent)) {
            $videos = @()
        } else {
            $videos = ConvertFrom-Json $jsonContent
        }
    } catch {
        Write-Warning "Failed to parse videos.json, starting fresh. Error: $_"
        $videos = @()
    }
} else {
    $videos = @()
}

Write-Host "Loaded $($videos.Count) existing videos from local database."

# Create a lookup set for existing links for O(1) checks
$existingLinks = @{}
foreach ($v in $videos) {
    if ($v.link) {
        $existingLinks[$v.link] = $true
    }
}

# 2. Fetch RSS feed pages
$feedItems = @()
for ($page = 1; $page -le $MaxPages; $page++) {
    $url = $targetFeedUrl
    if ($page -gt 1) {
        $url = "${targetFeedUrl}?paged=$page"
    }
    
    Write-Host "Fetching RSS feed page $page from: $url"
    try {
        $feed = Invoke-RestMethod -Uri $url -TimeoutSec 15
        if ($feed) {
            $feedItems += @($feed)
        }
    } catch {
        Write-Warning "No more pages or failed to fetch feed page ${page}: $_"
        break
    }
}
if ($feedItems.Count -eq 0) {
    Write-Host "No items found in the RSS feed."
    exit 0
}

Write-Host "Found $($feedItems.Count) items in the feed. Checking for updates..."

# 3. Identify new items (in reverse order to process oldest new item first)
$newItems = @()
for ($i = $feedItems.Count - 1; $i -ge 0; $i--) {
    $item = $feedItems[$i]
    if (-not $existingLinks.ContainsKey($item.link)) {
        $newItems += $item
    }
}

if ($newItems.Count -eq 0) {
    Write-Host "No new episodes found. Database is up to date."
    exit 0
}

Write-Host "Found $($newItems.Count) new episodes to scrape."

# 4. Scrape details for each new episode
$newVideosList = @()
$count = 0

foreach ($item in $newItems) {
    $count++
    Write-Host "[$count/$($newItems.Count)] Scraping: $($item.title)"
    Write-Host "URL: $($item.link)"
    
    try {
        # Fetch page HTML
        $webRequest = Invoke-WebRequest -Uri $item.link -UseBasicParsing -TimeoutSec 15
        $html = $webRequest.Content
        
        # Extract OpenGraph Image (thumbnail)
        $thumbnail = ""
        if ($html -match '<meta property="og:image" content="([^"]+)"') {
            $thumbnail = $Matches[1]
        }
        
        # Extract Select class="mirror" dropdown options
        $mirrors = @()
        if ($html -match '(?s)<select class="mirror"[^>]*>(.*?)</select>') {
            $selectContent = $Matches[1]
            # Match option tags: value, data-index, and inner text label
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
                        Write-Warning "Failed to decode base64 mirror index $index for page $($item.link)"
                    }
                }
            }
        } else {
            Write-Warning "No mirror dropdown select found for this page."
        }
        
        # Parse categories
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
        
        # Clean description (remove html tags)
        $desc = ""
        if ($item.description) {
            $descText = $item.description
            if ($item.description -is [System.Xml.XmlElement]) {
                $descText = $item.description.InnerText
            }
            $desc = $descText -replace '<[^>]+>', ''
            $desc = $desc.Trim()
        }
        
        # Construct video object
        $videoObj = @{
            title = $item.title
            link = $item.link
            pubDate = $item.pubDate
            description = $desc
            categories = $categories
            thumbnail = $thumbnail
            mirrors = $mirrors
            syncedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        }
        
        $newVideosList += $videoObj
        Write-Host "Success: Scraped $($mirrors.Count) mirrors."
    } catch {
        Write-Error "Failed to scrape page $($item.link): $_"
    }
    
    # Brief pause to avoid rate limiting
    Start-Sleep -Milliseconds 150
}

if ($newVideosList.Count -gt 0) {
    # Prepend new videos so they are at the top (newest first)
    # Convert custom PowerShell hashes to custom objects so they serialize neatly
    $newObjects = foreach ($v in $newVideosList) {
        [PSCustomObject]$v
    }
    
    # Merge
    $updatedVideos = @($newObjects) + $videos
    
    # Convert and write to file
    try {
        $updatedJson = $updatedVideos | ConvertTo-Json -Depth 5
        [System.IO.File]::WriteAllText($videosPath, $updatedJson, [System.Text.Encoding]::UTF8)
        Write-Host "Successfully synced and saved $($newVideosList.Count) new videos to database."
    } catch {
        Write-Error "Failed to write updated database to file: $_"
    }
} else {
    Write-Host "Scraped 0 new videos successfully."
}

Write-Host "=========================================="
Write-Host "Sync Completed: $(Get-Date)"
Write-Host "=========================================="
