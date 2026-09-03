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
const mcpV2GuidePath = path.join(ROOT, "mcp-app-build", "mcp-v2.md");
let mcpV2Guide = "";
try {
  mcpV2Guide = await readFile(mcpV2GuidePath, "utf-8");
} catch {
  fail(mcpV2GuidePath, "missing canonical MCP 2026-07-28 guidance");
}
for (const requiredGuidance of [
  "2026-07-28",
  "server/discover",
  "MCP-Protocol-Version",
  "Mcp-Method",
  "input_required",
  "requestState",
  "cacheScope",
  'cacheScope: "public" | "private"',
  "Realm is an application/deployment security-domain abstraction, not an MCP",
  "never trust a caller-supplied Realm label",
  "ui/initialize",
]) {
  if (!mcpV2Guide.includes(requiredGuidance)) {
    fail(mcpV2GuidePath, `MCP v2 guidance must include: ${requiredGuidance}`);
  }
}
if (!/legacy|compatibility/i.test(mcpV2Guide)) {
  fail(mcpV2GuidePath, "MCP v2 guidance must define a bounded legacy compatibility path");
}
for (const cacheableOperation of [
  "server/discover",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
  "resources/read",
]) {
  if (!mcpV2Guide.includes(`- \`${cacheableOperation}\``)) {
    fail(mcpV2GuidePath, `cache contract must require hints for: ${cacheableOperation}`);
  }
}
for (const mrtrRequirement of [
  "fulfill the",
  "inputRequests",
  "inputResponses",
  "exact `requestState`",
  "complete result from",
  "clients MUST NOT cache a result produced from a request carrying",
]) {
  if (!mcpV2Guide.includes(mrtrRequirement)) {
    fail(mcpV2GuidePath, `modern MRTR guidance must include: ${mrtrRequirement}`);
  }
}
const scaffoldGuidePath = path.join(ROOT, "mcp-app-build", "scaffold.md");
const scaffoldGuide = await readFile(scaffoldGuidePath, "utf-8");
for (const requiredGuidance of [
  'McpServer } from "@modelcontextprotocol/server"',
  'McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"',
  "createModernServer",
  "createLegacyAppServer",
]) {
  if (!scaffoldGuide.includes(requiredGuidance)) {
    fail(scaffoldGuidePath, `modern scaffold contract must include: ${requiredGuidance}`);
  }
}
if (!/createMcpHandler\(\(\)\s*=>\s*createModernServer\(\)/m.test(scaffoldGuide)) {
  fail(scaffoldGuidePath, "modern HTTP handler must create an SDK v2 server");
}
if (!/never pass a v1 `McpServer` object to a v2\s+handler/i.test(scaffoldGuide)) {
  fail(scaffoldGuidePath, "scaffold must prohibit mixing v1 and v2 server objects");
}
if (!/createLegacyAppServer\(\)\.connect\(new StdioServerTransport\(\)\)/m.test(scaffoldGuide)) {
  fail(scaffoldGuidePath, "legacy stdio entry point must use the v1 app server factory");
}
const serverApiGuidePath = path.join(ROOT, "mcp-app-test", "server-api.md");
const serverApiGuide = await readFile(serverApiGuidePath, "utf-8");
for (const requiredGuidance of [
  '"MCP-Protocol-Version": "2026-07-28"',
  '"Mcp-Method": method',
  '"Mcp-Name": encodeMcpHeaderValue(name)',
  "typeof params.name",
  "typeof params.uri",
  "=?base64?",
  "Mcp-Param-*",
]) {
  if (!serverApiGuide.includes(requiredGuidance)) {
    fail(serverApiGuidePath, `modern request guidance must include: ${requiredGuidance}`);
  }
  const copilotHostGuidePath = path.join(ROOT, "mcp-app-hosts", "copilot-sdk-host.md");
  const copilotHostGuide = await readFile(copilotHostGuidePath, "utf-8");
  for (const requiredGuidance of [
    "## Modern MRTR Sampling fulfillment",
    'result.resultType !== "input_required"',
    "inputResponses",
    "## Legacy v1 Sampling bridge",
    "only for a v1 compatibility adapter",
  ]) {
    if (!copilotHostGuide.includes(requiredGuidance)) {
      fail(copilotHostGuidePath, `host Sampling guidance must include: ${requiredGuidance}`);
    }
  }
}
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
if (
  !samplingGuide.includes("2026-07-28") ||
  !samplingGuide.includes("MRTR may embed a deprecated Sampling request") ||
  !samplingGuide.includes("unsolicited reverse channel") ||
  !samplingGuide.includes("stateful transport")
) {
  fail(
    samplingGuidePath,
    "sampling guidance must distinguish modern MRTR/direct-provider behavior from legacy sampling",
  );
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
