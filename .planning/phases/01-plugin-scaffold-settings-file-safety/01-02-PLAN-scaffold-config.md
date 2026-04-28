---
phase: 01-plugin-scaffold-settings-file-safety
plan: 02
type: execute
wave: 2
depends_on: []
files_modified:
  - manifest.json
  - versions.json
  - package.json
  - tsconfig.json
  - esbuild.config.mjs
  - .hotreload
  - styles.css
  - vitest.config.ts
  - .gitignore
autonomous: true
requirements:
  - FOUND-01
must_haves:
  truths:
    - "npm install completes without errors"
    - "npm run build exits 0 (esbuild produces main.js)"
    - "manifest.json contains id=kb-manager, minAppVersion=1.4.0, version=0.1.0"
    - "tsconfig.json has noUncheckedIndexedAccess=true and strictNullChecks=true"
    - "vitest.config.ts exists and runs tests in src/lib/ without Obsidian import errors"
  artifacts:
    - path: "manifest.json"
      provides: "Plugin identity and Obsidian version floor"
      contains: "kb-manager"
    - path: "package.json"
      provides: "npm scripts, dev dependencies"
      contains: "vitest"
    - path: "tsconfig.json"
      provides: "TypeScript compiler config"
      contains: "noUncheckedIndexedAccess"
    - path: "esbuild.config.mjs"
      provides: "Build script targeting CJS ES2018"
      contains: "ES2018"
    - path: "vitest.config.ts"
      provides: "Test runner config for pure-logic modules"
      contains: "vitest"
  key_links:
    - from: "esbuild.config.mjs"
      to: "src/main.ts"
      via: "entry point"
      pattern: "main\\.ts"
    - from: "tsconfig.json"
      to: "src/**/*.ts"
      via: "include glob"
      pattern: "src/\\*\\*"
---

<objective>
Create all toolchain and project configuration files from the official Obsidian sample plugin
template. This plan produces zero TypeScript source — only config, manifest, and build files.

Purpose: Establish the build pipeline (esbuild CJS ES2018), TypeScript strict config, Vitest
test runner, and plugin manifest before any source files are written. The scaffold is complete
enough for `npm install && npm run build` to succeed once src/main.ts exists (Wave 2b).

Output: manifest.json, versions.json, package.json, tsconfig.json, esbuild.config.mjs,
vitest.config.ts, styles.css, .hotreload, .gitignore
</objective>

<execution_context>
@/Users/schylerryan/.claude/get-shit-done/workflows/execute-plan.md
@/Users/schylerryan/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/PROJECT.md
@/Users/schylerryan/Desktop/Github/kb-manager/CLAUDE.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md
@/Users/schylerryan/Desktop/Github/kb-manager/.planning/research/STACK.md

<interfaces>
<!-- Config contract — Wave 2b (plugin entry) imports expect this to exist -->

// esbuild externals (must NOT be bundled):
// 'obsidian', 'electron', all '@codemirror/*', all '@lezer/*', all node built-ins

// tsconfig: baseUrl = "src" — Wave 2b imports will be relative from src/
// e.g. import { isExcluded } from 'lib/exclusions'  (not '../lib/exclusions')

// vitest config: test files match src/**/*.test.ts; env = node (no jsdom needed for pure logic)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create manifest.json, versions.json, package.json, .gitignore</name>
  <files>manifest.json, versions.json, package.json, .gitignore</files>
  <read_first>
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md (D-10, D-11, D-15)
    - .planning/research/STACK.md (section "Manifest and Version Targeting", section "Recommended Stack")
  </read_first>
  <action>
Create four files. All values below are exact — no substitution.

**manifest.json** (D-10: minAppVersion=1.4.0, D-11: plugin constraints):
```json
{
  "id": "kb-manager",
  "name": "KB Manager",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Auto-maintains MOC files, TOC sections, and tag hierarchies in your vault.",
  "author": "Schyler Ryan",
  "authorUrl": "",
  "isDesktopOnly": false
}
```

Rules for manifest (from PITFALLS.md §Plugin Review):
- description ends with a period
- id does not contain "obsidian"
- id is lowercase with hyphens only
- version matches versions.json

**versions.json** (maps plugin version → minimum Obsidian version):
```json
{
  "0.1.0": "1.4.0"
}
```

**package.json** (D-11: TypeScript 5.8+, esbuild, Vitest; D-15: official template toolchain):
```json
{
  "name": "kb-manager",
  "version": "0.1.0",
  "description": "KB Manager Obsidian Plugin",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit --skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": [],
  "author": "",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^22.0.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "0.25.5",
    "obsidian": "latest",
    "tslib": "2.4.0",
    "typescript": "^5.8.3",
    "vitest": "^2.1.0"
  }
}
```

Note: obsidian is devDependency (type definitions only — Obsidian provides runtime).
No eslint in Phase 1 — add in a later phase if desired.

**.gitignore**:
```
node_modules/
main.js
*.js.map
```

