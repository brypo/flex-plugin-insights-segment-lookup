/**
 * Twilio Serverless Function: Get Flex Insights Segment ID
 * 
 * Retrieves and executes a Flex Insights report filtered by task's External ID.
 * Validates Flex JWT token for security.
 * 
 * Dependencies (add in Twilio Functions Configuration):
 * - twilio-flex-token-validator (latest version)
 * - axios (latest version)
 * 
 * Environment Variables (add in Twilio Functions Configuration):
 * - ANALYTICS_WORKSPACE: Your Flex Insights workspace ID
 * - INSIGHTS_USERNAME: Your Flex Insights username
 * - INSIGHTS_PASSWORD: Your Flex Insights password
 * - INSIGHTS_REPORT: The report ID to execute
 */

const TokenValidator = require('twilio-flex-token-validator').functionValidator;
const axios = require('axios');

// GoodData object ID for External ID attribute (Flex Insights)
const EXTERNAL_ID_DISPLAY_FORM = '5193';

// Token cache stored in global scope (persists across warm invocations)
// This significantly reduces token generation API calls
const tokenCache = {
  sst: null,           // SuperSecuredToken (long-lived, ~2 weeks)
  sstExpiry: null,     // Expiration timestamp for SST
  tt: null,            // Temporary token (short-lived, ~10 minutes)
  ttExpiry: null       // Expiration timestamp for TT
};

exports.handler = TokenValidator(async function(context, event, callback) {
  const response = new Twilio.Response();
  
  // Set CORS headers to allow requests from Flex UI
  response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.appendHeader('Content-Type', 'application/json');

  try {
    const { TaskSid } = event;
    const { ANALYTICS_WORKSPACE, INSIGHTS_USERNAME, INSIGHTS_PASSWORD, INSIGHTS_REPORT } = context;
    
    if (!TaskSid) {
      response.setStatusCode(400);
      response.setBody({ error: 'TaskSid is required' });
      return callback(null, response);
    }

    if (!ANALYTICS_WORKSPACE || !INSIGHTS_USERNAME || !INSIGHTS_PASSWORD || !INSIGHTS_REPORT) {
      response.setStatusCode(500);
      response.setBody({ error: 'Missing required environment variables' });
      return callback(null, response);
    }

    // Use cached tokens when possible to avoid excessive token generation
    const token = await getCachedTempToken(INSIGHTS_USERNAME, INSIGHTS_PASSWORD);
    
    // Execute the report filtered by TaskSid and parse results
    const reportExecution = await executeReport(token, ANALYTICS_WORKSPACE, INSIGHTS_REPORT, TaskSid);
    const csvData = await downloadReportCsv(token, reportExecution);
    const segmentIds = parseSegmentIds(csvData);

    response.setStatusCode(200);
    response.setBody({ segment_ids: segmentIds });
    return callback(null, response);

  } catch (error) {
    console.error('Error:', error.message);
    response.setStatusCode(500);
    response.setBody({ error: error.message });
    return callback(null, response);
  }
});

// Get temporary token with caching logic
async function getCachedTempToken(username, password) {
  // Check if we have a valid temporary token cached (with 60s buffer before expiry)
  if (tokenCache.tt && tokenCache.ttExpiry && Date.now() < (tokenCache.ttExpiry - 60000)) {
    console.log('Using cached temporary token (TT)');
    return tokenCache.tt;
  }
  
  console.log('Temporary token (TT) expired or missing, refreshing...');
  
  // Check if we have a valid SST to use for getting a new TT
  if (!tokenCache.sst || !tokenCache.sstExpiry || Date.now() >= (tokenCache.sstExpiry - 60000)) {
    console.log('SuperSecuredToken (SST) expired or missing, generating new SST...');
    await getSuperSecuredToken(username, password);
  } else {
    console.log('Using cached SuperSecuredToken (SST)');
  }
  
  // Get new temporary token using the SST
  await getTempToken();
  
  return tokenCache.tt;
}

// Get SuperSecuredToken (SST) using username and password
async function getSuperSecuredToken(username, password) {
  const response = await axios.post('https://analytics.ytica.com/gdc/account/login', {
    postUserLogin: { login: username, password, remember: 0, verify_level: 2 }
  });
  
  if (!response.data?.userLogin?.token) throw new Error('Authentication failed');
  
  // Cache SST with 2-week expiration
  tokenCache.sst = response.data.userLogin.token;
  tokenCache.sstExpiry = Date.now() + (14 * 24 * 60 * 60 * 1000);
  console.log('New SST generated and cached (expires in 14 days)');
}

// Get temporary token using SST
async function getTempToken() {
  const response = await axios.get('https://analytics.ytica.com/gdc/account/token', {
    headers: { 'X-GDC-AuthSST': tokenCache.sst }
  });
  
  if (!response.data?.userToken?.token) throw new Error('Failed to get temporary token');
  
  // Cache TT with conservative 10-minute expiration
  tokenCache.tt = response.data.userToken.token;
  tokenCache.ttExpiry = Date.now() + (10 * 60 * 1000);
  console.log('New TT generated and cached (expires in 10 minutes)');
}

// Find external ID elements in a display form (filters report by Task SID)
async function findExternalIdElements(token, workspaceId, displayFormId, externalId) {
  const response = await axios.post(
    `https://analytics.ytica.com/gdc/md/${workspaceId}/obj/${displayFormId}/validElements`,
    { validElementsRequest: { titles: [externalId] } },
    { headers: { Cookie: `GDCAuthTT=${token}` } }
  );
  
  if (!response.data?.validElements?.items?.length) {
    throw new Error(`External ID '${externalId}' not found in Flex Insights`);
  }
  
  return response.data.validElements.items.map(item => item.element.uri);
}

// Execute report with External ID filter and return execution URI
async function executeReport(token, workspaceId, reportId, externalId) {
  const elementUris = await findExternalIdElements(token, workspaceId, EXTERNAL_ID_DISPLAY_FORM, externalId);
  
  const response = await axios.post(
    `https://analytics.ytica.com/gdc/app/projects/${workspaceId}/execute/raw`,
    {
      report_req: {
        report: `/gdc/md/${workspaceId}/obj/${reportId}`,
        context: {
          filters: [{
            uri: `/gdc/md/${workspaceId}/obj/${EXTERNAL_ID_DISPLAY_FORM}`,
            constraint: { type: "list", elements: elementUris }
          }]
        }
      }
    },
    { headers: { Cookie: `GDCAuthTT=${token}` } }
  );
  
  if (!response.data?.uri) throw new Error('Report execution failed');
  return response;
}

// Download report CSV data (polls until ready, max 10 seconds)
async function downloadReportCsv(token, reportExecution) {
  for (let i = 0; i < 10; i++) {
    try {
      const response = await axios.get(
        `https://analytics.ytica.com${reportExecution.data.uri}`,
        { headers: { Cookie: `GDCAuthTT=${token}` } }
      );
      if (response.status === 200) return response.data;
    } catch (error) {
      if (error.response?.status !== 202) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Report timeout after 10 seconds');
}

// Parse CSV data and extract segment IDs from first column
function parseSegmentIds(csvData) {
  if (!csvData || typeof csvData !== 'string') return [];
  
  const lines = csvData.trim().split('\n');
  if (lines.length <= 1) return [];
  
  return lines.slice(1)
    .map(line => line.match(/^"?([^",]+)"?/)?.[1]?.trim())
    .filter(Boolean);
}
