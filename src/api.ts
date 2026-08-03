import path from "node:path";
import { cached } from "./cache.js";
import { config } from "./config.js";

type Locale = "en" | "zh_CN";
type DokkaPlatform = "common" | "android" | "desktop" | "ios" | "js" | "macos" | "wasmJs";

type ComponentInfo = {
  name: string;
  slug: string;
};

type GuideInfo = {
  title: string;
  slug: string;
  locale: Locale;
  path: string;
};

type ExamplePathItem = {
  name: string;
  path: string;
  type: string;
  url: string;
  download_url: string | null;
};

type ExampleTreeItem = {
  name: string;
  path: string;
  type: "tree" | "blob";
  size?: number;
  sha: string;
  raw_url: string | null;
};

type DokkaSymbol = {
  kind: string;
  name: string;
  url: string;
  platform?: string;
  signature?: string;
  params?: Array<{ name: string; type: string; default?: string }>;
};

const GITHUB_API_BASE = "https://api.github.com/repos/compose-miuix-ui/miuix";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/compose-miuix-ui/miuix";

function normalizeLocale(locale?: string): Locale {
  return locale === "zh_CN" ? "zh_CN" : "en";
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

function docsRelativePath(relativePath: string, locale: Locale): string {
  const normalized = normalizeRelativePath(relativePath);
  return locale === "zh_CN" ? `docs/zh_CN/${normalized}` : `docs/${normalized}`;
}

function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractFirstHeading(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim();
}

async function fetchDefaultBranch(): Promise<string> {
  const url = GITHUB_API_BASE;
  return cached<string>(`defaultBranch@${url}`, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch repository metadata: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { default_branch?: string };
    return data.default_branch || "main";
  });
}

async function getContentRef(): Promise<string> {
  return await fetchDefaultBranch();
}

async function fetchRemoteText(relativePath: string): Promise<string> {
  const ref = await getContentRef();
  const normalized = normalizeRelativePath(relativePath);
  const url = `${GITHUB_RAW_BASE}/${ref}/${normalized}`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found: ${normalized}`);
    }
    throw new Error(`Failed to fetch "${normalized}": ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function readRepoText(relativePath: string): Promise<string> {
  return await fetchRemoteText(relativePath);
}

async function maybeReadRepoText(relativePath: string): Promise<string | null> {
  try {
    return await readRepoText(relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      return null;
    }
    throw error;
  }
}

async function listRemoteDirectory(relativeDir: string): Promise<Array<{ name: string; path: string; isDirectory: boolean; url: string; downloadUrl: string | null }>> {
  const ref = await getContentRef();
  const normalized = normalizeRelativePath(relativeDir);
  const encodedPath = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = encodedPath.length > 0
    ? `${GITHUB_API_BASE}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
    : `${GITHUB_API_BASE}/contents?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch directory "${normalized}": ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`Invalid directory response for "${normalized}"`);
  }

  return data.map((item: any) => ({
    name: String(item.name),
    path: normalizeRelativePath(String(item.path)),
    isDirectory: String(item.type) === "dir",
    url: String(item.html_url ?? ""),
    downloadUrl: item.download_url ? String(item.download_url) : null,
  }));
}

function extractComponentsFromMarkdown(markdown: string): ComponentInfo[] {
  const list: ComponentInfo[] = [];
  const linkRegex = /\[([^\]]+)\]\((?:\.\.\/)?components\/([A-Za-z0-9_-]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const name = (match[1] || "").trim();
    const slug = (match[2] || "").trim();
    if (!name || !slug || slug.toLowerCase() === "index") {
      continue;
    }
    list.push({ name, slug });
  }
  return list;
}

