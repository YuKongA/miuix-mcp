import { config } from "./config.js";

export async function fetchLatestRelease(): Promise<string> {
  const url = "https://api.github.com/repos/compose-miuix-ui/miuix/releases/latest";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch latest release: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { tag_name: string };
    return data.tag_name;
  } catch (error) {
    throw error;
  }
}

export async function fetchComponents(): Promise<string[]> {
  const base = String(config.MIUIX_DOCS_URL || "").replace(/\/+$/, "");
  const pageUrl = `${base}/components/`;

  const extractFromHtml = (html: string): string[] => {
    const names = new Set<string>();
    const anchorRegex = /<a[^>]+href=["']([^"']*?\/components\/([A-Za-z0-9_-]+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1] || "";
      const slug = match[2] || "";
      const labelRaw = match[3] || "";
      if (/github\.com/i.test(href)) continue;
      const label = labelRaw.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
      if (!slug || slug.toLowerCase() === "components") continue;
      if (!label || label.length > 64) continue;
      if (/edit this page/i.test(label) || /next page/i.test(label)) continue;
      names.add(label);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  };

  const response = await fetch(pageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${pageUrl}: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const parsed = extractFromHtml(html);
  if (parsed.length === 0) {
    throw new Error(`No components parsed from ${pageUrl}`);
  }
  return parsed;
}

export async function fetchComponentDemo(componentName: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/compose-miuix-ui/miuix/main/docs/demo/src/commonMain/kotlin/${componentName}Demo.kt`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Demo for component "${componentName}" not found.`);
      }
      throw new Error(`Failed to fetch demo for "${componentName}": ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    throw error;
  }
}

export async function fetchComponentDoc(componentName: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/compose-miuix-ui/miuix/main/docs/components/${componentName.toLowerCase()}.md`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Documentation for component "${componentName}" not found.`);
      }
      throw new Error(`Failed to fetch documentation for "${componentName}": ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    throw error;
  }
}

export async function fetchExamplePathContents(subpath: string = ""): Promise<Array<{ name: string; path: string; type: string; url: string; download_url: string | null }>> {
  const base = "https://api.github.com/repos/compose-miuix-ui/miuix/contents/example";
  const url = subpath ? `${base}/${subpath}` : base;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch example contents from ${url}: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Invalid response format: expected an array");
    }
    return data.map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type,
      url: item.url,
      download_url: item.download_url ?? null,
    }));
  } catch (error) {
    throw error;
  }
}

export async function fetchExampleFile(filePath: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/compose-miuix-ui/miuix/main/example/${filePath}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Example file "${filePath}" not found.`);
      }
      throw new Error(`Failed to fetch example file "${filePath}": ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    throw error;
  }
}

export async function fetchExampleTree(): Promise<Array<{ name: string; path: string; type: "tree" | "blob"; size?: number; sha: string; raw_url: string | null }>> {
  const url = "https://api.github.com/repos/compose-miuix-ui/miuix/git/trees/main?recursive=1";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch repository tree: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const tree = Array.isArray((data as { tree?: any }).tree) ? (data as { tree: any[] }).tree : [];

    const filtered = tree.filter((item: any) => typeof item.path === "string" && item.path.startsWith("example/"));
    return filtered.map((item: any) => {
      const name = item.path.split("/").pop() ?? item.path;
      const rawUrl = item.type === "blob" ? `https://raw.githubusercontent.com/compose-miuix-ui/miuix/main/${item.path}` : null;
      return {
        name,
        path: item.path,
        type: item.type,
        size: item.size,
        sha: item.sha,
        raw_url: rawUrl,
      };
    });
  } catch (error) {
    throw error;
  }
}
