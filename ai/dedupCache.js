/**
 * ai/dedupCache.js — Redis-backed deduplication cache for the video feedback pipeline.
 * Falls back to an in-memory Map if Redis is unavailable or not configured.
 *
 * Exports:
 *   - hashBuffer(buffer)
 *   - markProcessing(hash)
 *   - storeResult(hash, result)
 *   - getCacheEntry(hash)
 *   - evict(hash)
 *   - dedupCache  (the underlying Map — used only in fallback / tests)
 *   - CACHE_TTL_MS
 */

import { createHash } from 'node:crypto';
import Redis from 'ioredis';

// ---------------------------------------------------------------------------
// TTL constants
// ---------------------------------------------------------------------------

/** How long (ms) a completed result is retained. Default: 50 400 000 (14 hrs) */
export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 50_400_000;

/** How long (s) a "processing" entry lives in Redis before auto-expiry (safety net). */
const PROCESSING_TTL_S = 50_400; // 14 hrs

/** How long (s) a completed result lives in Redis. */
const RESULT_TTL_S = Math.ceil(CACHE_TTL_MS / 1000); // 14 hrs

const KEY_PREFIX = 'dedup:';

// ---------------------------------------------------------------------------
// Redis client — lazy singleton
// ---------------------------------------------------------------------------

let redis = null;
let redisAvailable = false;

function getRedis() {
  if (redis) return redis;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    enableOfflineQueue: false,
  });

  redis.on('ready', () => {
    redisAvailable = true;
    console.log('[DedupCache] Redis connected');
  });

  redis.on('error', (err) => {
    if (redisAvailable) {
      console.log('[DedupCache] Redis error — falling back to in-memory:', err.message);
    }
    redisAvailable = false;
  });

  redis.on('close', () => {
    redisAvailable = false;
  });

  redis.connect().catch(() => {
    // connection failure handled by 'error' event
  });

  return redis;
}

// ---------------------------------------------------------------------------
// In-memory fallback Map
// ---------------------------------------------------------------------------

/**
 * Fallback Map used when Redis is unavailable.
 * Also exported so existing tests can inspect / clear it directly.
 * @type {Map<string, 'processing' | string>}
 */
export const dedupCache = new Map();

// ---------------------------------------------------------------------------
// hashBuffer
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 hex digest of the given Buffer.
 *
 * @param {Buffer | Uint8Array} buffer
 * @returns {string}  hex digest
 */
export function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Cache operations — Redis-first, Map fallback
// ---------------------------------------------------------------------------

/**
 * Marks a hash as currently being processed.
 * Redis: SET dedup:<hash> "processing" EX 600
 *
 * @param {string} hash
 */
export async function markProcessing(hash) {
  const client = getRedis();
  if (client && redisAvailable) {
    try {
      await client.set(`${KEY_PREFIX}${hash}`, 'processing', 'EX', PROCESSING_TTL_S);
      return;
    } catch (err) {
      console.log('[DedupCache] markProcessing Redis error, using fallback:', err.message);
    }
  }
  dedupCache.set(hash, 'processing');
}

/**
 * Stores a completed feedback result and schedules eviction.
 * Redis: SET dedup:<hash> <result> EX <RESULT_TTL_S>
 *
 * @param {string} hash
 * @param {string} result  — formatted feedback text
 */
export async function storeResult(hash, result) {
  const client = getRedis();
  if (client && redisAvailable) {
    try {
      await client.set(`${KEY_PREFIX}${hash}`, result, 'EX', RESULT_TTL_S);
      return;
    } catch (err) {
      console.log('[DedupCache] storeResult Redis error, using fallback:', err.message);
    }
  }
  dedupCache.set(hash, result);
  setTimeout(() => evict(hash), CACHE_TTL_MS);
}

/**
 * Returns the current cache state for a hash.
 * Returns 'processing', a result string, or undefined/null if not found.
 *
 * @param {string} hash
 * @returns {Promise<'processing' | string | null>}
 */
export async function getCacheEntry(hash) {
  const client = getRedis();
  if (client && redisAvailable) {
    try {
      const val = await client.get(`${KEY_PREFIX}${hash}`);
      return val; // null if not found
    } catch (err) {
      console.log('[DedupCache] getCacheEntry Redis error, using fallback:', err.message);
    }
  }
  return dedupCache.get(hash) ?? null;
}

/**
 * Removes a hash from the cache.
 *
 * @param {string} hash
 */
export async function evict(hash) {
  const client = getRedis();
  if (client && redisAvailable) {
    try {
      await client.del(`${KEY_PREFIX}${hash}`);
      return;
    } catch (err) {
      console.log('[DedupCache] evict Redis error, using fallback:', err.message);
    }
  }
  dedupCache.delete(hash);
}
