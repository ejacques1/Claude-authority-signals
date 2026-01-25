# Claude Citation Extractor - Vercel Cron Edition

Fully automated citation extraction from 3,172 health questions using Claude API, Vercel Cron, and Supabase.

## 🎯 What This Does

- **Automatically** processes 3,172 questions through Claude API
- **Extracts** all cited source URLs
- **Writes** results to Google Sheets
- **Tracks** progress in Supabase
- **Runs** every 30 minutes via Vercel Cron
- **Zero manual work** after setup

---

## 📋 Prerequisites

1. **Claude API Key** - Get from: https://console.anthropic.com/
2. **Supabase Account** - Get from: https://supabase.com/
3. **Google Cloud Service Account** - For Google Sheets API
4. **Vercel Account** - Get from: https://vercel.com/
5. **GitHub Account** - For deployment

---

## 🚀 Setup Instructions

### Step 1: Supabase Setup

1. Go to your Supabase project
2. Open SQL Editor
3. Run the SQL in `supabase-schema.sql`
4. This creates the `citation_extraction_progress` table

### Step 2: Load Questions into Supabase

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```bash
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-anon-key
   ```

3. Place `41586_2023_6291_MOESM6_ESM.xlsx` in project root

4. Run setup script:
   ```bash
   npm run setup
   ```

This loads all 3,172 questions into Supabase with `status: pending`.

### Step 3: Configure Environment Variables

In Vercel dashboard, add these environment variables:

```
CLAUDE_API_KEY=your-claude-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-anon-key
GOOGLE_SHEET_ID=your-sheet-id-from-url
GOOGLE_CREDENTIALS={"type":"service_account","project_id":"..."}
```

**For GOOGLE_CREDENTIALS:**
1. Create service account in Google Cloud Console
2. Download JSON credentials
3. Copy entire JSON content as one line
4. Paste into Vercel environment variable

### Step 4: Share Google Sheet

1. Create a new Google Sheet
2. Add headers: `Question_Number | Question_Text | AI_Engine | Source_URL`
3. Share with your service account email (from step 3)
4. Give "Editor" permissions

### Step 5: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Step 6: Verify Cron is Running

1. Go to Vercel dashboard → Your project → Settings → Cron
2. You should see: `/api/extract-citations` running every 30 minutes
3. Check Vercel logs to see first run

---

## 📊 Monitoring Progress

### Option 1: Supabase Dashboard

```sql
SELECT * FROM extraction_stats;
```

Shows:
- Total questions
- Completed count
- Pending count
- Total URLs extracted
- Average URLs per question

### Option 2: Vercel Logs

Go to Vercel dashboard → Your project → Logs

You'll see output like:
```
🚀 Citation extraction cron triggered
📦 Processing 20 questions...
  Question 42: "What are symptoms of diabetes?"
  ✓ Extracted 6 URLs
✓ Wrote 120 rows to Google Sheets
📊 Progress: 42/3172 questions | 248 total URLs
```

### Option 3: Google Sheets

Watch rows appear in real-time as extraction progresses.

---

## ⚡ Manual Trigger (Speed It Up)

If you want to run extraction immediately instead of waiting for cron:

**Using reqbin.com:**
```
POST https://your-app.vercel.app/api/trigger
```

**Using curl:**
```bash
curl -X POST https://your-app.vercel.app/api/trigger
```

This triggers one batch (20 questions) immediately.

Call it multiple times to speed through questions faster.

---

## 📈 Timeline Estimates

**With 30-minute cron (automatic):**
- Batch size: 20 questions
- Runs per day: ~48
- Questions per day: ~960
- **Total time: ~3-4 days**

**With manual triggering:**
- Trigger every minute manually
- Questions per hour: ~1,200
- **Total time: ~3 hours** (if you trigger continuously)

**With custom cron (every 5 minutes):**
- Edit `vercel.json` to: `"schedule": "*/5 * * * *"`
- Questions per day: ~5,760
- **Total time: ~12-15 hours**

---

## 💰 Cost Estimates

- **Claude API**: ~$15-30 for 3,172 questions
- **Vercel**: Free (within limits)
- **Supabase**: Free tier is sufficient
- **Google Sheets API**: Free

**Total**: ~$15-30

---

## 🔧 Troubleshooting

**Cron not running:**
- Check Vercel dashboard → Settings → Cron
- Verify `vercel.json` is in project root
- Re-deploy after adding `vercel.json`

**"No pending questions":**
- Run the setup script again: `npm run setup`
- Check Supabase table has rows with `status = 'pending'`

**Google Sheets permission error:**
- Verify you shared Sheet with service account email
- Check `GOOGLE_CREDENTIALS` env var is valid JSON
- Test credentials in Google Cloud Console

**Rate limit errors:**
- Reduce `BATCH_SIZE` in `/api/extract-citations.js` (line 12)
- Increase delays between questions (line 112)

**Questions stuck in "processing":**
```sql
-- Reset stuck questions
UPDATE citation_extraction_progress 
SET status = 'pending' 
WHERE status = 'processing';
```

---

## 📁 Project Structure

```
├── api/
│   ├── extract-citations.js  # Main cron endpoint
│   └── trigger.js             # Manual trigger
├── scripts/
│   └── load-questions.js      # One-time setup
├── supabase-schema.sql        # Database schema
├── vercel.json                # Cron configuration
├── package.json
└── README.md
```

---

## 🔄 After Extraction Completes

Once all 3,172 questions are processed:

1. **Export from Google Sheets** → CSV
2. **Upload to Supabase** → `url_coding` table (your existing pipeline)
3. **Run Apify scraper** (your existing setup)
4. **Run Claude authority signal coding** (your existing pipeline)

Everything after extraction uses your existing automation.

---

Automated

1. ✅ Deploy to Vercel
2. ✅ Wait 3-4 days
3. ✅ Done
4. ⏱️ Time: 0 hours (runs automatically)


## 📝 Notes

- Cron runs even when your computer is off
- Progress is saved after each batch (no data loss)
- Can pause/resume anytime by adjusting Supabase status
- Logs are preserved in Vercel for debugging

---

Questions? Check the code comments or Vercel logs for details.
