/**
 * One-time setup: Load all questions into Supabase
 * Run this once before starting the cron job
 */

import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function loadQuestions() {
  console.log('📖 Reading Excel file...');
  
  // Load Excel
  const workbook = xlsx.readFile('./41586_2023_6291_MOESM6_ESM.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  
  // Extract questions (skip header row)
  const questions = data.slice(1)
    .map(row => row[0])
    .filter(q => q)
    .map((question, index) => ({
      question_number: index + 1,
      question_text: question,
      status: 'pending'
    }));
  
  console.log(`✓ Found ${questions.length} questions\n`);
  
  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = questions.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('citation_extraction_progress')
      .insert(batch);
    
    if (error) {
      console.error(`❌ Error inserting batch ${i}-${i + batch.length}:`, error);
      continue;
    }
    
    inserted += batch.length;
    console.log(`✓ Inserted ${inserted}/${questions.length} questions`);
  }
  
  console.log('\n✅ Setup complete! All questions loaded into Supabase.');
  console.log('🚀 You can now deploy to Vercel and the cron will start automatically.');
}

loadQuestions().catch(console.error);
