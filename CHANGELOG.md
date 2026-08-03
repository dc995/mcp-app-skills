# Changelog

## Unreleased

### Added

- Dedicated `mcp-app-security` skill and threat-model references
- Host matrix JSON Schema, evidence metadata and validation tool
- Multi-host compatibility and bounded static app scanning tools
- Installable Conductor `.agent.md` definition
- CI, dependency updates, contribution guidance and security policy
- Dated VS Code clipboard-image and sampling-authorization evidence
- Conditional capability requirements and image-delivery checks in the callable
  compatibility server

### Changed

- Updated MCP core examples to protocol version `2025-11-25`
- Updated MCP App MIME guidance to `text/html;profile=mcp-app`
- Replaced same-origin `srcdoc` host guidance with different-origin sandboxing
- Secured HTTP, session, OAuth, egress and model-context examples
- Reclassified host observations as dated evidence instead of universal guarantees
- Made generated host documentation stable across LF and CRLF checkouts
- Added Windows CI coverage and an advisory-specific production audit policy
