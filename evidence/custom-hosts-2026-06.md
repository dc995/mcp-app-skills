# First-party custom host validation — June 2026

**Evidence type:** empirical

The AppHub-style host observations came from a first-party custom web host built
alongside the MCP Apps under test. The host implemented the MCP Apps JSON-RPC
bridge, tool/resource proxying and tile lifecycle.

Security scope: the original host rendered reviewed first-party apps. Its
same-origin `srcdoc` design must not be generalized to arbitrary third-party MCP
servers. Public guidance therefore requires a different-origin sandbox proxy for
approved-partner and open-ecosystem trust modes.
