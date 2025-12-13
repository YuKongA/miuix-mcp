import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchComponents, fetchComponentDemo, fetchLatestRelease, fetchComponentDoc, fetchExamplePathContents, fetchExampleFile, fetchExampleTree, fetchQuickStartDoc, fetchThemeGuide, fetchTextStylesGuide, fetchIconsGuide, fetchUtilsGuide, fetchMultiplatformGuide, fetchDokkaPackages, fetchDokkaPackageItems, searchDokka } from "./api.js";

export function registerTools(server: McpServer) {
  const toText = (text: string) => ({ content: [{ type: "text" as const, text }] });
  const toJsonText = (value: unknown) => toText(JSON.stringify(value, null, 2));
  const toError = (error: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true });

  server.registerTool(
    "get_latest_version",
    { description: "Get the latest release version (tag name) of the miuix library from GitHub.", inputSchema: z.object({}) },
    async () => {
      try { const version = await fetchLatestRelease(); return toText(version); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_all_components",
    { description: "Get a list of all available components from the MIUIX documentation, including name and slug.", inputSchema: z.object({}) },
    async () => {
      try { const components = await fetchComponents(); return toJsonText(components); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "search_components",
    { description: "Search for components by name or slug.", inputSchema: z.object({ query: z.string().describe("Query to filter components by name or slug") }) },
    async ({ query }) => {
      try {
        const components = await fetchComponents();
        const q = query.toLowerCase();
        const filtered = components.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
        return toJsonText(filtered);
      } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_component_doc",
    { description: "Get the documentation markdown for a specific component.", inputSchema: z.object({ componentName: z.string().describe("The name of the component, e.g., 'Button'") }) },
    async ({ componentName }) => {
      try { const doc = await fetchComponentDoc(componentName); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_component_demo",
    { description: "Get the demo code for a specific component.", inputSchema: z.object({ componentName: z.string().describe("The name of the component, e.g., 'Button'") }) },
    async ({ componentName }) => {
      try { const demoCode = await fetchComponentDemo(componentName); return toText(demoCode); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_gradle_dependency",
    {
      description: "Get a Gradle dependency snippet for adding miuix to a project.",
      inputSchema: z.object({
        version: z.string().optional().describe("Optional version override, e.g., '0.7.1'"),
        platform: z.enum(["kmp", "android", "desktop", "iosarm64", "iosx64", "iossimulatorarm64", "macosx64", "macosarm64", "wasmjs", "js"]).optional().describe("Target platform. 'kmp' (default) for Multiplatform, 'android' for Android-only, others for specific single-platform dependencies.")
      })
    },
    async ({ version, platform }) => {
      try {
        const v = version && version.trim().length > 0 ? version.trim() : await fetchLatestRelease();

        if (platform === "android") {
          const snippet = [
            "dependencies {",
            `    implementation("top.yukonga.miuix.kmp:miuix-android:${v}")`,
            "}"
          ].join("\n");
          return toText(snippet);
        }

        if (platform && platform !== "kmp") {
          return toText(`implementation("top.yukonga.miuix.kmp:miuix-${platform}:${v}")`);
        }

        const snippet = [
          "kotlin {",
          "    sourceSets {",
          "        commonMain.dependencies {",
          `            implementation("top.yukonga.miuix.kmp:miuix:${v}")`,
          "        }",
          "    }",
          "}"
        ].join("\n");
        return toText(snippet);
      } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_quick_start_doc",
    { description: "Get the Getting Started guide markdown.", inputSchema: z.object({ locale: z.enum(["en", "zh_CN"]).optional().describe("Locale for the docs, default 'en'") }) },
    async ({ locale }) => {
      try { const doc = await fetchQuickStartDoc(locale); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_theme_doc",
    { description: "Get the Theme guide markdown.", inputSchema: z.object({ locale: z.enum(["en", "zh_CN"]).optional().describe("Locale for the docs, default 'en'") }) },
    async ({ locale }) => {
      try { const doc = await fetchThemeGuide(locale); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_text_styles_doc",
    { description: "Get the Text Styles guide markdown.", inputSchema: z.object({ locale: z.enum(["en", "zh_CN"]).optional().describe("Locale for the docs, default 'en'") }) },
    async ({ locale }) => {
      try { const doc = await fetchTextStylesGuide(locale); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_icons_doc",
    { description: "Get the Icons guide markdown.", inputSchema: z.object({ locale: z.enum(["en", "zh_CN"]).optional().describe("Locale for the docs, default 'en'") }) },
    async ({ locale }) => {
      try { const doc = await fetchIconsGuide(locale); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_utils_doc",
    { description: "Get the Utils guide markdown.", inputSchema: z.object({ locale: z.enum(["en", "zh_CN"]).optional().describe("Locale for the docs, default 'en'") }) },
    async ({ locale }) => {
      try { const doc = await fetchUtilsGuide(locale); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_multiplatform_doc",
    { description: "Get the Multiplatform guide markdown.", inputSchema: z.object({ locale: z.enum(["en", "zh_CN"]).optional().describe("Locale for the docs, default 'en'") }) },
    async ({ locale }) => {
      try { const doc = await fetchMultiplatformGuide(locale); return toText(doc); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "list_dokka_packages",
    { description: "List packages from Dokka API docs.", inputSchema: z.object({ platform: z.enum(["common", "android", "desktop", "ios", "js", "macos", "wasmJs"]).optional().describe("Filter by platform, default all") }) },
    async ({ platform }) => {
      try { const items = await fetchDokkaPackages(platform); return toJsonText(items); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "list_dokka_package_items",
    { description: "List items (classes, functions, properties) in a Dokka package.", inputSchema: z.object({ packageName: z.string().describe("Fully qualified package name, e.g., 'top.yukonga.miuix.kmp.anim'"), platform: z.enum(["common", "android", "desktop", "ios", "js", "macos", "wasmJs"]).optional().describe("Filter by platform, default all") }) },
    async ({ packageName, platform }) => {
      try { const items = await fetchDokkaPackageItems(packageName, platform); return toJsonText(items); } catch (error) { return toError(error); }
    }
  );


  server.registerTool(
    "search_dokka",
    { description: "Search Dokka packages and symbols.", inputSchema: z.object({ query: z.string().describe("Keyword to search in packages and symbols"), limit: z.number().int().positive().max(200).optional().describe("Max results, default 20") }) },
    async ({ query, limit }) => {
      try { const items = await searchDokka(query, limit ?? 20); return toJsonText(items); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "list_example_tree",
    { description: "Recursively list the entire example directory tree.", inputSchema: z.object({}) },
    async () => {
      try { const items = await fetchExampleTree(); return toJsonText(items); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "list_example_path",
    { description: "List files and directories under the example module.", inputSchema: z.object({ subpath: z.string().optional().describe("Subpath under example, e.g., 'src/commonMain/kotlin'") }) },
    async ({ subpath }) => {
      try { const items = await fetchExamplePathContents(subpath ?? ""); return toJsonText(items); } catch (error) { return toError(error); }
    }
  );

  server.registerTool(
    "get_example_file",
    { description: "Get the content of a specific file under the example module.", inputSchema: z.object({ filePath: z.string().describe("File path relative to example, e.g., 'src/commonMain/kotlin/UITest.kt'") }) },
    async ({ filePath }) => {
      try { const content = await fetchExampleFile(filePath); return toText(content); } catch (error) { return toError(error); }
    }
  );
}
