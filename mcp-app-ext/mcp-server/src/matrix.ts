import { readFile, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { z } from "zod";

export const CapabilityStatusSchema = z.union([
  z.boolean(),
  z.literal("unvalidated"),
  z.literal("varies"),
]);

const EvidenceSchema = z.object({
  kind: z.enum(["upstream", "empirical"]),
  date: z.string(),
  source: z.string().min(1),
  summary: z.string().min(1),
});

const HostSchema = z
  .object({
    name: z.string().min(1),
    transport: z.array(z.string()).min(1),
    tls: z.boolean(),
    csp: z.record(z.unknown()),
    sandbox: z.record(z.unknown()),
    "server-initiated": z.record(z.unknown()),
    "secure-context": z.boolean(),
    features: z.record(z.unknown()),
    bundling: z.record(z.unknown()),
    "last-validated": z.string(),
    evidence: z.array(EvidenceSchema).min(1),
  })
  .passthrough();

export const MatrixSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.string(),
  revision: z.string(),
  hosts: z.record(HostSchema),
  notes: z.string().optional(),
});

export type Matrix = z.infer<typeof MatrixSchema>;
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

function isIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export const FEATURE_PATHS: Record<string, readonly string[]> = {
  eval: ["features", "eval"],
  "new-function": ["features", "new-function"],
  "cdn-script": ["features", "cdn-script-tags"],
  "cdn-style": ["features", "cdn-link-tags"],
  "external-fetch": ["features", "fetch-external"],
  "external-media": ["features", "external-media-src"],
  "media-autoplay": ["features", "media-autoplay"],
  "web-speech": ["features", "web-speech-synthesis"],
  "nested-iframes": ["features", "nested-iframes"],
  webgl: ["features", "webgl"],
  canvas: ["features", "canvas-2d"],
  "web-workers": ["features", "web-workers"],
  websockets: ["features", "websockets"],
  "dynamic-import": ["features", "dynamic-import"],
  "window-open": ["features", "window-open"],
  microphone: ["sandbox", "microphone"],
  camera: ["sandbox", "camera"],
  geolocation: ["sandbox", "geolocation"],
  "clipboard-write": ["sandbox", "clipboard-write"],
  sampling: ["server-initiated", "sampling"],
  elicitation: ["server-initiated", "elicitation"],
  "resource-subscriptions": ["server-initiated", "resource-subscriptions"],
  "secure-context": ["secure-context"],
};

function valueAtPath(value: unknown, segments: readonly string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function getCapabilityStatus(
  host: Matrix["hosts"][string],
  feature: string,
): CapabilityStatus | undefined {
  const segments = FEATURE_PATHS[feature];
  if (!segments) return undefined;
  const value = valueAtPath(host, segments);
  const parsed = CapabilityStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export type MatrixValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export async function loadMatrix(matrixPath: string): Promise<Matrix> {
  const raw = JSON.parse(await readFile(matrixPath, "utf-8")) as unknown;
  const schemaReference =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).$schema
      : undefined;
  if (typeof schemaReference !== "string") {
    throw new Error("Matrix does not declare a $schema");
  }

  const matrixDirectory = await realpath(path.dirname(matrixPath));
  const schemaPath = await realpath(
    path.resolve(path.dirname(matrixPath), schemaReference),
  );
  if (!isWithin(matrixDirectory, schemaPath)) {
    throw new Error(`Schema path escapes the matrix directory: ${schemaReference}`);
  }

  const schema = JSON.parse(await readFile(schemaPath, "utf-8")) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat("date", { type: "string", validate: isIsoDate });
  const validate = ajv.compile(schema);
  if (!validate(raw)) {
    throw new Error(
      `JSON Schema validation failed:\n${ajv.errorsText(validate.errors, {
        separator: "\n",
      })}`,
    );
  }

  return MatrixSchema.parse(raw);
}

export async function validateMatrix(
  matrixPath: string,
  skillsRoot: string,
): Promise<MatrixValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let matrix: Matrix;

  try {
    matrix = await loadMatrix(matrixPath);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
    };
  }

  const latestEvidenceDate = Object.values(matrix.hosts)
    .flatMap((host) => host.evidence.map((entry) => entry.date))
    .sort()
    .at(-1);
  if (latestEvidenceDate && matrix.revision < latestEvidenceDate) {
    errors.push(
      `Matrix revision ${matrix.revision} predates evidence ${latestEvidenceDate}`,
    );
  }

  let evidenceRoot: string;
  try {
    evidenceRoot = await realpath(path.join(skillsRoot, "evidence"));
  } catch {
    errors.push(`Evidence directory not found under ${skillsRoot}`);
    return { valid: false, errors, warnings };
  }
  for (const [hostId, host] of Object.entries(matrix.hosts)) {
    for (const feature of Object.keys(FEATURE_PATHS)) {
      if (getCapabilityStatus(host, feature) === undefined) {
        errors.push(`Host '${hostId}' is missing capability '${feature}'`);
      }
    }
    for (const evidence of host.evidence) {
      if (/^https?:\/\//.test(evidence.source)) continue;
      const sourcePath = path.resolve(skillsRoot, evidence.source);
      if (!existsSync(sourcePath)) {
        errors.push(`Host '${hostId}' evidence not found: ${evidence.source}`);
        continue;
      }
      const sourceRealPath = await realpath(sourcePath);
      if (!isWithin(evidenceRoot, sourceRealPath)) {
        errors.push(
          `Host '${hostId}' evidence escapes the evidence directory: ${evidence.source}`,
        );
      }
    }
    if (host["last-validated"] > matrix.revision) {
      errors.push(
        `Host '${hostId}' last-validated ${host["last-validated"]} exceeds matrix revision ${matrix.revision}`,
      );
    }
  }

  if (Object.keys(matrix.hosts).length < 2) {
    warnings.push("Matrix contains fewer than two hosts; cross-host checks add little value.");
  }

  return { valid: errors.length === 0, errors, warnings };
}
