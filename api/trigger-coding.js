import { createClient } from '@supabase/supabase-js';
import { ApifyClient } from 'apify-client';
import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';

// Same config and functions as code-authority-signals.js
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const apify = new ApifyClient({
  token: process.env.APIFY_TOKEN
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
});

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const CODING_PROMPT = `You are a research assistant coding health information sources for authority signals research. You will receive webpage content and must analyze it according to the operational definitions below, then output your analysis as JSON.

OPERATIONAL DEFINITIONS:

1. SOURCE_NAME
Definition: The name of the organization or website publishing this content.
Instructions: Extract the publisher/organization name as it appears on the site (e.g., "Mayo Clinic", "WebMD", "CDC", "Healthline")

2. ORGANIZATION_NAME
Definition: The full official name of the organization behind the content.
Instructions: Extract the complete organization name (e.g., "Mayo Clinic", "Centers for Disease Control and Prevention", "Cleveland Clinic")

3. ORGANIZATION_TYPE
Definition: The primary organizational authority behind the content.
Coding Rules - Use FIRST match in this hierarchy:
1 = Medical Institution - Medical schools, teaching hospitals, university-affiliated medical centers, hospital systems, clinics (Mayo Clinic, Cleveland Clinic, Johns Hopkins, CityMD)
2 = Government Resource - .gov domains OR official government health agencies (CDC, NIH, NHS, FDA, WHO, HHS)
3 = Commercial Health Info - Primary business is health content/information (WebMD, Healthline, Medical News Today, Verywell Health)
4 = Professional/Practice Website - Individual practices, solo practitioners, private clinics, individual doctor/nurse websites
5 = Encyclopedia - Wikipedia, medical encyclopedias, general reference sites
6 = Professional Association/Resource - Membership organizations of healthcare professionals (American Heart Association, American Cancer Society, American Medical Association, specialty societies)
7 = Peer-Reviewed Journal - Academic/scientific journals (JAMA, The Lancet, NEJM, PubMed articles)
8 = News/Media - News organizations with health sections (CNN Health, New York Times Health, BBC Health, Reuters Health)

4. INSTITUTIONAL_AFFILIATION
Definition: The type of institutional affiliation of the publishing organization.
Instructions: Describe what kind of institution this organization is affiliated with or represents. Examples: "Academic Medical Center", "Government Agency", "Commercial Health Company", "Professional Medical Organization", "Independent Practice", "Media Organization". If unclear, write "Not Listed"

5. AUTHOR_NAME
Definition: The name of the individual author if listed.
Instructions: Extract the author's full name if provided. If no individual author is listed, enter "Not Listed"

6. AUTHOR_CREDENTIALS
Definition: Professional credentials of the author if displayed.
Instructions: Extract credentials exactly as shown (MD, DO, RN, NP, PA, PhD, MPH, PT, PharmD, etc.). If multiple credentials, list all (e.g., "MD, MPH"). If no credentials shown, enter "Not Listed"

7. TEMPORAL_DATE
Definition: Most recent date associated with the content.
Instructions: Look for dates in this priority order:
1. "Last updated" or "Modified" date
2. "Reviewed on" or "Review date"
3. "Published" date
4. Any other date stamp on the content
Format as YYYY-MM-DD. If no date found, enter "Not Listed"

8. CONTENT_LENGTH_CATEGORY
Definition: Approximate word count of main article content.
Coding Rules:
0 = Brief - Less than 500 words (short article, brief overview)
1 = Moderate - 500-1,500 words (standard article length)
2 = Comprehensive - More than 1,500 words (detailed, in-depth content)

9. MEDICAL_REVIEW_STATED
Definition: Does the content explicitly state it was medically reviewed?
Instructions: Look for these exact phrases or close variations:
- "Medically reviewed by"
- "Medical review"
- "Reviewed by"
- "Medical editor"
- "Fact-checked"
- "Verified by"
- "Clinically reviewed"
- "Expert reviewed"
- "Reviewed for accuracy"
Coding Rules:
1 = Yes - Page explicitly states medical review with one of the above phrases
0 = No - No explicit medical review statement found

10. REFERENCES_CITED
Definition: Does the content cite external sources?
1 = Yes - Has references, citations, bibliography, or source links
0 = No - No citations to external sources

11. NUMBER_OF_REFERENCES
Definition: Count of external sources cited.
Instructions: Count numbered references, distinct sources in bibliography, or unique external sources cited. If no references, enter 0.

12. HAS_SCHEMA
Definition: Does the page appear to have structured data markup?
Instructions: Look for indicators that structured data is present:
- JSON-LD script tags
- Schema.org properties mentioned
- Microdata attributes (itemscope, itemprop)
- Rich snippets indicators
Coding Rules:
1 = Yes - Clear evidence of structured data markup
0 = No - No evidence of structured data

13. SCHEMA_TYPE
Definition: What type of schema markup is used (if any)?
Instructions: Identify the format of structured data:
- "JSON-LD" - JavaScript object notation for linked data (most common, recommended by Google)
- "Microdata" - HTML5 microdata attributes
- "RDFa" - Resource Description Framework in attributes
- "None" - No schema markup detected
If multiple formats present, list the primary one.

OUTPUT FORMAT:
Respond ONLY with valid JSON in this exact structure, no additional text:

{
  "source_name": "",
  "organization_name": "",
  "organization_type": "",
  "organization_type_code": 0,
  "institutional_affiliation": "",
  "author_name": "",
  "author_credentials": "",
  "temporal_date": "",
  "content_length_category": "",
  "content_length_category_code": 0,
  "medical_review_stated": "",
  "medical_review_stated_code": 0,
  "references_cited": "",
  "references_cited_code": 0,
  "number_of_references": 0,
  "has_schema": "",
  "has_schema_code": 0,
  "schema_type": ""
}`;

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  
  return google.sheets({ version: 'v4', auth });
}

