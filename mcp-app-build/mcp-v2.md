# MCP 2026-07-28 — Generic Build and Migration Guidance

Use MCP `2026-07-28` for new protocol work. Treat older sessionful behavior as
an explicit compatibility profile, not as the architecture of the app.

This guide covers the MCP core protocol. The MCP Apps iframe protocol is a
separate extension: its `ui/initialize` and `ui/notifications/initialized`
lifecycle is not removed by the core protocol migration.

## Start with the official SDK v2 packages

The TypeScript SDK v2 is a package split, not an in-place upgrade of
`@modelcontextprotocol/sdk`:

- `@modelcontextprotocol/server`
- `@modelcontextprotocol/client`
- `@modelcontextprotocol/core`
- a runtime adapter such as `@modelcontextprotocol/node`

Run the official v1-to-v2 codemod at the package root and follow the SDK
migration guide. Do not hand-roll discovery, routing, MRTR, error, or
dual-version behavior.

Some extension packages may temporarily peer on the v1 monolith. When that
happens, keep v1 and v2 behind separate adapters. Imports must make the intended
protocol era visible, and removing v1 is a separate lifecycle decision.

## Modern requests are self-contained

Modern requests do not use the core `initialize` handshake or
`Mcp-Session-Id`. Each request carries its protocol version, client identity,
and client capabilities in `_meta`.

- Clients use `server/discover` when discovery is needed.
- HTTP requests carry `MCP-Protocol-Version`.
- HTTP requests carry `Mcp-Method` and, for named operations, `Mcp-Name`.
- Reject disagreement between routing headers and the JSON-RPC body.
- A modern claim, parse failure, authorization failure, or handler failure must
  never silently downgrade into the legacy profile.
- HTTP serving creates independent per-request server instances.
- Modern stdio serving uses the SDK's version-aware `serveStdio` entry point.

Pin `2026-07-28` when the endpoint is required to be modern. Use automatic
negotiation only at an explicit compatibility boundary.

## Cache metadata, not protocol sessions

List and discovery results can advertise `ttlMs` and `cacheScope`.

- Cache only safe discovery and list metadata.
- Honor the advertised TTL.
- Partition private cache entries by authenticated principal and Realm.
- Never share backend URLs, credentials, private capabilities, or private
  results across Realm partitions.
- A fresh request transport is not the same thing as re-fetching every
  cacheable catalog on every call.

## Keep application state explicit

Stateless MCP does not require stateless applications. Replace hidden transport
identity with an explicit opaque application handle in ordinary tool arguments.

An application handle should:

- contain no credentials or sensitive state;
- resolve server-side to the real state;
- bind to the authenticated subject and Realm;
- expire;
- fail closed for missing, expired, cross-subject, or cross-Realm use;
- support explicit close or cancel where the workflow needs lifecycle control.

Do not confuse application handles with MRTR `requestState`. Application handles
span separate tool calls. `requestState` carries one multi-round-trip operation
between retries.

## Use MRTR for input required during a call

Modern server-to-client interaction uses Multi Round-Trip Requests rather than
an unsolicited request over a held-open protocol session.

The server returns `resultType: "input_required"` with bounded input requests
and optional `requestState`. The client obtains the required input and retries
the original operation with `inputResponses`.

- Treat `requestState` as untrusted client-carried data.
- Integrity-protect it and bind it to the principal, Realm, method, relevant
  parameters, phase, and expiry.
- Add replay or single-use controls where repeating the operation has effects.
- Preserve cancellation and decline as normal outcomes when the workflow can
  continue safely.

MRTR is a delivery pattern. It is not a strategic replacement for deprecated
host Sampling.

## Do not expand deprecated core features

Roots, Sampling, and MCP Logging are deprecated in `2026-07-28`.

- Pass files and resources through explicit, validated tool inputs or resource
  URIs instead of adopting Roots for new work.
- Prefer an explicit model-provider connection for server-side model work.
  Do not create new strategic dependencies on `sampling/createMessage`.
  Modern MRTR may still embed a deprecated Sampling request; a client that
  supports that compatibility path must advertise the capability and register
  the corresponding handler before retrying the operation.
- Use stderr for stdio diagnostics and OpenTelemetry or the environment's
  structured logging system instead of adopting MCP Logging.

Put product behavior behind a protocol-neutral service before replacing a
deprecated capability. A configured modern connection is authoritative: do not
silently fall back to a different model, identity, or billing boundary after it
fails.

## Connections and credentials remain separate from the app

Model providers, data sources, and remote MCP servers are connections:
source + transport/tool + credential reference + Realm.

The app declares what it needs. The connection resolves credentials at the
edge. Secret bytes never enter prompts, tool arguments, UI state, logs, cache
keys, application handles, or `requestState`.

## Authorization and observability

- Authorize the trusted principal and Realm before backend discovery, cache
  lookup, connection creation, or tool execution.
- Validate OAuth issuer information and bind client registrations and tokens to
  the issuer that created them.
- Prefer Client ID Metadata Documents; keep Dynamic Client Registration only as
  bounded compatibility where required.
- Propagate approved trace context through request `_meta`, with size limits and
  redaction. Do not put credentials or unrestricted baggage there.

## Extensions are independently versioned

Negotiate MCP Apps through `io.modelcontextprotocol/ui` and Tasks through
`io.modelcontextprotocol/tasks`. Keep extension compatibility separate from the
core protocol profile.

For MCP Apps:

- retain the iframe `ui/initialize` lifecycle;
- provide text fallback when the host does not support the UI extension;
- do not infer core MCP version from iframe bridge messages.

## Bounded legacy compatibility

Keep legacy support only when a declared host or dependency still requires it.

- Select the protocol profile before execution.
- Isolate v1 imports, session maps, SSE fallback, negotiated Sampling, and
  `Mcp-Session-Id` handling in a compatibility adapter.
- Preserve dated host observations as evidence for that path.
- Instrument use without collecting prompts, credentials, or sensitive data.
- Define an explicit removal condition; do not remove compatibility merely
  because the earliest deprecation date has arrived.

## Verification checklist

- Modern `tools/list` succeeds without `initialize` or `Mcp-Session-Id`.
- `server/discover` reports the supported modern version.
- Every modern request has the required `_meta` and routing headers.
- Header/body mismatch fails and never downgrades.
- Concurrent requests can use independent server instances.
- Outbound operations do not reuse a hidden protocol session.
- Private cache entries do not cross principal or Realm boundaries.
- Application handles reject cross-Realm, expired, and replayed use as
  appropriate.
- MRTR completes when the retry lands on another server instance.
- Legacy behavior is tested separately and remains explicitly selectable.
- MCP Apps `ui/initialize` still works independently.
- Run applicable official conformance scenarios against a pinned release or
  source revision; do not claim coverage from an older stable suite.
