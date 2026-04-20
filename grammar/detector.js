// Detect if message should be analyzed
export function shouldAnalyze(text) {
  if (!text || text.trim().length === 0) return false;
  
  // Ignore commands
  if (text.trim().startsWith("/")) return false;
  
  // Ignore emoji-only messages
  const emojiRegex = /^[\p{Emoji}\s]+$/u;
  if (emojiRegex.test(text)) return false;
  
  // Ignore one-word messages
  if (text.trim().split(/\s+/).length === 1) return false;
  
  // Ignore URLs
  if (/(https?:\/\/|www\.)/i.test(text)) return false;
  
  // Ignore very short messages
  if (text.trim().length < 5) return false;
  
  // Check if contains English letters
  const englishRegex = /[a-zA-Z]/;
  if (!englishRegex.test(text)) return false;
  
  // Check if mostly English (at least 50% English characters)
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars > 0 && englishChars / totalChars < 0.5) return false;
  
  return true;
}

// Detect language - more lenient check
export function isEnglish(text) {
  // If it has English letters, treat it as English
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  return englishChars >= 2;
}
