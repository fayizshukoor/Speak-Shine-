#!/bin/bash

# Infisical Environment Sync Script
# Usage: ./scripts/sync-infisical.sh [environment]
# Example: ./scripts/sync-infisical.sh production

set -e

ENV=${1:-production}

echo "================================="
echo "Infisical Environment Sync"
echo "Environment: $ENV"
echo "================================="

# Check if Infisical CLI is installed
if ! command -v infisical &> /dev/null; then
    echo "❌ Infisical CLI is not installed"
    echo ""
    echo "Install it with:"
    echo "  npm install -g @infisical/cli"
    echo "  OR"
    echo "  curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash"
    echo "  sudo apt-get update && sudo apt-get install -y infisical"
    exit 1
fi

# Check if .infisical.json exists
if [ ! -f .infisical.json ]; then
    echo "❌ .infisical.json not found"
    echo ""
    echo "Run 'infisical init' to initialize the project"
    exit 1
fi

# Check if user is logged in
if ! infisical user 2>/dev/null; then
    echo "❌ Not logged in to Infisical"
    echo ""
    echo "Run 'infisical login' to authenticate"
    exit 1
fi

# Backup existing .env if it exists
if [ -f .env ]; then
    BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Backing up existing .env to $BACKUP_FILE"
    cp .env "$BACKUP_FILE"
fi

# Pull secrets from Infisical
echo "📥 Pulling secrets from Infisical ($ENV environment)..."
infisical export --env="$ENV" --format=dotenv > .env

# Verify .env was created
if [ -f .env ]; then
    LINE_COUNT=$(wc -l < .env)
    echo "✅ Successfully synced $LINE_COUNT environment variables"
    echo ""
    echo "🔐 Secrets are now in .env file"
    echo "⚠️  Remember: Never commit .env to version control"
else
    echo "❌ Failed to create .env file"
    exit 1
fi

echo ""
echo "================================="
echo "Sync completed successfully!"
echo "================================="
echo ""
echo "Next steps:"
echo "  • Start your app: npm run dev:api"
echo "  • Or with docker: docker compose up -d"
