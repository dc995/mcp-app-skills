import { spawnSync } from "node:child_process";

const ALLOWED_ADVISORIES = new Set([
  "https://github.com/advisories/GHSA-frvp-7c67-39w9",
]);
const ALLOWED_CHAIN = new Set([
  "@hono/node-server",
  "@modelcontextprotocol/sdk",
]);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (!result.stdout) {
  process.stderr.write(result.stderr || "npm audit produced no JSON output.\n");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(1);
}

const vulnerabilities = Object.entries(report.vulnerabilities ?? {});
const unexpected = vulnerabilities.filter(([name, vulnerability]) => {
  if (!ALLOWED_CHAIN.has(name)) return true;
  return vulnerability.via.some((via) =>
    typeof via === "string"
      ? !ALLOWED_CHAIN.has(via)
      : !ALLOWED_ADVISORIES.has(via.url),
  );
});

if (unexpected.length > 0) {
  console.error("Production dependency audit found non-allowlisted vulnerabilities:");
  for (const [name, vulnerability] of unexpected) {
    console.error(`- ${name}: ${vulnerability.severity}`);
  }
  process.exit(1);
}

if (vulnerabilities.length > 0) {
  console.warn(
    "Allowed advisory GHSA-frvp-7c67-39w9 remains in @modelcontextprotocol/sdk's " +
      "@hono/node-server dependency. This stdio server does not expose serve-static; " +
      "review the exception when the SDK permits @hono/node-server >=2.0.5.",
  );
}

console.log("Production dependency audit passed with no unexpected vulnerabilities.");
