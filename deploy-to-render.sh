#!/bin/bash
# Deploy ClawJudge to Render.com
# Run: bash deploy-to-render.sh

echo "🚀 Deploying ClawJudge to Render.com..."

# Method 1: Using Render Dashboard (Easiest)
echo ""
echo "📋 METHOD 1: Render Dashboard (Recommended)"
echo "1. Go to: https://dashboard.render.com/blueprints"
echo "2. Click 'New Blueprint'"
echo "3. Connect your GitHub account (suitandclaw)"
echo "4. Select the Clawjudge repository"
echo "5. Render will auto-detect render.yaml and deploy both services"
echo ""

# Method 2: Using Render CLI (if installed)
echo "📋 METHOD 2: Render CLI"
echo "Install CLI: npm install -g @render/cli"
echo "Then run: render blueprint apply --file render.yaml"
echo ""

# Method 3: Direct API call
echo "📋 METHOD 3: Direct Deploy"
echo "Paste this URL in your browser:"
echo "https://render.com/deploy?repo=https://github.com/suitandclaw/Clawjudge"
echo ""

echo "✅ Deployment will create:"
echo "  - clawjudge-api (Node.js API on :3000)"
echo "  - clawjudge-frontend (Static site)"
echo ""
echo "💰 Cost: FREE tier (switches to sleep after 15 min idle)"
echo "   Upgrade to Starter ($7/mo) for always-on"