function dedupeComponents(components: ComponentInfo[]): ComponentInfo[] {
  const unique = new Map<string, ComponentInfo>();
  for (const component of components) {
    const key = component.slug.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, component);
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveComponent(componentName: string): Promise<ComponentInfo> {
  const query = componentName.trim();
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");
  const components = await fetchComponents();

  const exact = components.find((component) => {
    const name = component.name.toLowerCase().replace(/\s+/g, "");
    const slug = component.slug.toLowerCase();
    return name === normalizedQuery || slug === normalizedQuery;
  });
  if (exact) {
    return exact;
  }

  const fuzzy = components.find((component) => {
    const name = component.name.toLowerCase().replace(/\s+/g, "");
    const slug = component.slug.toLowerCase();
    return name.includes(normalizedQuery) || slug.includes(normalizedQuery);
  });
  if (fuzzy) {
    return fuzzy;
  }

  return {
    name: query.replace(/\s+/g, ""),
    slug: normalizedQuery,
  };
}

async function findGuideEntries(locale: Locale): Promise<GuideInfo[]> {
  const relativeDir = docsRelativePath("guide", locale);
  const cacheKey = `guideIndex@${relativeDir}@remote-main`;
  return cached<GuideInfo[]>(cacheKey, 2 * 60 * 60 * 1000, async () => {
    const entries = await listRemoteDirectory(relativeDir);

    const markdownEntries = entries
      .filter((entry) => !entry.isDirectory && entry.name.endsWith(".md"))
      .sort((a, b) => a.name.localeCompare(b.name));

    const guides: GuideInfo[] = [];
    for (const entry of markdownEntries) {
      const markdown = await readRepoText(entry.path);
      const slug = entry.name.replace(/\.md$/i, "");
      guides.push({
        title: extractFirstHeading(markdown) || slugToTitle(slug),
        slug,
        locale,
        path: entry.path,
      });
    }
    return guides;
  });
}

export async function fetchGuideDoc(page: string, locale?: string): Promise<string> {
  const normalizedPage = normalizeRelativePath(page).replace(/\.md$/i, "").split("/").pop() || page;
  const loc = normalizeLocale(locale);
  const key = `guideDoc@${normalizedPage}@${loc}@remote-main`;
  return cached<string>(key, 12 * 60 * 60 * 1000, async () => {
    const primary = await maybeReadRepoText(docsRelativePath(`guide/${normalizedPage}.md`, loc));
    if (primary !== null) {
      return primary;
    }

    const fallbackLocale: Locale = loc === "en" ? "zh_CN" : "en";
    const fallback = await maybeReadRepoText(docsRelativePath(`guide/${normalizedPage}.md`, fallbackLocale));
    if (fallback !== null) {
      return fallback;
    }

    throw new Error(`Guide "${normalizedPage}" not found for locales ${loc} or ${fallbackLocale}.`);
  });
}

export async function fetchLatestRelease(): Promise<string> {
  const url = `${GITHUB_API_BASE}/releases/latest`;
  return cached<string>(`latestRelease@${url}`, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch latest release: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { tag_name?: string };
    if (!data.tag_name) {
      throw new Error("Latest release response did not contain tag_name");
    }
    return data.tag_name;
  });
}

export async function fetchComponents(): Promise<ComponentInfo[]> {
  const key = "components@remote-main";
  return cached<ComponentInfo[]>(key, 2 * 60 * 60 * 1000, async () => {
    const results: ComponentInfo[] = [];
    const markdownSources = [
      await maybeReadRepoText("docs/components/index.md"),
      await maybeReadRepoText("docs/zh_CN/components/index.md"),
    ].filter((item): item is string => item !== null);

    for (const markdown of markdownSources) {
      results.push(...extractComponentsFromMarkdown(markdown));
    }

    if (results.length === 0) {
      const directoryEntries = await listRemoteDirectory("docs/components");

      for (const entry of directoryEntries) {
        if (entry.isDirectory || !entry.name.endsWith(".md") || entry.name === "index.md") {
          continue;
        }
        const slug = entry.name.replace(/\.md$/i, "");
        const markdown = await readRepoText(entry.path);
        results.push({
          name: extractFirstHeading(markdown) || slugToTitle(slug).replace(/\s+/g, ""),
          slug,
        });
      }
    }

    const unique = dedupeComponents(results);
    if (unique.length === 0) {
      throw new Error("No components parsed from Miuix documentation.");
    }
    return unique;
  });
}

