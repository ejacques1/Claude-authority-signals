/**
 * Vercel API Endpoint: Citation Extraction
 * Processes batches of questions and extracts Claude citations
 * Runs via cron every 30 minutes
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

// ==================== CONFIGURATION ====================

const CONFIG = {
  BATCH_SIZE: 20, // Process 20 questions per run
  MODEL: 'claude-sonnet-4-20250514',
  AI_ENGINE_NAME: 'Claude Sonnet 4.5',
  SHEET_ID: process.env.GOOGLE_SHEET_ID,
};

// ==================== INITIALIZE CLIENTS ====================

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// ==================== HELPER FUNCTIONS ====================

function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)].map(url => url.replace(/[.,;!?\)]$/, ''));
}

async function askClaude(question) {
  try {
    const message = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `${question} Please include sources with links in your response.`
      }]
    });
    
    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
    
    return {
      success: true,
      urls: extractUrls(responseText)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      urls: []
    };
  }
}

async function writeToSheets(rows) {
  if (rows.length === 0) return;
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SHEET_ID,
    range: 'Sheet1!A:D',
    valueInputOption: 'RAW',
    resource: { values: rows }
  });
}

// ==================== MAIN HANDLER ====================

export default async function handler(req, res) {
  console.log('🚀 Citation extraction cron triggered');
  
  try {
    // Get next batch of pending questions
    const { data: questions, error: fetchError } = await supabase
      .from('citation_extraction_progress')
      .select('*')
      .eq('status', 'pending')
      .order('question_number', { ascending: true })
      .limit(CONFIG.BATCH_SIZE);
    
    if (fetchError) throw fetchError;
    
    if (!questions || questions.length === 0) {
      console.log('✅ No pending questions - extraction complete!');
      return res.status(200).json({ 
        status: 'complete',
        message: 'All questions processed'
      });
    }
    
    console.log(`📦 Processing ${questions.length} questions...`);
    
    const results = [];
    let totalUrls = 0;
    
    // Process each question
    for (const question of questions) {
      // Mark as processing
      await supabase
        .from('citation_extraction_progress')
        .update({ status: 'processing' })
        .eq('id', question.id);
      
      console.log(`  Question ${question.question_number}: ${question.question_text.substring(0, 50)}...`);
      
      const result = await askClaude(question.question_text);
      
      if (result.success) {
        // Create rows for Google Sheets
        const sheetRows = result.urls.map(url => [
          question.question_number,
          question.question_text,
          CONFIG.AI_ENGINE_NAME,
          url
        ]);
        
        results.push(...sheetRows);
        totalUrls += result.urls.length;
        
        // Update as completed
        await supabase
          .from('citation_extraction_progress')
          .update({ 
            status: 'completed',
            urls_extracted: result.urls.length,
            processed_at: new Date().toISOString()
          })
          .eq('id', question.id);
        
        console.log(`  ✓ Extracted ${result.urls.length} URLs`);
      } else {
        // Mark as error
        await supabase
          .from('citation_extraction_progress')
          .update({ 
            status: 'error',
            error_message: result.error
          })
          .eq('id', question.id);
        
        console.log(`  ✗ Error: ${result.error}`);
      }
      
      // Small delay between questions
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Write all results to Google Sheets
    if (results.length > 0) {
      await writeToSheets(results);
      console.log(`✓ Wrote ${results.length} rows to Google Sheets`);
    }
    
    // Get progress stats
    const { data: stats } = await supabase
      .from('extraction_stats')
      .select('*')
      .single();
    
    console.log(`📊 Progress: ${stats.completed}/${stats.total_questions} questions | ${stats.total_urls_extracted} total URLs`);
    
    return res.status(200).json({
      status: 'success',
      processed: questions.length,
      totalUrls,
      progress: stats
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
}

// Vercel config
export const config = {
  maxDuration: 300, // 5 minutes max
};
