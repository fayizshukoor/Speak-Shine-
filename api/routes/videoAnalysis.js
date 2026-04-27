import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import VideoReport from "../../models/videoReportSchema.js";
import User from "../../models/userSchema.js";
import { processWebVideo, getVideoDuration } from "../../ai/webVideoProcessor.js";
import { uploadToR2, deleteFromR2, getR2Key } from "../../r2.js";

const router = express.Router();

// In-memory SSE clients map: reportId → res
const sseClients = new Map();

// Configure multer for video uploads (max 350MB)
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 350 * 1024 * 1024 },
});

// ── SSE progress stream ──────────────────────────────────────────────────────
// GET /api/video/progress/:reportId
// Client subscribes here to get real-time stage updates
router.get("/progress/:reportId", authMiddleware, async (req, res) => {
  const { reportId } = req.params;

  // Verify the report belongs to this user
  const report = await VideoReport.findById(reportId).lean();
  if (!report || report.userId.toString() !== req.user.id) {
    return res.status(403).json({ error: "Access denied" });
  }

  // If already done, just return immediately
  if (report.status === "completed" || report.status === "failed") {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ status: report.status })}\n\n`);
    return res.end();
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.set(reportId, res);

  // Send a heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(reportId);
  });
});

// Helper to push SSE event to a specific report's client
function pushProgress(reportId, data) {
  const client = sseClients.get(String(reportId));
  if (client) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// ── Upload ───────────────────────────────────────────────────────────────────
// POST /api/video/upload
router.post("/upload", authMiddleware, (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      console.error("[VideoUpload] Multer error:", err.message);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Maximum size is 350MB." });
      }
      return res.status(400).json({ error: err.message || "File upload failed" });
    }
    next();
  });
}, async (req, res) => {
  let videoPath = null;
  let videoKey = null;
  let videoUrl = null;

  try {
    if (!req.file) return res.status(400).json({ error: "No video file uploaded" });

    videoPath = req.file.path;
    const userId = req.user.id;
    const phone  = req.user.phone;

    console.log(`[VideoUpload] ${req.file.originalname} (${(req.file.size/1024/1024).toFixed(1)}MB) user=${phone}`);

    // Ensure upload dir exists
    fs.mkdirSync(path.dirname(videoPath), { recursive: true });

    // Check duration
    let duration;
    try {
      duration = await getVideoDuration(videoPath);
      console.log(`[VideoUpload] Duration: ${duration}s`);
    } catch (err) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: err.message });
    }

    if (duration < 60) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: `Video is too short (${duration}s). Minimum is 1 minute.` });
    }
    if (duration > 300) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: `Video is too long (${duration}s). Maximum is 5 minutes.` });
    }

    // ── SAVE VIDEO TO R2 FIRST (before processing) ──────────────────────
    // This ensures the video is never lost, even if processing fails
    try {
      videoKey = getR2Key(userId.toString(), req.file.originalname);
      videoUrl = await uploadToR2(videoPath, videoKey, req.file.mimetype);
      console.log(`[R2] Video saved: ${videoUrl}`);
    } catch (r2Err) {
      console.error(`[R2] Upload failed:`, r2Err);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(500).json({ error: "Failed to save video. Please try again." });
    }

    // Create report
    const user = await User.findOne({ phone });

    // ── Mark submitted ───────────────────────────────────────────────────
    // Set completed=true at submission time
    // Weekly/monthly submissions are incremented at midnight reset (not here)
    await User.findOneAndUpdate(
      { phone },
      {
        completed: true,
        ...(req.user.name ? { $set: { name: req.user.name } } : {}),
      }
    );

    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: req.file.originalname,
      videoDuration: duration,
      status: "processing",
      videoUrl,      // Video is already saved
      videoKey,      // Key for deletion later
      isPublic: req.body.isPublic === "true" || req.body.isPublic === true,
      uploaderName: user?.name || phone,
    });

    console.log(`[VideoUpload] Report created: ${report._id}`);

    // Respond immediately — processing happens in background
    res.json({
      success: true,
      reportId: report._id,
      message: "Video uploaded. Analysis in progress…",
      estimatedTime: "2-3 minutes",
    });

    // Process in background (video is already in R2, so safe to delete local file)
    processInBackground(report._id, videoPath, phone, user?.name || phone, req.file.mimetype);

  } catch (err) {
    console.error("[VideoUpload] Error:", err);
    
    // Clean up local file
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    
    // If R2 upload succeeded but something else failed, clean up R2
    if (videoKey) {
      try {
        await deleteFromR2(videoKey);
      } catch {}
    }
    
    res.status(500).json({ error: err.message || "Failed to upload video" });
  }
});

// ── Get single report ────────────────────────────────────────────────────────
router.get("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found or expired" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });

    res.json({
      reportId:      report._id,
      status:        report.status,
      submittedAt:   report.submittedAt,
      expiresAt:     report.expiresAt,
      videoFileName: report.videoFileName,
      videoDuration: report.videoDuration,
      videoUrl:      report.videoUrl || null,
      isPublic:      report.isPublic || false,
      analysis:      report.status === "completed" ? report.analysis : null,
      errorMessage:  report.errorMessage,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// ── Community feed — today's public submissions ──────────────────────────────
// GET /api/video/community-feed
router.get("/community-feed", authMiddleware, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const feed = await VideoReport.find({
      status:   "completed",
      isPublic: true,
      videoUrl: { $ne: null },
      submittedAt: { $gte: since },
      expiresAt:   { $gt: new Date() },
    })
      .sort({ submittedAt: -1 })
      .limit(20)
      .select("uploaderName submittedAt videoDuration videoUrl analysis expiresAt")
      .lean();

    res.json({ feed });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch community feed" });
  }
});

// ── Toggle public/private for own report ────────────────────────────────────
router.patch("/report/:reportId/visibility", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });
    if (!report.videoUrl) return res.status(400).json({ error: "No video stored for this report" });

    report.isPublic = !report.isPublic;
    await report.save();
    res.json({ isPublic: report.isPublic });
  } catch (err) {
    res.status(500).json({ error: "Failed to update visibility" });
  }
});

// ── List my reports ──────────────────────────────────────────────────────────
router.get("/my-reports", authMiddleware, async (req, res) => {
  try {
    const reports = await VideoReport.find({
      userId: req.user.id,
      expiresAt: { $gt: new Date() },
    }).sort({ submittedAt: -1 }).limit(10).select("-analysis.transcription");

    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// ── Delete report ────────────────────────────────────────────────────────────
router.delete("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });

    await VideoReport.deleteOne({ _id: req.params.reportId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ── Retry failed analysis ────────────────────────────────────────────────────
// POST /api/video/retry/:reportId
// Retries analysis for a failed report (video is already in R2)
router.post("/retry/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });
    
    // Only allow retry for failed reports
    if (report.status !== "failed") {
      return res.status(400).json({ error: "Can only retry failed reports" });
    }
    
    // Check if video exists in R2
    if (!report.videoUrl || !report.videoKey) {
      return res.status(400).json({ error: "Video not found. Please re-upload." });
    }
    
    // Reset status to processing
    await VideoReport.findByIdAndUpdate(req.params.reportId, {
      status: "processing",
      errorMessage: null,
      analysis: {
        vocabularyHighlights: { strong: [], weak: [] },
        strongPoints: [],
        suggestions: [],
        visualSuggestions: [],
        visualStrengths: [],
        grammarErrors: [],
      },
    });
    
    console.log(`[VideoRetry] Retrying analysis for ${req.params.reportId}`);
    
    res.json({
      success: true,
      message: "Retrying analysis...",
      reportId: req.params.reportId,
    });
    
    // Download from R2 and process
    retryProcessing(req.params.reportId, report.videoUrl, report.phone, report.uploaderName);
    
  } catch (err) {
    console.error("[VideoRetry] Error:", err);
    res.status(500).json({ error: "Failed to retry analysis" });
  }
});

// ── Background processor ─────────────────────────────────────────────────────
async function processInBackground(reportId, videoPath, phone, displayName, mimeType = "video/webm") {
  // Set a timeout for the entire processing (10 minutes max)
  const processingTimeout = setTimeout(async () => {
    console.error(`[VideoAnalysis] ${reportId} TIMEOUT after 10 minutes`);
    try {
      await VideoReport.findByIdAndUpdate(reportId, {
        status: "failed",
        errorMessage: "Processing timeout. Please try again with a shorter video.",
      });
      pushProgress(reportId, { status: "failed", error: "Processing timeout" });
      const client = sseClients.get(String(reportId));
      if (client) { client.end(); sseClients.delete(String(reportId)); }
    } catch {}
  }, 10 * 60 * 1000); // 10 minutes

  try {
    console.log(`[VideoAnalysis] Starting ${reportId}`);

    const result = await processWebVideo(
      videoPath,
      displayName,
      async (stage) => {
        console.log(`[VideoAnalysis] ${reportId}: ${stage}`);
        pushProgress(reportId, { status: "processing", stage });
      }
    );

    // Video is already in R2 (uploaded before processing started)
    // Just update the analysis results
    await VideoReport.findByIdAndUpdate(reportId, {
      status:   "completed",
      analysis: result.analysis,
    });

    // ── Save feedback scores after analysis ────────────────────────────
    const { fluency, grammar, confidence, vocabulary } = result.analysis;
    if (fluency != null || grammar != null) {
      await User.findOneAndUpdate(
        { phone },
        {
          $push: {
            feedbackScores: {
              $each: [{ fluency, grammar, confidence, vocabulary, date: new Date() }],
              $slice: -30,
            },
          },
        }
      );
    }

    pushProgress(reportId, { status: "completed" });
    const client = sseClients.get(String(reportId));
    if (client) { client.end(); sseClients.delete(String(reportId)); }

    console.log(`[VideoAnalysis] ${reportId} completed`);

  } catch (err) {
    console.error(`[VideoAnalysis] ${reportId} failed:`, err.message);
    console.error(`[VideoAnalysis] ${reportId} stack:`, err.stack);

    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: err.message || "Analysis failed",
    });

    pushProgress(reportId, { status: "failed", error: err.message });
    const client = sseClients.get(String(reportId));
    if (client) { client.end(); sseClients.delete(String(reportId)); }

  } finally {
    // Clear the timeout
    clearTimeout(processingTimeout);
    
    // Always delete the local temp file
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  }
}

// ── Retry processor (downloads from R2 and processes) ────────────────────────
async function retryProcessing(reportId, videoUrl, phone, displayName) {
  const tempPath = `./tmp/retry-${reportId}-${Date.now()}.mp4`;
  
  try {
    console.log(`[VideoRetry] Downloading from R2: ${videoUrl}`);
    
    // Download video from R2
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error("Failed to download video from R2");
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    
    console.log(`[VideoRetry] Downloaded, starting processing...`);
    
    // Process the video
    await processInBackground(reportId, tempPath, phone, displayName, "video/mp4");
    
  } catch (err) {
    console.error(`[VideoRetry] ${reportId} failed:`, err);
    
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: "Retry failed: " + err.message,
    });
    
    // Clean up temp file
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

export default router;