export async function fetchComponentDemo(componentName: string): Promise<string> {
  const resolved = await resolveComponent(componentName);
  const demoPath = `docs/demo/src/commonMain/kotlin/${resolved.name}Demo.kt`;
  const fallbackPath = `docs/demo/src/commonMain/kotlin/${slugToTitle(resolved.slug).replace(/\s+/g, "")}Demo.kt`;
  const key = `componentDemo@${resolved.slug}@remote-main`;
  return cached<string>(key, 12 * 60 * 60 * 1000, async () => {
    const primary = await maybeReadRepoText(demoPath);
    if (primary !== null) {
      return primary;
    }
    const fallback = await maybeReadRepoText(fallbackPath);
    if (fallback !== null) {
      return fallback;
    }
    throw new Error(`Demo for component "${componentName}" not found.`);
  });
}

export async function fetchComponentDoc(componentName: string, locale?: string): Promise<string> {
  const resolved = await resolveComponent(componentName);
  const loc = normalizeLocale(locale);
  const key = `componentDoc@${resolved.slug}@${loc}@remote-main`;
  return cached<string>(key, 12 * 60 * 60 * 1000, async () => {
    const primary = await maybeReadRepoText(docsRelativePath(`components/${resolved.slug}.md`, loc));
    if (primary !== null) {
      return primary;
    }

    const fallbackLocale: Locale = loc === "en" ? "zh_CN" : "en";
    const fallback = await maybeReadRepoText(docsRelativePath(`components/${resolved.slug}.md`, fallbackLocale));
    if (fallback !== null) {
      return fallback;
    }

    throw new Error(`Documentation for component "${componentName}" not found.`);
  });
}

export async function listGuides(locale?: string): Promise<GuideInfo[]> {
  return await findGuideEntries(normalizeLocale(locale));
}

export async function fetchQuickStartDoc(locale?: string): Promise<string> {
  return await fetchGuideDoc("getting-started", locale);
}

export async function fetchThemeGuide(locale?: string): Promise<string> {
  return await fetchGuideDoc("theme", locale);
}

export async function fetchColorsGuide(locale?: string): Promise<string> {
  return await fetchGuideDoc("colors", locale);
}

export async function fetchTextStylesGuide(locale?: string): Promise<string> {
  return await fetchGuideDoc("textstyles", locale);
}

export async function fetchIconsGuide(locale?: string): Promise<string> {
  return await fetchGuideDoc("icons", locale);
}

export async function fetchUtilsGuide(locale?: string): Promise<string> {
  return await fetchGuideDoc("utils", locale);
}

export async function fetchNavigation3Guide(locale?: string): Promise<string> {
  return await fetchGuideDoc("navigation3", locale);
}

export async function fetchMultiplatformGuide(locale?: string): Promise<string> {
  return await fetchGuideDoc("multiplatform", locale);
}

export async function fetchBestPracticesGuide(locale?: string): Promise<string> {
  return await fetchGuideDoc("best-practices", locale);
}

function dokkaIndexUrl(): string {
  const base = String(config.MIUIX_DOCS_URL || "").replace(/\/+$/, "");
  return `${base}/dokka/index.html`;
}

function dokkaBase(): string {
  const base = String(config.MIUIX_DOCS_URL || "").replace(/\/+$/, "");
  return `${base}/dokka`;
}

