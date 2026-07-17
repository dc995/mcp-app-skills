import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const hostsDir = path.resolve(here, "..", "..", "mcp-app-hosts");
const schema = JSON.parse(
  await readFile(path.join(hostsDir, "host-matrix.schema.json"), "utf-8"),
);
const matrix = JSON.parse(
  await readFile(path.join(hostsDir, "host-matrix.json"), "utf-8"),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date", {
  type: "string",
  validate(value) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value;
  },
});
const validate = ajv.compile(schema);

if (!validate(matrix)) {
  console.error(ajv.errorsText(validate.errors, { separator: "\n" }));
  process.exit(1);
}

console.log("host-matrix.json conforms to host-matrix.schema.json");
