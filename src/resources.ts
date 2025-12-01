/**
 * Shared MCP resource definitions and handlers
 * Used by both stdio and HTTP transports to ensure consistency
 */

import { OECDClient } from './oecd-client.js';

/**
 * Resource definitions for MCP
 */
export const RESOURCE_DEFINITIONS = [
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
];

/**
 * Read a resource by URI
 */
export function readResource(
  client: OECDClient,
  uri: string
): {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
} {
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
}
