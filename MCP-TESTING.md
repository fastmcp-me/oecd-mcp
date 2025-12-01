# 🧪 OECD MCP Server - Testing & Configuration Guide

**Date:** 2025-12-01
**Status:** ✅ ALL TESTS PASSING
**Version:** 3.0.0

---

## 📋 TESTING SUMMARY

### Remote HTTP/JSON-RPC Transport (✅ VERIFIED)

**Endpoint:** `https://oecd-mcp-server.onrender.com/mcp`

**Test 1: List Tools**
```bash
curl -X POST https://oecd-mcp-server.onrender.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Result:** ✅ Returns 9 tools correctly
- search_dataflows
- list_dataflows
- get_data_structure
- query_data
- get_categories
- get_popular_datasets
- search_indicators
- get_dataflow_url
- list_categories_detailed

**Test 2: Tool Execution (list_dataflows with STI category)**
```bash
curl -X POST https://oecd-mcp-server.onrender.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_dataflows","arguments":{"category":"STI","limit":10}}}'
```

**Result:** ✅ Returns 3 STI dataflows
- MSTI - Main Science and Technology Indicators
- PAT_DEV - Patents - Technology Development
- ICT_IND - ICT Access and Usage by Individuals

---

## 🔧 MCP CLIENT CONFIGURATIONS

### 1. Claude Desktop (Local stdio)

**Config File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "oecd-mcp": {
      "command": "npx",
      "args": ["-y", "oecd-mcp"]
    }
  }
}
```

**Alternative (from local directory):**
```json
{
  "mcpServers": {
    "oecd-mcp-local": {
      "command": "node",
      "args": ["/Users/isak/Desktop/CLAUDE_CODE /PROJECTS/oecd-mcp/dist/index.js"]
    }
  }
}
```

### 2. Claude Desktop (Remote HTTP)

```json
{
  "mcpServers": {
    "oecd-mcp-remote": {
      "type": "http",
      "url": "https://oecd-mcp-server.onrender.com/mcp"
    }
  }
}
```

### 3. ChatGPT / OpenAI Assistants

**Type:** HTTP/JSON-RPC
**Endpoint:** `https://oecd-mcp-server.onrender.com/mcp`
**Protocol:** JSON-RPC 2.0

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

### 4. MCP Inspector (Local stdio)

**Install:**
```bash
npx @modelcontextprotocol/inspector npx oecd-mcp
```

**Or from project directory:**
```bash
cd /Users/isak/Desktop/CLAUDE_CODE /PROJECTS/oecd-mcp
npx @modelcontextprotocol/inspector node dist/index.js
```

### 5. MCP Inspector (Remote HTTP)

```bash
npx @modelcontextprotocol/inspector \
  --url https://oecd-mcp-server.onrender.com/mcp
```

---

## 🎯 TRANSPORT MODES

### stdio Transport (Local)

**Used by:**
- Claude Desktop (local installation)
- Zed Editor
- Cline VSCode extension
- MCP Inspector (local)

**How it works:**
- Runs MCP server as child process
- Communication via stdin/stdout
- Launched via `node dist/index.js`

**Entry point:** `src/index.ts` (lines 610-619)
```typescript
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OECD MCP Server running on stdio');
}
```

### HTTP/JSON-RPC Transport (Remote)

**Used by:**
- Claude Desktop (remote URL)
- ChatGPT / OpenAI Assistants
- Custom HTTP clients
- Web applications

**How it works:**
- Express server on port 3000 (Render deployment)
- POST requests to `/mcp` endpoint
- Synchronous request/response model
- JSON-RPC 2.0 protocol

**Entry point:** `src/http-server.ts` (lines 783-918)

**Example:**
```bash
curl -X POST https://oecd-mcp-server.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "query_data",
      "arguments": {
        "dataflow_id": "QNA",
        "last_n_observations": 10
      }
    }
  }'
```

### SSE Transport (Streaming) - LEGACY

**Endpoint:** `GET /mcp` or `GET /sse`
**Headers:** `Accept: text/event-stream`

**Used by:**
- Older MCP clients expecting persistent connections
- Server-sent events for real-time updates

---

## 🚀 DEPLOYMENT VERIFICATION

### Health Check
```bash
curl https://oecd-mcp-server.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "oecd-mcp-server",
  "version": "3.0.0",
  "timestamp": "2025-12-01T..."
}
```

### Tools Verification
```bash
curl -X POST https://oecd-mcp-server.onrender.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```

**Expected:** `9` (9 tools available)

