import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ============================================
// GOOGLE SHEETS SETUP
// ============================================

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  
  return google.sheets({ version: 'v4', auth });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

// ============================================
// MAIN SYNC FUNCTION
// ============================================

async function syncUrlsToSupabase() {
  console.log('🚀 Starting URL sync from Google Sheets to Supabase...\n');
  
  // 1. Read all citations from Google Sheets
  console.log('📊 Reading citations from Google Sheets...');
  const sheets = await getGoogleSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:D' // Question_Number, Question_Text, AI_Engine, Source_URL
  });
  
  const rows = response.data.values;
  
  if (!rows || rows.length <= 1) {
    console.log('❌ No data found in Google Sheets');
    return;
  }
  
  // Skip header row
  const citations = rows.slice(1);
  console.log(`✓ Found ${citations.length} total citations\n`);
  
  // 2. Deduplicate and group by URL
  console.log('🔄 Deduplicating URLs and grouping row numbers...');
  const urlMap = new Map();
  
  citations.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because: skip header (1) and array is 0-indexed
    const sourceUrl = row[3]; // Column D
    
    if (!sourceUrl || sourceUrl === '') return;
    
    if (!urlMap.has(sourceUrl)) {
      urlMap.set(sourceUrl, {
        source_url: sourceUrl,
        row_numbers: [],
        domain: extractDomain(sourceUrl)
      });
    }
    
    urlMap.get(sourceUrl).row_numbers.push(rowNumber);
  });
  
  // Convert to array and add citation counts
  const uniqueUrls = Array.from(urlMap.values()).map(item => ({
    ...item,
    url_citation_count: item.row_numbers.length,
    status: 'uncoded'
  }));
  
  console.log(`✓ Deduplicated to ${uniqueUrls.length} unique URLs\n`);
  
  // 3. Show distribution stats
  const domainCounts = {};
  uniqueUrls.forEach(item => {
    domainCounts[item.domain] = (domainCounts[item.domain] || 0) + item.url_citation_count;
  });
  
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log('📈 Top 10 most cited domains:');
  topDomains.forEach(([domain, count], i) => {
    console.log(`   ${i + 1}. ${domain}: ${count} citations`);
  });
  console.log('');
  
  // 4. Upload to Supabase in batches
  console.log('⬆️  Uploading to Supabase...');
  const BATCH_SIZE = 100;
  let uploaded = 0;
  let errors = 0;
  
  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('url_coding')
      .upsert(batch, { 
        onConflict: 'source_url',
        ignoreDuplicates: false 
      });
    
    if (error) {
      console.error(`   ❌ Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      errors += batch.length;
    } else {
      uploaded += batch.length;
      console.log(`   ✓ Batch ${i / BATCH_SIZE + 1}: ${uploaded}/${uniqueUrls.length} URLs uploaded`);
    }
  }
  
  console.log('');
  console.log('✅ Sync complete!');
  console.log(`   Total citations: ${citations.length}`);
  console.log(`   Unique URLs: ${uniqueUrls.length}`);
  console.log(`   Successfully uploaded: ${uploaded}`);
  console.log(`   Errors: ${errors}`);
  console.log('');
  console.log('🚀 Ready to start processing with your existing process-3.js script!');
}

// ============================================
// RUN
// ============================================

syncUrlsToSupabase()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
