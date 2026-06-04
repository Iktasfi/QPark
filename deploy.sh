#!/bin/bash
set -e

echo "🚀 Deploying QPark..."

# Push frontend to both repos
git push origin master
git push hiraymai master
git push hiraymai master:main

# Deploy backend to Railway
cd backend && npx @railway/cli@latest up --detach && cd ..

# Trigger Vercel production deploy
curl -s -X POST "https://api.vercel.com/v1/integrations/deploy/prj_xpM62sFcy8yP5URY3J4KZqPwJ0X5/iARhCy26i6" > /dev/null

echo "✅ Done! Vercel + Railway deploying now."
echo "   Frontend: https://q-park.vercel.app"
echo "   Backend:  https://qpark-production.up.railway.app"
