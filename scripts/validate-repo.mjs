import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage"]);
const TEXT_EXTENSIONS = new Set([".md", ".json", ".ts", ".js", ".mjs", ".yml", ".yaml"]);
const failures = [];

async function collectFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(full)));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function fail(file, message) {
  failures.push(`${relative(file)}: ${message}`);
}

const files = await collectFiles(ROOT);
for (const file of files) {
  const text = await readFile(file, "utf-8");
  const isValidator = file === fileURLToPath(import.meta.url);

  if (!isValidator && /(?:davidcra|dc995)@(microsoft\.com|hotmail\.com)/i.test(text)) {
    fail(file, "public artifact contains a personal/corporate email address");
  }
  if (!isValidator && /protocolVersion\s*:\s*["']2024-11-05["']/.test(text)) {
    fail(file, "hardcodes legacy MCP protocol version 2024-11-05");
  }
  if (!isValidator && /text\/html;\s*ext-apps/.test(text)) {
    fail(file, "contains the obsolete MCP App MIME type");
  }
  if (!isValidator && /\bAGENT\.md\b/.test(text)) {
    fail(file, "references obsolete mcp-app-ext/AGENT.md packaging");
  }

  if (file.endsWith(".md")) {
    for (const match of text.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
      const rawTarget = match[1].split("#")[0];
      if (!rawTarget || /^(https?:|mailto:|#)/.test(rawTarget) || rawTarget.startsWith("<")) {
        continue;
      }
      const target = path.resolve(path.dirname(file), decodeURIComponent(rawTarget));
      try {
        await stat(target);
      } catch {
        fail(file, `broken relative link: ${rawTarget}`);
      }
    }
  }
}

for (const skillFile of files.filter((file) => file.endsWith(`${path.sep}SKILL.md`))) {
  const text = await readFile(skillFile, "utf-8");
  if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(text)) {
    fail(skillFile, "missing YAML frontmatter");
  }
  if (!/^name:\s*\S+/m.test(text) || !/^description:\s*.+/m.test(text)) {
    fail(skillFile, "frontmatter must contain name and description");
  }
}

for (const agentFile of files.filter((file) => file.endsWith(".agent.md"))) {
  const text = await readFile(agentFile, "utf-8");
  if (!/^name:\s*\S+/m.test(text) || !/^description:\s*.+/m.test(text)) {
    fail(agentFile, "agent frontmatter must contain name and description");
  }
}

JSON.parse(await readFile(path.join(ROOT, "mcp-app-hosts", "host-matrix.json"), "utf-8"));
JSON.parse(
  await readFile(path.join(ROOT, "mcp-app-hosts", "host-matrix.schema.json"), "utf-8"),
);

if (failures.length > 0) {
  console.error(`Repository validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Repository validation passed (${files.length} text files checked).`);
