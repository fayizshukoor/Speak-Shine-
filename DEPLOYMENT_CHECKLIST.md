# ✅ Deployment Checklist

Use this checklist to track your deployment progress.

---

## 📋 Pre-Deployment (Gather Credentials)

- [ ] **MongoDB Atlas** connection string
  - Format: `mongodb+srv://username:password@cluster.mongodb.net/dbname`
  - Get from: https://cloud.mongodb.com

- [ ] **Upstash Redis** URL
  - Format: `rediss://default:password@host:6379`
  - Get from: https://console.upstash.com

- [ ] **Groq API Keys** (3-4 keys recommended)
  - Format: `gsk_xxxxxxxxxxxxx`
  - Get from: https://console.groq.com/keys
  - Separate with commas: `key1,key2,key3,key4`

- [ ] **Cloudflare R2** credentials
  - [ ] Account ID
  - [ ] Access Key ID
  - [ ] Secret Access Key
  - [ ] Bucket Name
  - [ ] Public URL
  - Get from: https://dash.cloudflare.com

- [ ] **JWT Secret** (any random string)
  - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 🚀 Backend Deployment (Fly.io)

### Step 1: Install Fly CLI
- [ ] Run: `iwr https://fly.io/install.ps1 -useb | iex`
- [ ] Restart PowerShell
- [ ] Verify: `fly version`

### Step 2: Login
- [ ] Run: `fly auth login`
- [ ] Complete browser authentication

### Step 3: Launch App
- [ ] Run: `fly launch --no-deploy`
- [ ] Choose app name: `speak-shine-backend` (or your choice)
- [ ] Choose region: `sin` (Singapore) or closest to you
- [ ] PostgreSQL: **No**
- [ ] Redis: **No**

### Step 4: Set Environment Variables
Copy and run these commands with your actual values:

```bash
fly secrets set MONGO_URI="your_mongodb_uri"
fly secrets set JWT_SECRET="your_jwt_secret"
fly secrets set GROQ_API_KEYS="key1,key2,key3,key4"
fly secrets set REDIS_URL="your_redis_url"
fly secrets set R2_ACCOUNT_ID="your_r2_account_id"
fly secrets set R2_ACCESS_KEY_ID="your_r2_access_key"
fly secrets set R2_SECRET_ACCESS_KEY="your_r2_secret_key"
fly secrets set R2_BUCKET_NAME="your_bucket_name"
fly secrets set R2_PUBLIC_URL="your_r2_public_url"
fly secrets set NODE_ENV="production"
```

- [ ] All secrets set
- [ ] Verify: `fly secrets list`

### Step 5: Create Volume
- [ ] Run: `fly volumes create speak_shine_data --size 1`

### Step 6: Deploy
- [ ] Run: `fly deploy`
- [ ] Wait 5-10 minutes for build
- [ ] Check status: `fly status`

### Step 7: Test Backend
- [ ] Get URL from `fly status`
- [ ] Test: `curl https://your-backend.fly.dev/api/health`
- [ ] Should return: `{"status":"ok","app":"Speak & Shine 🗣️"}`

**Backend URL:** `https://_____________________.fly.dev`

---

## 🎨 Frontend Deployment (Vercel)

### Step 1: Update API URL
- [ ] Edit `frontend/.env.local`
- [ ] Set: `VITE_API_URL=https://your-backend.fly.dev`
- [ ] Save file

### Step 2: Install Vercel CLI
- [ ] Run: `npm install -g vercel`
- [ ] Verify: `vercel --version`

### Step 3: Deploy
- [ ] Navigate: `cd frontend`
- [ ] Login: `vercel login`
- [ ] Deploy: `vercel --prod`
- [ ] Follow prompts

### Step 4: Get Frontend URL
- [ ] Copy URL from Vercel output
- [ ] Format: `https://speak-shine.vercel.app`

**Frontend URL:** `https://_____________________.vercel.app`

---

## 🔧 Post-Deployment Configuration

