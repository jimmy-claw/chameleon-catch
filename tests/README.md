# Chameleon Catch — Tests

Playwright test suite and fuzzy bot for Chameleon Catch.

## Install

```bash
cd tests
npm install
npx playwright install chromium
```

## Run Tests

Start a local server first (in a separate terminal):

```bash
npx serve ../ -p 8080 -s
```

Then run the tests:

```bash
npm test
```

Run with a visible browser:

```bash
npm run test:headed
```

## Fuzzy Bot

The bot runner starts its own server automatically:

```bash
node bot-runner.js
```

Options:

```bash
node bot-runner.js --duration 120    # Run for 120 seconds (default: 60)
node bot-runner.js --difficulty 1    # Easy=1, Normal=2, Hard=3 (default: 1)
node bot-runner.js --headed          # Show the browser window
```

## Dev Mode

Open the game with `?dev=1` to enable dev mode:

```
http://localhost:8080/?dev=1
```

Dev mode features:
- **DEV badge**: Red badge top-right below mute button
- **Error overlay**: Red banner at top on any unhandled JS error (tap to dismiss)
- **State monitor**: Bottom-left overlay showing FPS, fly count, game state, score, thirst/fuel, weather
- **`window.__gameState`**: Object with current game state (always available, even without `?dev=1`)
- **`window.__getFlies()`**: Returns array of `{x, y, type, id}` for all active flies
- **`window.__botTap(x, y)`**: Simulates a tap at screen coordinates
- **`window.__forceEndGame()`**: Immediately ends the current game
