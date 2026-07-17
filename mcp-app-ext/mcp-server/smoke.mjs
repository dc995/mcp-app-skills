// Smoke test: drive the built server over stdio with raw JSON-RPC and assert the
// tool surface, matrix validation, compatibility checks and static scanner.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [path.join(here, "dist", "index.js")], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, MCP_APP_SCAN_ROOTS: os.tmpdir() },
});

let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let id = 0;
function rpc(method, params) {
  const myId = ++id;
  return new Promise((res, reject) => {
    const timer = setTimeout(() => {
      pending.delete(myId);
      reject(new Error(`RPC timeout: ${method}`));
    }, 5_000);
    pending.set(myId, (message) => {
      clearTimeout(timer);
      res(message);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const assert = (c, m) => { if (!c) { console.error("FAIL:", m); child.kill(); process.exit(1); } };

const init = await rpc("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
assert(init.result?.serverInfo?.name === "mcp-app-ext", "serverInfo.name");
notify("notifications/initialized", {});

const list = await rpc("tools/list", {});
const names = (list.result?.tools ?? []).map((t) => t.name).sort();
assert(
  JSON.stringify(names) ===
    JSON.stringify([
      "check_compatibility",
      "check_multi_host_compatibility",
      "get_guidance",
      "list_host_capabilities",
      "scaffold",
      "scan_app",
      "validate_host_matrix",
    ]),
  "tools/list: " + names,
);

const matrix = await rpc("tools/call", {
  name: "validate_host_matrix",
  arguments: {},
});
const matrixResult = JSON.parse(matrix.result.content[0].text);
assert(matrixResult.valid === true, "host matrix valid: " + JSON.stringify(matrixResult.errors));

// The callable validator must reject schema-invalid matrices, not only missing
// capabilities discovered by the secondary consistency pass.
const { loadMatrix, validateMatrix } = await import("./dist/matrix.js");
const { parseScanRoots } = await import("./dist/scan.js");
const parsedRoots = parseScanRoots(
  `${os.tmpdir()}${path.delimiter}`,
  here,
);
assert(parsedRoots.length === 1, "empty scan-root segments must not widen access");
const invalidMatrixDir = await mkdtemp(path.join(os.tmpdir(), "mcp-app-matrix-smoke-"));
try {
  const repoRoot = path.resolve(here, "..", "..");
  const hostsDir = path.join(repoRoot, "mcp-app-hosts");
  const schemaText = await readFile(path.join(hostsDir, "host-matrix.schema.json"), "utf-8");
  const invalidMatrix = JSON.parse(
    await readFile(path.join(hostsDir, "host-matrix.json"), "utf-8"),
  );
  delete invalidMatrix.hosts.vscode["server-initiated"];
  await writeFile(path.join(invalidMatrixDir, "host-matrix.schema.json"), schemaText);
  await writeFile(
    path.join(invalidMatrixDir, "host-matrix.json"),
    JSON.stringify(invalidMatrix),
  );
  const invalidResult = await validateMatrix(
    path.join(invalidMatrixDir, "host-matrix.json"),
    repoRoot,
  );
  assert(invalidResult.valid === false, "schema-invalid matrix must fail");
  assert(
    invalidResult.errors.some((error) => error.includes("JSON Schema validation failed")),
    "schema validation error should be reported",
  );
  let runtimeLoadRejected = false;
  try {
    await loadMatrix(path.join(invalidMatrixDir, "host-matrix.json"));
  } catch (error) {
    runtimeLoadRejected =
      error instanceof Error && error.message.includes("JSON Schema validation failed");
  }
  assert(runtimeLoadRejected, "runtime matrix loader must reject schema-invalid data");

  const escapedEvidenceMatrix = JSON.parse(
    await readFile(path.join(hostsDir, "host-matrix.json"), "utf-8"),
  );
  escapedEvidenceMatrix.hosts.vscode.evidence[0].source = "README.md";
  await writeFile(
    path.join(invalidMatrixDir, "host-matrix.json"),
    JSON.stringify(escapedEvidenceMatrix),
  );
  const escapedEvidenceResult = await validateMatrix(
    path.join(invalidMatrixDir, "host-matrix.json"),
    repoRoot,
  );
  assert(escapedEvidenceResult.valid === false, "escaped evidence path must fail");
  assert(
    escapedEvidenceResult.errors.some((error) =>
      error.includes("escapes the evidence directory"),
    ),
    "escaped evidence error should be reported",
  );
} finally {
  await rm(invalidMatrixDir, { recursive: true, force: true });
}

// VS Code blocks eval + external-fetch → expect BLOCKED with 2 blockers.
const chk = await rpc("tools/call", { name: "check_compatibility", arguments: { host: "vscode", features: ["eval", "external-fetch", "webgl"] } });
const verdict = JSON.parse(chk.result.content[0].text);
assert(verdict.verdict === "BLOCKED", "verdict BLOCKED");
assert(verdict.findings.length === 2, "2 blockers, got " + verdict.findings.length);
assert(verdict.findings.some((b) => b.feature === "eval"), "eval blocked");

// A safe-set-only app should PASS.
const chk2 = await rpc("tools/call", { name: "check_compatibility", arguments: { host: "vscode", features: ["webgl", "canvas", "web-workers"] } });
assert(JSON.parse(chk2.result.content[0].text).verdict === "PASS", "safe set PASS");

const multi = await rpc("tools/call", {
  name: "check_multi_host_compatibility",
  arguments: {
    hosts: ["vscode", "apphub"],
    features: ["canvas", "media-autoplay"],
  },
});
assert(JSON.parse(multi.result.content[0].text).verdict === "BLOCKED", "multi-host intersection");

const fixture = await mkdtemp(path.join(os.tmpdir(), "mcp-app-ext-smoke-"));
try {
  await writeFile(
    path.join(fixture, "host.ts"),
    `iframe.srcdoc = html;
iframe.sandbox = "allow-scripts allow-same-origin";
app.use(cors());
const response = await fetch(input.url);
`,
  );
  const scan = await rpc("tools/call", {
    name: "scan_app",
    arguments: { appPath: fixture },
  });
  const scanResult = JSON.parse(scan.result.content[0].text);
  assert(scanResult.findings.some((finding) => finding.rule === "same-origin-srcdoc"), "srcdoc scan");
  assert(scanResult.findings.some((finding) => finding.rule === "unrestricted-cors"), "CORS scan");
  assert(scanResult.findings.some((finding) => finding.rule === "dynamic-server-fetch"), "SSRF scan");
} finally {
  await rm(fixture, { recursive: true, force: true });
}

console.log(
  "SMOKE OK:",
  names.join(", "),
  "| matrix valid",
  "| vscode eval/fetch =",
  verdict.verdict,
  "| safe set = PASS",
);
child.kill();
