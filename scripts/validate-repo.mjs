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

const hostMatrix = JSON.parse(
  await readFile(path.join(ROOT, "mcp-app-hosts", "host-matrix.json"), "utf-8"),
);
JSON.parse(
  await readFile(path.join(ROOT, "mcp-app-hosts", "host-matrix.schema.json"), "utf-8"),
);

const samplingGuidePath = path.join(ROOT, "mcp-app-build", "sampling.md");
const samplingGuide = await readFile(samplingGuidePath, "utf-8");
for (const requiredGuidance of [
  "chat.mcp.serverSampling",
  "allowedOutsideChat",
  "stateful transport",
  "Host authorization",
]) {
  if (!samplingGuide.includes(requiredGuidance)) {
    fail(
      samplingGuidePath,
      `sampling guidance must retain the VS Code authorization requirement: ${requiredGuidance}`,
    );
  }
}
if (!samplingGuide.includes("## The three requirements")) {
  fail(samplingGuidePath, "sampling guide must retain its three-requirement structure");
}

const vscode = hostMatrix.hosts?.vscode;
const samplingRequirements = vscode?.["server-initiated"]?.["sampling-requirements"];
for (const requirement of [
  "stateful-or-bidirectional-transport",
  "per-server-authorization:allowedOutsideChat-for-app-ui",
  "display-frame-fallback",
]) {
  if (!samplingRequirements?.includes(requirement)) {
    fail(
      path.join(ROOT, "mcp-app-hosts", "host-matrix.json"),
      `VS Code sampling requirements must include: ${requirement}`,
    );
  }
}
if (
  !vscode?.evidence?.some(
    (entry) =>
      entry.date === "2026-07-31" &&
      entry.source === "evidence/vscode-2026-07.md" &&
      /sampling authorization/i.test(entry.summary),
  )
) {
  fail(
    path.join(ROOT, "mcp-app-hosts", "host-matrix.json"),
    "VS Code sampling authorization must have a dated, scoped evidence entry",
  );
}

const vscodeGuidePath = path.join(ROOT, "mcp-app-hosts", "vscode.md");
const vscodeGuide = await readFile(vscodeGuidePath, "utf-8");
if (
  !vscodeGuide.includes("chat.mcp.serverSampling") ||
  !vscodeGuide.includes('stopReason: "cancelled"')
) {
  fail(
    vscodeGuidePath,
    "VS Code guidance must distinguish sampling authorization refusal from capability/transport failure",
  );
}

const conductorPath = path.join(ROOT, "mcp-app-ext", "SKILL.md");
const conductor = await readFile(conductorPath, "utf-8");
if (/runs there runs\s+everywhere/i.test(conductor)) {
  fail(conductorPath, "must not infer universal host compatibility from a VS Code pass");
}

if (failures.length > 0) {
  console.error(`Repository validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Repository validation passed (${files.length} text files checked).`);
