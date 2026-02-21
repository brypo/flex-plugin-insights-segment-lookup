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

// Helper function to check if cached token is still valid
function isCacheValid(expiryTimestamp) {
  if (!expiryTimestamp) return false;
  // Add 60 second buffer before expiration to be safe
  return Date.now() < (expiryTimestamp - 60000);
}

// Helper function to invalidate token cache when errors occur
function invalidateTokenCache() {
  console.log('Invalidating token cache');
  tokenCache.tt = null;
  tokenCache.ttExpiry = null;
  tokenCache.sst = null;
  tokenCache.sstExpiry = null;
}

// Helper function to detect authentication errors
function isAuthError(error) {
  const status = error.response?.status;
  const message = error.message?.toLowerCase() || '';
  return status === 401 || status === 403 || 
         message.includes('auth') || message.includes('unauthorized');
}

exports.handler = TokenValidator(async function(context, event, callback) {
  const response = new Twilio.Response();
  
  // Set CORS headers
  // NOTE: For production, consider restricting Access-Control-Allow-Origin
  // to your specific Flex domain instead of '*'
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
    
    try {
      const reportExecution = await executeReport(token, ANALYTICS_WORKSPACE, INSIGHTS_REPORT, TaskSid);
      const csvData = await downloadReportCsv(token, reportExecution);
      const segmentIds = parseSegmentIds(csvData);

      response.setStatusCode(200);
      response.setBody({ segment_ids: segmentIds });
      return callback(null, response);
    } catch (error) {
      // If error is auth-related and we used a cached token, retry with fresh token
      if (isAuthError(error) && tokenCache.tt) {
        console.log('Auth error with cached token, invalidating cache and retrying...');
        invalidateTokenCache();
        const freshToken = await getCachedTempToken(INSIGHTS_USERNAME, INSIGHTS_PASSWORD);
        const reportExecution = await executeReport(freshToken, ANALYTICS_WORKSPACE, INSIGHTS_REPORT, TaskSid);
        const csvData = await downloadReportCsv(freshToken, reportExecution);
        const segmentIds = parseSegmentIds(csvData);

        response.setStatusCode(200);
        response.setBody({ segment_ids: segmentIds });
        return callback(null, response);
      }
      throw error; // Re-throw if not auth error or retry already attempted
    }

  } catch (error) {
    console.error('Error:', error.message);
    response.setStatusCode(500);
    response.setBody({ error: error.message });
    return callback(null, response);
  }
});

// Get temporary token with caching logic
async function getCachedTempToken(username, password) {
  // Check if we have a valid temporary token cached
  if (tokenCache.tt && isCacheValid(tokenCache.ttExpiry)) {
    console.log('Using cached temporary token (TT)');
    return tokenCache.tt;
  }
  
  console.log('Temporary token (TT) expired or missing, refreshing...');
  
  // Check if we have a valid SST to use for getting a new TT
  if (!tokenCache.sst || !isCacheValid(tokenCache.sstExpiry)) {
    console.log('SuperSecuredToken (SST) expired or missing, generating new SST...');
    await getSuperSecuredToken(username, password);
  } else {
    console.log('Using cached SuperSecuredToken (SST)');
  }
  
  // Get new temporary token using the SST
  await getTempToken();
  
  return tokenCache.tt;
}

// Helper function to get SuperSecuredToken (SST) using username and password
async function getSuperSecuredToken(username, password) {
  const response = await axios.post('https://analytics.ytica.com/gdc/account/login', {
    postUserLogin: { login: username, password, remember: 0, verify_level: 2 }
  });
  if (!response.data?.userLogin?.token) throw new Error('Authentication failed');
  
  // Cache SST with 2-week expiration (14 days in milliseconds)
  tokenCache.sst = response.data.userLogin.token;
  tokenCache.sstExpiry = Date.now() + (14 * 24 * 60 * 60 * 1000);
  
  console.log('New SST generated and cached (expires in 14 days)');
  return response;
}

// Helper function to get temporary token using SST
async function getTempToken() {
  const response = await axios.get('https://analytics.ytica.com/gdc/account/token', {
    headers: { 'X-GDC-AuthSST': tokenCache.sst }
  });
  if (!response.data?.userToken?.token) throw new Error('Failed to get temporary token');
  
  // Cache TT with conservative 10-minute expiration
  // GoodData TT typically lasts longer, but we use short TTL to be safe
  tokenCache.tt = response.data.userToken.token;
  tokenCache.ttExpiry = Date.now() + (10 * 60 * 1000);
  
  console.log('New TT generated and cached (expires in 10 minutes)');
  return response.data.userToken.token;
}

// Helper function to find external ID elements in a display form
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

// Helper function to execute report and return execution URI
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

// Helper function to download report CSV data
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

// Helper function to parse CSV data and extract segment IDs
function parseSegmentIds(csvData) {
  if (!csvData || typeof csvData !== 'string') return [];
  
  const lines = csvData.trim().split('\n');
  if (lines.length <= 1) return [];
  
  return lines.slice(1)
    .map(line => line.match(/^"?([^",]+)"?/)?.[1]?.trim())
    .filter(Boolean);
}
