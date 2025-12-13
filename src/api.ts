import { cached } from "./cache.js";
import { config } from "./config.js";

export async function fetchLatestRelease(): Promise<string> {
  const url = "https://api.github.com/repos/compose-miuix-ui/miuix/releases/latest";
  return cached<string>(`latestRelease@${url}`, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch latest release: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { tag_name: string };
    return data.tag_name;
  });
}

async function getGithubRef(): Promise<string> {
  try {
    const tag = await fetchLatestRelease();
    return tag || "main";
  } catch {
    return "main";
  }
}

function normalizeLocale(locale?: string): "en" | "zh_CN" {
  const l = String(locale || "en");
  return l === "zh_CN" ? "zh_CN" : "en";
}

function guideUrl(page: string, locale: "en" | "zh_CN"): string {
  const base = "https://raw.githubusercontent.com/compose-miuix-ui/miuix";
  return locale === "zh_CN" ? `${base}/%REF%/docs/zh_CN/guide/${page}.md` : `${base}/%REF%/docs/guide/${page}.md`;
}

async function fetchGuideDoc(page: string, locale?: string): Promise<string> {
  const loc = normalizeLocale(locale);
  const ref = await getGithubRef();
  const key = `guideDoc@${page}@${loc}@${ref}`;
  return cached<string>(key, 12 * 60 * 60 * 1000, async () => {
    const primary = guideUrl(page, loc).replace("%REF%", ref);
    let response = await fetch(primary);
    if (!response.ok) {
      if (response.status === 404) {
        const fallback = loc === "en" ? "zh_CN" : "en";
        const fbUrl = guideUrl(page, fallback).replace("%REF%", ref);
        const fbResp = await fetch(fbUrl);
        if (!fbResp.ok) {
          throw new Error(`Failed to fetch guide "${page}" for ${loc}, fallback ${fallback}: ${fbResp.status} ${fbResp.statusText}`);
        }
        return await fbResp.text();
      }
      throw new Error(`Failed to fetch guide "${page}" for ${loc}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  });
}

export async function fetchComponents(): Promise<Array<{ name: string; slug: string }>> {
  const ref = await getGithubRef();
  const base = "https://raw.githubusercontent.com/compose-miuix-ui/miuix";
  const urls = [
    `${base}/${ref}/docs/components/index.md`,
    `${base}/${ref}/docs/zh_CN/components/index.md`,
  ];

  const extractFromMarkdown = (md: string): Array<{ name: string; slug: string }> => {
    const list: Array<{ name: string; slug: string }> = [];
    const linkRegex = /\[([^\]]+)\]\((?:\.\.\/)?components\/([A-Za-z0-9_-]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(md)) !== null) {
      const label = (match[1] || "").trim();
      const slug = (match[2] || "").trim();
      if (!slug || slug.toLowerCase() === "components") continue;
      if (!label || label.length > 64) continue;
      list.push({ name: label, slug });
    }
    return list;
  };

  return cached<Array<{ name: string; slug: string }>>(`components@${ref}`, 2 * 60 * 60 * 1000, async () => {
    const results: Array<{ name: string; slug: string }> = [];
    for (const url of urls) {
      const resp = await fetch(url);
      if (resp.ok) {
        const md = await resp.text();
        results.push(...extractFromMarkdown(md));
      }
    }
    const map = new Map<string, { name: string; slug: string }>();
    for (const item of results) {
      const key = item.slug.toLowerCase();
      if (!map.has(key)) map.set(key, item);
    }
    const unique = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (unique.length === 0) {
      throw new Error(`No components parsed from ${urls.join(", ")}`);
    }
    return unique;
  });
}

export async function fetchComponentDemo(componentName: string): Promise<string> {
  const ref = await getGithubRef();
  const url = `https://raw.githubusercontent.com/compose-miuix-ui/miuix/${ref}/docs/demo/src/commonMain/kotlin/${componentName}Demo.kt`;
  return cached<string>(`componentDemo@${componentName}@${ref}`, 12 * 60 * 60 * 1000, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Demo for component "${componentName}" not found.`);
      }
      throw new Error(`Failed to fetch demo for "${componentName}": ${response.status} ${response.statusText}`);
    }
    return await response.text();
  });
}

export async function fetchComponentDoc(componentName: string): Promise<string> {
  const ref = await getGithubRef();
  const url = `https://raw.githubusercontent.com/compose-miuix-ui/miuix/${ref}/docs/components/${componentName.toLowerCase()}.md`;
  return cached<string>(`componentDoc@${componentName.toLowerCase()}@${ref}`, 12 * 60 * 60 * 1000, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Documentation for component "${componentName}" not found.`);
      }
      throw new Error(`Failed to fetch documentation for "${componentName}": ${response.status} ${response.statusText}`);
    }
    return await response.text();
  });
}

export async function fetchQuickStartDoc(locale?: string): Promise<string> {
  return fetchGuideDoc("getting-started", locale);
}

export async function fetchThemeGuide(locale?: string): Promise<string> {
  return fetchGuideDoc("theme", locale);
}

export async function fetchTextStylesGuide(locale?: string): Promise<string> {
  return fetchGuideDoc("textstyles", locale);
}

export async function fetchIconsGuide(locale?: string): Promise<string> {
  return fetchGuideDoc("icons", locale);
}

export async function fetchUtilsGuide(locale?: string): Promise<string> {
  return fetchGuideDoc("utils", locale);
}

export async function fetchMultiplatformGuide(locale?: string): Promise<string> {
  return fetchGuideDoc("multiplatform", locale);
}

function dokkaIndexUrl(): string {
  const base = String(config.MIUIX_DOCS_URL || "").replace(/\/+$/, "");
  return `${base}/dokka/index.html`;
}

export async function fetchDokkaPackageSymbols(packageName: string, platform?: "common" | "android" | "desktop" | "ios" | "js" | "macos" | "wasmJs"): Promise<
  Array<{ kind: string; name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }>
> {
  const packages = await fetchDokkaPackages(platform);
  const pkg = packages.find((p) => p.name === packageName);
  if (!pkg) {
    throw new Error(`Package "${packageName}" not found in Dokka index`);
  }
  const key = `dokkaPackageSymbols@${pkg.url}@${platform || "all"}`;
  return cached<Array<{ kind: string; name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }>>(key, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(pkg.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Dokka package page: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const platMap: Record<string, string> = {
      common: ":miuix/commonMain",
      android: ":miuix/androidMain",
      desktop: ":miuix/desktopMain",
      ios: ":miuix/iosMain",
      js: ":miuix/jsMain",
      macos: ":miuix/macosMain",
      wasmJs: ":miuix/wasmJsMain",
    };
    const platFilter = platform ? platMap[platform] : undefined;
    const base = dokkaBase().replace(/\/+$/, "");
    const results: Array<{ kind: string; name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }> = [];
    const getSectionTable = (name: "TYPE" | "PROPERTY" | "FUNCTION"): string => {
      const sectionIdx = html.search(new RegExp(`<div\\s+data-togglable="${name}[^"]*"`, "i"));
      if (sectionIdx < 0) return "";
      const tableIdx = html.indexOf(`<div class="table">`, sectionIdx);
      if (tableIdx < 0) return "";
      const sliceDiv = (source: string, start: number): string => {
        const openEnd = source.indexOf(">", start);
        if (openEnd < 0) return "";
        let i = openEnd + 1;
        let depth = 1;
        let out = source.slice(start, i);
        while (i < source.length) {
          const openIdx = source.indexOf("<div", i);
          const closeIdx = source.indexOf("</div>", i);
          if (openIdx >= 0 && openIdx < closeIdx) {
            out += source.slice(i, openIdx);
            const openTagEnd = source.indexOf(">", openIdx);
            if (openTagEnd < 0) break;
            depth++;
            out += source.slice(openIdx, openTagEnd + 1);
            i = openTagEnd + 1;
            continue;
          }
          if (closeIdx >= 0) {
            out += source.slice(i, closeIdx + 6);
            depth--;
            i = closeIdx + 6;
            if (depth === 0) break;
            continue;
          }
          break;
        }
        return out;
      };
      const tableHtml = sliceDiv(html, tableIdx);
      return tableHtml;
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
        const idx = tableHtml.indexOf(row);
        const winStart = Math.max(0, idx - 1000);
        const winEnd = Math.min(tableHtml.length, idx + 2000);
        const win = tableHtml.slice(winStart, winEnd);
        const platformTagMatch = /data-filterable-current="([^"]+)"/.exec(win) || /data-filterable-set="([^"]+)"/.exec(win) || /data-togglable="([^"]+)"/.exec(win);
        const platformTag = platformTagMatch?.[1] ?? "";
        if (platFilter && platformTag && platformTag !== platFilter) continue;
        const symMatch = /<div class="symbol monospace">([\s\S]*?)<\/div>/.exec(row);
        const signature = symMatch && symMatch[1] ? symMatch[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "";
        if (signature) {
          if (kind === "Type") {
            const m = /^(?:class|interface|enum|object)\s+([A-Za-z0-9_]+)/i.exec(signature);
            if (m?.[1]) name = m[1];
          } else if (kind === "Function") {
            const m = /(?:^|[\s])fun\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
            if (m?.[1]) name = m[1];
          } else if (kind === "Property") {
            const m = /(?:^|[\s])(val|var)\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
            if (m?.[2]) name = m[2];
          }
        }
        name = name.replace(/\s+/g, "");
        let url: string;
        if (href.startsWith("http")) {
          url = href;
        } else if (/^\/miuix\//.test(href)) {
          url = new URL(href, dokkaBase()).toString();
        } else if (/^[-][A-Za-z0-9_.-]+(?:\/index\.html|\.html)?$/.test(href)) {
          const pkgDir = pkg.url.replace(/index\.html$/, "");
          url = `${pkgDir}${href.replace(/^\/+/, "")}`;
        } else {
          url = new URL(href, pkg.url).toString();
        }
        let params: Array<{ name: string; type: string; default?: string }> = [];
        if (kind === "Function") {
          const nameIdx = signature.indexOf(name);
          const openIdx = signature.indexOf("(", nameIdx >= 0 ? nameIdx : 0);
          if (openIdx >= 0) {
            let i = openIdx + 1;
            let depthParen = 1;
            let depthAngle = 0;
            let buf = "";
            while (i < signature.length && depthParen > 0) {
              const ch = signature[i];
              if (ch === "(") depthParen++;
              else if (ch === ")") depthParen--;
              else if (ch === "<") depthAngle++;
              else if (ch === ">") depthAngle = Math.max(0, depthAngle - 1);
              if (depthParen > 0) buf += ch;
              i++;
            }
            const rawParams = buf.trim();
            if (rawParams.length > 0) {
              const parts: string[] = [];
              let partBuf = "";
              let pDepth = 0;
              let aDepth = 0;
              for (let j = 0; j < rawParams.length; j++) {
                const ch = rawParams[j];
                if (ch === "(") pDepth++;
                else if (ch === ")") pDepth = Math.max(0, pDepth - 1);
                else if (ch === "<") aDepth++;
                else if (ch === ">") aDepth = Math.max(0, aDepth - 1);
                if (ch === "," && pDepth === 0 && aDepth === 0) {
                  const s = partBuf.trim();
                  if (s.length > 0) parts.push(s);
                  partBuf = "";
                  continue;
                }
                partBuf += ch;
              }
              const last = partBuf.trim();
              if (last.length > 0) parts.push(last);
              for (const part of parts) {
                let token = part.trim();
                token = token.replace(/\b(vararg|noinline|crossinline|inline|reified)\b/g, "").trim();
                const colonIdx = token.indexOf(":");
                if (colonIdx > 0) {
                  const pName = token.slice(0, colonIdx).trim();
                  let typeDefault = token.slice(colonIdx + 1).trim();
                  let def: string | undefined;
                  const eqIdx = typeDefault.indexOf("=");
                  if (eqIdx > 0) {
                    def = typeDefault.slice(eqIdx + 1).trim();
                    typeDefault = typeDefault.slice(0, eqIdx).trim();
                  }
                  params.push({ name: pName, type: typeDefault, default: def });
                }
              }
            }
          }
        }
        results.push({ kind, name, url, platform: platformTag || undefined, signature, params });
      }
    };
    parseRows(getSectionTable("TYPE"), "Type");
    parseRows(getSectionTable("PROPERTY"), "Property");
    parseRows(getSectionTable("FUNCTION"), "Function");
    if (results.length === 0) {
      const fallbackRowRegex = /<div class="table-row table-row_content"[\s\S]*?<\/div>\s*<\/div>/g;
      let m: RegExpExecArray | null;
      while ((m = fallbackRowRegex.exec(html)) !== null) {
        const row = m[0];
        const symMatch = /<div class="symbol monospace">([\s\S]*?)<\/div>/.exec(row);
        const signature = symMatch && symMatch[1] ? symMatch[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "";
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
        const idx = html.indexOf(row);
        const winStart = Math.max(0, idx - 1000);
        const winEnd = Math.min(html.length, idx + 2000);
        const win = html.slice(winStart, winEnd);
        const platformTagMatch = /data-filterable-current="([^"]+)"/.exec(win) || /data-filterable-set="([^"]+)"/.exec(win) || /data-togglable="([^"]+)"/.exec(win);
        const platformTag = platformTagMatch?.[1] ?? "";
        if (platFilter && platformTag && platformTag !== platFilter) continue;
        let url: string;
        if (href.startsWith("http")) {
          url = href;
        } else if (/^\/miuix\//.test(href)) {
          url = new URL(href, dokkaBase()).toString();
        } else if (/^[-][A-Za-z0-9_.-]+(?:\/index\.html|\.html)?$/.test(href)) {
          const pkgDir = pkg.url.replace(/index\.html$/, "");
          url = `${pkgDir}${href.replace(/^\/+/, "")}`;
        } else {
          url = new URL(href, pkg.url).toString();
        }
        let params: Array<{ name: string; type: string; default?: string }> = [];
        if (kind === "Function") {
          const nameIdx = signature.indexOf(name);
          const openIdx = signature.indexOf("(", nameIdx >= 0 ? nameIdx : 0);
          if (openIdx >= 0) {
            let i = openIdx + 1;
            let depthParen = 1;
            let depthAngle = 0;
            let buf = "";
            while (i < signature.length && depthParen > 0) {
              const ch = signature[i];
              if (ch === "(") depthParen++;
              else if (ch === ")") depthParen--;
              else if (ch === "<") depthAngle++;
              else if (ch === ">") depthAngle = Math.max(0, depthAngle - 1);
              if (depthParen > 0) buf += ch;
              i++;
            }
            const rawParams = buf.trim();
            if (rawParams.length > 0) {
              const parts: string[] = [];
              let partBuf = "";
              let pDepth = 0;
              let aDepth = 0;
              for (let j = 0; j < rawParams.length; j++) {
                const ch = rawParams[j];
                if (ch === "(") pDepth++;
                else if (ch === ")") pDepth = Math.max(0, pDepth - 1);
                else if (ch === "<") aDepth++;
                else if (ch === ">") aDepth = Math.max(0, aDepth - 1);
                if (ch === "," && pDepth === 0 && aDepth === 0) {
                  const s = partBuf.trim();
                  if (s.length > 0) parts.push(s);
                  partBuf = "";
                  continue;
                }
                partBuf += ch;
              }
              const last = partBuf.trim();
              if (last.length > 0) parts.push(last);
              for (const part of parts) {
                let token = part.trim();
                token = token.replace(/\b(vararg|noinline|crossinline|inline|reified)\b/g, "").trim();
                const colonIdx = token.indexOf(":");
                if (colonIdx > 0) {
                  const pName = token.slice(0, colonIdx).trim();
                  let typeDefault = token.slice(colonIdx + 1).trim();
                  let def: string | undefined;
                  const eqIdx = typeDefault.indexOf("=");
                  if (eqIdx > 0) {
                    def = typeDefault.slice(eqIdx + 1).trim();
                    typeDefault = typeDefault.slice(0, eqIdx).trim();
                  }
                  params.push({ name: pName, type: typeDefault, default: def });
                }
              }
            }
          }
        }
        results.push({ kind, name, url, platform: platformTag || undefined, signature, params });
      }
    }
    if (process.env.DEBUG_DOKKA === "1") {
      console.log(`[DEBUG] fetchDokkaPackageSymbols(${packageName}) results=${results.length}`);
    }
    return results;
  });
}

