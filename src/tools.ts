import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchComponents, fetchComponentDemo, fetchLatestRelease, fetchComponentDoc, fetchExamplePathContents, fetchExampleFile, fetchExampleTree } from "./api.js";

export function registerTools(server: McpServer) {
  const toText = (text: string) => ({ content: [{ type: "text" as const, text }] });
  const toJsonText = (value: unknown) => toText(JSON.stringify(value, null, 2));
  const toError = (error: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true });

  server.registerTool(
    "get_latest_version",
    { description: "Get the latest release version (tag name) of the miuix library from GitHub.", inputSchema: {} },
    async () => {
      try { const version = await fetchLatestRelease(); return toText(version); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_all_components",
    { description: "Get a list of all available components from the MIUIX documentation.", inputSchema: {} },
    async () => {
      try { const components = await fetchComponents(); return toJsonText(components); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "search_components",
    { description: "Search for components by name.", inputSchema: { query: z.string().describe("The search query to filter component names") } },
    async ({ query }) => {
      try {
        const components = await fetchComponents();
        const filtered = components.filter((c) => c.toLowerCase().includes(query.toLowerCase()));
        return toJsonText(filtered);
      } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_component_doc",
    { description: "Get the documentation markdown for a specific component.", inputSchema: { componentName: z.string().describe("The name of the component, e.g., 'Button'") } },
    async ({ componentName }) => {
      try { const doc = await fetchComponentDoc(componentName); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_component_demo",
    { description: "Get the demo code for a specific component.", inputSchema: { componentName: z.string().describe("The name of the component, e.g., 'Button'") } },
    async ({ componentName }) => {
      try { const demoCode = await fetchComponentDemo(componentName); return toText(demoCode); } catch (error) { return toError(error); }
    }
  );


  server.registerTool(
    "list_example_tree",
    { description: "Recursively list the entire example directory tree.", inputSchema: {} },
    async () => {
      try { const items = await fetchExampleTree(); return toJsonText(items); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "list_example_path",
    { description: "List files and directories under the example module.", inputSchema: { subpath: z.string().optional().describe("Subpath under example, e.g., 'src/commonMain/kotlin'") } },
    async ({ subpath }) => {
      try { const items = await fetchExamplePathContents(subpath ?? ""); return toJsonText(items); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_example_file",
    { description: "Get the content of a specific file under the example module.", inputSchema: { filePath: z.string().describe("File path relative to example, e.g., 'src/commonMain/kotlin/UITest.kt'") } },
    async ({ filePath }) => {
      try { const content = await fetchExampleFile(filePath); return toText(content); } catch (error) { return toError(error); }
    }
  );
}
