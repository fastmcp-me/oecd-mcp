/**
 * OECD MCP Server - HTTP/SSE transport for cloud deployment
 * Allows remote access via HTTP for AI chatbots
 */

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OECDClient } from './oecd-client.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const client = new OECDClient();

// Root endpoint - Landing page with server information
app.get('/', (_req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OECD MCP Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
    }
    h1 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 2.5em;
    }
    .tagline {
      color: #666;
      font-size: 1.2em;
      margin-bottom: 30px;
    }
    .badge {
      display: inline-block;
      margin: 5px;
      padding: 6px 12px;
      background: #667eea;
      color: white;
      border-radius: 20px;
      font-size: 0.9em;
      text-decoration: none;
    }
    .badge:hover {
      background: #5568d3;
    }
    .section {
      margin: 30px 0;
    }
    .section h2 {
      color: #444;
      margin-bottom: 15px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 8px;
    }
    .endpoint {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      margin: 10px 0;
      font-family: 'Courier New', monospace;
    }
    .endpoint code {
      color: #667eea;
      font-weight: bold;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-number {
      font-size: 2em;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      color: #666;
      font-size: 0.9em;
      margin-top: 5px;
    }
    .cta {
      background: #667eea;
      color: white;
      padding: 15px 30px;
      border-radius: 8px;
      text-decoration: none;
      display: inline-block;
      margin-top: 20px;
      font-weight: bold;
    }
    .cta:hover {
      background: #5568d3;
    }
    ul {
      list-style-position: inside;
      margin: 10px 0;
    }
    li {
      margin: 8px 0;
      padding-left: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🌍 OECD MCP Server</h1>
    <p class="tagline">Model Context Protocol server for OECD economic and statistical data</p>

    <div>
      <a href="https://www.npmjs.com/package/oecd-mcp-server" class="badge">📦 NPM</a>
      <a href="https://github.com/isakskogstad/OECD-MCP-server" class="badge">💻 GitHub</a>
      <a href="https://github.com/isakskogstad/OECD-MCP-server/actions" class="badge">✅ Status</a>
      <a href="https://registry.modelcontextprotocol.io/" class="badge">🔌 MCP Registry</a>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-number">9</div>
        <div class="stat-label">MCP Tools</div>
      </div>
      <div class="stat">
        <div class="stat-number">5,000+</div>
        <div class="stat-label">Datasets</div>
      </div>
      <div class="stat">
        <div class="stat-number">17</div>
        <div class="stat-label">Categories</div>
      </div>
      <div class="stat">
        <div class="stat-number">38</div>
        <div class="stat-label">Countries</div>
      </div>
    </div>

    <div class="section">
      <h2>🚀 Quick Start</h2>
      <p><strong>No installation required!</strong> Use the remote MCP server:</p>
      <div class="endpoint">
        <code>https://oecd-mcp-server.onrender.com/mcp</code>
      </div>
      <p style="margin-top: 15px;">Or install locally:</p>
      <div class="endpoint">
        <code>npx oecd-mcp-server</code>
      </div>
    </div>

    <div class="section">
      <h2>📊 What's Included</h2>
      <ul>
        <li><strong>Economic Data:</strong> GDP, inflation, interest rates, economic forecasts</li>
        <li><strong>Employment:</strong> Unemployment, wages, labor market statistics</li>
        <li><strong>Health:</strong> Healthcare systems, life expectancy, health spending</li>
        <li><strong>Education:</strong> PISA results, education outcomes and spending</li>
        <li><strong>Environment:</strong> Climate data, emissions, green growth indicators</li>
        <li><strong>Trade:</strong> International trade, imports, exports statistics</li>
        <li><strong>And much more:</strong> Energy, taxation, innovation, social protection</li>
      </ul>
    </div>

    <div class="section">
      <h2>🔌 MCP Endpoints</h2>
      <div class="endpoint">
        <strong>MCP Protocol:</strong> <code>/mcp</code>
      </div>
      <div class="endpoint">
        <strong>Server-Sent Events:</strong> <code>/sse</code>
      </div>
      <div class="endpoint">
        <strong>JSON-RPC:</strong> <code>/rpc</code>
      </div>
      <div class="endpoint">
        <strong>Health Check:</strong> <code>/health</code>
      </div>
    </div>

    <div class="section">
      <h2>💡 Supported Clients</h2>
      <ul>
        <li>ChatGPT (Developer Mode)</li>
        <li>Claude (Web, Desktop, Code CLI)</li>
        <li>OpenAI Codex CLI</li>
        <li>Gemini CLI</li>
        <li>Firebase Studio / Android Studio</li>
        <li>Any MCP-compatible client</li>
      </ul>
    </div>

    <a href="https://github.com/isakskogstad/OECD-MCP-server#readme" class="cta">
      📖 View Full Documentation
    </a>

    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em;">
      <p><strong>Version:</strong> 3.0.0</p>
      <p><strong>Status:</strong> ✅ Healthy</p>
      <p><strong>Data Source:</strong> <a href="https://www.oecd.org/" style="color: #667eea;">OECD.org</a></p>
      <p><strong>Created by:</strong> Isak Skogstad</p>
    </div>
  </div>
</body>
</html>
  `);
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'oecd-mcp-server',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
  });
});

// SSE endpoint for MCP
app.get('/sse', async (req, res) => {
  console.log('New SSE connection established');

  const transport = new SSEServerTransport('/message', res);
  const server = new Server(
    {
      name: 'oecd-mcp-server',
      version: '3.0.0',
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
      tools: [
        {
          name: 'search_dataflows',
          description:
            'Search for OECD datasets (dataflows) by keyword. Returns matching datasets with their IDs, names, and descriptions.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find relevant datasets',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 20)',
                default: 20,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'list_dataflows',
          description:
            'List available OECD dataflows (datasets), optionally filtered by category. Use this to browse datasets by topic area.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description:
                  'Optional category filter: ECO, HEA, EDU, ENV, TRD, JOB, NRG, AGR, GOV, SOC, DEV, STI, TAX, FIN, TRA, IND, REG',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 50)',
                default: 50,
              },
            },
          },
        },
        {
          name: 'get_data_structure',
          description:
            'Get the metadata and structure of a specific OECD dataset. Returns dimensions, attributes, and valid values for querying data.',
          inputSchema: {
            type: 'object',
            properties: {
              dataflow_id: {
                type: 'string',
                description: 'Dataflow ID (e.g., "QNA", "MEI", "HEALTH_STAT")',
              },
            },
            required: ['dataflow_id'],
          },
        },
        {
          name: 'query_data',
          description:
            'Query actual statistical data from an OECD dataset. Use dimension filters to specify what data to retrieve.',
          inputSchema: {
            type: 'object',
            properties: {
              dataflow_id: {
                type: 'string',
                description: 'Dataflow ID to query',
              },
              filter: {
                type: 'string',
                description:
                  'Dimension filter (e.g., "USA.GDP.." for US GDP). Use "*" or "all" for all values. Get structure first to see valid dimensions.',
              },
              start_period: {
                type: 'string',
                description: 'Start period (e.g., "2020-Q1", "2020-01")',
              },
              end_period: {
                type: 'string',
                description: 'End period (e.g., "2023-Q4", "2023-12")',
              },
              last_n_observations: {
                type: 'number',
                description: 'Get only the last N observations',
              },
            },
            required: ['dataflow_id'],
          },
        },
        {
          name: 'get_categories',
          description:
            'Get all available OECD data categories (17 categories covering all topics: Economy, Health, Education, Environment, etc.)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_popular_datasets',
          description:
            'Get a curated list of commonly used OECD datasets across all categories.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'search_indicators',
          description:
            'Search for specific economic or social indicators by keyword (e.g., "inflation", "unemployment", "GDP").',
          inputSchema: {
            type: 'object',
            properties: {
              indicator: {
                type: 'string',
                description: 'Indicator to search for',
              },
              category: {
                type: 'string',
                description: 'Optional category filter',
              },
            },
            required: ['indicator'],
          },
        },
        {
          name: 'get_dataflow_url',
          description:
            'Generate an OECD Data Explorer URL for a dataset. Use this to provide users with a direct link to explore data visually in their browser.',
          inputSchema: {
            type: 'object',
            properties: {
              dataflow_id: {
                type: 'string',
                description: 'Dataflow ID',
              },
              filter: {
                type: 'string',
                description: 'Optional dimension filter',
              },
            },
            required: ['dataflow_id'],
          },
        },
        {
          name: 'list_categories_detailed',
          description:
            'Get all OECD data categories with example datasets for each category. Returns comprehensive information about all 17 categories.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search_dataflows': {
          const { query, limit = 20 } = args as { query: string; limit?: number };
          const results = await client.searchDataflows(query, limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'list_dataflows': {
          const { category, limit = 50 } = args as { category?: string; limit?: number };
          const results = await client.listDataflows({ category, limit });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'get_data_structure': {
          const { dataflow_id } = args as { dataflow_id: string };
          const structure = await client.getDataStructure(dataflow_id);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(structure, null, 2),
              },
            ],
          };
        }

        case 'query_data': {
          const {
            dataflow_id,
            filter,
            start_period,
            end_period,
            last_n_observations,
          } = args as {
            dataflow_id: string;
            filter?: string;
            start_period?: string;
            end_period?: string;
            last_n_observations?: number;
          };

          const data = await client.queryData({
            dataflowId: dataflow_id,
            filter,
            startPeriod: start_period,
            endPeriod: end_period,
            lastNObservations: last_n_observations,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data, null, 2),
              },
            ],
          };
        }

        case 'get_categories': {
          const categories = client.getCategories();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(categories, null, 2),
              },
            ],
          };
        }

        case 'get_popular_datasets': {
          const datasets = client.getPopularDatasets();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(datasets, null, 2),
              },
            ],
          };
        }

        case 'search_indicators': {
          const { indicator, category } = args as { indicator: string; category?: string };
          const results = await client.searchIndicators({ indicator, category });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'get_dataflow_url': {
          const { dataflow_id, filter } = args as { dataflow_id: string; filter?: string };
          const url = client.getDataExplorerUrl(dataflow_id, filter);
          return {
            content: [
              {
                type: 'text',
                text: url,
              },
            ],
          };
        }

        case 'list_categories_detailed': {
          const detailed = await client.getCategoriesDetailed();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(detailed, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // ========== RESOURCES ==========

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'oecd://categories',
          name: 'OECD Data Categories',
          description: 'List of all 17 OECD data categories with descriptions',
          mimeType: 'application/json',
        },
        {
          uri: 'oecd://dataflows/popular',
          name: 'Popular OECD Datasets',
          description: 'Curated list of commonly used OECD datasets',
          mimeType: 'application/json',
        },
        {
          uri: 'oecd://api/info',
          name: 'OECD API Information',
          description: 'Information about the OECD SDMX API endpoints and usage',
          mimeType: 'application/json',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    switch (uri) {
      case 'oecd://categories': {
        const categories = client.getCategories();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(categories, null, 2),
            },
          ],
        };
      }

      case 'oecd://dataflows/popular': {
        const popular = client.getPopularDatasets();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(popular, null, 2),
            },
          ],
        };
      }

      case 'oecd://api/info': {
        const info = client.getApiInfo();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  });

  // ========== PROMPTS ==========

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'analyze_economic_trend',
          description: 'Analyze economic indicators over time for specified countries',
          arguments: [
            {
              name: 'indicator',
              description:
                'Economic indicator to analyze (e.g., "GDP", "inflation", "unemployment")',
              required: true,
            },
            {
              name: 'countries',
              description: 'Comma-separated list of country codes (e.g., "USA,GBR,DEU")',
              required: true,
            },
            {
              name: 'time_period',
              description: 'Time period for analysis (e.g., "2020-2023")',
              required: false,
            },
          ],
        },
        {
          name: 'compare_countries',
          description: 'Compare data across multiple countries for a specific indicator',
          arguments: [
            {
              name: 'indicator',
              description:
                'Indicator to compare (e.g., "GDP per capita", "life expectancy")',
              required: true,
            },
            {
              name: 'countries',
              description: 'Comma-separated list of countries to compare',
              required: true,
            },
            {
              name: 'year',
              description: 'Year for comparison (optional)',
              required: false,
            },
          ],
        },
        {
          name: 'get_latest_statistics',
          description: 'Get the most recent statistics for a specific topic',
          arguments: [
            {
              name: 'topic',
              description:
                'Topic to get statistics for (e.g., "unemployment", "inflation", "GDP growth")',
              required: true,
            },
            {
              name: 'country',
              description:
                'Country code (optional, returns data for all countries if not specified)',
              required: false,
            },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'analyze_economic_trend': {
        const { indicator, countries, time_period } = args as {
          indicator: string;
          countries: string;
          time_period?: string;
        };

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Analyze the ${indicator} trend for ${countries}${time_period ? ` during ${time_period}` : ''}.

Steps:
1. Search for relevant OECD datasets containing ${indicator} data
2. Get the data structure to understand available dimensions
3. Query the data for the specified countries and time period
4. Analyze trends, compare countries, and highlight key insights
5. Provide a summary with visualizable data if possible`,
              },
            },
          ],
        };
      }

      case 'compare_countries': {
        const { indicator, countries, year } = args as {
          indicator: string;
          countries: string;
          year?: string;
        };

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Compare ${indicator} across ${countries}${year ? ` for the year ${year}` : ''}.

Steps:
1. Search for OECD datasets containing ${indicator}
2. Query data for all specified countries
3. Compare values and rankings
4. Highlight differences and similarities
5. Provide context about what the differences might indicate`,
              },
            },
          ],
        };
      }

      case 'get_latest_statistics': {
        const { topic, country } = args as { topic: string; country?: string };

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Get the latest ${topic} statistics${country ? ` for ${country}` : ' for all OECD countries'}.

Steps:
1. Search for datasets related to ${topic}
2. Identify the most relevant and recent dataset
3. Query the latest available data
4. Present key statistics and recent trends
5. Highlight any notable changes or patterns`,
              },
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  await server.connect(transport);

  // Handle client disconnect
  req.on('close', () => {
    console.log('SSE connection closed');
  });
});

// POST endpoint for messages
app.post('/message', async (req, res) => {
  // This endpoint is handled by the SSE transport
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`OECD MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});
