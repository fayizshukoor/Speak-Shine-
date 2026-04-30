# Security Features Setup Guide

## Quick Start (Fast Deployment)

By default, **all optional security features are DISABLED** for fast deployment and uploads.

The following **core security features** are always enabled:
- ✅ MIME type validation (<1ms)
- ✅ Magic byte validation (~10ms)
- ✅ Duration validation (<1ms)
- ✅ FFmpeg command injection prevention
- ✅ Private video URL security
- ✅ Rate limiting (5 uploads/hour)
- ✅ Upload audit trail

**Total overhead: ~10-20ms** (negligible)

## Optional Security Features

These features add **5-15 seconds** to upload time but provide additional protection:

### 1. Codec Validation (~200ms)
Validates video/audio codecs against whitelist.

**Enable:**
```bash
ENABLE_CODEC_VALIDATION=true
```

### 2. Virus Scanning (~1-5 seconds)
Scans files with ClamAV for malware.

**Requirements:**
- ClamAV must be installed on server
- `clamscan` command must be available

**Enable:**
```bash
ENABLE_VIRUS_SCAN=true
```

**Install ClamAV:**
```bash
# Ubuntu/Debian
sudo apt-get install clamav clamav-daemon
sudo freshclam

# macOS
brew install clamav
freshclam
```

### 3. Content Moderation (~3-10 seconds)
AI-based detection of inappropriate content.

**Requirements:**
- GROQ_API_KEY must be set

**Enable:**
```bash
ENABLE_CONTENT_MODERATION=true
```

## Deployment Configuration

### For Fast Deployment (Recommended for Railway)
```bash
# In Railway environment variables
ENABLE_CODEC_VALIDATION=false
ENABLE_VIRUS_SCAN=false
ENABLE_CONTENT_MODERATION=false
```

**Deployment time:** ~2-3 minutes  
**Upload time:** ~10-20ms overhead

### For Maximum Security (Recommended for Production)
```bash
# In Railway environment variables
ENABLE_CODEC_VALIDATION=true
ENABLE_VIRUS_SCAN=true  # Only if ClamAV installed
ENABLE_CONTENT_MODERATION=true  # Only if GROQ_API_KEY set
```

**Deployment time:** ~2-3 minutes  
**Upload time:** ~5-15 seconds overhead

## Security Levels

### Level 1: Fast (Default)
- MIME validation
- Magic byte validation
- Duration validation
- Command injection prevention
- **Upload time:** ~10-20ms overhead
- **Security score:** 12/17 (71%)

### Level 2: Balanced
- Level 1 features
- Codec validation
- **Upload time:** ~200ms overhead
- **Security score:** 13/17 (76%)

### Level 3: Maximum
- Level 2 features
- Virus scanning
- Content moderation
- **Upload time:** ~5-15 seconds overhead
- **Security score:** 16/17 (94%)

## Timeouts

All optional features have automatic timeouts to prevent hanging:
- Codec validation: 5 seconds
- Virus scanning: 10 seconds
- Content moderation: 15 seconds

If a check times out, it's automatically skipped and the upload continues.

## Recommendation

**For Railway deployment:**
- Use **Level 1 (Fast)** to avoid deployment timeouts
- Enable optional features only if needed
- Monitor deployment logs for issues

**For dedicated servers:**
- Use **Level 3 (Maximum)** for best security
- Install ClamAV for virus scanning
- Set GROQ_API_KEY for content moderation

## Current Configuration

Check your current settings:
```bash
# View environment variables
cat .env | grep ENABLE_
```

## Troubleshooting

### Deployment Taking Too Long
**Solution:** Disable all optional features
```bash
ENABLE_CODEC_VALIDATION=false
ENABLE_VIRUS_SCAN=false
ENABLE_CONTENT_MODERATION=false
```

### Uploads Taking Too Long
**Solution:** Same as above - disable optional features

### ClamAV Not Working
**Solution:** Either install ClamAV or disable virus scanning
```bash
ENABLE_VIRUS_SCAN=false
```

### Content Moderation Not Working
**Solution:** Either set GROQ_API_KEY or disable moderation
```bash
ENABLE_CONTENT_MODERATION=false
```

## Summary

- **Default configuration is FAST** (all optional features disabled)
- **Core security features are always enabled** (MIME, magic byte, etc.)
- **Optional features can be enabled when needed**
- **All features have automatic timeouts** (won't hang deployment)
