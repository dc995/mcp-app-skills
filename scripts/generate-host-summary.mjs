import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX_PATH = path.join(ROOT, "mcp-app-hosts", "host-matrix.json");
const DOC_PATH = path.join(ROOT, "mcp-app-hosts", "SKILL.md");
const BEGIN = "<!-- BEGIN GENERATED HOST SUMMARY -->";
const END = "<!-- END GENERATED HOST SUMMARY -->";

const matrix = JSON.parse(await readFile(MATRIX_PATH, "utf-8"));
const hostIds = Object.keys(matrix.hosts);
const labels = {
  vscode: "VS Code",
  apphub: "AppHub",
  standalone: "Standalone",
  copilothub: "CopilotHub",
};
const rows = [
  ["`eval()` / `new Function()`", ["features", "eval"]],
  ["External `<script src>` CDN", ["features", "cdn-script-tags"]],
  ["External UI `fetch()`", ["features", "fetch-external"]],
  ["External media source", ["features", "external-media-src"]],
  ["Media autoplay", ["features", "media-autoplay"]],
  ["`window.open()`", ["features", "window-open"]],
  ["Microphone", ["sandbox", "microphone"]],
  ["Camera", ["sandbox", "camera"]],
  ["Geolocation", ["sandbox", "geolocation"]],
  ["Canvas 2D", ["features", "canvas-2d"]],
  ["WebGL", ["features", "webgl"]],
  ["Web Workers", ["features", "web-workers"]],
  ["WebSockets", ["features", "websockets"]],
  ["Nested iframes", ["features", "nested-iframes"]],
  ["Sampling (`createMessage`)", ["server-initiated", "sampling"]],
  ["Elicitation (`elicitInput`)", ["server-initiated", "elicitation"]],
];

function get(value, segments) {
  let current = value;
  for (const segment of segments) current = current?.[segment];
  return current;
}

function format(value) {
  if (value === true) return "Yes";
  if (value === false) return "**NO**";
  if (value === "varies") return "Varies";
  if (value === "unvalidated") return "Unvalidated";
  return "Unknown";
}

const header = `| Capability | ${hostIds.map((id) => labels[id] ?? id).join(" | ")} |`;
const separator = `|---|${hostIds.map(() => "---").join("|")}|`;
const body = rows.map(
  ([name, capabilityPath]) =>
    `| ${name} | ${hostIds
      .map((id) => format(get(matrix.hosts[id], capabilityPath)))
      .join(" | ")} |`,
);
const generated = [BEGIN, header, separator, ...body, END].join("\n");

const document = await readFile(DOC_PATH, "utf-8");
const start = document.indexOf(BEGIN);
const end = document.indexOf(END);
if (start < 0 || end < start) throw new Error("Generated host summary markers not found");
const next =
  document.slice(0, start) +
  generated +
  document.slice(end + END.length);

if (process.argv.includes("--check")) {
  if (next !== document) {
    console.error("mcp-app-hosts/SKILL.md host summary is out of date");
    process.exit(1);
  }
  console.log("Generated host summary is current.");
} else {
  await writeFile(DOC_PATH, next);
  console.log("Updated mcp-app-hosts/SKILL.md host summary.");
}
