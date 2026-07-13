---
phase: research
task: SPEC
feature: 01.mcp-gateway-proxy
timestamp: 2026-07-13T18:17:37.922Z
attempt: 1
---

Architectural analysis of pi-mcp-adapter reference codebase for mcp-tool-search (mcp-gateway-proxy) spec creation. See full analysis in the conversation. Key findings: pi-mcp-adapter's downstream connection management, config loading, cache, auth, lifecycle, and output guard are fully generic and portable. Pi-specific parts (UI panels, setup wizard, consent, sampling with Pi models, elicitation) are dropped. The standalone tool replaces Pi extension API with MCP SDK server-side API (StdioServerTransport). Config format (ServerEntry, McpSettings, McpConfig) is reused verbatim as it's a superset of standard MCP schema.