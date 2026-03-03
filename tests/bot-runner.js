#!/usr/bin/env node
/**
 * Fuzzy bot runner for Chameleon Catch
 *
 * Starts a local server, opens the game in a headless browser,
 * and runs an automated bot for a configurable duration.
 *
 * Usage: node bot-runner.js [--duration 60] [--difficulty 1] [--headed]
 */

const { chromium } = require('@playwright/test');
const { execSync, spawn } = require('child_process');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf('--' + name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultVal;
}
const duration = parseInt(getArg('duration', '60'), 10) * 1000;
const difficulty = getArg('difficulty', '1');
const headed = args.includes('--headed');

const PORT = 8080;
const ROOT = path.resolve(__dirname, '..');

async function run() {
  console.log(`🦎 Chameleon Catch Bot Runner`);
  console.log(`   Duration: ${duration / 1000}s | Difficulty: ${difficulty} | Headed: ${headed}`);
  console.log('');

  // Start local server
  console.log('Starting local server...');
  const server = spawn('npx', ['serve', ROOT, '-p', String(PORT), '-s', '-l', 'false'], {
    stdio: 'pipe',
    shell: true,
  });

  // Wait for server to be ready
  await new Promise((resolve) => {
    const check = setInterval(async () => {
      try {
        execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT}`, { stdio: 'pipe' });
        clearInterval(check);
        resolve();
      } catch { /* not ready yet */ }
    }, 500);

    // Timeout after 15s
    setTimeout(() => { clearInterval(check); resolve(); }, 15000);
  });

  console.log(`Server running on http://localhost:${PORT}`);

  // Launch browser
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // Load game
  await page.goto(`http://localhost:${PORT}/?dev=1`);
  await page.waitForSelector('#start-btn', { state: 'visible' });

  // Select classic mode + difficulty
  const classicBtn = page.locator('#mode-classic-btn');
  if (await classicBtn.isVisible()) await classicBtn.click();
  await page.evaluate((diff) => {
    const slider = document.getElementById('diff-slider');
    if (slider) { slider.value = diff; slider.dispatchEvent(new Event('input')); }
  }, difficulty);

  await page.click('#start-btn');
  await page.waitForFunction(() => window.__gameState && window.__gameState.gameActive === true, null, { timeout: 5000 });

  console.log('Game started! Running bot...\n');

  // Stats
  let totalTaps = 0;
  let catches = 0;
  let misses = 0;
  let freezeWarnings = 0;
  let lastScore = 0;
  let lastScoreTime = Date.now();
  let gamesPlayed = 1;

  const startTime = Date.now();

  while (Date.now() - startTime < duration) {
    const state = await page.evaluate(() => ({
      flies: window.__getFlies(),
      gs: window.__gameState,
    }));

    const gs = state.gs;

    // If game is over, restart
    if (!gs.gameActive && !gs.carActive) {
      const finalScore = gs.score;
      console.log(`  Game over! Score: ${finalScore} | Catches: ${gs.catches} | Missed: ${gs.missed}`);
      catches += gs.catches;
      misses += gs.missed;

      // Click restart if available
      const restartVisible = await page.locator('#restart-btn').isVisible().catch(() => false);
      if (restartVisible) {
        await page.click('#restart-btn');
        await page.waitForFunction(() => window.__gameState.gameActive === true, null, { timeout: 5000 }).catch(() => {});
        gamesPlayed++;
        lastScoreTime = Date.now();
        lastScore = 0;
      } else {
        break;
      }
      continue;
    }

    // Track score for freeze detection
    if (gs.score !== lastScore) {
      lastScore = gs.score;
      lastScoreTime = Date.now();
    }
    if (Date.now() - lastScoreTime > 10000 && state.flies.length === 0 && gs.gameActive) {
      freezeWarnings++;
      console.log('  ⚠ Possible freeze detected (no score change, 0 flies for 10s)');
      lastScoreTime = Date.now(); // reset to avoid spam
    }

    // Bot logic: 70% hit, 30% miss
    if (state.flies.length > 0 && Math.random() < 0.7) {
      const fly = state.flies[Math.floor(Math.random() * state.flies.length)];
      await page.evaluate(({ x, y }) => window.__botTap(x, y), fly);
    } else {
      const rx = Math.random() * 300 + 50;
      const ry = Math.random() * 400 + 50;
      await page.evaluate(({ x, y }) => window.__botTap(x, y), { x: rx, y: ry });
    }

    totalTaps++;
    await page.waitForTimeout(200);
  }

  // Final state
  const finalState = await page.evaluate(() => window.__gameState);
  catches += finalState.catches || 0;
  misses += finalState.missed || 0;

  await browser.close();
  server.kill();

  // Report
  console.log('\n─── Bot Run Report ───────────────────');
  console.log(`  Duration:        ${duration / 1000}s`);
  console.log(`  Games played:    ${gamesPlayed}`);
  console.log(`  Total taps:      ${totalTaps}`);
  console.log(`  Total catches:   ${catches}`);
  console.log(`  Total misses:    ${misses}`);
  console.log(`  JS errors:       ${errors.length}`);
  console.log(`  Freeze warnings: ${freezeWarnings}`);
  if (errors.length > 0) {
    console.log('\n  Errors:');
    errors.forEach((e) => console.log('    - ' + e));
  }
  console.log('──────────────────────────────────────\n');

  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Bot runner failed:', err);
  process.exit(1);
});
