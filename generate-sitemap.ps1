# generate-sitemap.ps1
# Script to generate sitemap.xml based on the videos.json database

$videosPath = Join-Path $PSScriptRoot "videos.json"
$sitemapPath = Join-Path $PSScriptRoot "sitemap.xml"
$baseUrl = "https://jummybilal794-lab.github.io/FallenAnime/"

if (-not (Test-Path $videosPath)) {
    Write-Warning "videos.json not found. Cannot generate sitemap."
    exit 1
}

Write-Host "Reading database to generate sitemap..."
$rawJson = Get-Content -Raw -Path $videosPath -Encoding utf8
$videos = ConvertFrom-Json $rawJson

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
    
    # Use syncedAt or format current time if missing
    $dateStr = ""
    if ($v.syncedAt) {
        $dateStr = $v.syncedAt
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

# Write to sitemap.xml
[System.IO.File]::WriteAllText($sitemapPath, $xml, [System.Text.Encoding]::UTF8)
Write-Host "Successfully generated sitemap.xml with $($count + 1) URLs."
