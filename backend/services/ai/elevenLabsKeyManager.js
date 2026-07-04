/**
 * elevenLabsKeyManager.js
 *
 * Priority-queue (min-heap) key rotation for ElevenLabs API keys.
 *
 * Strategy:
 *  - Keys are sorted by (cooldownUntil ASC, failCount ASC) — the "healthiest"
 *    key always surfaces to the top.
 *  - On a 429 (rate-limit): key goes on cooldown for the retry-after seconds
 *    (default 60 s if header is missing).
 *  - On a 401 / 403 (invalid / quota-exceeded): key goes on a long 6-hour
 *    cooldown so it doesn't keep getting tried.
 *  - On any other transient error (5xx, network): small 15 s cooldown, then retry.
 *  - When ALL keys are on cooldown, getKey() returns null — caller should surface
 *    a graceful error.
 *
 * Environment variable: ELEVENLABS_API_KEYS (comma-separated list of keys).
 * Falls back to ELEVENLABS_API_KEY (single key) for backwards-compatibility.
 */

// ── Min-Heap helpers ──────────────────────────────────────────────────────────
function heapParent(i) { return Math.floor((i - 1) / 2); }
function heapLeft(i)   { return 2 * i + 1; }
function heapRight(i)  { return 2 * i + 2; }

/**
 * Compare two key-nodes. Lower = higher priority (min-heap).
 * Primary:   cooldownUntil (available sooner wins)
 * Secondary: failCount (fewer failures wins)
 */
function lt(a, b) {
  if (a.cooldownUntil !== b.cooldownUntil) return a.cooldownUntil < b.cooldownUntil;
  return a.failCount < b.failCount;
}

class KeyHeap {
  constructor() {
    this._heap = [];
  }

  get size() { return this._heap.length; }

  push(node) {
    this._heap.push(node);
    this._siftUp(this._heap.length - 1);
  }

  peek() { return this._heap[0] ?? null; }

  // Remove the root and re-heapify
  pop() {
    const top = this._heap[0];
    const last = this._heap.pop();
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  // After mutating heap[0] in place, call this to restore heap invariant
  updateRoot() { this._siftDown(0); }

  _siftUp(i) {
    while (i > 0) {
      const p = heapParent(i);
      if (lt(this._heap[i], this._heap[p])) {
        [this._heap[i], this._heap[p]] = [this._heap[p], this._heap[i]];
        i = p;
      } else break;
    }
  }

  _siftDown(i) {
    const n = this._heap.length;
    while (true) {
      let smallest = i;
      const l = heapLeft(i);
      const r = heapRight(i);
      if (l < n && lt(this._heap[l], this._heap[smallest])) smallest = l;
      if (r < n && lt(this._heap[r], this._heap[smallest])) smallest = r;
      if (smallest === i) break;
      [this._heap[i], this._heap[smallest]] = [this._heap[smallest], this._heap[i]];
      i = smallest;
    }
  }
}

// ── Singleton key pool ────────────────────────────────────────────────────────
let _heap = null;

function buildHeap() {
  // Accept comma-separated multi-key env var, fall back to single-key
  const multi  = process.env.ELEVENLABS_API_KEYS || "";
  const single = process.env.ELEVENLABS_API_KEY  || "";
  const raw    = multi || single;

  const keys = raw
    .split(",")
    .map(k => k.trim())
    .filter(Boolean)
    // de-duplicate
    .filter((k, i, arr) => arr.indexOf(k) === i);

  if (keys.length === 0) return null;

  const heap = new KeyHeap();
  for (const key of keys) {
    heap.push({ key, cooldownUntil: 0, failCount: 0 });
  }
  console.log(`[ElevenLabsKeys] Loaded ${keys.length} key(s)`);
  return heap;
}

function getHeap() {
  if (!_heap) _heap = buildHeap();
  return _heap;
}

/**
 * Returns the best available key, or null if all are on cooldown.
 */
export function getKey() {
  const heap = getHeap();
  if (!heap || heap.size === 0) return null;

  const top = heap.peek();
  if (!top) return null;

  const now = Date.now();
  if (top.cooldownUntil > now) {
    // All keys cooled down — report soonest available time
    const waitSec = Math.ceil((top.cooldownUntil - now) / 1000);
    console.warn(`[ElevenLabsKeys] All keys on cooldown — soonest available in ${waitSec}s`);
    return null;
  }

  return top.key;
}

/**
 * Call after a 429 (rate limit) response.
 * @param {string} key        - the key that was rate-limited
 * @param {number} [retryAfter=60] - seconds to cool down (from Retry-After header)
 */
export function markRateLimited(key, retryAfter = 60) {
  _penalise(key, retryAfter * 1000, 1);
  console.warn(`[ElevenLabsKeys] Key ...${key.slice(-6)} rate-limited — cooldown ${retryAfter}s`);
}

/**
 * Call after a 401 / 403 / quota-exceeded response.
 * Key is benched for 6 hours.
 * @param {string} key
 */
export function markInvalid(key) {
  _penalise(key, 6 * 60 * 60 * 1000, 10);
  console.error(`[ElevenLabsKeys] Key ...${key.slice(-6)} invalid/quota-exceeded — benched 6h`);
}

/**
 * Call after a transient 5xx / network error.
 * Key gets a short 15-second rest.
 * @param {string} key
 */
export function markTransientError(key) {
  _penalise(key, 15 * 1000, 1);
  console.warn(`[ElevenLabsKeys] Key ...${key.slice(-6)} transient error — cooldown 15s`);
}

/**
 * Parse the Retry-After header value (seconds integer or HTTP-date).
 * Returns seconds as a number, or null if unparseable.
 */
export function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const n = parseInt(headerValue, 10);
  if (!isNaN(n)) return n;
  const d = new Date(headerValue);
  if (!isNaN(d.getTime())) return Math.max(1, Math.ceil((d.getTime() - Date.now()) / 1000));
  return null;
}

// ── Internal helper ───────────────────────────────────────────────────────────
function _penalise(key, cooldownMs, failIncrement) {
  const heap = getHeap();
  if (!heap) return;

  // Find the node in the heap array and update it
  for (let i = 0; i < heap._heap.length; i++) {
    if (heap._heap[i].key === key) {
      heap._heap[i].cooldownUntil = Date.now() + cooldownMs;
      heap._heap[i].failCount    += failIncrement;
      // Re-heapify from this position
      heap._siftDown(i);
      heap._siftUp(i);
      return;
    }
  }
}

/**
 * Status snapshot — useful for health-check / admin endpoints.
 */
export function getKeyStats() {
  const heap = getHeap();
  if (!heap) return { total: 0, available: 0, keys: [] };

  const now = Date.now();
  const keys = heap._heap.map(n => ({
    suffix: `...${n.key.slice(-6)}`,
    available: n.cooldownUntil <= now,
    cooldownUntil: n.cooldownUntil > now ? new Date(n.cooldownUntil).toISOString() : null,
    failCount: n.failCount,
  }));

  return {
    total:     keys.length,
    available: keys.filter(k => k.available).length,
    keys,
  };
}
