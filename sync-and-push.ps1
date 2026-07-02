# sync-and-push.ps1
# Automates synchronization, copies files to repository, and pushes changes to GitHub

$repoPath = "C:\Users\jummy\OneDrive\Documents\GitHub\FallenAnime"
$devPath = "C:\Users\jummy\.gemini\antigravity\scratch\video-cloner-app"

# Dynamically find GitHub Desktop's git directory and add it to the environment PATH
$gitFolder = Get-ChildItem -Path "C:\Users\jummy\AppData\Local\GitHubDesktop\app-*" | 
             Sort-Object Name -Descending | 
             Select-Object -First 1 | 
             ForEach-Object { "$($_.FullName)\resources\app\git\cmd" }

if ($gitFolder -and (Test-Path $gitFolder)) {
    $env:PATH += ";$gitFolder"
}

# 1. Run local synchronization
Write-Host "=========================================="
Write-Host "Starting video database sync..."
& "$devPath\sync-videos.ps1"
& "$devPath\generate-sitemap.ps1"

# 2. Copy updated database files to repository
Write-Host "Copying updated files to repository..."
Copy-Item -Path "$devPath\catalog.json" -Destination "$repoPath\catalog.json" -Force
if (Test-Path "$devPath\episodes") {
    Copy-Item -Path "$devPath\episodes\*" -Destination "$repoPath\episodes" -Recurse -Force
}
Copy-Item -Path "$devPath\sitemap.xml" -Destination "$repoPath\sitemap.xml" -Force
if (Test-Path "$devPath\logo.png") { Copy-Item -Path "$devPath\logo.png" -Destination "$repoPath\logo.png" -Force }
if (Test-Path "$devPath\banner.png") { Copy-Item -Path "$devPath\banner.png" -Destination "$repoPath\banner.png" -Force }

# 3. Commit and push changes directly from repository
Write-Host "Committing and pushing to GitHub..."
Push-Location $repoPath
try {
    # Check if there are changes to commit
    $status = git status --porcelain
    if ($status) {
        git add .
        git commit -m "System: Auto-synced updates"
        git push origin main --force
        Write-Host "Successfully pushed latest updates to live website!"
    } else {
        Write-Host "No new updates found to commit."
    }
} catch {
    Write-Error "Failed to push updates: $_"
} finally {
    Pop-Location
}
Write-Host "=========================================="
