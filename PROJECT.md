# OECD MCP Server

## Overview
Model Context Protocol (MCP) server providing access to OECD statistical data via SDMX API. Enables AI assistants to query 5,000+ datasets across 17 categories including economy, health, education, environment, trade, and more.

## Tech Stack
- **Runtime:** Node.js 20 (TypeScript)
- **Framework:** Express.js
- **MCP SDK:** @modelcontextprotocol/sdk ^1.0.0
- **Transport:** SSE (Server-Sent Events) over HTTP
- **Testing:** Vitest
- **Deployment:** Docker + Render (free tier)

## Project Structure
- `src/` - Source code
  - `http-server.ts` - Main HTTP server with SSE transport
  - `http-jsonrpc-transport.ts` - Custom HTTP/JSON-RPC transport
  - `index.ts` - STDIO transport for local usage
  - `oecd-client.ts` - OECD SDMX API client
- `tests/` - Test files
- `Dockerfile` - Container configuration
- `render.yaml` - Render deployment config
- `server.json` - MCP Registry metadata
- `backups/` - Automatic backups (session-start, session-end, changes)

## MCP Capabilities
**Tools (9):**
- search_dataflows - Search datasets by keyword
- list_dataflows - Browse datasets by category
- get_data_structure - Get dataset metadata
- query_data - Query statistical data
- get_categories - List all 17 categories
- get_popular_datasets - Curated dataset list
- search_indicators - Search by indicator
- get_dataflow_url - Generate Data Explorer URL
- list_categories_detailed - Detailed category info

**Resources (3):**
- oecd://categories - Category list
- oecd://dataflows/popular - Popular datasets
- oecd://api/info - API information

**Prompts (3):**
- analyze_economic_trend
- compare_countries
- get_latest_statistics

## Deployment Info
- **Render URL:** https://oecd-mcp-server.onrender.com
- **MCP Endpoints:**
  - POST /mcp (HTTP/JSON-RPC - recommended)
  - GET /mcp (SSE - legacy)
- **Health Check:** GET /health
- **Plan:** Free tier (cold starts after inactivity)
- **Region:** Frankfurt

## MCP Registry Publishing
- **Server Name:** io.github.isakskogstad/oecd-mcp
- **NPM Package:** oecd-mcp-server
- **Version:** 3.0.0
- **Registry File:** server.json (compatible with MCP Registry)
- **Publishing:** Ready for submission to registry.modelcontextprotocol.io

## Known Issues (RESOLVED ✅)

### ✅ FIXED: MCP Transport Support
**Status:** Resolved as of 2025-11-30

**What was fixed:**
1. ✅ Added HTTP/JSON-RPC transport for synchronous requests
2. ✅ POST /mcp now properly handles MCP protocol
3. ✅ Both SSE (GET) and JSON-RPC (POST) work correctly
4. ✅ Compatible with ChatGPT, Claude, and all HTTP clients

**Remaining consideration:**
- **Cold Starts** - Free tier still spins down after 15 min inactivity
  - First request after idle period takes 30-60s (container startup)
  - Subsequent requests are fast (~100-150ms)
  - Upgrade to paid plan ($7/mo) for always-on performance

## Build Commands
```bash
npm run build       # Compile TypeScript
npm start           # Start HTTP server
npm run start:stdio # Start STDIO server (local)
npm test            # Run tests
```

## Environment
- NODE_ENV=production
- PORT=3000

## Backup Info
- Last session backup: 2025-11-30_23-30-00_session-start
- Backup retention policy: Manual cleanup

## Notes
- Server is working correctly, responds in ~100-150ms when warm
- Cold starts on free tier take 30-60 seconds
- SSE transport requires GET request, not POST
- For reliable performance, consider paid Render plan or local deployment
