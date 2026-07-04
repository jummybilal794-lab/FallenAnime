# generate-sitemap.ps1
# Script to generate sitemap.xml based on the videos.json database

$videosPath = Join-Path $PSScriptRoot "videos.json"
$catalogPath = Join-Path $PSScriptRoot "catalog.json"
$sitemapPath = Join-Path $PSScriptRoot "sitemap.xml"
$baseUrl = "https://fallenanime.xyz/"

if (Test-Path $videosPath) {
    Write-Host "Reading videos.json to generate sitemap..."
    $rawJson = Get-Content -Raw -Path $videosPath -Encoding utf8
    $videos = ConvertFrom-Json $rawJson
} elseif (Test-Path $catalogPath) {
    Write-Host "videos.json not found. Reading catalog.json to generate sitemap..."
    $rawJson = Get-Content -Raw -Path $catalogPath -Encoding utf8
    $videos = ConvertFrom-Json $rawJson
} else {
    Write-Warning "Neither videos.json nor catalog.json was found. Cannot generate sitemap."
    exit 1
}

# Start XML structure
$xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>$baseUrl</loc>
    <changefreq>daily</changefreq>
    <priority>1.00</priority>
  </url>
"@

# Add each episode
$count = $videos.Count
for ($i = 0; $i -lt $count; $i++) {
    $v = $videos[$i]
    $loc = "${baseUrl}#watch?idx=$i"
    
    # Format date strictly to W3C datetime standard (yyyy-MM-ddTHH:mm:ssZ)
    $dateValue = $v.syncedAt
    if (-not $dateValue) { $dateValue = $v.pubDate }
    
    $dateStr = ""
    if ($dateValue) {
        # Check if it matches old MM/dd/yyyy HH:mm:ss format
        if ($dateValue -match '(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})') {
            $dateStr = "$($Matches[3])-$($Matches[1])-$($Matches[2])T$($Matches[4]):$($Matches[5]):$($Matches[6])Z"
        } elseif ($dateValue -match '^\d{4}-\d{2}-\d{2}') {
            # Normalize to include T and Z if it's just a date
            if ($dateValue -match '^\d{4}-\d{2}-\d{2}$') {
                $dateStr = "${dateValue}T00:00:00Z"
            } else {
                $dateStr = $dateValue
            }
        } else {
            $dateStr = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        }
    } else {
        $dateStr = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    }

    $xml += @"

  <url>
    <loc>$loc</loc>
    <lastmod>$dateStr</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.80</priority>
  </url>
"@
}

$xml += "`n</urlset>"

# Write to sitemap.xml strictly in UTF-8 WITHOUT Byte Order Mark (BOM)
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($sitemapPath, $xml, $utf8WithoutBom)
Write-Host "Successfully generated sitemap.xml with $($count + 1) URLs without UTF-8 BOM."