export async function searchDokka(query: string, limit: number = 20): Promise<
  Array<{ type: "package" | "symbol"; module: string; package?: string; name: string; url: string; kind?: string }>
> {
  const q = query.trim().toLowerCase();
  const qNoSpaces = q.replace(/\s+/g, "");
  if (!q) return [];
  const packages = await fetchDokkaPackages();
  const pkgMatches = packages.filter((p) => p.name.toLowerCase().includes(q));
  const results: Array<{ type: "package" | "symbol"; module: string; package?: string; name: string; url: string; kind?: string }> = [];
  for (const p of pkgMatches) {
    results.push({ type: "package", module: "miuix", package: p.name, name: p.name, url: p.url });
    if (results.length >= limit) return results.slice(0, limit);
  }
  const rankedPackages = packages
    .map((p) => ({ p, score: p.name.toLowerCase().includes(q) ? 2 : (p.name.toLowerCase().startsWith(q) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, packages.length))
    .map((x) => x.p);
  for (const p of rankedPackages) {
    const packageName = p.name;
    const symbols = await fetchDokkaPackageItems(packageName);
    for (const s of symbols) {
      const nameLower = s.name.toLowerCase();
      const nameLowerNoSpaces = nameLower.replace(/\s+/g, "");
      if (nameLower.includes(q) || nameLower.startsWith(q) || (qNoSpaces && nameLowerNoSpaces.includes(qNoSpaces))) {
        results.push({ type: "symbol", module: "miuix", package: packageName, name: s.name, url: s.url, kind: s.kind });
        if (results.length >= limit) return results.slice(0, limit);
      }
    }
    if (results.length >= limit) break;
  }
  if (results.length < limit) {
    const scanned = new Set(rankedPackages.map((x) => x.name));
    for (const p of packages) {
      if (scanned.has(p.name)) continue;
      const packageName = p.name;
      const symbols = await fetchDokkaPackageItems(packageName);
      for (const s of symbols) {
        const nameLower = s.name.toLowerCase();
        if (nameLower.includes(q) || nameLower.startsWith(q)) {
          results.push({ type: "symbol", module: "miuix", package: packageName, name: s.name, url: s.url, kind: s.kind });
          if (results.length >= limit) return results.slice(0, limit);
        }
      }
      if (results.length >= limit) break;
    }
  }
  return results.slice(0, limit);
}

function dokkaBase(): string {
  const base = String(config.MIUIX_DOCS_URL || "").replace(/\/+$/, "");
  return `${base}/dokka`;
}

export async function fetchDokkaPackages(platform?: "common" | "android" | "desktop" | "ios" | "js" | "macos" | "wasmJs"): Promise<Array<{ name: string; url: string; platform?: string }>> {
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
    const anchorRegex = /<a href="(miuix\/top\.yukonga\.miuix\.kmp\.[^"]+\/index\.html)">([^<]+)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
      const href = (match?.[1] ?? "");
      const name = (match?.[2] ?? "").trim();
      const url = `${base}/${href}`;
      results.push({ name, url });
    }
    if (results.length === 0) {
      throw new Error("No packages parsed from Dokka index");
    }
    const unique = Array.from(new Map(results.map((r) => [r.name, r])).values());
    unique.sort((a, b) => a.name.localeCompare(b.name));
    return unique;
  });
}

