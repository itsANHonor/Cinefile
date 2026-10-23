import { Router, Request, Response } from 'express';
import { webcrypto } from 'crypto';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthMiddleware } from '../middleware/auth.middleware';
import { createCinefileMcpServer } from '../mcp/mcp.server';

// Node 18 compatibility: @modelcontextprotocol/sdk WebStandardStreamableHTTPServerTransport uses globalThis.crypto
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

const router = Router();

const mcpCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Accept',
    'Authorization',
    'X-MCP-API-Key',
    'mcp-session-id',
    'last-event-id',
    'mcp-protocol-version',
  ],
  exposedHeaders: ['mcp-session-id', 'last-event-id', 'mcp-protocol-version'],
  credentials: false,
  optionsSuccessStatus: 204,
});

router.use(mcpCors);
router.options('/', mcpCors);

/**
 * Stateless Streamable HTTP MCP endpoint.
 * Supports POST /api/mcp (and /mcp) for JSON-RPC requests/notifications.
 */
router.post('/', mcpAuthMiddleware, async (req: Request, res: Response) => {
  const server = createCinefileMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal MCP server error',
        },
        id: null,
      });
    }
  }
});

/**
 * In stateless Streamable HTTP mode, standalone GET SSE streams and DELETE session
 * termination return 405 Method Not Allowed per the MCP Streamable HTTP specification.
 */
router.get('/', mcpAuthMiddleware, (_req: Request, res: Response) => {
  res.status(405).set('Allow', 'POST, OPTIONS').json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed. Use POST for stateless Streamable HTTP MCP requests.',
    },
    id: null,
  });
});

router.delete('/', mcpAuthMiddleware, (_req: Request, res: Response) => {
  res.status(405).set('Allow', 'POST, OPTIONS').json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed in stateless MCP mode.',
    },
    id: null,
  });
});

export default router;