function extractSignatureParams(signature: string, symbolName: string): Array<{ name: string; type: string; default?: string }> {
  const symbolIndex = signature.indexOf(symbolName);
  const openIndex = signature.indexOf("(", symbolIndex >= 0 ? symbolIndex : 0);
  if (openIndex < 0) {
    return [];
  }

  let index = openIndex + 1;
  let parenDepth = 1;
  let angleDepth = 0;
  let buffer = "";
  while (index < signature.length && parenDepth > 0) {
    const char = signature[index];
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "<") angleDepth++;
    else if (char === ">") angleDepth = Math.max(0, angleDepth - 1);
    if (parenDepth > 0) buffer += char;
    index++;
  }

  const rawParams = buffer.trim();
  if (!rawParams) {
    return [];
  }

  const parts: string[] = [];
  let partBuffer = "";
  let nestedParenDepth = 0;
  let nestedAngleDepth = 0;

  for (const char of rawParams) {
    if (char === "(") nestedParenDepth++;
    else if (char === ")") nestedParenDepth = Math.max(0, nestedParenDepth - 1);
    else if (char === "<") nestedAngleDepth++;
    else if (char === ">") nestedAngleDepth = Math.max(0, nestedAngleDepth - 1);

    if (char === "," && nestedParenDepth === 0 && nestedAngleDepth === 0) {
      const token = partBuffer.trim();
      if (token.length > 0) parts.push(token);
      partBuffer = "";
      continue;
    }

    partBuffer += char;
  }

  const last = partBuffer.trim();
  if (last.length > 0) {
    parts.push(last);
  }

  const params: Array<{ name: string; type: string; default?: string }> = [];
  for (const part of parts) {
    let token = part.trim();
    token = token.replace(/\b(vararg|noinline|crossinline|inline|reified)\b/g, "").trim();
    const colonIndex = token.indexOf(":");
    if (colonIndex <= 0) continue;

    const name = token.slice(0, colonIndex).trim();
    let typeWithDefault = token.slice(colonIndex + 1).trim();
    let defaultValue: string | undefined;
    const equalsIndex = typeWithDefault.indexOf("=");
    if (equalsIndex > 0) {
      defaultValue = typeWithDefault.slice(equalsIndex + 1).trim();
      typeWithDefault = typeWithDefault.slice(0, equalsIndex).trim();
    }

    params.push({
      name,
      type: typeWithDefault,
      default: defaultValue,
    });
  }

  return params;
}

