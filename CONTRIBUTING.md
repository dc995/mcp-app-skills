# Contributing

## Principles

- Keep portable skills separate from product-specific or machine-specific
  architecture.
- Treat upstream specifications as normative and empirical host behavior as
  dated evidence.
- Never commit credentials, private source code, personal contact details or
  absolute local paths.
- Security and compatibility are separate review gates.

## Host capability changes

1. Create or update an evidence note under `evidence/`.
2. Record host/runtime/SDK versions, minimal reproduction and observed result.
3. Update `mcp-app-hosts/host-matrix.json`.
4. Update the matrix revision and host `last-validated` date.
5. Run the repository verification commands.
6. Regenerate the host summary with `node scripts/generate-host-summary.mjs`.

Do not set an untested capability to `true` or `false`; use `unvalidated`.

## Verification

```bash
cd mcp-app-ext/mcp-server
npm ci
npm run typecheck
npm run validate:matrix
npm run smoke
npm audit --omit=dev
cd ../..
node scripts/validate-repo.mjs
node scripts/generate-host-summary.mjs --check
```

Pull requests should explain the source of each protocol/host claim and the
negative tests used for security-sensitive changes.
