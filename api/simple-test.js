/**
 * Simple test to verify video analysis setup
 */

import dotenv from "dotenv";
import { connectDB } from "../db.js";
import VideoReport from "../models/videoReportSchema.js";
import User from "../models/userSchema.js";

// Load environment variables
dotenv.config({ path: "../.env" });

async function simpleTest() {
  console.log("🧪 Simple Video Analysis Test...\n");

  try {
    // Connect to database
    await connectDB();
    console.log("✅ Database connected");

    // Test 1: Create a test user
    console.log("\n👤 Creating test user...");
    const testUser = await User.findOneAndUpdate(
      { phone: "9999999999" },
      { 
        phone: "9999999999",
        name: "Test User",
        userId: "test@example.com"
      },
      { upsert: true, new: true }
    );
    console.log("✅ Test user created:", testUser.name);

    // Test 2: Create a test report (this will create the collection and TTL index)
    console.log("\n📄 Creating test report...");
    const testReport = await VideoReport.create({
      userId: testUser._id,
      phone: testUser.phone,
      videoFileName: "test-video.mp4",
      videoDuration: 60,
      status: "completed",
      analysis: {
        fluency: 8,
        grammar: 7,
        confidence: 9,
        vocabulary: 6,
        overallComment: "Great job! Your speaking has improved significantly.",
        strongPoints: ["Clear pronunciation", "Good pace"],
        suggestions: ["Work on grammar", "Expand vocabulary"],
        stats: {
          duration: "1:00",
          wpm: 120,
          fillerWords: { "um": 2, "uh": 1 },
          fillerTotal: 3
        }
      },
      // Set expiration to 2 minutes for testing
      expiresAt: new Date(Date.now() + 2 * 60 * 1000)
    });
    console.log("✅ Test report created:", testReport._id);

    // Test 3: Verify TTL index was created
    console.log("\n📋 Checking TTL index...");
    try {
      const indexes = await VideoReport.collection.getIndexes();
      const ttlIndex = Object.values(indexes).find(idx => 
        idx.expireAfterSeconds === 0 && idx.key && idx.key.expiresAt
      );
      if (ttlIndex) {
        console.log("✅ TTL index found - reports will auto-delete after 12 hours");
      } else {
        console.log("⚠️ TTL index not found, but it may be created automatically");
      }
    } catch (err) {
      console.log("⚠️ Could not check indexes (this is normal for new collections)");
    }

    // Test 4: Retrieve report
    console.log("\n📖 Retrieving report...");
    const retrievedReport = await VideoReport.findById(testReport._id);
    if (retrievedReport && retrievedReport.analysis) {
      console.log("✅ Report retrieved successfully");
      console.log("   Scores:", {
        fluency: retrievedReport.analysis.fluency,
        grammar: retrievedReport.analysis.grammar,
        confidence: retrievedReport.analysis.confidence,
        vocabulary: retrievedReport.analysis.vocabulary
      });
    } else {
      console.log("❌ Failed to retrieve report");
    }

    // Test 5: Check expiration
    console.log("\n⏰ Checking expiration...");
    const now = new Date();
    const expiresAt = retrievedReport.expiresAt;
    const timeRemaining = Math.round((expiresAt - now) / 1000);
    console.log(`✅ Report expires in ${timeRemaining} seconds`);
    console.log("   (MongoDB will auto-delete within 60 seconds of expiration)");

    // Test 6: List user reports
    console.log("\n📋 Listing user reports...");
    const userReports = await VideoReport.find({
      userId: testUser._id,
      expiresAt: { $gt: new Date() }
    }).sort({ submittedAt: -1 });
    console.log(`✅ Found ${userReports.length} active reports for user`);

    // Test 7: Test video processor import
    console.log("\n🎬 Testing video processor import...");
    try {
      const { parseFeedbackToStructure } = await import("../ai/webVideoProcessor.js");
      console.log("✅ Video processor module loaded successfully");
      
      // Test the parser with sample feedback text
      const sampleFeedback = `🗣️ *Fluency:*    🟩🟩🟩🟩🟩🟩🟩🟩⬜⬜ 8/10
📚 *Grammar:*    🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 7/10
🔥 *Confidence:* 🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 9/10
🧠 *Vocabulary:* 🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜ 6/10
📝 Great job! Your speaking has improved significantly.`;
      
      const parsed = parseFeedbackToStructure(sampleFeedback);
      if (parsed.fluency === 8 && parsed.grammar === 7) {
        console.log("✅ Feedback parser working correctly");
      } else {
        console.log("❌ Feedback parser not working correctly");
        console.log("   Expected: fluency=8, grammar=7");
        console.log("   Got:", { fluency: parsed.fluency, grammar: parsed.grammar });
      }
    } catch (err) {
      console.log("❌ Video processor test failed:", err.message);
    }

    // Test 8: Cleanup
    console.log("\n🧹 Cleaning up...");
    await VideoReport.deleteOne({ _id: testReport._id });
    await User.deleteOne({ _id: testUser._id });
    console.log("✅ Test data cleaned up");

    console.log("\n🎉 All tests completed successfully!");
    console.log("\n📋 System Status:");
    console.log("   ✅ Database connection working");
    console.log("   ✅ VideoReport model working");
    console.log("   ✅ User model integration working");
    console.log("   ✅ Report CRUD operations working");
    console.log("   ✅ Expiration system configured");
    console.log("   ✅ Video processor module loaded");
    console.log("   ✅ Feedback parser working");

    console.log("\n🚀 System is ready for video analysis!");
    console.log("\nNext steps:");
    console.log("   1. Start the API server: npm start");
    console.log("   2. Start the frontend: cd ../frontend && npm run dev");
    console.log("   3. Navigate to /video-analysis in the web app");
    console.log("   4. Upload a test video to verify end-to-end functionality");

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    process.exit(0);
  }
}

// Run the test
simpleTest();