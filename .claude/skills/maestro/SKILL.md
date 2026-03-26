# Maestro — Declarative Browser Test Runner

## Purpose
Run Maestro-style YAML test flows against the Death by Geometry web game using Playwright as the headless browser engine.

## When to Use
- When the user says `/maestro`, `maestro test`, or asks to run browser/integration/e2e tests
- After completing a phase of development to validate the build works in a real browser
- When the user asks to verify game functionality

## How It Works
1. Builds the project with `npm run build` (from `web/`)
2. Starts a local Vite preview server
3. Reads YAML test flow files from `tests/flows/`
4. Executes each flow using Playwright (headless Chromium)
5. Reports pass/fail for each flow and step

## Test Flow Format
Test flows are YAML files in `tests/flows/`. Each flow has:
```yaml
name: "Flow Name"
tags: [phase1, smoke]
steps:
  - action: launch
    url: "/"                    # relative to dev server
    waitFor: "canvas#game"     # CSS selector to wait for

  - action: screenshot
    name: "initial-state"      # saved to tests/screenshots/

  - action: wait
    ms: 1000

  - action: click
    selector: "canvas#game"    # click to start game
    x: 0.5                     # relative coords (0-1), optional
    y: 0.5

  - action: assertVisible
    selector: "canvas#game"

  - action: evalCheck
    description: "WebGL context exists"
    script: |
      const c = document.getElementById('game');
      return c && !!c.getContext('webgl');

  - action: keyPress
    key: "w"
    duration: 500              # hold for ms

  - action: keys
    keys: ["w", "a"]           # simultaneous keys
    duration: 300

  - action: mouseMove
    x: 400
    y: 300

  - action: mouseDown

  - action: mouseUp

  - action: assertEval
    description: "Score is a number"
    script: |
      // Access game internals if exposed on window
      return typeof window.__testScore === 'number';

  - action: waitForEval
    description: "Wait for game state"
    script: "return document.title !== ''"
    timeout: 5000
```

## Running
```
/maestro                     # run all flows
/maestro smoke               # run flows tagged 'smoke'
/maestro tests/flows/foo.yml # run a specific flow file
```

## Instructions

When invoking this skill:

1. **Build**: `cd /home/user/Geometry-Genocide/web && npm run build`
2. **Start server**: Launch `npx vite preview --port 4173` in background
3. **Wait** for server to be ready (curl localhost:4173)
4. **Load flows**: Read all `tests/flows/*.yml` files (or filter by args)
5. **Execute**: For each flow, run the Playwright test runner script at `tests/run-flow.ts`
   - `npx tsx tests/run-flow.ts <flow-file> [--tag <tag>]`
6. **Report**: Print results summary
7. **Cleanup**: Kill the preview server

If `tests/run-flow.ts` doesn't exist yet, create it following the spec below.

### Runner Implementation (`tests/run-flow.ts`)

The runner should:
- Parse the YAML flow file
- Launch Playwright Chromium (headless)
- Execute each step sequentially
- Capture screenshots to `tests/screenshots/`
- Print pass/fail per step with timing
- Exit with code 0 if all pass, 1 if any fail
- Use `--tag` flag to filter flows by tag

Dependencies needed in web/package.json devDependencies:
- `playwright` (already available globally via npx)
- `yaml` for YAML parsing (or use a simple parser)
- `tsx` for running TypeScript directly
