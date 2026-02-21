# Flex Insights Segment Lookup Solution

A Twilio Flex solution for looking up Flex Insights segment IDs by Task SID directly from the Flex agent UI.

## What This Does

Users can enter any Task SID in the Flex UI and retrieve all associated Flex Insights segment IDs. 

## Components

| Component | Type | Purpose | Documentation |
|-----------|------|---------|---------------|
| **`plugin-get-segment-by-task/`** | Flex Plugin (Frontend) | Adds segment lookup UI to Flex | [Plugin README](./plugin-get-segment-by-task/README.md) |
| **`serverless-get-segment-id/`** | Serverless Function (Backend) | Queries Flex Insights API and returns segment IDs | [Serverless README](./serverless-get-segment-id/README.md) |

### Key Features

**Frontend (Flex Plugin):**
- UI panel integrated into Flex workspace
- Task SID input with real-time lookup
- Displays all segment IDs found

**Backend (Serverless Function):**
- Secure Flex JWT token validation
- Intelligent token caching (99% reduction in auth API calls)
- Flex Insights API integration
- Filters and executes custom Insights reports

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Flex Agent UI                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Segment Lookup Panel                              │     │
│  │  [Enter Task SID: WT123...    ] [Go]               │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────┬───────────────────────────────────────┘
                      │ GET /get-segment-id?TaskSid=WT123&Token=...
                      ▼
┌─────────────────────────────────────────────────────────────┐
│           Twilio Serverless Function                        │
│  • Validates Flex JWT token                                 │
│  • Uses cached tokens (or generates new if expired)         │
│  • Queries Flex Insights API with Task SID filter           │
└─────────────────────┬───────────────────────────────────────┘
                      │ Execute report filtered by External ID
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Flex Insights (GoodData) API                   │
│  • Finds External ID elements                               │
│  • Executes pre-configured report                           │
│  • Returns CSV with segment IDs                             │
└─────────────────────┬───────────────────────────────────────┘
                      │ Parse CSV → JSON array
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 Response to Flex UI                         │
│  { "segment_ids": ["123456", "789012", "345678"] }          │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Twilio Account** with Flex provisioned
- **Twilio CLI** with Flex and Serverless plugins installed
- **Node.js** >= v22
- **Flex Insights** workspace with API credentials
- **Custom Flex Insights Report** configured to return segment IDs (single column output)

## Quick Start

> **Important:** Deploy the backend (Serverless Function) first, then the frontend (Flex Plugin).

### Step 1: Deploy Backend (Serverless Function)

```bash
cd serverless-get-segment-id
npm install

# Configure your Insights credentials
cp .env.example .env
# Edit .env: Add ANALYTICS_WORKSPACE, INSIGHTS_USERNAME, INSIGHTS_PASSWORD, INSIGHTS_REPORT

# Deploy to Twilio
twilio serverless:deploy
# ✓ Note the deployed URL (e.g., https://segment-lookup-xxxx.twil.io)
```

📖 **Details:** See [Serverless Function README](./serverless-get-segment-id/README.md) for API documentation, token caching details, and troubleshooting.

### Step 2: Deploy Frontend (Flex Plugin)

```bash
cd ../plugin-get-segment-by-task
npm install

# Configure serverless URL from Step 1
cp .env.example .env
# Edit .env: Add FLEX_APP_SERVERLESS_URL=https://segment-lookup-xxxx.twil.io/get-segment-id

# Deploy to Flex
twilio flex:plugins:deploy --changelog "Initial deployment"
twilio flex:plugins:release --plugin plugin-get-segment-by-task@latest --name "Segment Lookup" --description "Segment ID lookup tool"
```

📖 **Details:** See [Plugin README](./plugin-get-segment-by-task/README.md) for local development, configuration options, and usage guide.

### Step 3: Use in Flex

1. Open your Twilio Flex dashboard
2. Look for the **Segment Lookup** panel in the workspace
3. Enter a Task SID and click **Go**
4. View the segment IDs returned

## Configuration Summary

### Backend Environment Variables (in `serverless-get-segment-id/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `ANALYTICS_WORKSPACE` | Flex Insights workspace ID | `bb89mhhktfpc4g5ruti33ixxxxxxxxxx` |
| `INSIGHTS_USERNAME` | Insights API username | `user@example.com` |
| `INSIGHTS_PASSWORD` | Insights API password | `your_password` |
| `INSIGHTS_REPORT` | Report ID that returns segment IDs | `4257423` |

### Frontend Environment Variables (in `plugin-get-segment-by-task/.env`)

| Variable | Description |
|----------|-------------|
| `FLEX_APP_SERVERLESS_URL` | Full URL to deployed serverless function endpoint |

**Example:** `FLEX_APP_SERVERLESS_URL=https://segment-lookup-1234.twil.io/get-segment-id`

## Project Structure

```
flex-plugin-get-insights-segment/
├── README.md                          (You are here - Overview & Quick Start)
│
├── plugin-get-segment-by-task/        (Frontend - Flex Plugin)
│   ├── README.md                      (Plugin setup, development, deployment)
│   ├── src/
│   │   └── components/
│   │       └── SegmentLookup.js       (UI component)
│   └── .env                           (Plugin configuration)
│
└── serverless-get-segment-id/         (Backend - Serverless Function)
    ├── README.md                      (API docs, caching, troubleshooting)
    ├── functions/
    │   └── get-segment-id.js          (Main function with token caching)
    └── .env                           (Backend configuration)
```

## Development Workflow

**Local Development:**
1. Start serverless function locally: `cd serverless-get-segment-id && twilio serverless:start`
2. Start plugin locally: `cd plugin-get-segment-by-task && twilio flex:plugins:start`
3. Update plugin `.env` to point to `http://localhost:3000/get-segment-id`

**Monitoring:**
- View serverless logs: `twilio serverless:logs --tail` (from serverless directory)
- Check for token cache hits/misses in logs
- Monitor Flex console for plugin errors

## Additional Resources

- 📘 [Plugin Documentation](./plugin-get-segment-by-task/README.md) - Frontend setup & usage
- 📗 [Serverless Documentation](./serverless-get-segment-id/README.md) - Backend API & implementation
- 🔗 [Twilio Flex Plugins](https://www.twilio.com/docs/flex/developer/plugins)
- 🔗 [Twilio Serverless](https://www.twilio.com/docs/serverless)
- 🔗 [Using Twilio Functions Securely with Flex Plugins](https://www.twilio.com/docs/flex/developer/plugins/call-functions)
- 🔗 [Flex Insights API](https://www.twilio.com/docs/flex/developer/insights)

## Security

- Flex JWT token validation on all function calls
- Environment variables stored securely in Twilio
- No credentials exposed in client-side code
- Intelligent token caching reduces security surface area

## Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Twilio bears no responsibility to support the use or implementation of this software.