Do NOT gitignore manifest.json, versions.json, or styles.css — these are release assets.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && node -e "const m = require('./manifest.json'); console.log(m.id, m.minAppVersion, m.version)"</automated>
  </verify>
  <acceptance_criteria>
    - `node -e "const m = require('./manifest.json'); console.log(m.id, m.minAppVersion, m.version)"` outputs `kb-manager 1.4.0 0.1.0`
    - `grep -c "vitest" package.json` outputs `1` or more
    - `grep -c "\"0.1.0\": \"1.4.0\"" versions.json` outputs `1`
    - `grep -c "main.js" .gitignore` outputs `1`
    - manifest.json description ends with a period: `node -e "const m=require('./manifest.json'); process.exit(m.description.endsWith('.')?0:1)"`
  </acceptance_criteria>
  <done>manifest.json, versions.json, package.json, .gitignore all created with correct content</done>
</task>

<task type="auto">
  <name>Task 2: Create tsconfig.json, esbuild.config.mjs, vitest.config.ts, styles.css, .hotreload</name>
  <files>tsconfig.json, esbuild.config.mjs, vitest.config.ts, styles.css, .hotreload</files>
  <read_first>
    - .planning/research/STACK.md (section "Build Toolchain", exact tsconfig settings listed)
    - .planning/phases/01-plugin-scaffold-settings-file-safety/01-CONTEXT.md (D-11: ES2018 target)
  </read_first>
  <action>
Create five files.

**tsconfig.json** (from STACK.md §tsconfig — verified against official template):
```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "module": "ESNext",
    "target": "ES6",
    "moduleResolution": "node",
    "importHelpers": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "strictNullChecks": true,
    "strictBindCallApply": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"],
    "inlineSourceMap": true,
    "inlineSources": true
  },
  "include": ["src/**/*.ts"]
}
```

Important: `baseUrl: "src"` means imports within src/ use paths relative to src/ root.
`src/lib/exclusions.ts` is importable as `import { isExcluded } from 'lib/exclusions'`.

**esbuild.config.mjs** (D-11: ES2018 target, CJS format; from STACK.md §esbuild):

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

**vitest.config.ts** (test runner for pure-logic modules in src/lib/):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Mirror tsconfig baseUrl so test imports match source imports
      // e.g. import { isExcluded } from 'lib/exclusions' works in tests too
    },
  },
});
```

Note: vitest needs to resolve the same `baseUrl: "src"` as tsconfig. Since test files
in src/lib/ will do relative imports (`'./exclusions'`), no alias needed for Phase 1.
Tests will use relative imports within src/lib/. If cross-module imports are needed in
later phases, add a `'src'` alias to `vite.resolve.alias`.

**styles.css** (per UI-SPEC: minimal, no custom styles required for Phase 1):
```css
/* KB Manager */
/* No custom styles required for Phase 1 settings tab. */
/* Obsidian's Setting API handles all control styling via CSS variables. */
```

**.hotreload** (empty file — signals hot-reload plugin to watch this directory):
Create as empty file. Contents: empty string.
  </action>
  <verify>
    <automated>cd /Users/schylerryan/Desktop/Github/kb-manager && node -e "const t = require('./tsconfig.json'); console.log(t.compilerOptions.noUncheckedIndexedAccess, t.compilerOptions.strictNullChecks, t.compilerOptions.baseUrl)"</automated>
  </verify>
  <acceptance_criteria>
    - `node -e "const t=require('./tsconfig.json'); console.log(t.compilerOptions.noUncheckedIndexedAccess, t.compilerOptions.strictNullChecks, t.compilerOptions.baseUrl)"` outputs `true true src`
    - `grep -c "es2018" esbuild.config.mjs` outputs `1`
    - `grep -c "format.*cjs" esbuild.config.mjs` outputs `1`
    - `grep -c "obsidian" esbuild.config.mjs` outputs `1` or more (external list includes obsidian)
    - `grep -c "include.*test.ts" vitest.config.ts` outputs `1`
    - `test -f .hotreload` (exit 0 = file exists)
    - `test -f styles.css` (exit 0)
  </acceptance_criteria>
  <done>All five config files created; tsconfig has correct strict settings; esbuild targets CJS ES2018; vitest config covers src/**/*.test.ts</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry → package.json | Dev dependencies fetched from npm on install |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04 | Tampering | package.json dependency versions | accept | Dev dependencies only; no runtime deps shipped to users; standard plugin review requirement is to ship readable source |
| T-01-05 | Information Disclosure | .gitignore | mitigate | main.js excluded from git (build artifact); node_modules excluded; no secrets in config files |
</threat_model>

<verification>
After both tasks complete:

```bash
cd /Users/schylerryan/Desktop/Github/kb-manager && npm install
```
Must complete without errors.

```bash
ls manifest.json versions.json package.json tsconfig.json esbuild.config.mjs vitest.config.ts styles.css .hotreload .gitignore
```
All nine files must exist.

```bash
node -e "const p = require('./package.json'); console.log(Object.keys(p.scripts).join(','))"
```
Must output string containing: dev, build, test
</verification>

<success_criteria>
- manifest.json: id=kb-manager, minAppVersion=1.4.0, version=0.1.0, description ends with period
- package.json: has dev, build, test scripts; devDependencies includes obsidian, typescript 5.8+, esbuild 0.25.5, vitest
- tsconfig.json: noUncheckedIndexedAccess=true, strictNullChecks=true, baseUrl=src, target=ES6
- esbuild.config.mjs: format=cjs, target=es2018, obsidian in externals, entry=src/main.ts
- vitest.config.ts: include pattern covers src/**/*.test.ts
- npm install completes without errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-plugin-scaffold-settings-file-safety/01-02-SUMMARY.md`
using the summary template.
</output>