export async function fetchDokkaPackageSymbols(packageName: string, platform?: DokkaPlatform): Promise<DokkaSymbol[]> {
  const packages = await fetchDokkaPackages(platform);
  const pkg = packages.find((item) => item.name === packageName);
  if (!pkg) {
    throw new Error(`Package "${packageName}" not found in Dokka index`);
  }

  const key = `dokkaPackageSymbols@${pkg.url}@${platform || "all"}`;
  return cached<DokkaSymbol[]>(key, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(pkg.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Dokka package page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const platformMap: Record<DokkaPlatform, string> = {
      common: ":miuix/commonMain",
      android: ":miuix/androidMain",
      desktop: ":miuix/desktopMain",
      ios: ":miuix/iosMain",
      js: ":miuix/jsMain",
      macos: ":miuix/macosMain",
      wasmJs: ":miuix/wasmJsMain",
    };
    const platformFilter = platform ? platformMap[platform] : undefined;
    const results: DokkaSymbol[] = [];

    const getSectionTable = (name: "TYPE" | "PROPERTY" | "FUNCTION"): string => {
      const sectionIndex = html.search(new RegExp(`<div\\s+data-togglable="${name}[^"]*"`, "i"));
      if (sectionIndex < 0) return "";
      const tableIndex = html.indexOf(`<div class="table">`, sectionIndex);
      if (tableIndex < 0) return "";

      const sliceDiv = (source: string, start: number): string => {
        const openEnd = source.indexOf(">", start);
        if (openEnd < 0) return "";
        let innerIndex = openEnd + 1;
        let depth = 1;
        let out = source.slice(start, innerIndex);

        while (innerIndex < source.length) {
          const openIndex = source.indexOf("<div", innerIndex);
          const closeIndex = source.indexOf("</div>", innerIndex);

          if (openIndex >= 0 && openIndex < closeIndex) {
            out += source.slice(innerIndex, openIndex);
            const openTagEnd = source.indexOf(">", openIndex);
            if (openTagEnd < 0) break;
            depth++;
            out += source.slice(openIndex, openTagEnd + 1);
            innerIndex = openTagEnd + 1;
            continue;
          }

          if (closeIndex >= 0) {
            out += source.slice(innerIndex, closeIndex + 6);
            depth--;
            innerIndex = closeIndex + 6;
            if (depth === 0) break;
            continue;
          }

          break;
        }

        return out;
      };

      return sliceDiv(html, tableIndex);
    };

    const rowRegex = /<div class="table-row table-row_content"[\s\S]*?>\s*<\/div>\s*<\/div>/g;
    const parseRows = (tableHtml: string, kind: "Type" | "Property" | "Function") => {
      if (!tableHtml) return;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const row = rowMatch[0];
        const anchorMatch = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
        if (!anchorMatch) continue;

        const href = String(anchorMatch[1] || "");
        const rawNameHtml = String(anchorMatch[2] || "");
        if (!href || !rawNameHtml) continue;

        let name = rawNameHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const index = tableHtml.indexOf(row);
        const windowStart = Math.max(0, index - 1000);
        const windowEnd = Math.min(tableHtml.length, index + 2000);
        const windowHtml = tableHtml.slice(windowStart, windowEnd);
        const platformTagMatch = /data-filterable-current="([^"]+)"/.exec(windowHtml)
          || /data-filterable-set="([^"]+)"/.exec(windowHtml)
          || /data-togglable="([^"]+)"/.exec(windowHtml);
        const platformTag = platformTagMatch?.[1] ?? "";

        if (platformFilter && platformTag && platformTag !== platformFilter) {
          continue;
        }

        const signatureMatch = /<div class="symbol monospace">([\s\S]*?)<\/div>/.exec(row);
        const signature = signatureMatch?.[1]
          ? signatureMatch[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
          : "";

        if (signature) {
          if (kind === "Type") {
            const match = /^(?:class|interface|enum|object)\s+([A-Za-z0-9_]+)/i.exec(signature);
            if (match?.[1]) name = match[1];
          } else if (kind === "Function") {
            const match = /(?:^|[\s])fun\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
            if (match?.[1]) name = match[1];
          } else if (kind === "Property") {
            const match = /(?:^|[\s])(val|var)\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
            if (match?.[2]) name = match[2];
          }
        }

        name = name.replace(/\s+/g, "");

        let url: string;
        if (href.startsWith("http")) {
          url = href;
        } else if (/^\/miuix\//.test(href)) {
          url = new URL(href, dokkaBase()).toString();
        } else if (/^[-][A-Za-z0-9_.-]+(?:\/index\.html|\.html)?$/.test(href)) {
          const packageDir = pkg.url.replace(/index\.html$/, "");
          url = `${packageDir}${href.replace(/^\/+/, "")}`;
        } else {
          url = new URL(href, pkg.url).toString();
        }

        const params = kind === "Function" ? extractSignatureParams(signature, name) : [];
        results.push({ kind, name, url, platform: platformTag || undefined, signature, params });
      }
    };

    parseRows(getSectionTable("TYPE"), "Type");
    parseRows(getSectionTable("PROPERTY"), "Property");
    parseRows(getSectionTable("FUNCTION"), "Function");

    if (results.length === 0) {
      const fallbackRowRegex = /<div class="table-row table-row_content"[\s\S]*?<\/div>\s*<\/div>/g;
      let match: RegExpExecArray | null;
      while ((match = fallbackRowRegex.exec(html)) !== null) {
        const row = match[0];
        const signatureMatch = /<div class="symbol monospace">([\s\S]*?)<\/div>/.exec(row);
        const signature = signatureMatch?.[1]
          ? signatureMatch[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
          : "";

        let kind: "Type" | "Property" | "Function" | null = null;
        if (/^(?:open\s+|override\s+|inline\s+|suspend\s+)*fun\s/i.test(signature)) kind = "Function";
        else if (/^(?:val|var)\s/i.test(signature)) kind = "Property";
        else if (/^(?:class|interface|enum|object)\s/i.test(signature)) kind = "Type";
        if (!kind) continue;

        const anchorMatch = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
        if (!anchorMatch) continue;
        const href = String(anchorMatch[1] || "");
        const rawNameHtml = String(anchorMatch[2] || "");
        if (!href || !rawNameHtml) continue;

        const name = rawNameHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const index = html.indexOf(row);
        const windowStart = Math.max(0, index - 1000);
        const windowEnd = Math.min(html.length, index + 2000);
        const windowHtml = html.slice(windowStart, windowEnd);
        const platformTagMatch = /data-filterable-current="([^"]+)"/.exec(windowHtml)
          || /data-filterable-set="([^"]+)"/.exec(windowHtml)
          || /data-togglable="([^"]+)"/.exec(windowHtml);
        const platformTag = platformTagMatch?.[1] ?? "";
        if (platformFilter && platformTag && platformTag !== platformFilter) continue;

        const url = href.startsWith("http")
          ? href
          : /^\/miuix\//.test(href)
            ? new URL(href, dokkaBase()).toString()
            : /^[-][A-Za-z0-9_.-]+(?:\/index\.html|\.html)?$/.test(href)
              ? `${pkg.url.replace(/index\.html$/, "")}${href.replace(/^\/+/, "")}`
              : new URL(href, pkg.url).toString();
        const params = kind === "Function" ? extractSignatureParams(signature, name) : [];
        results.push({ kind, name, url, platform: platformTag || undefined, signature, params });
      }
    }

    return results;
  });
}