export async function fetchDokkaPackageItems(packageName: string, platform?: "common" | "android" | "desktop" | "ios" | "js" | "macos" | "wasmJs"): Promise<Array<{ kind: string; name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }>> {
  const packages = await fetchDokkaPackages(platform);
  const pkg = packages.find((p) => p.name === packageName);
  if (!pkg) {
    throw new Error(`Package "${packageName}" not found in Dokka index`);
  }
  return fetchDokkaPackageSymbols(packageName, platform);
}

export async function fetchDokkaClassMembers(typeUrl: string, platform?: "common" | "android" | "desktop" | "ios" | "js" | "macos" | "wasmJs"): Promise<{
  constructors: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }>;
  functions: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }>;
  properties: Array<{ name: string; url: string; platform?: string; signature?: string }>;
}> {
  const key = `dokkaClassMembers@${typeUrl}@${platform || "all"}@v2`;
  return cached(key, 6 * 60 * 60 * 1000, async () => {
    const response = await fetch(typeUrl);
    if (!response.ok) {
      if (response.status === 404) {
        return { constructors: [], functions: [], properties: [] };
      }
      throw new Error(`Failed to fetch Dokka type page: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const platMap: Record<string, string> = {
      common: ":miuix/commonMain",
      android: ":miuix/androidMain",
      desktop: ":miuix/desktopMain",
      ios: ":miuix/iosMain",
      js: ":miuix/jsMain",
      macos: ":miuix/macosMain",
      wasmJs: ":miuix/wasmJsMain",
    };
    const platFilter = platform ? platMap[platform] : undefined;
    const base = dokkaBase().replace(/\/+$/, "");
    const constructors: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }> = [];
    const functions: Array<{ name: string; url: string; platform?: string; signature?: string; params?: Array<{ name: string; type: string; default?: string }> }> = [];
    const properties: Array<{ name: string; url: string; platform?: string; signature?: string }> = [];
    const rowRegex = /<div class="table-row table-row_content"[\s\S]*?>\s*<\/div>\s*<\/div>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[0];
      const symMatch = /<div class="symbol monospace">([\s\S]*?)<\/div>/.exec(row);
      if (!symMatch) continue;
      const signatureHtml = symMatch[1] || "";
      const signature = signatureHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      const anchorMatch = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
      if (!anchorMatch) continue;
      const href = String(anchorMatch[1] || "");
      const rawNameHtml = String(anchorMatch[2] || "");
      if (!href || !rawNameHtml) continue;
      let name = rawNameHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const idx = typeof (rowMatch as any).index === "number" ? (rowMatch as any).index : html.indexOf(row);
      const winStart = Math.max(0, idx - 1000);
      const winEnd = Math.min(html.length, idx + 2000);
      const win = html.slice(winStart, winEnd);
      const platformTagMatch = /data-filterable-current="([^"]+)"/.exec(win) || /data-filterable-set="([^"]+)"/.exec(win) || /data-togglable="([^"]+)"/.exec(win);
      const platformTag = platformTagMatch?.[1] ?? "";
      if (platFilter && platformTag && platformTag !== platFilter) continue;
      const url = href.startsWith("http") ? href : new URL(href, typeUrl).toString();
      if (signature) {
        const typeNameMatch = /^(?:class|interface|enum|object)\s+([A-Za-z0-9_]+)/i.exec(signature);
        const funNameMatch = /(?:^|[\s])fun\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
        const propNameMatch = /(?:^|[\s])(val|var)\s+(?:[A-Za-z0-9_.]+\s*\.\s*)?([A-Za-z0-9_]+)/i.exec(signature);
        if (typeNameMatch?.[1]) name = typeNameMatch[1];
        else if (funNameMatch?.[1]) name = funNameMatch[1];
        else if (propNameMatch?.[2]) name = propNameMatch[2];
      }
      name = name.replace(/\s+/g, "");
      if (/^(?:constructor)\s*\(/i.test(signature)) {
        let params: Array<{ name: string; type: string; default?: string }> = [];
        const nameIdx = signature.indexOf("constructor");
        const openIdx = signature.indexOf("(", nameIdx >= 0 ? nameIdx : 0);
        if (openIdx >= 0) {
          let i = openIdx + 1;
          let depthParen = 1;
          let depthAngle = 0;
          let buf = "";
          while (i < signature.length && depthParen > 0) {
            const ch = signature[i];
            if (ch === "(") depthParen++;
            else if (ch === ")") depthParen--;
            else if (ch === "<") depthAngle++;
            else if (ch === ">") depthAngle = Math.max(0, depthAngle - 1);
            if (depthParen > 0) buf += ch;
            i++;
          }
          const rawParams = buf.trim();
          if (rawParams.length > 0) {
            const parts: string[] = [];
            let partBuf = "";
            let pDepth = 0;
            let aDepth = 0;
            for (let j = 0; j < rawParams.length; j++) {
              const ch = rawParams[j];
              if (ch === "(") pDepth++;
              else if (ch === ")") pDepth = Math.max(0, pDepth - 1);
              else if (ch === "<") aDepth++;
              else if (ch === ">") aDepth = Math.max(0, aDepth - 1);
              if (ch === "," && pDepth === 0 && aDepth === 0) {
                const s = partBuf.trim();
                if (s.length > 0) parts.push(s);
                partBuf = "";
                continue;
              }
              partBuf += ch;
            }
            const last = partBuf.trim();
            if (last.length > 0) parts.push(last);
            for (const part of parts) {
              let token = part.trim();
              token = token.replace(/\b(vararg|noinline|crossinline|inline|reified)\b/g, "").trim();
              const colonIdx = token.indexOf(":");
              if (colonIdx > 0) {
                const pName = token.slice(0, colonIdx).trim();
                let typeDefault = token.slice(colonIdx + 1).trim();
                let def: string | undefined;
                const eqIdx = typeDefault.indexOf("=");
                if (eqIdx > 0) {
                  def = typeDefault.slice(eqIdx + 1).trim();
                  typeDefault = typeDefault.slice(0, eqIdx).trim();
                }
                params.push({ name: pName, type: typeDefault, default: def });
              }
            }
          }
        }
        constructors.push({ name, url, platform: platformTag || undefined, signature, params });
        continue;
      }
      if (/^(?:open\s+|override\s+|inline\s+|suspend\s+)*fun\s/i.test(signature)) {
        let params: Array<{ name: string; type: string; default?: string }> = [];
        const nameIdx = signature.indexOf(name);
        const openIdx = signature.indexOf("(", nameIdx >= 0 ? nameIdx : 0);
        if (openIdx >= 0) {
          let i = openIdx + 1;
          let depthParen = 1;
          let depthAngle = 0;
          let buf = "";
          while (i < signature.length && depthParen > 0) {
            const ch = signature[i];
            if (ch === "(") depthParen++;
            else if (ch === ")") depthParen--;
            else if (ch === "<") depthAngle++;
            else if (ch === ">") depthAngle = Math.max(0, depthAngle - 1);
            if (depthParen > 0) buf += ch;
            i++;
          }
          const rawParams = buf.trim();
          if (rawParams.length > 0) {
            const parts: string[] = [];
            let partBuf = "";
            let pDepth = 0;
            let aDepth = 0;
            for (let j = 0; j < rawParams.length; j++) {
              const ch = rawParams[j];
              if (ch === "(") pDepth++;
              else if (ch === ")") pDepth = Math.max(0, pDepth - 1);
              else if (ch === "<") aDepth++;
              else if (ch === ">") aDepth = Math.max(0, aDepth - 1);
              if (ch === "," && pDepth === 0 && aDepth === 0) {
                const s = partBuf.trim();
                if (s.length > 0) parts.push(s);
                partBuf = "";
                continue;
              }
              partBuf += ch;
            }
            const last = partBuf.trim();
            if (last.length > 0) parts.push(last);
            for (const part of parts) {
              let token = part.trim();
              token = token.replace(/\b(vararg|noinline|crossinline|inline|reified)\b/g, "").trim();
              const colonIdx = token.indexOf(":");
              if (colonIdx > 0) {
                const pName = token.slice(0, colonIdx).trim();
                let typeDefault = token.slice(colonIdx + 1).trim();
                let def: string | undefined;
                const eqIdx = typeDefault.indexOf("=");
                if (eqIdx > 0) {
                  def = typeDefault.slice(eqIdx + 1).trim();
                  typeDefault = typeDefault.slice(0, eqIdx).trim();
                }
                params.push({ name: pName, type: typeDefault, default: def });
              }
            }
          }
        }
        functions.push({ name, url, platform: platformTag || undefined, signature, params });
        continue;
      }
      if (/^(?:val|var)\s/i.test(signature)) {
        properties.push({ name, url, platform: platformTag || undefined, signature });
        continue;
      }
    }
    return { constructors, functions, properties };
  });
}

// Removed unused export: fetchDokkaPage

export async function fetchExamplePathContents(subpath: string = ""): Promise<Array<{ name: string; path: string; type: string; url: string; download_url: string | null }>> {
  const ref = await getGithubRef();
  const base = "https://api.github.com/repos/compose-miuix-ui/miuix/contents/example";
  const url = subpath ? `${base}/${subpath}?ref=${encodeURIComponent(ref)}` : `${base}?ref=${encodeURIComponent(ref)}`;
  return cached<Array<{ name: string; path: string; type: string; url: string; download_url: string | null }>>(
    `examplePath@${ref}@${subpath || "/"}`,
    2 * 60 * 60 * 1000,
    async () => {
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
    }
  );
}

export async function fetchExampleFile(filePath: string): Promise<string> {
  const ref = await getGithubRef();
  const url = `https://raw.githubusercontent.com/compose-miuix-ui/miuix/${ref}/example/${filePath}`;
  return cached<string>(`exampleFile@${filePath}@${ref}`, 24 * 60 * 60 * 1000, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Example file "${filePath}" not found.`);
      }
      throw new Error(`Failed to fetch example file "${filePath}": ${response.status} ${response.statusText}`);
    }
    return await response.text();
  });
}

export async function fetchExampleTree(): Promise<Array<{ name: string; path: string; type: "tree" | "blob"; size?: number; sha: string; raw_url: string | null }>> {
  const ref = await getGithubRef();
  const url = `https://api.github.com/repos/compose-miuix-ui/miuix/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  return cached<Array<{ name: string; path: string; type: "tree" | "blob"; size?: number; sha: string; raw_url: string | null }>>(
    `exampleTree@${ref}`,
    6 * 60 * 60 * 1000,
    async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch repository tree: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const tree = Array.isArray((data as { tree?: any }).tree) ? (data as { tree: any[] }).tree : [];

      const filtered = tree.filter((item: any) => typeof item.path === "string" && item.path.startsWith("example/"));
      return filtered.map((item: any) => {
        const name = item.path.split("/").pop() ?? item.path;
        const rawUrl = item.type === "blob" ? `https://raw.githubusercontent.com/compose-miuix-ui/miuix/${ref}/${item.path}` : null;
        return {
          name,
          path: item.path,
          type: item.type,
          size: item.size,
          sha: item.sha,
          raw_url: rawUrl,
        };
      });
    }
  );
}
