#!/usr/bin/env node
'use strict';
// MCP server (T08): official SDK, Streamable HTTP (stateless) at http://localhost:3000/mcp.
// Tools: run_scenario, score_plan, explain_order. One JSON log line per tool call on stderr.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const { summarizeArgs, logLine } = require('./tools/common');
const pkg = require('../package.json');

const TOOLS = [require('./tools/run_scenario'), require('./tools/score_plan'), require('./tools/explain_order')];

// Schema-level input errors are rejected by the SDK before our handler runs; log them too
// so every tools/call produces exactly one log line.
class LoggingMcpServer extends McpServer {
  async validateToolInput(tool, args, toolName) {
    const t0 = Date.now();
    try { return await super.validateToolInput(tool, args, toolName); } catch (e) {
      logLine({ tool: toolName, args: summarizeArgs(args), duration_ms: Date.now() - t0, ok: false, error: e.message });
      throw e;
    }
  }
}

function createMcpServer() {
  const server = new LoggingMcpServer({ name: 'inblack-a', version: pkg.version });
  for (const t of TOOLS) server.registerTool(t.name, t.config, t.handler);
  return server;
}

const jsonRpcError = (res, status, code, message) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });

function createApp(host) {
  const app = createMcpExpressApp({ host });
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      logLine({ event: 'http_error', ok: false, error: e.message });
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
    }
  });
  const notAllowed = (req, res) => jsonRpcError(res, 405, -32000, 'Method not allowed (stateless server: use POST /mcp)');
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
  return app;
}

// Start listening; resolves {port, url, close()}. port 0 = random free port.
function startServer({ port = 3000, host = '127.0.0.1' } = {}) {
  const app = createApp(host);
  return new Promise((resolve, reject) => {
    const http = app.listen(port, host);
    http.once('error', reject);
    http.once('listening', () => {
      const p = http.address().port;
      const url = `http://${host === '127.0.0.1' ? 'localhost' : host}:${p}/mcp`;
      resolve({
        port: p, url, http,
        close: () => new Promise((r) => { http.closeAllConnections && http.closeAllConnections(); http.close(() => r()); }),
      });
    });
  });
}

if (require.main === module) {
  const port = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) { process.stderr.write(`invalid PORT ${process.env.PORT}\n`); process.exit(2); }
  startServer({ port }).then(({ url }) => {
    logLine({ event: 'listening', url, tools: TOOLS.map((t) => t.name) });
  }).catch((e) => { process.stderr.write(`failed to start: ${e.message}\n`); process.exit(1); });
}

module.exports = { createMcpServer, createApp, startServer, TOOLS };
