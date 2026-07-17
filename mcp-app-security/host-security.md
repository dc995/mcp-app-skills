# Custom Host Security

## Use a different-origin sandbox

The MCP Apps specification expects an intermediate sandbox document hosted on a
different origin from the host application.

```text
https://host.example             host UI, cookies, authenticated APIs
https://mcp-sandbox.example      sandbox proxy only, no host credentials
```

The sandbox proxy may use `allow-scripts allow-same-origin` because it is already
cross-origin from the host. Do not combine those flags with same-origin `srcdoc`
and assume CSP provides equivalent isolation.

## Sandbox policy

Start with:

```html
<iframe sandbox="allow-scripts"></iframe>
```

Add capabilities only when the resource declares them and host policy approves:

- `allow-same-origin`: only when the framed document is on the dedicated sandbox
  origin and requires storage/workers.
- `allow-popups`: only for approved link-opening behavior.
- `allow-popups-to-escape-sandbox`: high risk; prefer host-mediated `ui/open-link`.
- Camera, microphone, geolocation and clipboard: explicit per-resource grants.

## postMessage validation

```typescript
window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  const parsed = JsonRpcMessageSchema.safeParse(event.data);
  if (!parsed.success) return;
  if (serializedSize(event.data) > MAX_BRIDGE_MESSAGE_BYTES) return;
  routeAppMessage(parsed.data);
});
```

For an opaque sandbox origin, `event.origin` may be `"null"` and is not a useful
identity check. Bind each bridge to its exact `contentWindow`, validate every
message and maintain a request-ID table.

## Host-mediated actions

Validate all app requests:

- `tools/call`: tool exists, app is allowed to call it, input validates.
- `ui/open-link`: allow only approved `https:` destinations.
- `resources/read`: URI belongs to the connected server and permitted namespace.
- Sampling: apply model/tool/permission policy; do not automatically approve
  server-offered tools.
- Logging/model context: redact and size-limit before storage or model ingestion.

## CSP baseline

Use a restrictive default and intersect resource declarations with host policy:

```text
default-src 'none';
script-src 'unsafe-inline';
style-src 'unsafe-inline';
img-src data: blob:;
font-src data:;
connect-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none';
```

Never treat resource-declared domains as automatically trusted. Validate schemes,
normalize hostnames and apply an administrator-controlled maximum policy.
