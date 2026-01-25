/**
 * Manual Trigger Endpoint
 * Call this to run extraction immediately instead of waiting for cron
 * 
 * Usage: POST to https://your-app.vercel.app/api/trigger
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Call the extraction endpoint
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/extract-citations`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    return res.status(200).json({
      message: 'Manual extraction triggered',
      result
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to trigger extraction',
      details: error.message
    });
  }
}