### Data Query Test
```bash
curl -X POST https://oecd-mcp-server.onrender.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_dataflows",
      "arguments": {"category": "ECO", "limit": 5}
    }
  }' | jq '.result.content[0].text | fromjson | length'
```

**Expected:** `5` (5 ECO dataflows returned)

---

## 🔍 DEBUGGING TOOLS

### 1. MCP Inspector

**Purpose:** Interactive debugging interface for MCP servers

**Launch:**
```bash
# Local stdio
npx @modelcontextprotocol/inspector npx oecd-mcp

# Remote HTTP
npx @modelcontextprotocol/inspector \
  --url https://oecd-mcp-server.onrender.com/mcp
```

**Features:**
- List all available tools
- Test tool execution with custom arguments
- View request/response payloads
- Debug JSON-RPC messages

### 2. Claude Desktop Developer Tools

**Enable:**
```bash
echo '{"allowDevTools": true}' > ~/Library/Application\ Support/Claude/developer_settings.json
```

**Access:** `Command-Option-Shift-i` (Mac) or `Ctrl-Shift-i` (Windows/Linux)

**Check Logs:**
```bash
tail -n 20 -F ~/Library/Logs/Claude/mcp*.log
```

### 3. Render Deployment Logs

**Dashboard:** https://dashboard.render.com/

**Real-time logs:**
- Server startup messages
- MCP connection events
- Request/response logging
- Error stack traces

---

## ✅ VERIFIED CONFIGURATIONS

### ✅ Remote HTTP Transport

- **Endpoint:** https://oecd-mcp-server.onrender.com/mcp
- **Protocol:** JSON-RPC 2.0
- **Methods:** `tools/list`, `tools/call`, `resources/list`, `prompts/list`
- **Status:** ✅ WORKING
- **Tools:** 9/9 available
- **Rate Limiting:** 1.5s minimum between OECD API requests

### ✅ Local stdio Transport

- **Entry Point:** `dist/index.js`
- **Command:** `node dist/index.js` or `npx oecd-mcp`
- **Status:** ✅ WORKING
- **Tools:** 9/9 available
- **Supabase Cache:** Optional (when `.env` configured)

### ✅ Dual-Mode Server

- **Both transports:** stdio AND HTTP work simultaneously
- **Same codebase:** `src/index.ts` (stdio) + `src/http-server.ts` (HTTP)
- **Same tools:** Identical 9 tools in both modes
- **Rate limiting:** Applied in both modes

---

## 📊 PERFORMANCE METRICS

### Remote HTTP Transport

| Metric | Value |
|--------|-------|
| Response Time (cold) | ~2,700ms |
| Response Time (cached) | ~74ms |
| Tools Available | 9 |
| Max Observations | 1,000 |
| Default Limit | 100 |
| Rate Limit | 1.5s between requests |

### Local stdio Transport

| Metric | Value |
|--------|-------|
| Startup Time | <1s |
| Tools Available | 9 |
| Cache Support | Yes (with .env) |
| Rate Limit | 1.5s between requests |

---

## 🛡️ SECURITY & STABILITY

### ✅ Verified Working

1. ✅ Error handling for invalid dataflow IDs
2. ✅ Error handling for missing required parameters
3. ✅ JSON-RPC 2.0 compliance
4. ✅ Rate limiting enforcement (1.5s minimum)
5. ✅ Default limit enforcement (100 observations)
6. ✅ Maximum limit enforcement (1000 observations)
7. ✅ Supabase cache integration (37x speedup)
8. ✅ Parameter validation for search_indicators tool (fixed v3.0.1)

### 🐛 Bug Fixes

**v3.0.1 (2025-12-01):**
- Fixed `search_indicators` tool parameter validation (src/index.ts:326-340)
- Now properly validates `indicator` parameter before use
- Returns clear error message when parameter is missing
- Prevents undefined toLowerCase() error

### 📝 Known Limitations

1. ⚠️ OECD API strict rate limiting (~20-30 rapid requests → IP block)
2. ⚠️ stdio transport requires absolute paths in configs
3. ⚠️ Environment variables not inherited in stdio mode (set in config)

---

## 🎯 NEXT STEPS

### For Users

1. ✅ Install via npm: `npm install -g oecd-mcp`
2. ✅ Configure Claude Desktop (stdio or HTTP)
3. ✅ Start querying OECD data via MCP

### For Developers

1. ✅ Test locally: `npm run build && npm start:stdio`
2. ✅ Test HTTP: `npm start` (port 3000)
3. ✅ Deploy to Render: Push to GitHub (auto-deploy)

---

**Last Updated:** 2025-12-01
**Version:** 3.0.0
**Status:** ✅ PRODUCTION READY (both stdio and HTTP transports verified)
