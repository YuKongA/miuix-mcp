import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchComponents, fetchComponentDemo, fetchLatestRelease, fetchComponentDoc } from "./api.js";

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_all_components",
    {
      description: "Get a list of all available components from the MIUIX documentation.",
      inputSchema: {},
    },
    async () => {
      try {
        const components = await fetchComponents();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(components, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "search_components",
    {
      description: "Search for components by name.",
      inputSchema: {
        query: z.string().describe("The search query to filter component names"),
      },
    },
    async ({ query }) => {
      try {
        const components = await fetchComponents();

        const filtered = components.filter((c) => {
          return c.toLowerCase().includes(query.toLowerCase());
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(filtered, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_component_demo",
    {
      description: "Get the demo code for a specific component.",
      inputSchema: {
        componentName: z.string().describe("The name of the component, e.g., 'Button'"),
      },
    },
    async ({ componentName }) => {
      try {
        const demoCode = await fetchComponentDemo(componentName);
        return {
          content: [
            {
              type: "text",
              text: demoCode,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_component_doc",
    {
      description: "Get the documentation markdown for a specific component.",
      inputSchema: {
        componentName: z.string().describe("The name of the component, e.g., 'Button'"),
      },
    },
    async ({ componentName }) => {
      try {
        const doc = await fetchComponentDoc(componentName);
        return {
          content: [
            {
              type: "text",
              text: doc,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_latest_version",
    {
      description: "Get the latest release version (tag name) of the miuix library from GitHub.",
      inputSchema: {},
    },
    async () => {
      try {
        const version = await fetchLatestRelease();
        return {
          content: [
            {
              type: "text",
              text: version,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
