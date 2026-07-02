/**
 * Questions Service
 * Business logic for question management
 */

import Question from "../../../models/questionSchema.js";

/**
 * Get a random question for practice
 */
export async function getRandomQuestion(category) {
  const filter = category ? { category } : {};
  const count = await Question.countDocuments(filter);
  
  if (count === 0) {
    const error = new Error("No questions available");
    error.statusCode = 404;
    throw error;
  }
  
  const skip = Math.floor(Math.random() * count);
  const question = await Question.findOne(filter).skip(skip).lean();
  
  return question;
}

/**
 * List all questions with pagination (admin/trainer)
 */
export async function listQuestions(category, limit = 50, page = 1) {
  const filter = category ? { category } : {};
  
  const questions = await Question.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  
  const total = await Question.countDocuments(filter);
  
  return {
    questions,
    total,
    page: Number(page),
  };
}

/**
 * Add a new question (admin only)
 */
export async function addQuestion(category, topic, question) {
  if (!category || !topic || !question) {
    throw new Error("category, topic and question are required");
  }
  
  const newQuestion = await Question.create({ category, topic, question });
  return newQuestion;
}

/**
 * Delete a question (admin only)
 */
export async function deleteQuestion(questionId) {
  await Question.findByIdAndDelete(questionId);
  return { success: true };
}

/**
 * Edit a question (admin only)
 */
export async function editQuestion(questionId, category, topic, question) {
  const updatedQuestion = await Question.findByIdAndUpdate(
    questionId,
    { category, topic, question },
    { new: true }
  );
  
  if (!updatedQuestion) {
    const error = new Error("Question not found");
    error.statusCode = 404;
    throw error;
  }
  
  return updatedQuestion;
}

/**
 * Setup manual question for specific date/type (admin/trainer)
 */
export async function setupManualQuestion(setupType, scheduledFor, scheduledTime, category, topic, question, createdBy, story = {}) {
  if (!setupType || !scheduledFor || !category || !topic || !question) {
    throw new Error("setupType, scheduledFor, category, topic and question are required");
  }

  const validTypes = ["weekly_reflection", "monthly_reflection", "monthly_goals", "story_summary"];
  if (!validTypes.includes(setupType)) {
    throw new Error("Invalid setupType. Must be one of: " + validTypes.join(", "));
  }

  if (setupType === "story_summary" && !story.audioUrl) {
    throw new Error("audioUrl is required for story summary questions");
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const normalizedTime = scheduledTime && timeRegex.test(scheduledTime) ? scheduledTime : null;
  if (scheduledTime && !normalizedTime) {
    throw new Error("Invalid scheduledTime format. Use HH:MM");
  }

  const scheduleDate = normalizedTime
    ? new Date(`${scheduledFor}T${normalizedTime}:00+05:30`)
    : new Date(scheduledFor);
  if (isNaN(scheduleDate.getTime())) {
    throw new Error("Invalid scheduledFor date");
  }

  // Check if there's already a manual question for this date and type
  const existing = await Question.findOne({
    isManualSetup: true,
    setupType,
    scheduledFor: {
      $gte: new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate()),
      $lt: new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate() + 1)
    },
    isUsed: false
  });

  if (existing) {
    throw new Error(`A manual ${setupType.replace('_', ' ')} question is already scheduled for this date`);
  }

  const manualQuestion = await Question.create({
    category,
    topic,
    question,
    isManualSetup: true,
    setupType,
    contentType: setupType === "story_summary" ? "story_audio" : "question",
    audioUrl: story.audioUrl || null,
    storyTranscript: story.storyTranscript || null,
    summaryGuide: story.summaryGuide || null,
    scheduledFor: scheduleDate,
    scheduledTime: normalizedTime,
    createdBy,
    isUsed: false
  });

  return manualQuestion;
}

/**
 * List manual questions (admin/trainer)
 */
export async function listManualQuestions(setupType, upcomingOnly = false) {
  const filter = { isManualSetup: true };
  
  if (setupType) {
    filter.setupType = setupType;
  }
  
  if (upcomingOnly) {
    filter.scheduledFor = { $gte: new Date() };
    filter.isUsed = false;
  }

  const questions = await Question.find(filter)
    .sort({ scheduledFor: 1 })
    .lean();

  return questions;
}

/**
 * Delete manual question (admin/trainer)
 */
export async function deleteManualQuestion(questionId, userPhone) {
  const question = await Question.findById(questionId);
  
  if (!question) {
    const error = new Error("Question not found");
    error.statusCode = 404;
    throw error;
  }

  if (!question.isManualSetup) {
    const error = new Error("Can only delete manual setup questions");
    error.statusCode = 400;
    throw error;
  }

  if (question.isUsed) {
    const error = new Error("Cannot delete a question that has already been used");
    error.statusCode = 400;
    throw error;
  }

  await Question.findByIdAndDelete(questionId);
  return { success: true };
}

/**
 * Get question templates for manual setup (admin/trainer)
 */
export async function getQuestionTemplates() {
  const templates = {
    weekly_reflection: [
      "Did you attend your review this week? If yes, did you pass or fail? Why?",
      "How many days did you submit your speaking video this week?",
      "What was the best speaking moment you had this week?",
      "What was the most difficult part of speaking this week?",
      "What new word or phrase did you learn and use this week?",
      "What is your focus for next week — in both review preparation and communication?"
    ],
    monthly_reflection: [
      "How many reviews did you attend this month?",
      "How many reviews passed and how many failed? Why did you fail?",
      "How many extensions did you take this month?",
      "What is your current growth and progress in the program?",
      "What did you do this month to improve your communication skill?",
      "What is your communication skill level now compared to last month?"
    ],
    monthly_goals: [
      "What is your main goal for this month in the program?",
      "What is your dream or target you are working toward right now?",
      "What specific steps will you take this month to improve your communication?",
      "What was your biggest challenge last month and how will you overcome it this month?",
      "How many reviews are you planning to attend this month?",
      "What will you do differently this month to grow faster?"
    ],
    story_summary: [
      "Listen to the story audio. Then record a short video summary in your own words.",
      "Retell the story in order: beginning, problem, important events, ending, and lesson.",
      "Summarize the story clearly without reading a transcript."
    ]
  };

  return templates;
}

/**
 * Get manual question for specific date and type (used by scheduler)
 */
export async function getManualQuestionForDate(date, setupType) {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  const manualQuestion = await Question.findOne({
    isManualSetup: true,
    setupType,
    scheduledFor: {
      $gte: startOfDay,
      $lt: endOfDay
    },
    isUsed: false
  });

  if (manualQuestion) {
    // Mark as used
    await Question.findByIdAndUpdate(manualQuestion._id, { isUsed: true });
  }

  return manualQuestion;
}

/**
 * Get the oldest due manual question by exact scheduled datetime.
 */
export async function getDueManualQuestion(setupType, now = new Date()) {
  const manualQuestion = await Question.findOne({
    isManualSetup: true,
    setupType,
    scheduledFor: { $lte: now },
    isUsed: false
  }).sort({ scheduledFor: 1 });

  if (manualQuestion) {
    await Question.findByIdAndUpdate(manualQuestion._id, { isUsed: true });
  }

  return manualQuestion;
}
