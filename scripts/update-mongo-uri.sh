#!/bin/bash
# Script to update MongoDB URI in Infisical and restart the application

set -e

echo "=================================================="
echo "Update MongoDB URI to speak-shine database"
echo "=================================================="

# Step 1: Update in Infisical dashboard
echo ""
echo "📝 Step 1: Update MONGO_URI in Infisical"
echo "   Go to: https://app.infisical.com"
echo "   1. Select your project"
echo "   2. Go to 'production' environment"
echo "   3. Find MONGO_URI secret"
echo "   4. Update the database name from 'Electro_V2' to 'speak-shine'"
echo ""
echo "   OLD: mongodb+srv://sidharthT:XksrtVkcKn6Jo0sQ@cluster0.72fiywx.mongodb.net/Electro_V2"
echo "   NEW: mongodb+srv://sidharthT:XksrtVkcKn6Jo0sQ@cluster0.72fiywx.mongodb.net/speak-shine"
echo ""
read -p "Press ENTER after updating Infisical..."

# Step 2: Pull updated secrets
echo ""
echo "📥 Step 2: Pulling updated secrets from Infisical..."
if command -v infisical &> /dev/null; then
    infisical export --env=production --format=dotenv > .env
    echo "✅ Secrets pulled successfully"
else
    echo "⚠️  Infisical CLI not found"
    echo "   Please manually update .env file with the new MONGO_URI"
    exit 1
fi

# Step 3: Verify the change
echo ""
echo "🔍 Step 3: Verifying MONGO_URI update..."
if grep -q "speak-shine" .env; then
    echo "✅ MONGO_URI now points to speak-shine database"
    grep "MONGO_URI" .env
else
    echo "❌ MONGO_URI still points to wrong database!"
    grep "MONGO_URI" .env
    exit 1
fi

# Step 4: Clear Redis cache (restart will do this)
echo ""
echo "🗑️  Step 4: Clearing Redis cache..."
echo "   (Will be cleared on app restart)"

# Step 5: Restart application
echo ""
echo "🔄 Step 5: Restarting application..."
docker compose restart app

# Step 6: Wait and check logs
echo ""
echo "⏳ Waiting 10 seconds for application to start..."
sleep 10

echo ""
echo "📋 Step 6: Checking application logs..."
docker compose logs --tail=30 app | grep -i "mongodb\|connected"

echo ""
echo "=================================================="
echo "✅ Update complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Test login at your frontend URL"
echo "2. Verify user data appears correctly"
echo "3. Check that all 10 users are visible"
echo ""
echo "If issues persist:"
echo "  - Check logs: docker compose logs app"
echo "  - Verify connection: docker compose exec app node -e \"console.log(process.env.MONGO_URI)\""
echo ""
