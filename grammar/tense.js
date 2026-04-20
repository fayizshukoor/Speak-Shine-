// Tense detection and correction patterns
const tensePatterns = {
  // Future indicators
  future: /\b(tomorrow|next week|next month|next year|later|soon|will|gonna|going to)\b/i,
  
  // Past indicators
  past: /\b(yesterday|last week|last month|last year|ago|earlier|previously|was|were)\b/i,
  
  // Present continuous indicators
  presentContinuous: /\b(now|currently|at the moment|right now)\b/i,
};

export function detectTenseIssues(text) {
  const issues = [];
  
  // Check for future time with present tense
  if (tensePatterns.future.test(text)) {
    // Check if using present tense verbs
    const presentVerbs = /\b(go|come|do|make|get|see|know|think|take|give)\b/i;
    if (presentVerbs.test(text) && !/\b(will|going to|gonna)\b/i.test(text)) {
      issues.push({
        type: "tense",
        message: "Use future tense (will/going to) for future actions",
        suggestion: "Add 'will' or 'going to' before the verb",
      });
    }
  }
  
  // Check for past time with present tense
  if (tensePatterns.past.test(text)) {
    const presentVerbs = /\b(am|is|are|go|come|do|make|get)\b/i;
    if (presentVerbs.test(text) && !/\b(was|were|went|came|did|made|got)\b/i.test(text)) {
      issues.push({
        type: "tense",
        message: "Use past tense for past actions",
        suggestion: "Change verb to past tense form",
      });
    }
  }
  
  // Check for present continuous indicators
  if (tensePatterns.presentContinuous.test(text)) {
    if (!/\b(am|is|are)\s+\w+ing\b/i.test(text)) {
      issues.push({
        type: "tense",
        message: "Use present continuous (am/is/are + verb-ing) for current actions",
        suggestion: "Use 'am/is/are + verb-ing' form",
      });
    }
  }
  
  return issues;
}

// Common tense corrections - expanded list
export const tenseCorrections = {
  // Future with present tense
  "i go tomorrow": "I will go tomorrow",
  "i come tomorrow": "I will come tomorrow",
  "i do it tomorrow": "I will do it tomorrow",
  "i go next": "I will go next",
  "i come next": "I will come next",
  "i go today": "I will go today",
  "i come today": "I will come today",
  
  // Past time with present tense
  "yesterday i am": "Yesterday I was",
  "yesterday i is": "Yesterday I was",
  "yesterday i go": "Yesterday I went",
  "yesterday i come": "Yesterday I came",
  "yesterday i eat": "Yesterday I ate",
  "yesterday i see": "Yesterday I saw",
  "last night i am": "Last night I was",
  "last week i go": "Last week I went",
  
  // Common grammar mistakes
  "i am go": "I am going",
  "i was go": "I went",
  "i will went": "I will go",
  "he don't": "He doesn't",
  "she don't": "She doesn't",
  "it don't": "It doesn't",
  "they is": "They are",
  "we is": "We are",
  "i is": "I am",
  "you is": "You are",
  "he are": "He is",
  "she are": "She is",
  "i are": "I am",
};

export function quickTenseCheck(text) {
  const lower = text.toLowerCase().trim();
  
  // Normalize common misspellings first
  const normalized = lower
    .replace(/\btowmarow\b/g, "tomorrow")
    .replace(/\btommorow\b/g, "tomorrow")
    .replace(/\btomorow\b/g, "tomorrow")
    .replace(/\btomarrow\b/g, "tomorrow")
    .replace(/\byesterady\b/g, "yesterday")
    .replace(/\byestarday\b/g, "yesterday");
  
  for (const [wrong, correct] of Object.entries(tenseCorrections)) {
    if (normalized.includes(wrong.toLowerCase())) {
      // Apply correction on normalized text, then restore original casing style
      const corrected = normalized.replace(wrong.toLowerCase(), correct.toLowerCase());
      // Capitalize first letter
      return { 
        found: true, 
        wrong: lower, 
        correct: corrected.charAt(0).toUpperCase() + corrected.slice(1)
      };
    }
  }
  return { found: false };
}
