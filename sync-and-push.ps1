# sync-and-push.ps1
# Automates synchronization, sitemap generation, and pushes changes to GitHub

$repoPath = "C:\Users\jummy\OneDrive\Documents\GitHub\FallenAnime"
Set-Location $repoPath

# Dynamically find GitHub Desktop's git directory and add it to the environment PATH
$gitFolder = Get-ChildItem -Path "C:\Users\jummy\AppData\Local\GitHubDesktop\app-*" | 
             Sort-Object Name -Descending | 
             Select-Object -First 1 | 
             ForEach-Object { Join-Path $_.FullName "resources\app\git\cmd" }

if ($gitFolder -and (Test-Path $gitFolder)) {
    $env:PATH = "$gitFolder;$env:PATH"
}

# 1. Run local synchronization
Write-Host "=========================================="
Write-Host "Starting video database sync from Animexin..."
& "$repoPath\sync-videos.ps1" -Limit 100
& "$repoPath\generate-sitemap.ps1"

# 2. Commit and push changes directly from repository
Write-Host "Committing and pushing to GitHub..."
try {
    $status = & git status --porcelain
    if ($status) {
        & git add catalog.json sitemap.xml episodes/ videos.json sync.log
        & git commit -m "System: Auto-synced latest Animexin episodes and updated sitemap"
        & git push origin main
        Write-Host "Successfully pushed latest updates to live website!"
    } else {
        Write-Host "No new updates found to commit."
    }
} catch {
    Write-Error "Failed to push updates: $_"
}
Write-Host "=========================================="
