import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchBestPracticesGuide,
  fetchColorsGuide,
  fetchComponentDemo,
  fetchComponentDoc,
  fetchComponents,
  fetchDokkaPackageItems,
  fetchDokkaPackages,
  fetchExampleFile,
  fetchExamplePathContents,
  fetchExampleTree,
  fetchGuideDoc,
  fetchIconsGuide,
  fetchLatestRelease,
  fetchMultiplatformGuide,
  fetchNavigation3Guide,
  fetchQuickStartDoc,
  fetchTextStylesGuide,
  fetchThemeGuide,
  fetchUtilsGuide,
  listGuides,
  searchDokka,
} from "./api.js";

const localeSchema = z.enum(["en", "zh_CN"]).optional().describe("Docs locale, default 'en'");
const platformSchema = z.enum(["kmp", "android", "desktop", "iosarm64", "iosx64", "iossimulatorarm64", "macosx64", "macosarm64", "wasmjs", "js"]).optional().describe("Target platform. Default 'kmp'.");
const artifactSchema = z.enum(["miuix", "miuix-icons", "miuix-navigation3-ui"]);

export function registerTools(server: McpServer) {
  const toText = (text: string) => ({ content: [{ type: "text" as const, text }] });
  const toJsonText = (value: unknown) => toText(JSON.stringify(value, null, 2));
  const toError = (error: unknown) => ({
    content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  });

  server.registerTool(
    "get_latest_version",
    {
      description: "Get the latest published miuix release version from GitHub Releases.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toText(await fetchLatestRelease());
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_gradle_dependency",
    {
      description: "Get Gradle dependency snippets for miuix, miuix-icons, and miuix-navigation3-ui.",
      inputSchema: z.object({
        version: z.string().optional().describe("Optional version override, e.g. '0.8.0'."),
        platform: platformSchema,
        artifacts: z.array(artifactSchema).min(1).optional().describe("Artifacts to include. Default ['miuix']."),
      }),
    },
    async ({ version, platform, artifacts }) => {
      try {
        const resolvedVersion = version && version.trim().length > 0 ? version.trim() : await fetchLatestRelease();
        const resolvedPlatform = platform ?? "kmp";
        const resolvedArtifacts = artifacts && artifacts.length > 0 ? artifacts : ["miuix"];

        const dependencyLine = (artifact: string) => {
          if (resolvedPlatform === "kmp") {
            return `            implementation("top.yukonga.miuix.kmp:${artifact}:${resolvedVersion}")`;
          }
          if (resolvedPlatform === "android") {
            return `    implementation("top.yukonga.miuix.kmp:${artifact}-android:${resolvedVersion}")`;
          }
          return `implementation("top.yukonga.miuix.kmp:${artifact}-${resolvedPlatform}:${resolvedVersion}")`;
        };

        const needsNavigationRuntime = resolvedArtifacts.includes("miuix-navigation3-ui");

        if (resolvedPlatform === "kmp") {
          const lines = [
            "kotlin {",
            "    sourceSets {",
            "        commonMain.dependencies {",
            ...resolvedArtifacts.map(dependencyLine),
            ...(needsNavigationRuntime ? ['            implementation("androidx.navigation3:navigation3-runtime:<navigation3-version>")'] : []),
            "        }",
            "    }",
            "}",
          ];
          return toText(lines.join("\n"));
        }

        if (resolvedPlatform === "android") {
          const lines = [
            "dependencies {",
            ...resolvedArtifacts.map(dependencyLine),
            ...(needsNavigationRuntime ? ['    implementation("androidx.navigation3:navigation3-runtime:<navigation3-version>")'] : []),
            "}",
          ];
          return toText(lines.join("\n"));
        }

        const lines = [
          ...resolvedArtifacts.map(dependencyLine),
          ...(needsNavigationRuntime ? ['implementation("androidx.navigation3:navigation3-runtime:<navigation3-version>")'] : []),
        ];
        return toText(lines.join("\n"));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_all_components",
    {
      description: "List all available Miuix components from the latest docs/source snapshot.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toJsonText(await fetchComponents());
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "search_components",
    {
      description: "Search components by display name or slug.",
      inputSchema: z.object({
        query: z.string().describe("Query to filter components by name or slug."),
      }),
    },
    async ({ query }) => {
      try {
        const components = await fetchComponents();
        const normalized = query.toLowerCase().replace(/\s+/g, "");
        const filtered = components.filter((component) => {
          const name = component.name.toLowerCase().replace(/\s+/g, "");
          const slug = component.slug.toLowerCase();
          return name.includes(normalized) || slug.includes(normalized);
        });
        return toJsonText(filtered);
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_component_doc",
    {
      description: "Get the Markdown documentation for a component. Accepts component name or slug.",
      inputSchema: z.object({
        componentName: z.string().describe("Component name or slug, e.g. 'Button' or 'button'."),
        locale: localeSchema,
      }),
    },
    async ({ componentName, locale }) => {
      try {
        return toText(await fetchComponentDoc(componentName, locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_component_demo",
    {
      description: "Get the latest demo Kotlin code for a component from docs/demo.",
      inputSchema: z.object({
        componentName: z.string().describe("Component name or slug, e.g. 'Button' or 'button'."),
      }),
    },
    async ({ componentName }) => {
      try {
        return toText(await fetchComponentDemo(componentName));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "list_guides",
    {
      description: "List all available guide pages in the Miuix docs.",
      inputSchema: z.object({
        locale: localeSchema,
      }),
    },
    async ({ locale }) => {
      try {
        return toJsonText(await listGuides(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_guide_doc",
    {
      description: "Get a guide page by slug, e.g. 'getting-started', 'colors', or 'navigation3'.",
      inputSchema: z.object({
        page: z.string().describe("Guide slug or relative path without extension."),
        locale: localeSchema,
      }),
    },
    async ({ page, locale }) => {
      try {
        return toText(await fetchGuideDoc(page, locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_quick_start_doc",
    {
      description: "Get the Getting Started guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchQuickStartDoc(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_theme_doc",
    {
      description: "Get the Theme guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchThemeGuide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_colors_doc",
    {
      description: "Get the Color System guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchColorsGuide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_text_styles_doc",
    {
      description: "Get the Text Styles guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchTextStylesGuide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_icons_doc",
    {
      description: "Get the Icons guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchIconsGuide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_utils_doc",
    {
      description: "Get the Utils guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchUtilsGuide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_navigation3_doc",
    {
      description: "Get the Navigation3 Support guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchNavigation3Guide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_multiplatform_doc",
    {
      description: "Get the Multiplatform guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchMultiplatformGuide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_best_practices_doc",
    {
      description: "Get the Best Practices guide markdown.",
      inputSchema: z.object({ locale: localeSchema }),
    },
    async ({ locale }) => {
      try {
        return toText(await fetchBestPracticesGuide(locale));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "list_dokka_packages",
    {
      description: "List packages from the online Dokka API docs.",
      inputSchema: z.object({
        platform: z.enum(["common", "android", "desktop", "ios", "js", "macos", "wasmJs"]).optional().describe("Filter by platform, default all."),
      }),
    },
    async ({ platform }) => {
      try {
        return toJsonText(await fetchDokkaPackages(platform));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "list_dokka_package_items",
    {
      description: "List items (classes, functions, properties) in a Dokka package.",
      inputSchema: z.object({
        packageName: z.string().describe("Fully qualified package name, e.g. 'top.yukonga.miuix.kmp.anim'."),
        platform: z.enum(["common", "android", "desktop", "ios", "js", "macos", "wasmJs"]).optional().describe("Filter by platform, default all."),
      }),
    },
    async ({ packageName, platform }) => {
      try {
        return toJsonText(await fetchDokkaPackageItems(packageName, platform));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "search_dokka",
    {
      description: "Search Dokka packages and symbols.",
      inputSchema: z.object({
        query: z.string().describe("Keyword to search in packages and symbols."),
        limit: z.number().int().positive().max(200).optional().describe("Max results, default 20."),
      }),
    },
    async ({ query, limit }) => {
      try {
        return toJsonText(await searchDokka(query, limit ?? 20));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "list_example_tree",
    {
      description: "Recursively list the entire example directory tree from the latest GitHub source.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return toJsonText(await fetchExampleTree());
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "list_example_path",
    {
      description: "List files and directories under the example module. Returned paths are relative to example/.",
      inputSchema: z.object({
        subpath: z.string().optional().describe("Subpath under example/, e.g. 'shared/src/commonMain/kotlin'."),
      }),
    },
    async ({ subpath }) => {
      try {
        return toJsonText(await fetchExamplePathContents(subpath ?? ""));
      } catch (error) {
        return toError(error);
      }
    }
  );

  server.registerTool(
    "get_example_file",
    {
      description: "Get the content of a specific file under example/.",
      inputSchema: z.object({
        filePath: z.string().describe("File path relative to example/, e.g. 'shared/src/commonMain/kotlin/App.kt'."),
      }),
    },
    async ({ filePath }) => {
      try {
        return toText(await fetchExampleFile(filePath));
      } catch (error) {
        return toError(error);
      }
    }
  );
}
