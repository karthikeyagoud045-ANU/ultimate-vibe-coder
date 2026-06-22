#!/bin/bash
set -euo pipefail

# ============================================================
# Antigravity IDE — Fly.io Deployment Script
# ============================================================
# Usage:
#   ./deploy.sh                    # Deploy with existing secrets
#   ./deploy.sh --set-secrets      # Set secrets then deploy
#   ./deploy.sh --status           # Check deployment status
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="antigravity-ws"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check if flyctl is installed
check_flyctl() {
  if ! command -v flyctl &> /dev/null && ! command -v fly &> /dev/null; then
    error "flyctl not found. Install it: curl -L https://fly.io/install.sh | sh"
  fi
  FLY_CMD=$(command -v flyctl 2>/dev/null || command -v fly 2>/dev/null)
}

# Set Fly.io secrets
set_secrets() {
  info "Setting Fly.io secrets for $APP_NAME..."
  echo ""
  echo "You will be prompted for each secret. Press Ctrl+C to cancel."
  echo ""

  read -p "SUPABASE_URL: " supabase_url
  read -p "SUPABASE_SERVICE_ROLE_KEY: " supabase_key
  read -p "ALLOWED_ORIGINS (comma-separated, e.g. https://antigravity.vercel.app): " allowed_origins

  [ -n "$supabase_url" ] && $FLY_CMD secrets set SUPABASE_URL="$supabase_url" --app "$APP_NAME"
  [ -n "$supabase_key" ] && $FLY_CMD secrets set SUPABASE_SERVICE_ROLE_KEY="$supabase_key" --app "$APP_NAME"
  [ -n "$allowed_origins" ] && $FLY_CMD secrets set ALLOWED_ORIGINS="$allowed_origins" --app "$APP_NAME"

  success "Secrets set successfully"
}

# Deploy to Fly.io
deploy() {
  info "Deploying $APP_NAME to Fly.io..."
  cd "$SCRIPT_DIR"
  $FLY_CMD deploy --config fly.toml --app "$APP_NAME"
  success "Deployment complete!"
  echo ""
  $FLY_CMD status --app "$APP_NAME"
}

# Show status
show_status() {
  info "Status for $APP_NAME:"
  $FLY_CMD status --app "$APP_NAME"
  echo ""
  info "Recent logs:"
  $FLY_CMD logs --app "$APP_NAME" --limit 20
}

# Main
check_flyctl

case "${1:-}" in
  --set-secrets)
    set_secrets
    deploy
    ;;
  --status)
    show_status
    ;;
  --secrets-only)
    set_secrets
    ;;
  *)
    deploy
    ;;
esac
