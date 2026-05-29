# ============================================================
# Lead Key -- automated deploy script for Windows Server / Windows 10+
# Usage: Run PowerShell as Administrator, then:
#   Set-ExecutionPolicy Bypass -Scope Process
#   .\deploy-windows.ps1
# ============================================================

#Requires -RunAsAdministrator

# --- Config (edit before running) ---
$APP_NAME = "led-key"
$REPO_URL = "https://github.com/rasuliyonn/led-key.git"
$DOMAIN = "lead-key.ru"
$APP_DIR = "C:\Apps\$APP_NAME"
$APP_PORT = 3000
$NODE_VERSION = "22"

# Admin credentials (CHANGE THESE!)
$ADMIN_USER = "admin"
$ADMIN_PASS = "admin123"

# --- Helper functions ---
function Log($msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err($msg) { Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Lead Key -- Windows Deploy"
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Install Chocolatey (package manager) ---
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Log "Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = "$env:Path;C:\ProgramData\chocolatey\bin"
} else {
    Log "Chocolatey already installed"
}

# --- 2. Install Git ---
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Log "Installing Git..."
    choco install git -y --no-progress
    $env:Path = "$env:Path;C:\Program Files\Git\bin"
} else {
    Log "Git already installed: $(git --version)"
}

# --- 3. Install Node.js ---
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Log "Installing Node.js $NODE_VERSION..."
    choco install nodejs-lts -y --no-progress
    # Refresh PATH
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
} else {
    $currentVersion = (node -v) -replace 'v','' -split '\.' | Select-Object -First 1
    if ([int]$currentVersion -ge [int]$NODE_VERSION) {
        Log "Node.js v$(node -v) already installed"
    } else {
        Log "Upgrading Node.js..."
        choco upgrade nodejs-lts -y --no-progress
    }
}

# --- 4. Install PM2 ---
if (!(Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Log "Installing PM2..."
    npm install -g pm2 pm2-windows-startup
} else {
    Log "PM2 already installed"
}

# --- 5. Clone or pull repo ---
if (Test-Path "$APP_DIR\.git") {
    Log "Repo exists, pulling latest..."
    Set-Location $APP_DIR
    git pull origin main
} else {
    Log "Cloning repository..."
    if (!(Test-Path (Split-Path $APP_DIR))) {
        New-Item -ItemType Directory -Path (Split-Path $APP_DIR) -Force | Out-Null
    }
    git clone $REPO_URL $APP_DIR
    Set-Location $APP_DIR
}

# --- 6. Install dependencies ---
Log "Installing npm dependencies..."
Set-Location $APP_DIR
npm install --production

# --- 7. Create .env ---
$envFile = Join-Path $APP_DIR ".env"

if (Test-Path $envFile) {
    Warn ".env already exists -- skipping (delete manually to regenerate)"
} else {
    Log "Creating .env..."
    # Generate random JWT secret
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $JWT_SECRET = [BitConverter]::ToString($bytes) -replace '-',''

    $envContent = "PORT=$APP_PORT`nJWT_SECRET=$JWT_SECRET`nADMIN_USER=$ADMIN_USER`nADMIN_PASS=$ADMIN_PASS"
    $envContent | Out-File -FilePath $envFile -Encoding UTF8 -NoNewline
    Log ".env created with generated JWT_SECRET"
}

# --- 8. Create upload dirs ---
$dirs = @(
    "$APP_DIR\public\uploads\images",
    "$APP_DIR\public\uploads\videos",
    "$APP_DIR\data"
)
foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}
Log "Upload directories created"

# --- 9. PM2 setup ---
Log "Starting app with PM2..."
pm2 delete $APP_NAME 2>$null
pm2 start "$APP_DIR\server.js" --name $APP_NAME
pm2 save

# Setup PM2 to run on Windows startup
Log "Configuring PM2 auto-start..."
pm2-startup install 2>$null
pm2 save

# --- 10. Windows Firewall ---
Log "Configuring Windows Firewall..."

# Remove old rules if exist
Remove-NetFirewallRule -DisplayName "Lead Key HTTP" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Lead Key HTTPS" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Lead Key Node" -ErrorAction SilentlyContinue

