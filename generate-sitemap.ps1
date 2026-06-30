# generate-sitemap.ps1
# Script to generate sitemap.xml based on the videos.json database

$videosPath = Join-Path $PSScriptRoot "videos.json"
$sitemapPath = Join-Path $PSScriptRoot "sitemap.xml"
$baseUrl = "https://fallenanime.xyz/"

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
    
    # Format date strictly to W3C datetime standard (yyyy-MM-ddTHH:mm:ssZ)
    $dateStr = ""
    if ($v.syncedAt) {
        # Check if it matches old MM/dd/yyyy HH:mm:ss format
        if ($v.syncedAt -match '(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})') {
            $dateStr = "$($Matches[3])-$($Matches[1])-$($Matches[2])T$($Matches[4]):$($Matches[5]):$($Matches[6])Z"
        } elseif ($v.syncedAt -match '^\d{4}-\d{2}-\d{2}T') {
            $dateStr = $v.syncedAt
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
