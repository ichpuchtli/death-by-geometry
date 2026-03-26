# Playwright — Browser Testing & Screenshots

## Purpose
Run Playwright browser tests and take screenshots of the Death by Geometry game. Handles building, starting a preview server, running declarative YAML test flows, and capturing screenshots.

## When to Use
- When the user says `/playwright`, `run tests`, `take a screenshot`, or asks to verify game visually
- After making UI/visual changes to validate the result
- When debugging layout issues

## Commands

```
/playwright              # run all test flows
/playwright smoke        # run flows tagged 'smoke'
/playwright screenshot   # take a screenshot of the menu state
/playwright --headed     # run with visible browser window
```

## Instructions

Run the test script:
```bash
cd /Users/sam/src/geometry-genocide && bash tests/playwright.sh <args>
```

The script handles everything: dependency installation, building, starting/stopping the preview server, and running tests or taking screenshots.

### Quick Screenshot
To take a quick screenshot and view it:
```bash
cd /Users/sam/src/geometry-genocide && bash tests/playwright.sh screenshot
```
Then read the resulting PNG from `tests/screenshots/` to show the user.

### Run Specific Flow
```bash
cd /Users/sam/src/geometry-genocide && bash tests/playwright.sh tests/flows/01-app-loads.yml
```

### Run by Tag
```bash
cd /Users/sam/src/geometry-genocide && bash tests/playwright.sh smoke
```

### Headed Mode (visible browser)
Append `--headed` to any command:
```bash
cd /Users/sam/src/geometry-genocide && bash tests/playwright.sh screenshot --headed
```

### After Tests
- Report pass/fail results to the user
- If screenshots were taken, read and display them using the Read tool
- Failure screenshots are saved as `FAIL-*.png` in `tests/screenshots/`

## Test Flow Files
Located in `tests/flows/*.yml`. See `tests/run-flow.ts` for the runner implementation and supported actions (launch, click, screenshot, keyPress, keys, mouseMove, evalCheck, assertVisible, waitForEval, etc.).
