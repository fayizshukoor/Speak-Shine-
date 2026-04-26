# Railway Deployment Fix Guide

## Issues Fixed

### 1. Canvas Dependency Issue
- **Problem**: Canvas package requires native libraries (cairo, pango, etc.) that were failing to build
- **Solution**: Moved canvas to `optionalDependencies` and excluded it from web deployment using `--omit=optional`
- **Impact**: Canvas is only used in `poster.js` (WhatsApp bot), not needed for web API

### 2. Build Command Optimization
- **Problem**: Inconsistent npm install commands causing build failures
- **Solution**: Updated `nixpacks.webapp.toml` to use `npm ci` with fallback to `npm install`
- **Impact**: Faster, more reliable builds with proper dependency locking

### 3. Unnecessary Files in Deployment
- **Problem**: WhatsApp bot files and tests being deployed unnecessarily
- **Solution**: Created `.railwayignore` to exclude WhatsApp-specific files
- **Impact**: Smaller deployment size, faster builds

## Configuration Changes

### Updated Files:
1. `nixpacks.webapp.toml` - Optimized build commands
2. `package.json` - Moved canvas to optionalDependencies
3. `.railwayignore` - Excluded unnecessary files

## Deployment Steps

### 1. Commit Changes
```bash
git add .
git commit -m "fix: optimize Railway deployment configuration"
git push
```

### 2. Railway Environment Variables
Ensure these are set in Railway dashboard:

**Required:**
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `GROQ_API_KEYS` - Comma-separated Groq API keys
- `GEMINI_API_KEY` - Google Gemini API key
- `NODE_ENV=production`

**Optional:**
- `REDIS_URL` - Redis connection for caching
- `FRONTEND_URL` - Frontend URL for CORS
- `API_PORT` - API port (defaults to Railway's PORT)
- `TRANSCRIBE_TIMEOUT_MS=240000`
- `SPEECH_TIMEOUT_MS=120000`
- `VISUAL_TIMEOUT_MS=240000`

### 3. Verify Build
After pushing, Railway will automatically:
1. Install Node.js 20 and ffmpeg
2. Install root dependencies (excluding canvas)
3. Install frontend dependencies
4. Build frontend with Vite
5. Start API server

### 4. Check Deployment
- Health check: `https://your-app.railway.app/api/health`
- Should return: `{"status":"ok","app":"Speak & Shine 🗣️"}`

## Troubleshooting

### Build Still Failing?
1. Check Railway logs for specific error
2. Verify all environment variables are set
3. Ensure MongoDB is accessible from Railway

### Frontend Not Loading?
1. Check that `frontend/dist` was created during build
2. Verify `NODE_ENV=production` is set
3. Check browser console for API connection errors

### Video Upload Failing?
1. Verify ffmpeg is installed (should be in nixpacks)
2. Check tmp/uploads directory permissions
3. Verify Groq/Gemini API keys are valid

## Architecture

### Web Deployment (Railway):
- **Backend**: Express API on port 3001
- **Frontend**: React SPA served from `frontend/dist`
- **Dependencies**: Node.js 20, ffmpeg, MongoDB
- **Excluded**: Canvas, WhatsApp bot files

### WhatsApp Bot (Separate):
- **Entry**: `index.js`
- **Dependencies**: All packages including canvas
- **Not deployed to Railway**

## Next Steps

1. Monitor first successful deployment
2. Test video upload and analysis
3. Verify SSE progress updates work
4. Check user authentication flow
5. Test all dashboard features
