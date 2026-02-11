# Railway Deployment Guide

## Quick Deploy

1. **Push code to GitHub**
   ```bash
   git add -A
   git commit -m "chore: Railway deployment config"
   git push origin main
   ```

2. **Create Railway project**
   - Go to https://railway.app
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `suitandclaw/Clawjudge`

3. **Deploy**
   - Railway will auto-detect the Node.js app
   - Click "Deploy"
   - Wait 2-3 minutes

4. **Get URL**
   - Railway provides a URL like `https://clawjudge.up.railway.app`
   - Test: `curl https://clawjudge.up.railway.app/health`

## Environment Variables

Set in Railway Dashboard → Variables:

```
NODE_ENV=production
PORT=3000
CLAWJUDGE_DB=/app/data/clawjudge.db
```

## API Endpoints

Once deployed:

```bash
# Health check
curl https://clawjudge.up.railway.app/health

# API docs
curl https://clawjudge.up.railway.app/api/docs

# Submit verification
curl -X POST https://clawjudge.up.railway.app/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"submission": "https://github.com/example/repo", "requirements": ["Pass all tests"]}'

# Check stats
curl https://clawjudge.up.railway.app/api/v1/stats
```

## Scaling

Railway free tier:
- 500 hours/month (enough for one always-on service)
- 1 GB RAM
- 1 GB disk

To upgrade:
- Go to Railway Dashboard
- Select "Clawjudge" service
- Click "Settings" → "Upgrade"
- Choose plan ($5-50/month based on usage)

## Logs

View logs in Railway Dashboard or:
```bash
railway logs
```

## Troubleshooting

**Build fails:**
- Check that package.json has "start" script
- Verify all dependencies are in package.json

**Database errors:**
- Ensure /data directory exists (Railway provides persistent storage at /app)
- Check CLAWJUDGE_DB env var

**Port issues:**
- Railway sets PORT automatically
- API server uses process.env.PORT
