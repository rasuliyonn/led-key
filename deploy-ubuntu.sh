#!/bin/bash
set -euo pipefail

# ============================================================
# Lead Key — automated deploy script for Ubuntu 22.04+ / VPS
# Usage: sudo bash deploy-ubuntu.sh
# ============================================================

# --- Config (edit before running) ---
APP_NAME="led-key"
REPO_URL="https://github.com/rasuliyonn/led-key.git"
DOMAIN="lead-key.ru"                    # your domain
APP_DIR="/var/www/$APP_NAME"
APP_PORT=3000
NODE_MAJOR=22
APP_USER="www-data"

# Admin credentials (CHANGE THESE!)
ADMIN_USER="admin"
ADMIN_PASS="admin123"

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# --- Root check ---
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash deploy-ubuntu.sh"

echo ""
echo "========================================="
echo "  Lead Key — Ubuntu Deploy"
echo "========================================="
echo ""

# --- 1. System update ---
log "Updating system packages..."
apt update -y && apt upgrade -y

# --- 2. Install essentials ---
log "Installing essentials..."
apt install -y curl git build-essential nginx certbot python3-certbot-nginx ufw

# --- 3. Install Node.js ---
if command -v node &>/dev/null && [[ "$(node -v | cut -d. -f1 | tr -d v)" -ge $NODE_MAJOR ]]; then
    log "Node.js $(node -v) already installed"
else
    log "Installing Node.js $NODE_MAJOR..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt install -y nodejs
    log "Node.js $(node -v) installed"
fi

# --- 4. Install PM2 ---
if command -v pm2 &>/dev/null; then
    log "PM2 already installed"
else
    log "Installing PM2..."
    npm install -g pm2
fi

# --- 5. Clone or pull repo ---
if [[ -d "$APP_DIR/.git" ]]; then
    log "Repo exists, pulling latest..."
    cd "$APP_DIR"
    git pull origin main
else
    log "Cloning repository..."
    mkdir -p "$(dirname "$APP_DIR")"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# --- 6. Install dependencies ---
log "Installing npm dependencies..."
cd "$APP_DIR"
npm install --production

# --- 7. Create .env ---
JWT_SECRET=$(openssl rand -hex 32)

if [[ -f "$APP_DIR/.env" ]]; then
    warn ".env already exists — skipping (delete it manually to regenerate)"
else
    log "Creating .env..."
    cat > "$APP_DIR/.env" <<EOF
PORT=$APP_PORT
JWT_SECRET=$JWT_SECRET
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS
EOF
    log ".env created with generated JWT_SECRET"
fi

# --- 8. Create upload dirs ---
mkdir -p "$APP_DIR/public/uploads/images"
mkdir -p "$APP_DIR/public/uploads/videos"
mkdir -p "$APP_DIR/data"

# --- 9. Set permissions ---
chown -R $APP_USER:$APP_USER "$APP_DIR"
chmod -R 755 "$APP_DIR"

# --- 10. PM2 setup ---
log "Starting app with PM2..."
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 start "$APP_DIR/server.js" \
    --name "$APP_NAME" \
    --user "$APP_USER" \
    -i 1 \
    --env production

pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# --- 11. Nginx config ---
log "Configuring Nginx..."
cat > "/etc/nginx/sites-available/$APP_NAME" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

# Replace placeholders
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "/etc/nginx/sites-available/$APP_NAME"
sed -i "s/PORT_PLACEHOLDER/$APP_PORT/g" "/etc/nginx/sites-available/$APP_NAME"

# Enable site
ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/"
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t || err "Nginx config test failed"
systemctl restart nginx
log "Nginx configured"

# --- 12. Firewall ---
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "Firewall enabled (22, 80, 443)"

# --- 13. SSL ---
echo ""
warn "SSL setup requires domain $DOMAIN to point to this server's IP."
read -p "Domain already points here? Install SSL now? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Requesting SSL certificate..."
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || {
        warn "SSL failed — run manually later: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    }
    log "SSL installed"
else
    warn "Skipping SSL. Run later: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# --- 14. Cron for SSL renewal ---
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -
log "SSL auto-renewal cron added"

# --- Done ---
echo ""
echo "========================================="
echo -e "${GREEN}  Deploy complete!${NC}"
echo "========================================="
echo ""
echo "  Site:   http://$DOMAIN"
echo "  Admin:  http://$DOMAIN/admin"
echo "  User:   $ADMIN_USER"
echo ""
echo "  Useful commands:"
echo "    pm2 status          — check app status"
echo "    pm2 logs $APP_NAME  — view logs"
echo "    pm2 restart $APP_NAME — restart app"
echo "    cd $APP_DIR         — project directory"
echo ""
warn "CHANGE admin password after first login!"
echo ""
