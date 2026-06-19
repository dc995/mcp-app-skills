// Smoke test: drive the built server over stdio with raw JSON-RPC and assert the
// four tools list and check_compatibility returns a real verdict from the matrix.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [path.join(here, "dist", "index.js")], { stdio: ["pipe", "pipe", "inherit"] });

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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});

let id = 0;
function rpc(method, params) {
  const myId = ++id;
  return new Promise((res) => {
    pending.set(myId, res);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const assert = (c, m) => { if (!c) { console.error("FAIL:", m); child.kill(); process.exit(1); } };

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
assert(init.result?.serverInfo?.name === "mcp-app-ext", "serverInfo.name");
notify("notifications/initialized", {});

const list = await rpc("tools/list", {});
const names = (list.result?.tools ?? []).map((t) => t.name).sort();
assert(JSON.stringify(names) === JSON.stringify(["check_compatibility", "get_guidance", "list_host_capabilities", "scaffold"]), "tools/list: " + names);

// VS Code blocks eval + external-fetch → expect BLOCKED with 2 blockers.
const chk = await rpc("tools/call", { name: "check_compatibility", arguments: { host: "vscode", features: ["eval", "external-fetch", "webgl"] } });
const verdict = JSON.parse(chk.result.content[0].text);
assert(verdict.verdict === "BLOCKED", "verdict BLOCKED");
assert(verdict.blockers.length === 2, "2 blockers, got " + verdict.blockers.length);
assert(verdict.blockers.some((b) => b.feature === "eval"), "eval blocked");

// A safe-set-only app should PASS.
const chk2 = await rpc("tools/call", { name: "check_compatibility", arguments: { host: "vscode", features: ["webgl", "canvas", "web-workers"] } });
assert(JSON.parse(chk2.result.content[0].text).verdict === "PASS", "safe set PASS");

console.log("SMOKE OK:", names.join(", "), "| vscode eval/fetch =", verdict.verdict, "| safe set = PASS");
child.kill();
process.exit(0);
