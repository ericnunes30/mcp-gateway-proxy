---
phase: plan
task: T1
feature: 01.mcp-gateway-proxy
timestamp: 2026-07-13T18:29:48.152Z
attempt: 1
---

needsResearch: false

Plan for T1 — Project Scaffolding:

1. **package.json** — name: mcp-tool-search, version: 0.0.1, type: module, bin: { "mcp-tool-search": "bin/mcp-tool-search.js" }, deps: @modelcontextprotocol/sdk ^1.25.1, open ^10.2.0, recheck ^4.5.0, typebox ^1.1.24, zod ^4.0.0; devDeps: @types/node ^20, @types/open ^6.2.1, tsx ^4.21.0, typescript ^5.0.0, vitest ^3.0.0. Scripts: test, test:watch, test:coverage, typecheck. Remove Pi fields and @earendil-works/* deps.

2. **tsconfig.json** — ES2022, NodeNext module, NodeNext resolution, allowImportingTsExtensions, esModuleInterop, skipLibCheck, noEmit, strict: true, include src + __tests__ + *.ts

3. **vitest.config.ts** — globals: true, environment: node, include __tests__/**/*.test.ts, coverage v8

4. **bin/mcp-tool-search.js** — shebang stub importing ../dist/cli.js

5. **.gitignore** — node_modules, dist, *.log, .env, .DS_Store, coverage, .cache, *.tsbuildinfo

6. **src/ tree** — empty .ts files (export {}) for all 27 modules per design.md

7. **__tests__/.gitkeep**

8. **git init** + initial commit

Verification: npm install succeeds, tsc --noEmit passes, no Pi deps, .git exists.