async function claimUncodedUrl(researcherId) {
  const { data: urls, error: fetchError } = await supabase
    .from('url_coding')
    .select('*')
    .in('status', ['uncoded', 'in_progress'])
    .order('url_citation_count', { ascending: false })
    .limit(1);

  if (fetchError || !urls || urls.length === 0) {
    return null;
  }

  const url = urls[0];

  const { error: updateError } = await supabase
    .from('url_coding')
    .update({
      status: 'in_progress',
      researcher_id: researcherId,
      claimed_at: new Date().toISOString()
    })
    .eq('id', url.id);

  if (updateError) {
    return null;
  }

  return url;
}

async function scrapeUrl(url) {
  try {
    const run = await apify.actor('apify/website-content-crawler').call({
      startUrls: [{ url }],
      maxCrawlPages: 1,
      crawlerType: 'cheerio'
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    
    if (items && items.length > 0) {
      return items[0].text || items[0].markdown || '';
    }
    
    return null;
  } catch (error) {
    console.error('Apify error:', error.message);
    return null;
  }
}

async function codeWithClaude(content, url) {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${CODING_PROMPT}\n\nURL being analyzed: ${url}\n\nHere is the webpage content to analyze:\n\n${content.substring(0, 50000)}`
        }
      ]
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return null;
  } catch (error) {
    console.error('Claude API error:', error.message);
    return null;
  }
}

async function writeToGoogleSheets(rowNumbers, codingResult) {
  const sheets = await getGoogleSheetsClient();
  
  const values = [
    codingResult.source_name,
    codingResult.organization_name,
    codingResult.organization_type,
    codingResult.institutional_affiliation,
    codingResult.author_name,
    codingResult.author_credentials,
    codingResult.temporal_date,
    codingResult.content_length_category,
    codingResult.medical_review_stated,
    codingResult.references_cited,
    codingResult.number_of_references,
    codingResult.has_schema,
    codingResult.schema_type
  ];

  let successCount = 0;
  
  for (const rowNumber of rowNumbers) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Sheet1!E${rowNumber}:Q${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [values] }
      });
      successCount++;
    } catch (error) {
      console.error(`Failed to write to row ${rowNumber}:`, error.message);
    }
  }
  
  return successCount;
}

async function markComplete(urlId) {
  const { error } = await supabase
    .from('url_coding')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString()
    })
    .eq('id', urlId);

  return !error;
}

async function markFailed(urlId, reason) {
  await supabase
    .from('url_coding')
    .update({ 
      status: 'failed',
      researcher_id: reason,
      completed_at: new Date().toISOString()
    })
    .eq('id', urlId);
}

export default async function handler(req, res) {
  console.log('Authority coding trigger called');
  
  try {
    // Claim URL
    const urlRecord = await claimUncodedUrl('browser-trigger');
    if (!urlRecord) {
      return res.status(200).json({
        status: 'complete',
        message: 'All URLs coded!'
      });
    }

    console.log(`Processing: ${urlRecord.source_url} (cited ${urlRecord.url_citation_count} times)`);

    // Scrape
    const content = await scrapeUrl(urlRecord.source_url);
    if (!content) {
      await markFailed(urlRecord.id, 'scrape_failed');
      return res.status(200).json({ 
        url: urlRecord.source_url, 
        status: 'scrape_failed' 
      });
    }

    // Code
    const codingResult = await codeWithClaude(content, urlRecord.source_url);
    if (!codingResult) {
      await markFailed(urlRecord.id, 'coding_failed');
      return res.status(200).json({ 
        url: urlRecord.source_url, 
        status: 'coding_failed' 
      });
    }

    // Write to sheets
    const rowsUpdated = await writeToGoogleSheets(urlRecord.row_numbers, codingResult);

    // Mark complete
    await markComplete(urlRecord.id);
    
    console.log(`Completed - updated ${rowsUpdated} rows`);

    return res.status(200).json({
      url: urlRecord.source_url,
      citation_count: urlRecord.url_citation_count,
      rows_updated: rowsUpdated,
      status: 'complete'
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
}