export async function searchDokka(query: string, limit: number = 20): Promise<
  Array<{ type: "package" | "symbol"; module: string; package?: string; name: string; url: string; kind?: string }>
> {
  const normalizedQuery = query.trim().toLowerCase();
  const noSpaceQuery = normalizedQuery.replace(/\s+/g, "");
  if (!normalizedQuery) {
    return [];
  }

  const packages = await fetchDokkaPackages();
  const packageMatches = packages.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  const results: Array<{ type: "package" | "symbol"; module: string; package?: string; name: string; url: string; kind?: string }> = [];

  for (const item of packageMatches) {
    results.push({
      type: "package",
      module: "miuix",
      package: item.name,
      name: item.name,
      url: item.url,
    });
    if (results.length >= limit) {
      return results.slice(0, limit);
    }
  }

  const rankedPackages = packages
    .map((item) => ({
      item,
      score: item.name.toLowerCase().startsWith(normalizedQuery) ? 3 : item.name.toLowerCase().includes(normalizedQuery) ? 2 : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, packages.length))
    .map((entry) => entry.item);

  for (const pkg of rankedPackages) {
    const symbols = await fetchDokkaPackageItems(pkg.name);
    for (const symbol of symbols) {
      const symbolName = symbol.name.toLowerCase();
      const compactSymbolName = symbolName.replace(/\s+/g, "");
      if (symbolName.includes(normalizedQuery) || compactSymbolName.includes(noSpaceQuery)) {
        results.push({
          type: "symbol",
          module: "miuix",
          package: pkg.name,
          name: symbol.name,
          url: symbol.url,
          kind: symbol.kind,
        });
        if (results.length >= limit) {
          return results.slice(0, limit);
        }
      }
    }
  }

  if (results.length < limit) {
    const scanned = new Set(rankedPackages.map((item) => item.name));
    for (const pkg of packages) {
      if (scanned.has(pkg.name)) continue;
      const symbols = await fetchDokkaPackageItems(pkg.name);
      for (const symbol of symbols) {
        if (symbol.name.toLowerCase().includes(normalizedQuery)) {
          results.push({
            type: "symbol",
            module: "miuix",
            package: pkg.name,
            name: symbol.name,
            url: symbol.url,
            kind: symbol.kind,
          });
          if (results.length >= limit) {
            return results.slice(0, limit);
          }
        }
      }
      if (results.length >= limit) {
        break;
      }
    }
  }

  return results.slice(0, limit);
}

export async function fetchDokkaPackages(platform?: DokkaPlatform): Promise<Array<{ name: string; url: string; platform?: string }>> {
  const indexUrl = dokkaIndexUrl();
  const key = `dokkaPackages@${indexUrl}@${platform || "all"}`;
  return cached<Array<{ name: string; url: string; platform?: string }>>(key, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(indexUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Dokka index: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const base = dokkaBase().replace(/\/+$/, "");
    const results: Array<{ name: string; url: string; platform?: string }> = [];
    const anchorRegex = /<a href="((?:miuix|miuix-ui)\/top\.yukonga\.miuix\.kmp\.[^"]+\/index\.html)">([^<]+)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1] || "";
      const name = (match[2] || "").trim();
      results.push({
        name,
        url: `${base}/${href}`,
      });
    }

    if (results.length === 0) {
      throw new Error("No packages parsed from Dokka index");
    }

    const unique = Array.from(new Map(results.map((item) => [item.name, item])).values());
    unique.sort((a, b) => a.name.localeCompare(b.name));
    return unique;
  });
}

