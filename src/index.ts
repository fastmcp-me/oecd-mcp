#!/usr/bin/env node

/**
 * OECD MCP Server - stdio transport
 * Provides access to OECD statistical data via SDMX API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OECDClient } from './oecd-client.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';
import { RESOURCE_DEFINITIONS, readResource } from './resources.js';
import { PROMPT_DEFINITIONS, getPrompt } from './prompts.js';

const client = new OECDClient();

// Create MCP server
const server = new Server(
  {
    name: 'oecd-mcp-server',
    version: '4.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ========== TOOLS ==========

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOL_DEFINITIONS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await executeTool(client, name, args);
});

// ========== RESOURCES ==========

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCE_DEFINITIONS };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  return readResource(client, uri);
});

// ========== PROMPTS ==========

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: PROMPT_DEFINITIONS };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return getPrompt(name, args || {});
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OECD MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
