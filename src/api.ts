import { config } from "./config.js";

export async function fetchComponents(): Promise<string[]> {
  const url = `${config.MIUIX_DOCS_URL}/component.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch components from ${url}: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid response format: expected an array");
    }

    return data as string[];
  } catch (error) {
    throw error;
  }
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
