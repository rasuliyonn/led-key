# Lead Key - deploy script for Windows
# Run as Administrator: Set-ExecutionPolicy Bypass -Scope Process; .\deploy-windows.ps1

#Requires -RunAsAdministrator

$APP_NAME = 'led-key'
$REPO_URL = 'https://github.com/rasuliyonn/led-key.git'
$DOMAIN = 'lead-key.ru'
$APP_DIR = 'C:\Apps\led-key'
$APP_PORT = 6654
$NODE_VERSION = 22

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

# 3. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Log 'Installing Node.js...'
    choco install nodejs-lts -y --no-progress
    $mp = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $up = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $mp + ';' + $up
} else {
    Log ('Node.js OK: ' + (node -v))
}

# 4. PM2
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Log 'Installing PM2...'
    npm install -g pm2
} else {
    Log 'PM2 OK'
}

# 5. Clone or pull
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

# 6. npm install
Log 'Installing dependencies...'
Set-Location $APP_DIR
npm install --production

# 7. Create .env
$envFile = Join-Path $APP_DIR '.env'
if (Test-Path $envFile) {
    Warn '.env exists - skipping'
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

# 8. Directories
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

# 9. PM2 start
Log 'Starting with PM2...'
$serverJs = Join-Path $APP_DIR 'server.js'
pm2 delete $APP_NAME 2>$null
pm2 start $serverJs --name $APP_NAME
pm2 save
Log 'PM2 running'

# 10. Firewall
Log 'Configuring firewall...'
Remove-NetFirewallRule -DisplayName 'LeadKey HTTP' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'LeadKey HTTPS' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'LeadKey App' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'LeadKey HTTP' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
New-NetFirewallRule -DisplayName 'LeadKey HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow | Out-Null
New-NetFirewallRule -DisplayName 'LeadKey App' -Direction Inbound -Protocol TCP -LocalPort $APP_PORT -Action Allow | Out-Null
Log 'Firewall OK'

# 11. Nginx
$doNginx = Read-Host 'Install Nginx reverse proxy? (y/n)'
if ($doNginx -eq 'y') {
    Log 'Installing Nginx...'
    choco install nginx -y --no-progress

    $nginxConf = 'C:\tools\nginx\conf\nginx.conf'
    if (-not (Test-Path $nginxConf)) {
        $nginxConf = 'C:\ProgramData\chocolatey\lib\nginx\tools\nginx\conf\nginx.conf'
    }

    $nl = "`n"
    $cfg = 'worker_processes 1;' + $nl
    $cfg += 'events { worker_connections 1024; }' + $nl
    $cfg += 'http {' + $nl
    $cfg += '    include mime.types;' + $nl
    $cfg += '    default_type application/octet-stream;' + $nl
    $cfg += '    sendfile on;' + $nl
    $cfg += '    client_max_body_size 100M;' + $nl
    $cfg += '    upstream nodejs { server 127.0.0.1:' + $APP_PORT + '; }' + $nl
    $cfg += '    server {' + $nl
    $cfg += '        listen 80;' + $nl
    $cfg += '        server_name ' + $DOMAIN + ' www.' + $DOMAIN + ';' + $nl
    $cfg += '        location / {' + $nl
    $cfg += '            proxy_pass http://nodejs;' + $nl
    $cfg += '            proxy_http_version 1.1;' + $nl
    $cfg += '            proxy_set_header Host $host;' + $nl
    $cfg += '            proxy_set_header X-Real-IP $remote_addr;' + $nl
    $cfg += '            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' + $nl
    $cfg += '            proxy_set_header X-Forwarded-Proto $scheme;' + $nl
    $cfg += '        }' + $nl
    $cfg += '    }' + $nl
    $cfg += '}' + $nl

    $cfg | Set-Content -Path $nginxConf -Encoding UTF8
    Log 'Nginx configured'

    Start-Process -FilePath 'nginx' -WorkingDirectory (Split-Path $nginxConf) -WindowStyle Hidden
    Log 'Nginx started'
    Warn 'For SSL use win-acme: choco install win-acme -y'
} else {
    Warn ('No Nginx. App at http://localhost:' + $APP_PORT)
}

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
