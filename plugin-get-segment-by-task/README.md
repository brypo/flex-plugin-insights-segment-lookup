# Flex Plugin: Segment Lookup

The frontend component that adds a Segment ID lookup panel to the Twilio Flex UI.

> 📘 **Looking for the complete solution?** See the [main README](../README.md) for the full overview and quick start guide.

## What This Plugin Does

Adds a UI panel to Flex that allows agents to:
1. Enter a Task SID
2. Click "Go" to initiate the lookup
3. View all segment IDs associated with that task

The plugin communicates with the [serverless backend function](../serverless-get-segment-id/README.md) to fetch data from Flex Insights.

## Prerequisites

- Node.js >= v22
- Twilio CLI with Flex plugin
- **Backend serverless function must be deployed first** - See [serverless README](../serverless-get-segment-id/README.md)

## Installation

```bash
cd plugin-get-segment-by-task
npm install
```

## Configuration

### 1. Create Environment File

```bash
cp .env.example .env
```

### 2. Configure Serverless URL

Edit `.env` and add your deployed serverless function URL:

```bash
FLEX_APP_SERVERLESS_URL=https://your-domain.twil.io/get-segment-id
```

> ⚠️ **Important:** The variable name must start with `FLEX_`, `TWILIO_`, or `REACT_APP_` to be available in the plugin.

### 3. Verify Webpack Configuration

The `webpack.config.js` should already be configured to load environment variables. Verify it contains:

```javascript
const DotEnvWebpack = require('dotenv-webpack');

module.exports = (config, { isProd, isDev, isTest }) => {
  config.plugins.push(new DotEnvWebpack({ path: '.env' }));
  return config;
};
```

## Development

### Run Plugin Locally

```bash
twilio flex:plugins:start
```

This will:
- Start the development server
- Automatically open Flex in your browser with the plugin loaded
- Enable hot-reloading for development

The plugin will be available at `http://localhost:3000`

### Local Development with Local Backend

If you're also developing the serverless function locally:

1. Start the serverless function first:
   ```bash
   cd ../serverless-get-segment-id
   twilio serverless:start
   # Note the local URL (usually http://localhost:3000)
   ```

2. Update your plugin `.env` to point to localhost:
   ```bash
   FLEX_APP_SERVERLESS_URL=http://localhost:3000/get-segment-id
   ```

3. Start the plugin:
   ```bash
   cd ../plugin-get-segment-by-task
   twilio flex:plugins:start
   ```

### Testing the Function Locally

```bash
cd serverless-get-segment-id
twilio serverless:start
```

## Usage

### Finding the Panel

The Segment Lookup panel appears in Panel 2 (right side of the Flex UI) when no task is selected.

### Looking Up Segment IDs

1. **Enter a Task SID** in the input field
   - Format: `WT` followed by 32 hexadecimal characters
   - Example: `WT1234567890abcdef1234567890abcdef`

2. **Click "Go"** or press Enter

3. **View Results:**
   - Loading indicator appears while fetching data
   - Segment IDs are displayed in a list
   - Count of segments found is shown
   - If no segments are found, an appropriate message is displayed

## Component Details

### SegmentLookup Component

Location: `src/components/SegmentLookup.js`

**Key Features:**
- React functional component
- Fetches data from serverless function endpoint
- Passes Flex JWT token for authentication

**Props:** None (uses Flex Manager context)

**State:**
- `taskSid` - Current input value
- `segmentIds` - Array of segment IDs from API response
- `loading` - Boolean for loading state
- `error` - Error message if request fails


## Learn More

- 📘 [Main README](../README.md) - Complete solution overview
- 📗 [Serverless README](../serverless-get-segment-id/README.md) - Backend API documentation
- 🔗 [Flex Plugins Documentation](https://www.twilio.com/docs/flex/developer/plugins)
- 🔗 [Flex UI Components](https://www.twilio.com/docs/flex/developer/ui)
- 🔗 [Environment Variables in Flex](https://www.twilio.com/docs/flex/developer/plugins/environment-variables)

## Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Twilio bears no responsibility to support the use or implementation of this software.