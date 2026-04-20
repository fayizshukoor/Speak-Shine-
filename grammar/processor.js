import { analyzeGrammar, formatCorrections, analyzeWithOpenAI } from "./analyzer.js";
import { detectTenseIssues, quickTenseCheck } from "./tense.js";
import { suggestVocabUpgrade, suggestSpokenImprovement } from "./vocab.js";
import { shouldAnalyze, isEnglish } from "./detector.js";

export async function processMessage(text, settings, openaiKey = null) {
  if (!shouldAnalyze(text)) {
    console.log(`⏭️ Skipping: "${text}" (filter)`);
    return null;
  }
  
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
    if (aiResult) return parseOpenAIResponse(aiResult, text);
  }

  // 1. Run custom tense check FIRST (most reliable)
  if (settings.tenseEnabled) {
    const quickCheck = quickTenseCheck(text);
    if (quickCheck.found) {
      result.corrected = quickCheck.correct;
      result.tips.push(`Use: "${quickCheck.correct}"`);
      // Return immediately - don't let LanguageTool override our correction
      return result;
    }
    
    const tenseIssues = detectTenseIssues(text);
    if (tenseIssues.length > 0) {
      result.tenseIssues = tenseIssues;
    }
  }

  // 2. LanguageTool for grammar/spelling (only if no tense fix found)
  if (settings.grammarEnabled) {
    const matches = await analyzeGrammar(text);
    if (matches.length > 0) {
      const corrections = formatCorrections(text, matches);
      if (corrections) {
        result.corrected = corrections.corrected;
        result.tips = corrections.tips;
      }
    }
  }
  
  // 3. Vocab suggestions
  if (settings.vocabEnabled) {
    const vocabSuggestions = suggestVocabUpgrade(text);
    if (vocabSuggestions.length > 0) result.vocabSuggestions = vocabSuggestions.slice(0, 2);
    
    const spokenSuggestion = suggestSpokenImprovement(text);
    if (spokenSuggestion.found) result.spokenSuggestion = spokenSuggestion;
  }
  
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
