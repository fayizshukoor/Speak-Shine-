/**
 * useVideoCompression Hook
 * Lightweight stub — FFmpeg.wasm was removed because it caused 30–60s delays
 * loading a ~30MB WASM binary from CDN before every upload.
 *
 * Compression is now handled by:
 *  - RecordCard: already uses optimised MediaRecorder bitrates (1 Mbps / 96 kbps)
 *  - UploadCard: uploads the original file directly; server-side analysis handles it fine
 *
 * The hook is kept so UploadCard doesn't need refactoring — isSupported() returns
 * false, so the compression branch is simply skipped.
 */

import { useState, useCallback } from "react";

export function useVideoCompression() {
  const [isCompressing]        = useState(false);
  const [compressionProgress]  = useState(0);
  const [compressionError]     = useState(null);

  /** No-op — compression is skipped at the call site when isSupported() === false */
  const compressVideo = useCallback(async (file) => file, []);

  /** Always false → UploadCard skips the compression step entirely */
  const isSupported = useCallback(() => false, []);

  return {
    compressVideo,
    isCompressing,
    compressionProgress,
    compressionError,
    isSupported,
  };
}
