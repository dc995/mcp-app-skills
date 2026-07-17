import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type Severity = "critical" | "important" | "warning";

export type ScanFinding = {
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
};

const MAX_FILES = 1_000;
const MAX_FILE_BYTES = 1_000_000;
const SOURCE_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage"]);

export function parseScanRoots(
  configured: string | undefined,
  cwd: string,
  delimiter = path.delimiter,
): string[] {
  const entries =
    configured === undefined
      ? [cwd]
      : configured
          .split(delimiter)
          .map((root) => root.trim())
          .filter(Boolean);
  if (entries.length === 0) {
    throw new Error("MCP_APP_SCAN_ROOTS contains no valid paths");
  }
  return entries.map((root) => path.resolve(root));
}

const LINE_RULES: Array<{
  rule: string;
  severity: Severity;
  pattern: RegExp;
  message: string;
}> = [
  {
    rule: "dynamic-code",
    severity: "critical",
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(|setTimeout\s*\(\s*["'`]/,
    message: "Dynamic string-to-code execution crosses CSP and code-injection boundaries.",
  },
  {
    rule: "external-active-resource",
    severity: "important",
    pattern: /<(script|link|iframe)\b[^>]+(?:src|href)=["']https?:\/\//i,
    message: "External active resource requires host CSP review and supply-chain controls.",
  },
  {
    rule: "unsafe-dom-html",
    severity: "important",
    pattern: /\.innerHTML\s*=|insertAdjacentHTML\s*\(/,
    message: "Render untrusted tool/model content with text APIs or a reviewed sanitizer.",
  },
  {
    rule: "unrestricted-cors",
    severity: "important",
    pattern: /\bcors\s*\(\s*\)/,
    message: "Unrestricted CORS is not Origin validation and is unsafe for network-reachable servers.",
  },
  {
    rule: "network-bind-all",
    severity: "important",
    pattern: /["']0\.0\.0\.0["']/,
    message: "Local MCP servers should bind loopback unless remote access is intentional and authenticated.",
  },
  {
    rule: "tls-verification-disabled",
    severity: "critical",
    pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/,
    message: "Process-wide TLS verification is disabled.",
  },
  {
    rule: "dynamic-server-fetch",
    severity: "critical",
    pattern: /\bfetch\s*\(\s*(?:url\b|req\.|args\.|input\.)/,
    message: "User-controlled server fetch requires SSRF destination, redirect, timeout and size policy.",
  },
  {
    rule: "auto-approve-tools",
    severity: "important",
    pattern: /\bapproveAll\b|skipPermission\s*:\s*true/,
    message: "Automatic tool approval requires an explicit first-party trust boundary and allowlist.",
  },
  {
    rule: "model-context-injection",
    severity: "important",
    pattern: /\bupdateModelContext\s*\(|["']ui\/update-model-context["']/,
    message: "Model-context updates must label external/UI text as untrusted data and constrain its purpose.",
  },
  {
    rule: "hardcoded-secret",
    severity: "critical",
    pattern: /\b(api[_-]?key|client[_-]?secret|access[_-]?token|password)\b\s*[:=]\s*["'][^"'$<]{8,}["']/i,
    message: "Potential hardcoded credential. Use a runtime credential reference.",
  },
];

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
        if (files.length > MAX_FILES) throw new Error(`Scan exceeds ${MAX_FILES} files`);
      }
    }
  }
  await walk(root);
  return files;
}

export async function scanApp(appPath: string): Promise<{
  root: string;
  filesScanned: number;
  findings: ScanFinding[];
}> {
  const root = path.resolve(appPath);
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error(`App path is not a directory: ${root}`);

  const findings: ScanFinding[] = [];
  const files = await collectFiles(root);
  for (const file of files) {
    const fileInfo = await stat(file);
    if (fileInfo.size > MAX_FILE_BYTES) continue;
    const text = await readFile(file, "utf-8");
    const relative = path.relative(root, file);
    const lines = text.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (/^\s*pattern:\s*\//.test(line)) continue;
      for (const rule of LINE_RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line)) {
          findings.push({
            rule: rule.rule,
            severity: rule.severity,
            file: relative,
            line: index + 1,
            message: rule.message,
          });
        }
      }
    }

    if (
      /addEventListener\s*\(\s*["']message["']/.test(text) &&
      !/event\.source\s*!==?\s*[^;\n]*contentWindow/.test(text)
    ) {
      findings.push({
        rule: "postmessage-source-validation",
        severity: "critical",
        file: relative,
        line: 1,
        message: "Message bridge does not visibly bind events to the expected iframe contentWindow.",
      });
    }

    if (
      /srcdoc/i.test(text) &&
      /allow-scripts[^"'`\n]*allow-same-origin|allow-same-origin[^"'`\n]*allow-scripts/i.test(text)
    ) {
      findings.push({
        rule: "same-origin-srcdoc",
        severity: "critical",
        file: relative,
        line: 1,
        message: "Same-origin srcdoc with allow-scripts and allow-same-origin can compromise the host origin.",
      });
    }

    if (/\/auth\/callback/.test(text) && !/\bstate\b/.test(text)) {
      findings.push({
        rule: "oauth-state",
        severity: "critical",
        file: relative,
        line: 1,
        message: "OAuth callback is present without visible state validation.",
      });
    }
  }

  return {
    root,
    filesScanned: files.length,
    findings: findings.sort((a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule),
    ),
  };
}
