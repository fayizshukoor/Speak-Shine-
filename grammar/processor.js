import { analyzeGrammar, formatCorrections, analyzeWithOpenAI } from "./analyzer.js";
import { detectTenseIssues, quickTenseCheck } from "./tense.js";
import { suggestVocabUpgrade, suggestSpokenImprovement } from "./vocab.js";
import { shouldAnalyze, isEnglish } from "./detector.js";

export async function processMessage(text, settings, openaiKey = null) {
  // Check if should analyze
  if (!shouldAnalyze(text)) {
    console.log(`⏭️ Skipping: "${text}" (filter)`);
    return null;
  }
  
  // Check if English
  if (!isEnglish(text)) {
    console.log(`⏭️ Skipping: not English`);
    return null;
  }
  
  const result = {
    original: text,
    corrected: null,
    tips: [],
    vocabSuggestions: [],
    spokenSuggestion: null,
    tenseIssues: [],
  };
  
  // Try OpenAI first if available
  if (openaiKey) {
    const aiResult = await analyzeWithOpenAI(text, openaiKey);
    if (aiResult) {
      return parseOpenAIResponse(aiResult, text);
    }
  }
  
  // Run all checks in parallel
  const [matches, quickCheck, tenseIssues, vocabSuggestions, spokenSuggestion] = await Promise.all([
    settings.grammarEnabled ? analyzeGrammar(text) : Promise.resolve([]),
    Promise.resolve(quickTenseCheck(text)),
    Promise.resolve(settings.tenseEnabled ? detectTenseIssues(text) : []),
    Promise.resolve(settings.vocabEnabled ? suggestVocabUpgrade(text) : []),
    Promise.resolve(settings.vocabEnabled ? suggestSpokenImprovement(text) : { found: false }),
  ]);

  // Apply LanguageTool corrections
  if (matches.length > 0) {
    const corrections = formatCorrections(text, matches);
    if (corrections) {
      result.corrected = corrections.corrected;
      result.tips = corrections.tips;
    }
  }
  
  // Apply quick tense fix
  if (settings.tenseEnabled && quickCheck.found) {
    const regex = new RegExp(quickCheck.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi");
    result.corrected = (result.corrected || text).replace(regex, quickCheck.correct);
    result.tips.push(`Tense: "${quickCheck.wrong}" → "${quickCheck.correct}"`);
  } else if (settings.tenseEnabled && tenseIssues.length > 0) {
    result.tenseIssues = tenseIssues;
  }
  
  // Vocab suggestions
  if (vocabSuggestions.length > 0) {
    result.vocabSuggestions = vocabSuggestions.slice(0, 2);
  }
  
  if (spokenSuggestion.found) {
    result.spokenSuggestion = spokenSuggestion;
  }
  
  // Return null only if absolutely nothing found
  if (!result.corrected && 
      result.tenseIssues.length === 0 && 
      result.vocabSuggestions.length === 0 && 
      !result.spokenSuggestion &&
      result.tips.length === 0) {
    return null;
  }
  
  return result;
}

function parseOpenAIResponse(response, original) {
  const parts = response.split("|");
  
  return {
    original,
    corrected: parts[1]?.replace("Corrected:", "").trim() || null,
    tips: [parts[2]?.replace("Tip:", "").trim() || "Keep practicing!"],
    vocabSuggestions: [],
    spokenSuggestion: null,
    tenseIssues: [],
  };
}

export function formatResponse(result, username) {
  let msg = `✍️ *English Suggestion for @${username}*\n\n`;
  
  if (result.corrected && result.corrected !== result.original) {
    msg += `❌ *Original:*\n${result.original}\n\n`;
    msg += `✅ *Corrected:*\n${result.corrected}\n\n`;
  }
  
  if (result.tenseIssues.length > 0) {
    msg += `⏰ *Tense:*\n`;
    result.tenseIssues.forEach(issue => {
      msg += `• ${issue.message}\n`;
    });
    msg += `\n`;
  }
  
  if (result.vocabSuggestions.length > 0) {
    msg += `📚 *Better Words:*\n`;
    result.vocabSuggestions.forEach(s => {
      msg += `• "${s.original}" → "${s.upgrade}"\n`;
    });
    msg += `\n`;
  }
  
  if (result.spokenSuggestion) {
    msg += `🗣️ *Spoken English:*\n`;
    msg += `"${result.spokenSuggestion.formal}" → "${result.spokenSuggestion.casual}"\n\n`;
  }
  
  if (result.tips.length > 0) {
    msg += `💡 *Tip:* ${result.tips[0]}\n\n`;
  }
  
  msg += `🔥 _Keep improving! You're doing great!_`;
  
  return msg;
}
