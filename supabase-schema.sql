-- Citation Extraction Progress Tracking Table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS citation_extraction_progress (
  id SERIAL PRIMARY KEY,
  question_number INTEGER NOT NULL UNIQUE,
  question_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, error
  urls_extracted INTEGER DEFAULT 0,
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_status ON citation_extraction_progress(status);
CREATE INDEX idx_question_number ON citation_extraction_progress(question_number);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_citation_extraction_progress_updated_at 
  BEFORE UPDATE ON citation_extraction_progress 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- View to see progress stats
CREATE OR REPLACE VIEW extraction_stats AS
SELECT 
  COUNT(*) as total_questions,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'error') as errors,
  SUM(urls_extracted) as total_urls_extracted,
  ROUND(AVG(urls_extracted) FILTER (WHERE status = 'completed'), 2) as avg_urls_per_question
FROM citation_extraction_progress;
