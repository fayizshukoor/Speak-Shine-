# Login Issue Fixed

## Problem
Login was failing with "Invalid credentials" even with correct password because:
- Frontend sends phone as `"8848096746"` (without country code)
- Backend was doing exact match: `Auth.findOne({ phone: "8848096746" })`
- But Auth records might have phone stored as `"918848096746"` (with country code)
- Exact match failed, causing "Invalid credentials" error

## Solution
Updated login endpoint to try multiple phone formats:
```javascript
const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
const auth = await Auth.findOne({ 
  phone: { $in: [phone, stripped, `91${stripped}`] } 
});
```

Now matches phone numbers stored in any of these formats:
- `"8848096746"` (10 digits)
- `"918848096746"` (with 91 prefix)
- `"+918848096746"` (with +91 prefix)

## What You Need to Do

### Option 1: Create Auth Account (Recommended)
Run this command locally to create an auth account:
```bash
node scripts/create-admin-account.js 8848096746 YourPassword123 "Sidharth T"
```

This will:
- Create an Auth record with phone `"8848096746"`
- Hash the password securely with argon2
- Set role to "admin"
- Enable the account

### Option 2: Use Railway MongoDB Shell
If you can't run scripts locally, manually insert into MongoDB:
```javascript
db.auths.insertOne({
  phone: "8848096746",
  password: "$argon2id$v=19$m=65536,t=3,p=4$...", // Use argon2 hash
  name: "Sidharth T",
  role: "admin",
  isActive: true,
  failedLoginAttempts: 0,
  refreshTokens: [],
  createdAt: new Date()
})
```

### Option 3: Check Existing Auth Record
Maybe an auth record already exists but with different phone format. Check:
```javascript
db.auths.find({ phone: { $regex: "8848096746" } })
```

If found, note the exact phone format and try logging in with that format.

## After Creating Account
1. Go to login page
2. Enter phone: `8848096746` (or whatever format you stored)
3. Enter the password you set
4. Login should work now!

## Files Changed
- `api/routes/auth.js` - Updated login endpoint with flexible phone matching
- `scripts/create-admin-account.js` - Helper script to create accounts

## Testing
After deploying, test login with:
- Phone: `8848096746`
- Phone: `918848096746`
- Phone: `+918848096746`

All three formats should work if the account exists in any of these formats.
