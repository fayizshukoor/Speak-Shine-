/**
 * backend/config/dev.config.example.js
 * Optional local development overrides.
 *
 * IMPORTANT: Copy this file to `backend/config/dev.config.js` and edit values.
 * Then add `backend/config/dev.config.js` to your local .gitignore (already added).
 * Do NOT commit `dev.config.js` — it may contain secrets.
 */

module.exports = {
  // Example local MongoDB for contributors
  MONGO_URI: 'mongodb://127.0.0.1:27017/whatsapp-bot-dev',

  // Local JWT secret for development only — rotate / replace in production
  JWT_SECRET: 'dev-jwt-secret-change-me',

  // Optional: override frontend URL used by server-side generation or CORS
  FRONTEND_URL: 'http://localhost:5173',
  APP_URL: 'http://localhost:3001',

  // Example: public frontend API URL used by client builds
  VITE_API_URL: 'http://localhost:3001',
};
