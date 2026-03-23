#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "miuix-mcp",
  version: "1.0.3",
});

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Miuix MCP Server running on stdio");
  console.error(`Using Miuix Docs URL: ${config.MIUIX_DOCS_URL}`);
  console.error("Using Miuix source: GitHub default branch");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
