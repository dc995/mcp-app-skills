#!/usr/bin/env node
/**
 * mcp-app-ext MCP server (Conductor's active layer).
 *
 * Turns the markdown skills into CALLABLE tools so any agent gets the behavior by
 * SENSING reality, not by being trusted to have read the instructions. This is a
 * runnable skeleton: the four tools below work today against the repo's own
 * `host-matrix.json` and skill files; the marked extension points are where you
 * add deeper validation (e.g. static-scan an app dir, run cross-host checks).
 *
 * Transport: stdio (works in every MCP host). Run with `npm start` and register:
 *   { "mcp-app-ext": { "type": "stdio", "command": "node",
 *                       "args": ["dist/index.js"], "cwd": "<this dir>" } }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// {dist,src}/ → mcp-server/ → mcp-app-ext/ → repo root (three levels up).
const SKILLS_ROOT = path.resolve(HERE, "..", "..", "..");
const HOSTS_DIR = path.join(SKILLS_ROOT, "mcp-app-hosts");
const MATRIX_PATH = path.join(HOSTS_DIR, "host-matrix.json");

/** Map a human "planned feature" to the host-matrix `features` key it depends on. */
const FEATURE_KEYS: Record<string, string> = {
  eval: "eval",
  "new-function": "new-function",
  "cdn-script": "cdn-script-tags",
  "external-fetch": "fetch-external",
  "external-media": "external-media-src",
  "media-autoplay": "media-autoplay",
  "web-speech": "web-speech-synthesis",
  "nested-iframes": "nested-iframes",
  webgl: "webgl",
  canvas: "canvas-2d",
  "web-workers": "web-workers",
  websockets: "websockets",
  "dynamic-import": "dynamic-import",
};

const GUIDANCE_FILES: Record<string, string> = {
  build: "mcp-app-build/SKILL.md",
  "pre-build-check": "mcp-app-build/pre-build-check.md",
  scaffold: "mcp-app-build/scaffold.md",
  patterns: "mcp-app-build/patterns.md",
  sampling: "mcp-app-build/sampling.md",
  audit: "mcp-app-audit/SKILL.md",
  hosts: "mcp-app-hosts/SKILL.md",
  "host-rendering": "mcp-app-hosts/host-rendering.md",
  "copilot-sdk-host": "mcp-app-hosts/copilot-sdk-host.md",
  vscode: "mcp-app-hosts/vscode.md",
  test: "mcp-app-test/SKILL.md",
};

type Matrix = { version?: string; hosts?: Record<string, { name?: string; features?: Record<string, unknown> }> };

async function loadMatrix(): Promise<Matrix> {
  if (!existsSync(MATRIX_PATH)) throw new Error(`host-matrix.json not found at ${MATRIX_PATH}`);
  return JSON.parse(await readFile(MATRIX_PATH, "utf-8")) as Matrix;
}

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

const server = new McpServer({ name: "mcp-app-ext", version: "0.1.0" });

