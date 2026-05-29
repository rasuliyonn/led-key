# Lead Key - deploy script for Windows
# Run as Administrator: Set-ExecutionPolicy Bypass -Scope Process; .\deploy-windows.ps1

#Requires -RunAsAdministrator

$APP_NAME = 'led-key'
$REPO_URL = 'https://github.com/rasuliyonn/led-key.git'
$DOMAIN = 'lead-key.ru'
$APP_DIR = 'C:\Apps\led-key'
$APP_PORT = 6654

$ADMIN_USER = 'admin'
$ADMIN_PASS = 'admin123'

function Log($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "[!!] $msg" -ForegroundColor Yellow }

Write-Host ''
Write-Host '========================================='
Write-Host '  Lead Key - Windows Deploy'
Write-Host '========================================='
Write-Host ''

# 1. Chocolatey
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Log 'Installing Chocolatey...'
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = $env:Path + ';C:\ProgramData\chocolatey\bin'
} else {
    Log 'Chocolatey OK'
}

# 2. Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Log 'Installing Git...'
    choco install git -y --no-progress
    $env:Path = $env:Path + ';C:\Program Files\Git\bin'
} else {
    Log 'Git OK'
}

# 3. Python (needed for native modules like better-sqlite3)
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Log 'Installing Python 3...'
    choco install python3 -y --no-progress
    $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $mp + ';' + $up
} else {
    Log ('Python OK: ' + (python --version))
}

# 4. Visual Studio Build Tools (C++ compiler for native npm modules)
$vsWhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$hasBuildTools = $false
if (Test-Path $vsWhere) {
    $installed = & $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property productPath 2>$null
    if ($installed) { $hasBuildTools = $true }
}
if (-not $hasBuildTools) {
    Log 'Installing Visual Studio Build Tools (C++ workload)...'
    Warn 'This may take 5-10 minutes...'
    choco install visualstudio2022buildtools -y --no-progress --package-parameters '--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive'
    $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $mp + ';' + $up
} else {
    Log 'VS Build Tools OK'
}

# 5. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Log 'Installing Node.js...'
    choco install nodejs-lts -y --no-progress
    $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $mp + ';' + $up
} else {
    Log ('Node.js OK: ' + (node -v))
}

# 6. PM2
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Log 'Installing PM2...'
    npm install -g pm2
} else {
    Log 'PM2 OK'
}

# 7. Clone or pull
if (Test-Path (Join-Path $APP_DIR '.git')) {
    Log 'Pulling latest...'
    Set-Location $APP_DIR
    git pull origin main
} else {
    Log 'Cloning repo...'
    $parent = Split-Path $APP_DIR
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    git clone $REPO_URL $APP_DIR
    Set-Location $APP_DIR
}

# 8. npm install
Log 'Installing dependencies...'
Set-Location $APP_DIR
npm install --omit=dev
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '[FAIL] npm install failed!' -ForegroundColor Red
    Write-Host 'If better-sqlite3 fails to build:' -ForegroundColor Red
    Write-Host '  1. Close PowerShell' -ForegroundColor Yellow
    Write-Host '  2. Reboot the server (build tools need reboot)' -ForegroundColor Yellow
    Write-Host '  3. Open PowerShell as Admin, run:' -ForegroundColor Yellow
    Write-Host '     cd C:\Apps\led-key' -ForegroundColor Yellow
    Write-Host '     npm install --omit=dev' -ForegroundColor Yellow
    Write-Host '     pm2 start server.js --name led-key' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# 9. Create .env
$envFile = Join-Path $APP_DIR '.env'
if (Test-Path $envFile) {
    Warn '.env exists - checking port...'
    $content = Get-Content $envFile -Raw
    if ($content -notmatch ('PORT=' + $APP_PORT)) {
        Warn ('Updating port to ' + $APP_PORT + '...')
        $content = $content -replace 'PORT=\d+', ('PORT=' + $APP_PORT)
        $content | Set-Content -Path $envFile -Encoding UTF8 -NoNewline
        Log 'Port updated'
    }
} else {
    Log 'Creating .env...'
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [BitConverter]::ToString($bytes) -replace '-',''
    $lines = @(
        ('PORT=' + $APP_PORT),
        ('JWT_SECRET=' + $secret),
        ('ADMIN_USER=' + $ADMIN_USER),
        ('ADMIN_PASS=' + $ADMIN_PASS)
    )
    $lines -join "`n" | Set-Content -Path $envFile -Encoding UTF8 -NoNewline
    Log '.env created'
}

# 10. Directories
$uploadDirs = @(
    (Join-Path $APP_DIR 'public\uploads\images'),
    (Join-Path $APP_DIR 'public\uploads\videos'),
    (Join-Path $APP_DIR 'data')
)
foreach ($d in $uploadDirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}
Log 'Directories OK'

# 11. PM2 start
Log 'Starting with PM2...'
$serverJs = Join-Path $APP_DIR 'server.js'
pm2 delete $APP_NAME 2>$null
pm2 start $serverJs --name $APP_NAME
pm2 save
Log 'PM2 running'

# 12. Firewall
Log 'Configuring firewall...'
Remove-NetFirewallRule -DisplayName 'LeadKey HTTP' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'LeadKey HTTPS' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'LeadKey App' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'LeadKey HTTP' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
New-NetFirewallRule -DisplayName 'LeadKey HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow | Out-Null
New-NetFirewallRule -DisplayName 'LeadKey App' -Direction Inbound -Protocol TCP -LocalPort $APP_PORT -Action Allow | Out-Null
Log ('Firewall OK (80, 443, ' + $APP_PORT + ')')

# Done
Write-Host ''
Write-Host '========================================='
Write-Host '  Deploy complete!' -ForegroundColor Green
Write-Host '========================================='
Write-Host ''
Write-Host ('  Site:  http://localhost:' + $APP_PORT)
Write-Host ('  Admin: http://localhost:' + $APP_PORT + '/admin')
Write-Host ('  Login: ' + $ADMIN_USER)
Write-Host ''
Write-Host '  pm2 status / pm2 logs led-key / pm2 restart led-key'
Write-Host ''
Warn 'CHANGE admin password after first login!'
