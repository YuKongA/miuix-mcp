import { z } from "zod";

const args = process.argv.slice(2);
const argMap = new Map<string, string>();
args.forEach((arg) => {
  if (arg.startsWith("--")) {
    const parts = arg.slice(2).split("=");
    const key = parts[0];
    const value = parts.slice(1).join("=");
    if (key && value) argMap.set(key, value);
  }
});

const isDev = process.env.NODE_ENV === "development";
const defaultUrl = isDev
  ? "http://localhost:5173/miuix/"
  : "https://compose-miuix-ui.github.io/miuix";

const envSchema = z.object({
  MIUIX_DOCS_URL: z.string().default(defaultUrl),
});

const parsed = envSchema.parse(process.env);

if (argMap.has("docs-url")) {
  parsed.MIUIX_DOCS_URL = argMap.get("docs-url")!;
}

export const config = parsed;
