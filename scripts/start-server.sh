#!/bin/bash

# Speak & Shine Server Startup Script
# This script ensures environment variables are properly loaded before starting the server

set -e  # Exit on error

echo "🚀 Starting Speak & Shine Server..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with required environment variables."
    exit 1
fi

echo "✅ Found .env file"

# Load environment variables
set -a  # Automatically export all variables
source .env
set +a

# Validate critical environment variables
REQUIRED_VARS=(
    "MONGO_URI"
    "JWT_SECRET"
    "R2_ENDPOINT"
    "R2_ACCESS_KEY_ID"
    "R2_SECRET_ACCESS_KEY"
    "R2_BUCKET_NAME"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    printf '   - %s\n' "${MISSING_VARS[@]}"
    exit 1
fi

echo "✅ All required environment variables are set"

# Export variables for PM2
export MONGO_URI
export JWT_SECRET
export R2_ENDPOINT
export R2_ACCESS_KEY_ID
export R2_SECRET_ACCESS_KEY
export R2_BUCKET_NAME
export R2_PUBLIC_URL
export R2_ACCOUNT_ID

# Stop existing PM2 process if running
echo "🔄 Stopping existing PM2 process..."
pm2 stop speak-shine 2>/dev/null || true
pm2 delete speak-shine 2>/dev/null || true

# Start with PM2 using ecosystem config
echo "🚀 Starting server with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

echo "✅ Server started successfully!"
echo ""
echo "📊 View logs with: pm2 logs speak-shine"
echo "📈 View status with: pm2 status"
echo "🔄 Restart with: pm2 restart speak-shine"
