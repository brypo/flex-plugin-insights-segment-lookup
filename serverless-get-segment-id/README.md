# Serverless Function: Segment ID Lookup API

The backend API that queries Flex Insights to retrieve segment IDs for a given Task SID.

> 📗 **Looking for the complete solution?** See the [main README](../README.md) for the full overview and quick start guide.

## What This Function Does

This Twilio Serverless Function serves as the backend API for the [Flex plugin](../plugin-get-segment-by-task/README.md). It:

1. Validates Flex JWT tokens for security
2. Authenticates with Flex Insights API (with intelligent caching)
3. Executes a pre-configured Insights report filtered by Task SID
4. Parses CSV results and returns segment IDs as JSON

**Key Feature:** Implements intelligent token caching to reduce API calls by ~99% and improve performance.

## API Documentation

### Endpoint
`GET /get-segment-id`

### Request

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `TaskSid` | string | Yes | The Task SID to look up (also used as External ID) |
| `Token` | string | Yes | Flex JWT token for authentication |

**Example:**
```javascript
GET /get-segment-id?TaskSid=WT1234567890abcdef1234567890abcdef&Token=eyJhbGc...
```

### Response

**Success (200):**
```json
{
  "segment_ids": ["123456", "789012", "345678"]
}
```

**Error (400):**
```json
{
  "error": "TaskSid is required"
}
```

**Error (500):**
```json
{
  "error": "External ID 'WT12345' not found in Flex Insights",
  "details": null
}
```

## Setup & Configuration

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` and add your Flex Insights credentials:

| Variable | Description | Example |
|----------|-------------|---------|
| `ANALYTICS_WORKSPACE` | Flex Insights workspace ID | `bb89mhhktfpc4g5ruti33ixxxxxxxxxx` |
| `INSIGHTS_USERNAME` | Insights API username/email | `user@example.com` |
| `INSIGHTS_PASSWORD` | Insights API password | `your_password` |
| `INSIGHTS_REPORT` | Report ID to execute | `4257423` |

### 3. Add Dependencies to Twilio

When deploying, ensure these dependencies are configured in Twilio Functions:

- `twilio-flex-token-validator` - Latest version
- `axios` - Latest version

## Development & Testing

### Run Locally

```bash
twilio serverless:start
# Function available at http://localhost:3000/get-segment-id
```

### Test Locally

```bash
# Replace with a real Task SID and Flex JWT token
curl "http://localhost:3000/get-segment-id?TaskSid=WT1234567890abcdef1234567890abcdef&Token=your_flex_jwt_token"
```

### View Logs

```bash
# View logs in real-time
twilio serverless:logs --tail
```

### Deploy to Twilio

```bash
twilio serverless:deploy
```

**Save the deployed URL** - you'll need it for the plugin configuration.
Example: `https://segment-lookup-1234.twil.io/get-segment-id`

## How It Works

### Authentication Flow

1. **Get Super Secured Token (SST):**
   - POST to `https://analytics.ytica.com/gdc/account/login`
   - Send Insights username/password
   - Receive SST token

2. **Exchange for Temporary Token (TT):**
   - GET from `https://analytics.ytica.com/gdc/account/token`
   - Send SST in header
   - Receive TT token (used for API calls)

### Token Caching (Best Practices)

To minimize token generation and API calls, the function implements intelligent token caching:

**How it works:**

- **Global Scope Cache:** Tokens are stored in global scope (outside the handler), which persists across warm container invocations in Twilio Serverless
- **SST Cache:** Super Secured Tokens are cached for 14 days (their actual lifetime)
- **TT Cache:** Temporary Tokens are cached for 10 minutes (conservative TTL)
- **Expiration Tracking:** Each token is stored with an expiration timestamp
- **60-Second Buffer:** Tokens are considered expired 60 seconds before actual expiration for safety

**Cache Hit Behavior:**

```
Request 1 (Cold Start):
  → Generate new SST (cached for 14 days)
  → Generate new TT (cached for 10 minutes)
  → Execute report

Request 2-N (within 10 minutes):
  → Use cached TT ✓
  → Use cached SST ✓
  → Execute report

Request N+1 (after 10 minutes):
  → Use cached SST ✓
  → Generate new TT (TT expired, cached for 10 minutes)
  → Execute report

Request N+2 (after 14 days):
  → Generate new SST (SST expired, cached for 14 days)
  → Generate new TT (cached for 10 minutes)
  → Execute report
```

**Monitoring:**

Check Twilio Function logs to monitor cache effectiveness:
```
Using cached temporary token (TT)             ← Cache hit
Using cached SuperSecuredToken (SST)          ← Cache hit
New TT generated and cached (expires in...)   ← Cache miss
New SST generated and cached (expires in...)  ← Cache miss
```

**Benefits:**

- **Reduced API calls:** ~99% reduction in token generation requests during normal operation
- **Faster response times:** Cached tokens eliminate 2 round-trips to GoodData
- **Lower rate limit risk:** Fewer authentication requests
- **Cost efficiency:** Reduced network I/O and processing time

### Report Execution Flow

1. **Find External ID Elements:**
   - POST to `/gdc/md/{workspace}/obj/5193/validElements`
   - Search for Task SID in External ID dimension
   - Get element URIs

2. **Execute Report:**
   - POST to `/gdc/app/projects/{workspace}/execute/raw`
   - Filter report by element URIs
   - Get execution URI

3. **Poll for Results:**
   - GET from execution URI
   - Retry up to 10 times (1 second intervals)
   - Wait for status 200 (report ready)

4. **Parse CSV:**
   - Extract first column values (skip header)
   - Clean and filter empty values
   - Return as JSON array

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `TaskSid is required` | Missing TaskSid parameter | Ensure plugin sends TaskSid |
| `Missing Insights configuration` | Environment variables not set | Configure all required env vars |
| `Authentication failed` | Invalid Insights credentials | Verify username/password |
| `External ID 'XXX' not found` | Task SID not in Insights | Verify task exists in Insights |
| `Report execution failed` | Invalid report ID or permissions | Check INSIGHTS_REPORT ID |
| `Report timeout after 10 seconds` | Report too complex/slow | Optimize report or increase timeout |


## Learn More

- 📘 [Main README](../README.md) - Complete solution overview and quick start
- 📙 [Plugin README](../plugin-get-segment-by-task/README.md) - Frontend setup and usage
- 🔗 [Twilio Serverless Documentation](https://www.twilio.com/docs/serverless)
- 🔗 [Flex Token Validator](https://www.npmjs.com/package/twilio-flex-token-validator)
- 🔗 [Flex Insights API](https://www.twilio.com/docs/flex/developer/insights/api/general-usage)

## Next Steps

After deploying this function:

1. **Note the deployed URL** (e.g., `https://segment-lookup-1234.twil.io/get-segment-id`)
2. **Configure the plugin** - See [Plugin README](../plugin-get-segment-by-task/README.md)
3. **Monitor logs** - Watch for cache hits and performance

## Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Twilio bears no responsibility to support the use or implementation of this software.