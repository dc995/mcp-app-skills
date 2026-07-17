#!/usr/bin/env node
/**
 * mcp-app-ext MCP server (Conductor's active layer).
 *
 * Turns the markdown skills into CALLABLE tools so any agent gets the behavior by
 * SENSING reality, not by being trusted to have read the instructions. This is a
 * runnable policy server: the tools below work against the repo's own
 * `host-matrix.json` and skill files. It also validates the matrix, intersects
 * multiple hosts and performs bounded compatibility/security scans.
 *
 * Transport: stdio (works in every MCP host). Run with `npm start` and register:
 *   { "mcp-app-ext": { "type": "stdio", "command": "node",
 *                       "args": ["dist/index.js"], "cwd": "<this dir>" } }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  FEATURE_PATHS,
  getCapabilityStatus,
  loadMatrix,
  validateMatrix,
  type Matrix,
} from "./matrix.js";
import { parseScanRoots, scanApp } from "./scan.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// {dist,src}/ → mcp-server/ → mcp-app-ext/ → repo root (three levels up).
const SKILLS_ROOT = path.resolve(HERE, "..", "..", "..");
const HOSTS_DIR = path.join(SKILLS_ROOT, "mcp-app-hosts");
const MATRIX_PATH = path.join(HOSTS_DIR, "host-matrix.json");
const SCAN_ROOTS = parseScanRoots(
  process.env.MCP_APP_SCAN_ROOTS,
  process.cwd(),
);

const GUIDANCE_FILES: Record<string, string> = {
  build: "mcp-app-build/SKILL.md",
  "pre-build-check": "mcp-app-build/pre-build-check.md",
  scaffold: "mcp-app-build/scaffold.md",
  patterns: "mcp-app-build/patterns.md",
  sampling: "mcp-app-build/sampling.md",
  audit: "mcp-app-audit/SKILL.md",
  security: "mcp-app-security/SKILL.md",
  "security-threat-model": "mcp-app-security/threat-model.md",
  "host-security": "mcp-app-security/host-security.md",
  "server-security": "mcp-app-security/server-security.md",
  hosts: "mcp-app-hosts/SKILL.md",
  "host-rendering": "mcp-app-hosts/host-rendering.md",
  "copilot-sdk-host": "mcp-app-hosts/copilot-sdk-host.md",
  vscode: "mcp-app-hosts/vscode.md",
  test: "mcp-app-test/SKILL.md",
};

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

async function isWithinAllowedScanRoot(appPath: string): Promise<boolean> {
  const requested = await realpath(path.resolve(appPath));
  const allowedRoots = await Promise.all(
    SCAN_ROOTS.map(async (root) => {
      try {
        return await realpath(root);
      } catch {
        return root;
      }
    }),
  );
  return allowedRoots.some((root) => {
    const relative = path.relative(root, requested);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

const server = new McpServer({ name: "mcp-app-ext", version: "0.2.0" });

type CompatibilityFinding = {
  host: string;
  feature: string;
  status: "blocked" | "unvalidated";
  alternative: string;
};

function evaluateCompatibility(
  matrix: Matrix,
  hosts: string[],
  features: string[],
): {
  verdict: "PASS" | "BLOCKED" | "UNKNOWN";
  findings: CompatibilityFinding[];
} {
  const unknownFeatures = features.filter((feature) => !FEATURE_PATHS[feature]);
  if (unknownFeatures.length > 0) {
    throw new Error(
      `Unknown features: ${unknownFeatures.join(", ")}. Known: ${Object.keys(FEATURE_PATHS).join(", ")}`,
    );
  }

  const findings: CompatibilityFinding[] = [];
  for (const hostId of hosts) {
    const host = matrix.hosts[hostId];
    if (!host) {
      throw new Error(`Unknown host '${hostId}'. Known: ${Object.keys(matrix.hosts).join(", ")}`);
    }
    for (const feature of features) {
      const status = getCapabilityStatus(host, feature);
      if (status === false) {
        findings.push({
          host: hostId,
          feature,
          status: "blocked",
          alternative: SAFE_ALTERNATIVE[feature] ?? DEFAULT_ALTERNATIVE,
        });
      } else if (status !== true) {
        findings.push({
          host: hostId,
          feature,
          status: "unvalidated",
          alternative: "Treat as unavailable until a dated host probe records evidence.",
        });
      }
    }
  }

  const verdict = findings.some((finding) => finding.status === "blocked")
    ? "BLOCKED"
    : findings.length > 0
      ? "UNKNOWN"
      : "PASS";
  return { verdict, findings };
}

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
      const matrix = await loadMatrix(MATRIX_PATH);
      if (host) {
        const h = matrix.hosts[host];
        if (!h) return fail(`Unknown host '${host}'. Known: ${Object.keys(matrix.hosts).join(", ")}`);
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
      "call it BEFORE writing app code. Unvalidated capabilities return UNKNOWN. Feature names: " +
      Object.keys(FEATURE_PATHS).join(", ") + ".",
    inputSchema: {
      host: z.string().describe("Target host id, e.g. 'vscode'."),
      features: z.array(z.string()).describe("Planned features, from the known feature names."),
    },
  },
  async ({ host, features }) => {
    try {
      const matrix = await loadMatrix(MATRIX_PATH);
      const result = evaluateCompatibility(matrix, [host], features);
      return ok(
        JSON.stringify(
          {
            ...result,
            host,
            evidence: `host-matrix.json@${matrix.revision}`,
            advice:
              result.verdict === "PASS"
                ? "All requested capabilities are supported by dated evidence for this host."
                : "Resolve blocked capabilities and validate unknown capabilities on every target host.",
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
  "external-media": "Use host-mediated playback or a host-approved same-origin media resource; enforce server egress limits.",
  "media-autoplay": "Play on a user gesture; do not rely on autoplay in a sandboxed frame.",
  "web-speech": "Pre-synthesize on the server or degrade gracefully; Web Speech is blocked in strict hosts.",
  "nested-iframes": "Flatten the UI; strict hosts disallow nested iframes.",
  "window-open": "Use host-mediated ui/open-link or a server-side authorization flow.",
  microphone: "Provide text/file input and request a host permission only where explicitly supported.",
  camera: "Provide file upload or manual input fallback.",
  geolocation: "Use explicit user-entered location or a server-side approved lookup.",
  "clipboard-write": "Provide a selectable text fallback and require a user gesture.",
  sampling: "Ship a deterministic Display-Frame fallback.",
  elicitation: "Use a normal app form or plain tool input fallback.",
  "resource-subscriptions": "Use polling or explicit refresh where subscriptions are unavailable.",
};
const DEFAULT_ALTERNATIVE =
  "Use a structured, least-privilege, server-mediated approach and retain a fallback.";

// 3) check_multi_host_compatibility — intersection across declared targets.
server.registerTool(
  "check_multi_host_compatibility",
  {
    title: "Check compatibility across target hosts",
    description:
      "Intersect planned features across multiple target hosts. Returns BLOCKED for known " +
      "unsupported capabilities and UNKNOWN for unvalidated/variable capabilities.",
    inputSchema: {
      hosts: z.array(z.string()).min(1),
      features: z.array(z.string()),
    },
  },
  async ({ hosts, features }) => {
    try {
      const matrix = await loadMatrix(MATRIX_PATH);
      const result = evaluateCompatibility(matrix, hosts, features);
      return ok(
        JSON.stringify(
          { ...result, hosts, evidence: `host-matrix.json@${matrix.revision}` },
          null,
          2,
        ),
      );
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

// 4) validate_host_matrix — schema + completeness/evidence consistency.
server.registerTool(
  "validate_host_matrix",
  {
    title: "Validate the host capability matrix",
    description:
      "Validate matrix structure, feature completeness, revision dates and local evidence links.",
    inputSchema: {},
  },
  async () => ok(JSON.stringify(await validateMatrix(MATRIX_PATH, SKILLS_ROOT), null, 2)),
);

// 5) scan_app — bounded static compatibility/security scan.
server.registerTool(
  "scan_app",
  {
    title: "Scan an MCP App directory",
    description:
      "Run a bounded heuristic scan for CSP, iframe, transport, SSRF, OAuth, XSS, TLS and secret risks. " +
      "Returns file/line/rule metadata without returning source contents.",
    inputSchema: {
      appPath: z.string().min(1).describe("Absolute or current-process-relative app directory."),
    },
  },
  async ({ appPath }) => {
    try {
      if (!(await isWithinAllowedScanRoot(appPath))) {
        return fail(
          `Scan path is outside MCP_APP_SCAN_ROOTS. Allowed roots: ${SCAN_ROOTS.join(", ")}`,
        );
      }
      return ok(JSON.stringify(await scanApp(appPath), null, 2));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
);

// 6) get_guidance — return the relevant skill section text (the same source the
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

// 7) scaffold — point at the canonical templates for a stack layer. EXTENSION
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
      server: { from: "mcp-app-build/scaffold.md", note: "MCP server: secure transport boundary + tool + ui:// resource; stateful transport if required." },
      app: { from: "mcp-app-build/scaffold.md", note: "UI resource (main.ts/html): consume host styles, data-driven render, single-file bundle." },
      host: { from: "mcp-app-hosts/host-rendering.md", note: "Web/React host: different-origin sandbox, CSP, dual _meta read, theming, validated bridge." },
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
  console.error("mcp-app-ext server ready (stdio). Tools: list_host_capabilities, check_compatibility, check_multi_host_compatibility, validate_host_matrix, scan_app, get_guidance, scaffold.");
}

main().catch((e) => {
  console.error("mcp-app-ext failed to start:", e);
  process.exit(1);
});
