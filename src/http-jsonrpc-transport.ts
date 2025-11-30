/**
 * Simplified HTTP/JSON-RPC Transport for MCP
 * Handles synchronous request/response over HTTP POST
 */

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';

export class HTTPJSONRPCTransport implements Transport {
  private _responseHandlers: Map<string | number, (message: JSONRPCMessage) => void> = new Map();

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    private req: Request,
    private res: Response
  ) {}

  async start(): Promise<void> {
    // No persistent connection needed for synchronous HTTP
    return Promise.resolve();
  }

  async close(): Promise<void> {
    this._responseHandlers.clear();
    this.onclose?.();
    return Promise.resolve();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Send response back via HTTP
    if (!this.res.headersSent) {
      this.res.status(200).json(message);
    }
    return Promise.resolve();
  }

  /**
   * Process incoming JSON-RPC request from HTTP body
   */
  async processRequest(body: unknown): Promise<void> {
    try {
      // Handle both single messages and batched arrays
      const messages = Array.isArray(body) ? body : [body];

      for (const msg of messages) {
        this.onmessage?.(msg as JSONRPCMessage);
      }
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}
