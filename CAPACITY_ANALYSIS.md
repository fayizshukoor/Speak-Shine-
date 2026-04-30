# Speak & Shine - Capacity Analysis & Load Testing Guide

## 📊 Current Infrastructure

### **Railway Deployment**
- **Memory:** 512MB (default Railway plan)
- **CPU:** Shared (varies based on load)
- **Storage:** Ephemeral (videos stored in R2, not local disk)
- **Database:** MongoDB Atlas (separate service)
- **Video Storage:** Cloudflare R2 (unlimited)
- **Redis:** Upstash (for caching)

### **Processing Architecture**
- **Queue System:** Single-threaded FIFO queue
- **Concurrent Processing:** 1 video at a time
- **Processing Time:** ~2-3 minutes per 5-minute video
- **Timeout:** 10 minutes per video
- **Memory per video:** ~200-300MB during processing

---

## 🎯 Maximum Capacity Estimates

### **1. Concurrent Users (Uploading/Recording)**
**Theoretical Maximum:** Unlimited (uploads go directly to R2)
- ✅ Video upload is **direct-to-R2** (doesn't touch Railway server)
- ✅ Recording happens in browser (client-side)
- ✅ Only metadata passes through server

**Practical Limit:** 50-100 simultaneous uploads
- Limited by Railway's network bandwidth
- Limited by MongoDB connection pool (10 connections)

**Recommendation:** **30-50 users** uploading simultaneously is safe

---

### **2. Video Processing Queue**

**Current Setup:**
- Processes **1 video at a time** (sequential)
- Average processing time: **2.5 minutes** per video
- Queue capacity: **Unlimited** (in-memory array)

**Daily Processing Capacity:**
```
24 hours = 1,440 minutes
1,440 minutes ÷ 2.5 minutes per video = 576 videos per day
```

**With 10-minute timeout:**
```
Worst case: 1,440 minutes ÷ 10 minutes = 144 videos per day
```

**Realistic Capacity:** **300-400 videos per day**

---

### **3. Maximum Members**

**Database Limits:**
- MongoDB Atlas Free Tier: **512MB storage**
- Each user record: ~2KB
- Each video report: ~10KB
- Each question: ~1KB

**Storage Calculation:**
```
Users: 10,000 users × 2KB = 20MB
Video Reports: 10,000 reports × 10KB = 100MB
Questions: 1,000 questions × 1KB = 1MB
Total: ~121MB (well within 512MB limit)
```

**Member Capacity:** **5,000-10,000 members** (database not a bottleneck)

**Actual Bottleneck:** Video processing queue

---

### **4. Videos Per Day Limit**

**Based on Processing Queue:**
- **Conservative:** 200 videos/day (leaves buffer for retries)
- **Optimal:** 300 videos/day (80% utilization)
- **Maximum:** 400 videos/day (95% utilization, risky)

**Per Member:**
- If 100 members: 3-4 videos per member per day
- If 200 members: 1-2 videos per member per day
- If 400 members: 1 video per member per day ✅ (your use case)

**Current `.env` Setting:**
```
MAX_USERS=20
```

**Recommendation:** Set to **200-300 members** for daily submissions

---

## 🧪 Load Testing Plan

### **Test 1: Concurrent Uploads**
**Goal:** Test how many users can upload simultaneously

```bash
# Install Apache Bench (load testing tool)
# Windows: Download from https://www.apachelounge.com/download/
# Mac: brew install httpd
# Linux: sudo apt-get install apache2-utils

# Test 10 concurrent uploads
ab -n 10 -c 10 -p video.mp4 -T video/mp4 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://speak-shine.up.railway.app/api/video/upload

# Test 50 concurrent uploads
ab -n 50 -c 50 -p video.mp4 -T video/mp4 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://speak-shine.up.railway.app/api/video/upload
```

**Expected Results:**
- ✅ 10 concurrent: Should work fine
- ⚠️ 50 concurrent: May see some timeouts
- ❌ 100+ concurrent: Will likely fail

---

### **Test 2: Queue Stress Test**
**Goal:** Test video processing queue capacity

**Script:** `scripts/load-test-queue.js`
```javascript
import api from '../frontend/src/api/client.js';

async function uploadTestVideo(index) {
  const start = Date.now();
  try {
    // Create a test video blob
    const blob = new Blob(['test video data'], { type: 'video/mp4' });
    const file = new File([blob], `test-${index}.mp4`, { type: 'video/mp4' });
    
    // Upload
    const formData = new FormData();
    formData.append('video', file);
    
    const response = await api.post('/video/upload', formData);
    const elapsed = Date.now() - start;
    
    console.log(`✅ Video ${index} uploaded in ${elapsed}ms - Report ID: ${response.data.reportId}`);
    return { success: true, elapsed, reportId: response.data.reportId };
  } catch (error) {
    const elapsed = Date.now() - start;
    console.error(`❌ Video ${index} failed after ${elapsed}ms:`, error.message);
    return { success: false, elapsed, error: error.message };
  }
}

async function runLoadTest(numVideos, concurrency) {
  console.log(`\n🧪 Starting load test: ${numVideos} videos, ${concurrency} concurrent\n`);
  
  const results = [];
  const batches = Math.ceil(numVideos / concurrency);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * concurrency;
    const batchEnd = Math.min(batchStart + concurrency, numVideos);
    const batchPromises = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(uploadTestVideo(i + 1));
    }
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Wait 1 second between batches
    if (batch < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const avgTime = results.reduce((sum, r) => sum + r.elapsed, 0) / results.length;
  
  console.log(`\n📊 Load Test Results:`);
  console.log(`   ✅ Successful: ${successful}/${numVideos}`);
  console.log(`   ❌ Failed: ${failed}/${numVideos}`);
  console.log(`   ⏱️  Average time: ${avgTime.toFixed(0)}ms`);
  console.log(`   📈 Success rate: ${(successful / numVideos * 100).toFixed(1)}%`);
}

// Run tests
runLoadTest(10, 5);   // 10 videos, 5 at a time
// runLoadTest(50, 10);  // 50 videos, 10 at a time
// runLoadTest(100, 20); // 100 videos, 20 at a time
```

---

### **Test 3: Daily Capacity Test**
**Goal:** Simulate a full day of submissions

**Scenario:** 200 members, each submits 1 video
```
200 videos × 2.5 min average = 500 minutes = 8.3 hours
```

**Test Plan:**
1. Upload 200 test videos over 2 hours
2. Monitor queue length
3. Check for failures
4. Measure average processing time

**Expected Results:**
- ✅ All 200 videos should process successfully
- ⏱️ Should complete within 10-12 hours
- 📊 Queue should stay under 50 videos

---

## 🚀 Scaling Recommendations

### **Current Capacity (No Changes)**
- **Members:** 20-50
- **Videos/day:** 50-100
- **Concurrent uploads:** 10-20

### **Recommended Capacity (Your Use Case)**
- **Members:** 200-300
- **Videos/day:** 200-300
- **Concurrent uploads:** 30-50

### **To Scale to 500+ Members:**

**Option 1: Parallel Processing (Recommended)**
```javascript
// In api/videoQueue.js
const MAX_CONCURRENT = 3; // Process 3 videos simultaneously
let activeJobs = [];

// Modify processNext() to handle multiple concurrent jobs
```

**Benefits:**
- 3× faster processing
- 900-1,200 videos/day capacity
- Supports 500-800 members

**Cost:** Upgrade Railway to 2GB RAM ($10/month)

---

**Option 2: Separate Processing Service**
- Deploy video processing to separate Railway service
- Main app handles uploads
- Processing service handles AI analysis
- Use Redis for job queue

**Benefits:**
- Unlimited scaling
- Better reliability
- Can handle 1,000+ members

**Cost:** $20-30/month (2 Railway services)

---

**Option 3: Background Workers**
- Use Railway Cron Jobs
- Process videos in batches every hour
- Cheaper but slower

**Benefits:**
- Very cheap
- Simple to implement

**Drawbacks:**
- Slower feedback (1-2 hour delay)
- Not real-time

---

## 📈 Monitoring & Alerts

### **Add Monitoring Dashboard**
Create `/api/admin/capacity` endpoint:

```javascript
router.get('/capacity', authMiddleware, requireRole('admin'), async (req, res) => {
  const queueStats = getQueueStats();
  const userCount = await User.countDocuments();
  const todayReports = await VideoReport.countDocuments({
    submittedAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
  });
  
  const capacity = {
    current: {
      members: userCount,
      videosToday: todayReports,
      queueLength: queueStats.queueLength,
      processing: queueStats.isProcessing,
    },
    limits: {
      maxMembers: 300,
      maxVideosPerDay: 300,
      maxQueueLength: 50,
    },
    health: {
      membersUtilization: (userCount / 300 * 100).toFixed(1) + '%',
      dailyCapacityUsed: (todayReports / 300 * 100).toFixed(1) + '%',
      queueUtilization: (queueStats.queueLength / 50 * 100).toFixed(1) + '%',
    },
    recommendations: []
  };
  
  // Add warnings
  if (userCount > 250) capacity.recommendations.push('⚠️ Approaching member limit - consider scaling');
  if (todayReports > 250) capacity.recommendations.push('⚠️ High daily volume - monitor queue');
  if (queueStats.queueLength > 30) capacity.recommendations.push('🔴 Queue backing up - consider parallel processing');
  
  res.json(capacity);
});
```

---

## 🎯 Recommended Settings for Your Use Case

### **Update `.env`:**
```bash
MAX_USERS=300  # Up from 20
MAX_QUEUE_LENGTH=50  # Add this
ENABLE_PARALLEL_PROCESSING=false  # Add this for future
```

### **Update Railway Memory:**
- Go to Railway dashboard
- Settings → Resources
- Increase to **1GB RAM** ($5/month)
- This allows 2-3 concurrent video processing

---

## 📝 Summary

| Metric | Current | Recommended | Maximum |
|--------|---------|-------------|---------|
| **Members** | 20 | 200-300 | 500 |
| **Videos/Day** | 50 | 200-300 | 400 |
| **Concurrent Uploads** | 10 | 30-50 | 100 |
| **Queue Length** | Unlimited | 50 max | 100 |
| **Processing** | 1 at a time | 1-2 at a time | 3-5 at a time |
| **Railway RAM** | 512MB | 1GB | 2GB |
| **Monthly Cost** | $5 | $10 | $20 |

**Your current setup can handle 200-300 members submitting 1 video per day comfortably!** 🎉

For load testing, I recommend starting with 50 test users and gradually increasing to find your actual limits.