# Add new rules
New-NetFirewallRule -DisplayName "Lead Key HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
New-NetFirewallRule -DisplayName "Lead Key HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow | Out-Null
New-NetFirewallRule -DisplayName "Lead Key Node" -Direction Inbound -Protocol TCP -LocalPort $APP_PORT -Action Allow | Out-Null
Log "Firewall rules added (80, 443, $APP_PORT)"

# --- 11. Nginx (optional reverse proxy) ---
$installNginx = Read-Host "Install Nginx as reverse proxy? (y/n)"

if ($installNginx -eq 'y') {
    Log "Installing Nginx..."
    choco install nginx -y --no-progress

    $nginxConf = "C:\tools\nginx\conf\nginx.conf"
    if (!(Test-Path $nginxConf)) {
        $nginxConf = "C:\ProgramData\chocolatey\lib\nginx\tools\nginx\conf\nginx.conf"
    }

    $nginxConfig = @"
worker_processes 1;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    client_max_body_size 100M;

    upstream nodejs {
        server 127.0.0.1:$APP_PORT;
    }

    server {
        listen 80;
        server_name $DOMAIN www.$DOMAIN;

        location / {
            proxy_pass http://nodejs;
            proxy_http_version 1.1;
            proxy_set_header Upgrade `$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host `$host;
            proxy_set_header X-Real-IP `$remote_addr;
            proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto `$scheme;
            proxy_cache_bypass `$http_upgrade;
        }
    }
}
"@
    $nginxConfig | Out-File -FilePath $nginxConf -Encoding UTF8
    Log "Nginx configured"

    # Start nginx
    Start-Process -FilePath "nginx" -WorkingDirectory (Split-Path $nginxConf) -WindowStyle Hidden
    Log "Nginx started"

    Warn "For SSL on Windows, use win-acme (wacs.exe):"
    Warn "  choco install win-acme -y"
    Warn "  wacs.exe --target manual --host $DOMAIN,www.$DOMAIN --installation nginx"
} else {
    Warn "Skipping Nginx. App accessible directly at http://localhost:$APP_PORT"
}

# --- 12. Create Windows Service (alternative to PM2) ---
$useService = Read-Host "Also install as Windows Service via NSSM? (y/n)"

if ($useService -eq 'y') {
    if (!(Get-Command nssm -ErrorAction SilentlyContinue)) {
        choco install nssm -y --no-progress
    }

    # Remove existing service
    nssm stop $APP_NAME 2>$null
    nssm remove $APP_NAME confirm 2>$null

    # Install service
    $nodePath = (Get-Command node).Source
    nssm install $APP_NAME $nodePath "$APP_DIR\server.js"
    nssm set $APP_NAME AppDirectory $APP_DIR
    nssm set $APP_NAME AppEnvironmentExtra "NODE_ENV=production"
    nssm set $APP_NAME DisplayName "Lead Key Web App"
    nssm set $APP_NAME Description "Lead Key landing page with admin panel"
    nssm set $APP_NAME Start SERVICE_AUTO_START
    nssm set $APP_NAME AppStdout "$APP_DIR\logs\service-stdout.log"
    nssm set $APP_NAME AppStderr "$APP_DIR\logs\service-stderr.log"

    New-Item -ItemType Directory -Path "$APP_DIR\logs" -Force | Out-Null
    nssm start $APP_NAME

    Log "Windows Service '$APP_NAME' installed and started"
    Warn "If using NSSM service, you can stop PM2: pm2 delete $APP_NAME"
}

# --- Done ---
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Deploy complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Site:   http://localhost:$APP_PORT"
Write-Host "  Admin:  http://localhost:$APP_PORT/admin"
Write-Host "  User:   $ADMIN_USER"
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Gray
Write-Host "    pm2 status          -- check app status"
Write-Host "    pm2 logs $APP_NAME  -- view logs"
Write-Host "    pm2 restart $APP_NAME -- restart app"
Write-Host "    cd $APP_DIR         -- project directory"
Write-Host ""
Warn "CHANGE admin password after first login!"
Write-Host ""