### Step 1: Update CORS
- [ ] Edit `api/server.js` (around line 70)
- [ ] Add your Vercel URL to `allowedOrigins` array:
  ```javascript
  const allowedOrigins = [
    "https://your-frontend.vercel.app",
    "http://localhost:5173",
  ];
  ```

### Step 2: Update Socket.io CORS
- [ ] Edit `api/server.js` (around line 100)
- [ ] Add your Vercel URL to Socket.io CORS:
  ```javascript
  const io = new SocketIO(httpServer, {
    cors: {
      origin: [
        "https://your-frontend.vercel.app",
        "http://localhost:5173",
      ],
      credentials: true,
    },
  });
  ```

### Step 3: Commit and Redeploy Backend
- [ ] Run: `git add api/server.js`
- [ ] Run: `git commit -m "chore: update CORS for Vercel"`
- [ ] Run: `git push origin main`
- [ ] Run: `fly deploy`

---

## ✅ Testing

### Backend Tests
- [ ] Health check: `curl https://your-backend.fly.dev/api/health`
- [ ] View logs: `fly logs`
- [ ] Check status: `fly status`

### Frontend Tests
- [ ] Open: `https://your-frontend.vercel.app`
- [ ] Test login page loads
- [ ] Test registration
- [ ] Test video upload
- [ ] Test real-time chat
- [ ] Test admin dashboard

### Integration Tests
- [ ] Frontend can connect to backend
- [ ] Socket.io real-time features work
- [ ] Video upload and analysis works
- [ ] Database operations work
- [ ] Redis caching works

---

## 📊 Monitoring Setup

### Fly.io Dashboard
- [ ] Visit: https://fly.io/dashboard
- [ ] Check CPU/Memory usage
- [ ] Review logs
- [ ] Set up alerts (optional)

### Vercel Dashboard
- [ ] Visit: https://vercel.com/dashboard
- [ ] Check deployment status
- [ ] Review analytics
- [ ] Check build logs

---

## 🎉 Launch Checklist

- [ ] Backend is running (no errors in logs)
- [ ] Frontend is accessible
- [ ] All features tested and working
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Database connected
- [ ] Redis connected
- [ ] R2 storage working
- [ ] Groq API working

---

## 📝 Post-Launch

### Share Your App
- [ ] Share frontend URL with users
- [ ] Update README with live URLs
- [ ] Create user documentation

### Monitor Performance
- [ ] Check Fly.io metrics daily
- [ ] Review Vercel analytics
- [ ] Monitor error logs
- [ ] Track API usage

### Backup & Security
- [ ] MongoDB Atlas auto-backups enabled
- [ ] Rotate Groq API keys if needed
- [ ] Review security settings
- [ ] Set up monitoring alerts

---

## 🆘 Troubleshooting

If something goes wrong, check:

1. **Backend won't start**
   - [ ] Run: `fly logs`
   - [ ] Check all secrets are set: `fly secrets list`
   - [ ] Verify MongoDB connection string

2. **Frontend can't connect**
   - [ ] Check CORS in `api/server.js`
   - [ ] Verify `VITE_API_URL` in Vercel dashboard
   - [ ] Test backend health endpoint

3. **Out of memory**
   - [ ] Run: `fly scale memory 512`

4. **Video processing fails**
   - [ ] Check Groq API keys are valid
   - [ ] Verify R2 credentials
   - [ ] Check backend logs: `fly logs`

---

## 💰 Cost Tracking

| Service | Usage | Cost |
|---------|-------|------|
| Vercel | Bandwidth: _____ GB | $0 |
| Fly.io | VM hours: _____ | $0 |
| MongoDB | Storage: _____ MB | $0 |
| Redis | Commands: _____ | $0 |
| R2 | Storage: _____ GB | $0 |
| **Total** | | **$0** |

---

## ✅ Deployment Complete!

**Your app is live at:**
- Frontend: https://_____________________.vercel.app
- Backend: https://_____________________.fly.dev

**Total time:** _____ minutes
**Total cost:** $0/month

🎉 Congratulations! Your app is now live and free!