export async function fetchDokkaPackageItems(packageName: string, platform?: DokkaPlatform): Promise<DokkaSymbol[]> {
  const packages = await fetchDokkaPackages(platform);
  const pkg = packages.find((item) => item.name === packageName);
  if (!pkg) {
    throw new Error(`Package "${packageName}" not found in Dokka index`);
  }
  return await fetchDokkaPackageSymbols(packageName, platform);
}

export async function fetchDokkaClassMembers(typeUrl: string, platform?: DokkaPlatform): Promise<{
  constructors: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }>;
  functions: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }>;
  properties: Array<{ name: string; url: string; platform?: string; signature?: string }>;
}> {
  const key = `dokkaClassMembers@${typeUrl}@${platform || "all"}@v3`;
  return cached(key, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(typeUrl);
    if (!response.ok) {
      if (response.status === 404) {
        return { constructors: [], functions: [], properties: [] };
      }
      throw new Error(`Failed to fetch Dokka type page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const platformMap: Record<DokkaPlatform, string> = {
      common: ":miuix/commonMain",
      android: ":miuix/androidMain",
      desktop: ":miuix/desktopMain",
      ios: ":miuix/iosMain",
      js: ":miuix/jsMain",
      macos: ":miuix/macosMain",
      wasmJs: ":miuix/wasmJsMain",
    };
    const platformFilter = platform ? platformMap[platform] : undefined;
    const constructors: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }> = [];
    const functions: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }> = [];
    const properties: Array<{ name: string; url: string; platform?: string; signature?: string }> = [];

    const rowRegex = /<div class="table-row table-row_content"[\s\S]*?>\s*<\/div>\s*<\/div>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[0];
      const signatureMatch = /<div class="symbol monospace">([\s\S]*?)<\/div>/.exec(row);
      if (!signatureMatch) continue;
      const signature = (signatureMatch[1] ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

      const anchorMatch = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
      if (!anchorMatch) continue;

      const href = String(anchorMatch[1] || "");
      const rawNameHtml = String(anchorMatch[2] || "");
      if (!href || !rawNameHtml) continue;

      let name = rawNameHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const index = typeof (rowMatch as RegExpExecArray & { index?: number }).index === "number"
        ? (rowMatch as RegExpExecArray & { index?: number }).index!
        : html.indexOf(row);
      const windowStart = Math.max(0, index - 1000);
      const windowEnd = Math.min(html.length, index + 2000);
      const windowHtml = html.slice(windowStart, windowEnd);
      const platformTagMatch = /data-filterable-current="([^"]+)"/.exec(windowHtml)
        || /data-filterable-set="([^"]+)"/.exec(windowHtml)
        || /data-togglable="([^"]+)"/.exec(windowHtml);
      const platformTag = platformTagMatch?.[1] ?? "";
      if (platformFilter && platformTag && platformTag !== platformFilter) continue;

      const url = href.startsWith("http") ? href : new URL(href, typeUrl).toString();

      if (signature) {
        const typeNameMatch = /^(?:class|interface|enum|object)\s+([A-Za-z0-9_]+)/i.exec(signature);
        const functionNameMatch = /(?:^|[\s])fun\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
        const propertyNameMatch = /(?:^|[\s])(val|var)\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
        if (typeNameMatch?.[1]) name = typeNameMatch[1];
        else if (functionNameMatch?.[1]) name = functionNameMatch[1];
        else if (propertyNameMatch?.[2]) name = propertyNameMatch[2];
      }
      name = name.replace(/\s+/g, "");

      if (/^(?:constructor)\s*\(/i.test(signature)) {
        constructors.push({
          name,
          url,
          platform: platformTag || undefined,
          signature,
          params: extractSignatureParams(signature, "constructor"),
        });
        continue;
      }

      if (/^(?:open\s+|override\s+|inline\s+|suspend\s+)*fun\s/i.test(signature)) {
        functions.push({
          name,
          url,
          platform: platformTag || undefined,
          signature,
          params: extractSignatureParams(signature, name),
        });
        continue;
      }

      if (/^(?:val|var)\s/i.test(signature)) {
        properties.push({
          name,
          url,
          platform: platformTag || undefined,
          signature,
        });
      }
    }

    return { constructors, functions, properties };
  });
}

export async function fetchExamplePathContents(subpath: string = ""): Promise<ExamplePathItem[]> {
  const normalizedSubpath = normalizeRelativePath(subpath);
  const cacheKey = `examplePath@${normalizedSubpath || "/"}@remote-main`;
  return cached<ExamplePathItem[]>(cacheKey, 2 * 60 * 60 * 1000, async () => {
    const entries = await listRemoteDirectory(path.posix.join("example", normalizedSubpath));
    return entries.map((entry) => ({
      name: entry.name,
      path: entry.path.replace(/^example\/?/, ""),
      type: entry.isDirectory ? "dir" : "file",
      url: entry.url,
      download_url: entry.downloadUrl,
    }));
  });
}

export async function fetchExampleFile(filePath: string): Promise<string> {
  const normalizedPath = normalizeRelativePath(filePath).replace(/^example\/?/, "");
  const key = `exampleFile@${normalizedPath}@remote-main`;
  return cached<string>(key, 24 * 60 * 60 * 1000, async () => {
    return await readRepoText(path.posix.join("example", normalizedPath));
  });
}

export async function fetchExampleTree(): Promise<ExampleTreeItem[]> {
  const key = "exampleTree@remote-main";
  return cached<ExampleTreeItem[]>(key, 6 * 60 * 60 * 1000, async () => {
    const ref = await getContentRef();
    const url = `${GITHUB_API_BASE}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch repository tree: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { tree?: any[] };
    const tree = Array.isArray(data.tree) ? data.tree : [];
    return tree
      .filter((item) => typeof item.path === "string" && item.path.startsWith("example/"))
      .map((item) => ({
        name: item.path.split("/").pop() ?? item.path,
        path: String(item.path),
        type: item.type,
        size: item.size,
        sha: item.sha,
        raw_url: item.type === "blob" ? `${GITHUB_RAW_BASE}/${ref}/${item.path}` : null,
      }));
  });
}
