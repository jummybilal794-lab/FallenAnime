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

$sb = New-Object System.Text.StringBuilder(1000000)
[void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sb.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
[void]$sb.AppendLine("  <url>`n    <loc>$baseUrl</loc>`n    <changefreq>daily</changefreq>`n    <priority>1.00</priority>`n  </url>")

# Add each episode
$nowIso = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
$count = $videos.Count
for ($i = 0; $i -lt $count; $i++) {
    $v = $videos[$i]
    $loc = "${baseUrl}#watch?idx=$i"
    
    # Format date strictly to W3C datetime standard (yyyy-MM-ddTHH:mm:ssZ)
    $dateValue = $v.syncedAt
    if (-not $dateValue) { $dateValue = $v.pubDate }
    
    $dateStr = $nowIso
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
        }
    }

    [void]$sb.AppendLine("  <url>`n    <loc>$loc</loc>`n    <lastmod>$dateStr</lastmod>`n    <changefreq>weekly</changefreq>`n    <priority>0.80</priority>`n  </url>")
}

[void]$sb.AppendLine("</urlset>")

# Write to sitemap.xml strictly in UTF-8 WITHOUT Byte Order Mark (BOM)
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($sitemapPath, $sb.ToString(), $utf8WithoutBom)
Write-Host "Successfully generated sitemap.xml with $($count + 1) URLs without UTF-8 BOM."