// 1) list_host_capabilities — the source-of-truth matrix, all hosts or one.
server.registerTool(
  "list_host_capabilities",
  {
    title: "List host capabilities",
    description:
      "Return the validated MCP App host capability matrix (CSP, sandbox, features). " +
      "Optionally narrow to one host id (e.g. 'vscode'). Use this to SENSE what a host allows " +
      "instead of guessing.",
    inputSchema: { host: z.string().optional().describe("Host id, e.g. 'vscode'. Omit for all.") },
  },
  async ({ host }) => {
    try {
      const matrix = await loadMatrix();
      if (host) {
        const h = matrix.hosts?.[host];
        if (!h) return fail(`Unknown host '${host}'. Known: ${Object.keys(matrix.hosts ?? {}).join(", ")}`);
        return ok(JSON.stringify({ host, ...h }, null, 2));
      }
      return ok(JSON.stringify(matrix, null, 2));
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

// 2) check_compatibility — the pre-build safety gate as a verifiable check.
server.registerTool(
  "check_compatibility",
  {
    title: "Check app compatibility against a host",
    description:
      "Given a target host and the features an app plans to use, return a pass/fail verdict with " +
      "the specific blockers and a safer alternative for each. This is the objective pre-build gate — " +
      "call it BEFORE writing app code. Feature names: " +
      Object.keys(FEATURE_KEYS).join(", ") + ".",
    inputSchema: {
      host: z.string().describe("Target host id, e.g. 'vscode'."),
      features: z.array(z.string()).describe("Planned features, from the known feature names."),
    },
  },
  async ({ host, features }) => {
    try {
      const matrix = await loadMatrix();
      const h = matrix.hosts?.[host];
      if (!h) return fail(`Unknown host '${host}'. Known: ${Object.keys(matrix.hosts ?? {}).join(", ")}`);
      const feats = h.features ?? {};
      const blockers: { feature: string; alternative: string }[] = [];
      for (const f of features) {
        const key = FEATURE_KEYS[f];
        if (!key) {
          blockers.push({ feature: f, alternative: `Unknown feature '${f}'. Known: ${Object.keys(FEATURE_KEYS).join(", ")}` });
          continue;
        }
        if (feats[key] !== true) blockers.push({ feature: f, alternative: SAFE_ALTERNATIVE[f] ?? "Use a data-driven / server-proxied approach (see mcp-app-build/patterns.md)." });
      }
      const verdict = blockers.length === 0 ? "PASS" : "BLOCKED";
      return ok(
        JSON.stringify(
          {
            verdict,
            host,
            evidence: `host-matrix.json@${matrix.version ?? "unknown"}`,
            blockers,
            advice:
              blockers.length === 0
                ? "All planned features are supported on this host."
                : "Rewrite each blocker per its alternative, or target a more permissive host. VS Code is the strictest validated host — pass there and you pass everywhere.",
          },
          null,
          2,
        ),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

const SAFE_ALTERNATIVE: Record<string, string> = {
  eval: "Replace code-string execution with DATA-DRIVEN rendering: pass structured data, render with DOM APIs.",
  "new-function": "Same as eval — no runtime code generation. Drive the UI from structured data.",
  "cdn-script": "Bundle the library with npm + vite-plugin-singlefile instead of an external <script src>.",
  "external-fetch": "Proxy the request through the MCP server (server.ts fetches, returns via tool result).",
  "external-media": "Proxy media bytes through the server and return same-origin (data: URL / embedded resource).",
  "media-autoplay": "Play on a user gesture; do not rely on autoplay in a sandboxed frame.",
  "web-speech": "Pre-synthesize on the server or degrade gracefully; Web Speech is blocked in strict hosts.",
  "nested-iframes": "Flatten the UI; strict hosts disallow nested iframes.",
};

// 3) get_guidance — return the relevant skill section text (the same source the
//    agent would read), so a host with this server connected needs no skill files.
server.registerTool(
  "get_guidance",
  {
    title: "Get skill guidance",
    description:
      "Return the full text of a skill topic so the calling agent has the authoritative procedure " +
      "even if the skill files aren't installed. Topics: " + Object.keys(GUIDANCE_FILES).join(", ") + ".",
    inputSchema: { topic: z.string().describe("One of the known topics.") },
  },
  async ({ topic }) => {
    const rel = GUIDANCE_FILES[topic];
    if (!rel) return fail(`Unknown topic '${topic}'. Known: ${Object.keys(GUIDANCE_FILES).join(", ")}`);
    const p = path.join(SKILLS_ROOT, rel);
    if (!existsSync(p)) return fail(`Guidance file missing: ${rel}`);
    return ok(await readFile(p, "utf-8"));
  },
);

// 4) scaffold — point at the canonical templates for a stack layer. EXTENSION
//    POINT: return ready-to-write file contents here once you've parameterized
//    them (name, port, framework) instead of only pointing at scaffold.md.
server.registerTool(
  "scaffold",
  {
    title: "Scaffold a stack layer",
    description:
      "Return the canonical scaffold guidance for a layer of the MCP App stack so you compose the " +
      "whole stack consistently. Layers: server, app, host, session.",
    inputSchema: { layer: z.enum(["server", "app", "host", "session"]).describe("Which stack layer.") },
  },
  async ({ layer }) => {
    const map: Record<string, { from: string; note: string }> = {
      server: { from: "mcp-app-build/scaffold.md", note: "MCP server: tool + ui:// resource, stateful transport if the app is stateful." },
      app: { from: "mcp-app-build/scaffold.md", note: "UI resource (main.ts/html): consume host styles, data-driven render, single-file bundle." },
      host: { from: "mcp-app-hosts/host-rendering.md", note: "Web/React host: iframe sandbox flags, CSP, dual _meta read, theming, bridge handshake." },
      session: { from: "mcp-app-hosts/copilot-sdk-host.md", note: "Bind & resume a session; re-hydrate tiles; host-side handle-relay repair." },
    };
    const entry = map[layer];
    const p = path.join(SKILLS_ROOT, entry.from);
    const body = existsSync(p) ? await readFile(p, "utf-8") : `(missing ${entry.from})`;
    return ok(`# Scaffold: ${layer}\n${entry.note}\n\nSource: ${entry.from}\n\n---\n\n${body}`);
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // stderr is safe for logs on stdio transport; stdout carries the protocol.
  console.error("mcp-app-ext server ready (stdio). Tools: list_host_capabilities, check_compatibility, get_guidance, scaffold.");
}

main().catch((e) => {
  console.error("mcp-app-ext failed to start:", e);
  process.exit(1);
});
