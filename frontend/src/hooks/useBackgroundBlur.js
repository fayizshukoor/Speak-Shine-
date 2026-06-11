import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * useBackgroundBlur
 * 
 * AI-powered background blur using MediaPipe Selfie Segmentation.
 * Detects the person in real-time and blurs only the background.
 * 
 * @param {number} blurStrength - Blur intensity in pixels (default: 20)
 * @returns {Object} - { applyBlur, cleanupBlur, blurStatus, blurError }
 */
export function useBackgroundBlur(blurStrength = 20) {
  const [blurStatus, setBlurStatus] = useState('idle'); // idle | loading | active | fallback | error
  const [blurError, setBlurError] = useState(null);
  
  const segmenterRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const animationFrameRef = useRef(null);
  const inputVideoRef = useRef(null);
  const outputStreamRef = useRef(null);
  const blurStrengthRef = useRef(blurStrength);
  const originalStreamRef = useRef(null); // Store original stream for toggling
  const isBlurEnabledRef = useRef(true); // Track if blur should be applied

  // Update blur strength dynamically
  useEffect(() => {
    blurStrengthRef.current = blurStrength;
  }, [blurStrength]);

  // Cleanup function
  const cleanupBlur = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(track => track.stop());
      outputStreamRef.current = null;
    }
    
    if (inputVideoRef.current) {
      inputVideoRef.current.srcObject = null;
      inputVideoRef.current = null;
    }
    
    if (segmenterRef.current) {
      segmenterRef.current.close?.();
      segmenterRef.current = null;
    }
    
    if (canvasRef.current) {
      canvasRef.current = null;
      ctxRef.current = null;
    }
    
    originalStreamRef.current = null;
    isBlurEnabledRef.current = true;
    
    setBlurStatus('idle');
    setBlurError(null);
  }, []);

  // Toggle blur on/off during recording
  const toggleBlur = useCallback((enabled) => {
    isBlurEnabledRef.current = enabled;
    if (enabled) {
      setBlurStatus('active');
    } else {
      setBlurStatus('idle');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupBlur();
  }, [cleanupBlur]);

  /**
   * Apply background blur to a MediaStream
   * @param {MediaStream} originalStream - The input video stream
   * @returns {Promise<MediaStream>} - Returns blurred stream or original on fallback
   */
  const applyBlur = useCallback(async (originalStream) => {
    try {
      setBlurStatus('loading');
      setBlurError(null);

      console.log('[BackgroundBlur] Starting initialization...');

      // Check browser support
      if (!HTMLCanvasElement.prototype.captureStream) {
        console.warn('[BackgroundBlur] Canvas.captureStream() not supported');
        setBlurStatus('fallback');
        return originalStream;
      }

      // Check if MediaPipe is loaded globally (via script tag in index.html)
      // Priority: window object first (most reliable in production)
      let SelfieSegmentation = window.SelfieSegmentation;
      
      if (SelfieSegmentation && typeof SelfieSegmentation === 'function') {
        console.log('[BackgroundBlur] ✅ Using MediaPipe from window object');
      } else {
        console.log('[BackgroundBlur] window.SelfieSegmentation not available, trying dynamic import...');
        
        // Fallback: try dynamic import (for development)
        try {
          const mediaPipeModule = await import('@mediapipe/selfie_segmentation');
          
          console.log('[BackgroundBlur] Module keys:', Object.keys(mediaPipeModule));
          
          // The module has a 'default' key - access it directly
          if (mediaPipeModule.default && typeof mediaPipeModule.default === 'function') {
            SelfieSegmentation = mediaPipeModule.default;
            console.log('[BackgroundBlur] ✅ Using default export');
          } else if (mediaPipeModule.SelfieSegmentation) {
            SelfieSegmentation = mediaPipeModule.SelfieSegmentation;
            console.log('[BackgroundBlur] ✅ Using named export');
          } else if (mediaPipeModule.default && mediaPipeModule.default.SelfieSegmentation) {
            SelfieSegmentation = mediaPipeModule.default.SelfieSegmentation;
            console.log('[BackgroundBlur] ✅ Using default.SelfieSegmentation');
          }
        } catch (importErr) {
          console.error('[BackgroundBlur] Dynamic import failed:', importErr);
        }
      }
      
      // Final validation
      if (!SelfieSegmentation || typeof SelfieSegmentation !== 'function') {
        console.error('[BackgroundBlur] ❌ MediaPipe not available');
        console.error('[BackgroundBlur] window.SelfieSegmentation:', typeof window.SelfieSegmentation);
        setBlurStatus('fallback');
        setBlurError('MediaPipe not loaded');
        return originalStream;
      }
      
      console.log('[BackgroundBlur] ✅ MediaPipe ready');

      // Create hidden video element to read frames from original stream
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.width = 640;
      video.height = 480;
      video.srcObject = originalStream;
      inputVideoRef.current = video;

      // Wait for video to load
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = (e) => reject(new Error('Video element error: ' + e));
        setTimeout(() => reject(new Error('Video load timeout')), 5000);
      });
      await video.play();

      console.log('[BackgroundBlur] Video element ready:', video.videoWidth, 'x', video.videoHeight);

      // Create canvas for drawing blurred output
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      canvasRef.current = canvas;
      ctxRef.current = ctx;

      console.log('[BackgroundBlur] Canvas created:', canvas.width, 'x', canvas.height);

      // Initialize MediaPipe Selfie Segmentation with fallback CDN
      let segmenter;
      try {
        segmenter = new SelfieSegmentation({
          locateFile: (file) => {
            // Try unpkg CDN first (more reliable)
            const cdnUrl = `https://unpkg.com/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`;
            console.log('[BackgroundBlur] Loading file from CDN:', cdnUrl);
            return cdnUrl;
          }
        });

        segmenter.setOptions({
          modelSelection: 1, // 0 = general (faster), 1 = landscape (more accurate)
        });

        console.log('[BackgroundBlur] Segmenter initialized');
      } catch (segErr) {
        console.error('[BackgroundBlur] Segmenter init error:', segErr);
        throw segErr;
      }

      segmenterRef.current = segmenter;

      // Process each frame
      let isProcessing = false;
      let lastFrameTime = 0;
      const TARGET_FPS = 30;
      const FRAME_INTERVAL = 1000 / TARGET_FPS;
      
      const onResults = (results) => {
        if (!canvasRef.current || !ctxRef.current) return;

        const now = performance.now();
        if (now - lastFrameTime < FRAME_INTERVAL) {
          isProcessing = false;
          return; // Skip frame to maintain target FPS
        }
        lastFrameTime = now;

        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        const width = canvas.width;
        const height = canvas.height;

        try {
          ctx.clearRect(0, 0, width, height);

          // If blur is disabled, just draw the original image
          if (!isBlurEnabledRef.current) {
            ctx.drawImage(results.image, 0, 0, width, height);
            isProcessing = false;
            return;
          }

          // Step 1: Draw the original image
          ctx.drawImage(results.image, 0, 0, width, height);
          
          // Step 2: Get image data to manually composite with mask
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;

          // Step 3: Create a temporary canvas for the blurred background
          const blurCanvas = document.createElement('canvas');
          blurCanvas.width = width;
          blurCanvas.height = height;
          const blurCtx = blurCanvas.getContext('2d');
          blurCtx.filter = `blur(${blurStrengthRef.current}px)`;
          blurCtx.drawImage(results.image, 0, 0, width, height);
          const blurredData = blurCtx.getImageData(0, 0, width, height).data;

          // Step 4: Create a temporary canvas for the mask
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = width;
          maskCanvas.height = height;
          const maskCtx = maskCanvas.getContext('2d');
          maskCtx.drawImage(results.segmentationMask, 0, 0, width, height);
          const maskData = maskCtx.getImageData(0, 0, width, height).data;

          // Step 5: Composite based on mask
          // Mask: white (255) = person, black (0) = background
          for (let i = 0; i < data.length; i += 4) {
            const maskValue = maskData[i] / 255; // Normalize to 0-1
            
            // If mask is 1 (person), keep original pixel
            // If mask is 0 (background), use blurred pixel
            data[i]     = data[i] * maskValue + blurredData[i] * (1 - maskValue);     // R
            data[i + 1] = data[i + 1] * maskValue + blurredData[i + 1] * (1 - maskValue); // G
            data[i + 2] = data[i + 2] * maskValue + blurredData[i + 2] * (1 - maskValue); // B
            // Alpha stays the same
          }

          // Step 6: Put the composited image back
          ctx.putImageData(imageData, 0, 0);
        } catch (err) {
          console.warn('[BackgroundBlur] Frame processing error:', err);
        }

        isProcessing = false;
      };

      segmenter.onResults(onResults);

      // Error handler for segmenter
      segmenter.onError = (error) => {
        console.error('[BackgroundBlur] Segmenter error:', error);
      };

      // Start processing loop
      const processFrame = async () => {
        if (!segmenterRef.current || !inputVideoRef.current || !canvasRef.current) {
          return;
        }

        if (!isProcessing && inputVideoRef.current.readyState === 4) {
          isProcessing = true;
          try {
            await segmenter.send({ image: inputVideoRef.current });
          } catch (err) {
            console.error('[BackgroundBlur] Frame send error:', err);
            isProcessing = false;
          }
        }

        animationFrameRef.current = requestAnimationFrame(processFrame);
      };

      // Wait for segmenter to initialize and load models
      console.log('[BackgroundBlur] Waiting for model to load...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start processing
      console.log('[BackgroundBlur] Starting frame processing...');
      processFrame();

      // Create output stream from canvas
      const fps = 30;
      const outputStream = canvas.captureStream(fps);
      
      // Add audio track from original stream
      const audioTracks = originalStream.getAudioTracks();
      audioTracks.forEach(track => outputStream.addTrack(track));

      outputStreamRef.current = outputStream;
      setBlurStatus('active');

      console.log('[BackgroundBlur] ✅ AI background blur active');
      return outputStream;

    } catch (err) {
      console.error('[BackgroundBlur] Failed to initialize:', err);
      setBlurError(err.message);
      setBlurStatus('error');
      cleanupBlur();
      
      // Fallback to original stream
      return originalStream;
    }
  }, [cleanupBlur]);

  return {
    applyBlur,
    cleanupBlur,
    toggleBlur,
    blurStatus,
    blurError,
  };
}
