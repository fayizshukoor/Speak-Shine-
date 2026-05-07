/**
 * textSanitizer.js
 * Shared sanitization and validation for all user-generated text
 * (chat messages, comments, reply previews).
 *
 * Defends against:
 *  - XSS (HTML/script injection)
 *  - NoSQL injection ($-operators, JS expressions)
 *  - Null bytes and non-printable control characters
 *  - Excessive length
 *  - Blank / whitespace-only input
 */

// ── Limits ────────────────────────────────────────────────────────────────────
export const LIMITS = {
  CHAT_MESSAGE:   1000,
  COMMENT:         500,
  REPLY_PREVIEW:   200, // replyTo.text shown in group chat
  NAME_PREVIEW:     80, // replyTo.fromName
};

// ── Patterns ──────────────────────────────────────────────────────────────────

// HTML tags and entities that could execute scripts
const HTML_TAG_RE       = /<[^>]*>/g;
const HTML_ENTITY_RE    = /&(?:#\d+|#x[\da-f]+|[a-z]+);/gi;

// javascript: / data: URI schemes (href/src injection)
const DANGEROUS_URI_RE  = /(?:javascript|data|vbscript)\s*:/gi;

// NoSQL injection: MongoDB operators starting with $
const NOSQL_OP_RE       = /\$[a-zA-Z]/g;

// Null bytes and ASCII control characters (except tab \x09, newline \x0a, CR \x0d)
const CONTROL_CHAR_RE   = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

// Repeated whitespace collapse (more than 3 consecutive newlines → 2)
const EXCESS_NEWLINE_RE = /\n{3,}/g;

// ── Core sanitizer ────────────────────────────────────────────────────────────

/**
 * Sanitize a single text string.
 * Returns the cleaned string, or throws a SanitizeError with a user-facing message.
 *
 * @param {string} input
 * @param {number} maxLength
 * @param {string} fieldName  - used in error messages
 * @returns {string}
 */
export function sanitizeText(input, maxLength, fieldName = "Message") {
  // 1. Type check
  if (typeof input !== "string") {
    throw new SanitizeError(`${fieldName} must be a string`);
  }

  // 2. Strip null bytes and control characters first
  let text = input.replace(CONTROL_CHAR_RE, "");

  // 3. Strip HTML tags
  text = text.replace(HTML_TAG_RE, "");

  // 4. Decode and strip HTML entities (prevents &lt;script&gt; bypass)
  text = text.replace(HTML_ENTITY_RE, "");

  // 5. Block dangerous URI schemes
  if (DANGEROUS_URI_RE.test(text)) {
    throw new SanitizeError(`${fieldName} contains disallowed content`);
  }
  // Reset lastIndex after test()
  DANGEROUS_URI_RE.lastIndex = 0;

  // 6. Block NoSQL injection operators
  if (NOSQL_OP_RE.test(text)) {
    throw new SanitizeError(`${fieldName} contains invalid characters`);
  }
  NOSQL_OP_RE.lastIndex = 0;

  // 7. Collapse excessive newlines
  text = text.replace(EXCESS_NEWLINE_RE, "\n\n");

  // 8. Trim
  text = text.trim();

  // 9. Blank check
  if (!text) {
    throw new SanitizeError(`${fieldName} cannot be empty`);
  }

  // 10. Length check
  if (text.length > maxLength) {
    throw new SanitizeError(`${fieldName} is too long (max ${maxLength} characters)`);
  }

  return text;
}

/**
 * Validate a MongoDB ObjectId string (24 hex chars).
 */
export function isValidObjectId(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Validate a phone number string (digits, optional leading +).
 * Accepts E.164-ish format used throughout the app.
 */
export function isValidPhone(phone) {
  return typeof phone === "string" && /^\+?\d{7,15}$/.test(phone);
}

// ── Custom error class ────────────────────────────────────────────────────────

export class SanitizeError extends Error {
  constructor(message) {
    super(message);
    this.name = "SanitizeError";
    this.statusCode = 400;
  }
}
