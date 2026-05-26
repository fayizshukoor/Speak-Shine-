/*
 * backend/config/env.js
 * Centralized environment loader + validator for the backend.
 * Behavior:
 *  1) Loads `.env` via dotenv (if present)
 *  2) Loads optional `backend/config/dev.config.js` (local overrides)
 *  3) Falls back to safe development defaults
 *
 * This lets the app run locally even when `.env` is missing.
 */

const fs = require('fs');
const path = require('path');

// Load .env if present (no crash if dotenv isn't installed)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv is optional in some environments; ignore if missing
}

// Try to load a local dev config that contributors may keep out of git
let devConfig = {};
const devConfigPath = path.join(__dirname, 'dev.config.js');
if (fs.existsSync(devConfigPath)) {
  try {
    devConfig = require(devConfigPath) || {};
  } catch (e) {
    console.warn('Could not load dev.config.js — skipping local overrides');
  }
}

function getVar(name, fallback) {
  const fromEnv = process.env[name];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  if (devConfig && devConfig[name] !== undefined && devConfig[name] !== '') return devConfig[name];
  return fallback;
}

function parseBool(v, fallback = false) {
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === 'true';
}

function parseIntVar(v, fallback = 0) {
  if (v === undefined) return fallback;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? fallback : n;
}

// Safe development defaults
const DEFAULTS = {
  NODE_ENV: 'development',
  PORT: 3001,
  API_PORT: 3001,
  MONGO_URI: 'mongodb://127.0.0.1:27017/whatsapp-bot-dev',
  JWT_SECRET: 'dev-jwt-secret-change-me',
  FRONTEND_URL: 'http://localhost:5173',
  APP_URL: 'http://localhost:3001',
  TRANSCRIBE_TIMEOUT_MS: 240000,
  SPEECH_TIMEOUT_MS: 120000,
  VISUAL_TIMEOUT_MS: 240000,
};

const env = {
  NODE_ENV: getVar('NODE_ENV', DEFAULTS.NODE_ENV),
  PORT: parseIntVar(getVar('PORT', DEFAULTS.PORT)),
  API_PORT: parseIntVar(getVar('API_PORT', DEFAULTS.API_PORT)),

  MONGO_URI: getVar('MONGO_URI', DEFAULTS.MONGO_URI),
  JWT_SECRET: getVar('JWT_SECRET', DEFAULTS.JWT_SECRET),

  REDIS_URL: getVar('REDIS_URL', ''),
  ENABLE_CODEC_VALIDATION: parseBool(getVar('ENABLE_CODEC_VALIDATION', 'false')),
  ENABLE_VIRUS_SCAN: parseBool(getVar('ENABLE_VIRUS_SCAN', 'false')),

  R2_ACCOUNT_ID: getVar('R2_ACCOUNT_ID', ''),
  R2_ACCESS_KEY_ID: getVar('R2_ACCESS_KEY_ID', ''),
  R2_SECRET_ACCESS_KEY: getVar('R2_SECRET_ACCESS_KEY', ''),
  R2_BUCKET_NAME: getVar('R2_BUCKET_NAME', ''),
  R2_PUBLIC_URL: getVar('R2_PUBLIC_URL', ''),
  R2_ENDPOINT: getVar('R2_ENDPOINT', ''),

  GROQ_API_KEY: getVar('GROQ_API_KEY', ''),
  GROQ_API_KEYS: (getVar('GROQ_API_KEYS', '') || '').split(',').map(s => s.trim()).filter(Boolean),

  FRONTEND_URL: getVar('FRONTEND_URL', DEFAULTS.FRONTEND_URL),
  APP_URL: getVar('APP_URL', DEFAULTS.APP_URL),
  ALLOWED_ORIGINS: (getVar('ALLOWED_ORIGINS', '') || '').split(',').map(s => s.trim()).filter(Boolean),

  TRANSCRIBE_TIMEOUT_MS: parseIntVar(getVar('TRANSCRIBE_TIMEOUT_MS', DEFAULTS.TRANSCRIBE_TIMEOUT_MS)),
  SPEECH_TIMEOUT_MS: parseIntVar(getVar('SPEECH_TIMEOUT_MS', DEFAULTS.SPEECH_TIMEOUT_MS)),
  VISUAL_TIMEOUT_MS: parseIntVar(getVar('VISUAL_TIMEOUT_MS', DEFAULTS.VISUAL_TIMEOUT_MS)),
};

// Validation & warnings
function warn(message) { console.warn('⚠️', message); }

if (env.NODE_ENV === 'production') {
  // In production, be strict — fail fast if required secrets are missing
  if (!env.MONGO_URI) throw new Error('MONGO_URI is required in production');
  if (!env.JWT_SECRET || env.JWT_SECRET === DEFAULTS.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');
} else {
  // Development: warn but allow sensible defaults so the app runs for contributors
  if (!process.env.MONGO_URI && (!devConfig || !devConfig.MONGO_URI)) {
    warn('MONGO_URI not set — using local default. Set MONGO_URI in .env or backend/config/dev.config.js for custom value.');
  }
  if (!process.env.JWT_SECRET && (!devConfig || !devConfig.JWT_SECRET)) {
    warn('JWT_SECRET not set — using development fallback. Do NOT use this in production.');
  }
  console.log('✓ backend config loaded (development mode)');
}

module.exports = env;
