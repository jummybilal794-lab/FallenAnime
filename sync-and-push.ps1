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

# 1. Pull latest remote changes first to prevent divergence
Write-Host "=========================================="
Write-Host "Checking for latest changes from GitHub..."
try {
    & git fetch origin main
    & git pull --rebase origin main
} catch {
    Write-Warning "Git pull --rebase notice: $_"
}

# 2. Run local synchronization
Write-Host "=========================================="
Write-Host "Starting video database sync from Animexin..."
& "$repoPath\sync-videos.ps1" -Limit 100
& "$repoPath\generate-sitemap.ps1"

# 3. Commit and push changes directly from repository
Write-Host "Committing and pushing to GitHub..."
try {
    $status = & git status --porcelain
    if ($status) {
        & git add catalog.json sitemap.xml episodes/
        & git commit -m "System: Auto-synced latest Animexin episodes and updated sitemap"
        
        # Push with automatic retry/rebase if remote has new commits
        & git push origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Push rejected or failed; pulling latest remote commits and retrying..."
            & git pull --rebase origin main
            & git push origin main
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Successfully pushed latest updates to live website!"
        } else {
            Write-Warning "Push finished with exit code $LASTEXITCODE"
        }
    } else {
        Write-Host "No new updates found to commit."
    }
} catch {
    Write-Warning "Notice during commit and push: $_"
}
Write-Host "=========================================="
