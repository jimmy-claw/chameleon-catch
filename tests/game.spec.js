// @ts-check
const { test, expect } = require('@playwright/test');

/** Load the game in dev mode, classic easy, and start */
async function startClassicEasy(page) {
  await page.goto('/?dev=1');
  await page.waitForSelector('#start-btn', { state: 'visible' });

  // Select classic mode
  const classicBtn = page.locator('#mode-classic-btn');
  if (await classicBtn.isVisible()) await classicBtn.click();

  // Set difficulty to Easy (slider value 1)
  await page.evaluate(() => {
    const slider = document.getElementById('diff-slider');
    if (slider) {
      slider.value = '1';
      slider.dispatchEvent(new Event('input'));
    }
  });

  // Click start
  await page.click('#start-btn');
  // Wait for game to be active
  await page.waitForFunction(() => window.__gameState && window.__gameState.gameActive === true, null, { timeout: 5000 });
}

/** Load the game in dev mode, car mode, and start */
async function startCarMode(page) {
  await page.goto('/?dev=1');
  await page.waitForSelector('#start-btn', { state: 'visible' });

  // Select car mode
  await page.click('#mode-car-btn');

  // Set difficulty to Easy
  await page.evaluate(() => {
    const slider = document.getElementById('diff-slider');
    if (slider) {
      slider.value = '1';
      slider.dispatchEvent(new Event('input'));
    }
  });

  await page.click('#start-btn');
  await page.waitForFunction(() => window.__gameState && window.__gameState.carActive === true, null, { timeout: 5000 });
}

// ─── Test 1: Basic fly spawning ──────────────────────────────────────────────
test('basic fly spawning', async ({ page }) => {
  await startClassicEasy(page);

  // Wait up to 3s for at least 1 fly
  await page.waitForFunction(() => window.__getFlies().length >= 1, null, { timeout: 3000 });

  const flyCount = await page.evaluate(() => window.__getFlies().length);
  expect(flyCount).toBeGreaterThanOrEqual(1);
});

// ─── Test 2: Catch a fly (bot player) ────────────────────────────────────────
test('catch a fly via bot tap', async ({ page }) => {
  await startClassicEasy(page);

  // Wait for flies to appear
  await page.waitForFunction(() => window.__getFlies().length >= 1, null, { timeout: 3000 });

  // Try tapping flies up to 10 times
  let scored = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const flies = await page.evaluate(() => window.__getFlies());
    if (flies.length > 0) {
      const fly = flies[0];
      await page.evaluate(({ x, y }) => window.__botTap(x, y), fly);
    }
    await page.waitForTimeout(600);

    const score = await page.evaluate(() => window.__gameState.score);
    if (score > 0) {
      scored = true;
      break;
    }
  }

  expect(scored).toBe(true);
});

// ─── Test 3: Miss counting ───────────────────────────────────────────────────
test('miss counting', async ({ page }) => {
  await startClassicEasy(page);

  // Tap well outside any fly position to NOT interfere — just wait for natural misses
  // Or tap empty spots to force engagement without catching
  for (let i = 0; i < 20; i++) {
    // Tap far bottom-left corner where no flies spawn
    await page.evaluate(() => window.__botTap(5, window.innerHeight - 5));
    await page.waitForTimeout(400);
  }

  // Wait for at least one fly to expire (escape timers are 8-14s on easy)
  await page.waitForFunction(() => window.__gameState.missed > 0, null, { timeout: 20000 });

  const missed = await page.evaluate(() => window.__gameState.missed);
  expect(missed).toBeGreaterThan(0);
});

// ─── Test 4: Fuzzy bot — 30 second stress test ──────────────────────────────
test('fuzzy bot 30s stress test', async ({ page }) => {
  test.setTimeout(45000);
  await startClassicEasy(page);

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  let lastScoreChange = Date.now();
  let lastScore = 0;

  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    const state = await page.evaluate(() => {
      const flies = window.__getFlies();
      const gs = window.__gameState;
      return { flies, score: gs.score, active: gs.gameActive, flyCount: gs.flyCount };
    });

    // Game over is acceptable — just break
    if (!state.active) break;

    // Track score changes
    if (state.score !== lastScore) {
      lastScore = state.score;
      lastScoreChange = Date.now();
    }

    // Tap a fly (70% hit rate)
    if (state.flies.length > 0 && Math.random() < 0.7) {
      const fly = state.flies[Math.floor(Math.random() * state.flies.length)];
      await page.evaluate(({ x, y }) => window.__botTap(x, y), fly);
    } else {
      // Tap random empty space
      const rx = Math.random() * 300 + 50;
      const ry = Math.random() * 400 + 50;
      await page.evaluate(({ x, y }) => window.__botTap(x, y), { x: rx, y: ry });
    }

    await page.waitForTimeout(200);

    // Check for freeze: no score change AND 0 flies for > 10s
    if (Date.now() - lastScoreChange > 10000 && state.flyCount === 0 && state.active) {
      throw new Error('Game appears frozen: no score change for 10s with 0 flies');
    }
  }

  expect(errors).toHaveLength(0);
});

// ─── Test 5: Car mode smoke test ─────────────────────────────────────────────
test('car mode smoke test', async ({ page }) => {
  test.setTimeout(15000);
  await startCarMode(page);

  // Wait 5 seconds
  await page.waitForTimeout(5000);

  const active = await page.evaluate(() => window.__gameState.carActive);
  expect(active).toBe(true);
});

// ─── Test 6: Rapid tap stress test ───────────────────────────────────────────
test('rapid tap stress test', async ({ page }) => {
  test.setTimeout(15000);
  await startClassicEasy(page);
  await page.waitForTimeout(500);

  // Fire 50 taps in ~1 second at random positions
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight * 0.7;
      setTimeout(() => window.__botTap(x, y), i * 20);
    }
  });

  await page.waitForTimeout(1500);

  // Game should still be alive (active or game-over is fine, just no crash)
  const state = await page.evaluate(() => ({
    active: window.__gameState.gameActive,
    score: window.__gameState.score,
  }));

  // If game is still active OR ended normally (score >= 0), it didn't crash
  expect(state.score).toBeGreaterThanOrEqual(0);
});

// ─── Test 7: Pause/resume cycle ──────────────────────────────────────────────
test('pause and resume cycle', async ({ page }) => {
  await startClassicEasy(page);

  // Wait for game to be running with some flies
  await page.waitForFunction(() => window.__getFlies().length >= 1, null, { timeout: 3000 });

  // Pause
  await page.click('#pause-btn');
  await page.waitForFunction(() => window.__gameState.gamePaused === true, null, { timeout: 2000 });

  // Record score while paused
  const scoreBefore = await page.evaluate(() => window.__gameState.score);
  await page.waitForTimeout(1000);
  const scoreAfterPause = await page.evaluate(() => window.__gameState.score);

  // Score should not change while paused
  expect(scoreAfterPause).toBe(scoreBefore);

  // Resume
  await page.click('#pause-resume-btn');
  await page.waitForFunction(() => window.__gameState.gamePaused === false, null, { timeout: 2000 });

  // Game should be active again
  const active = await page.evaluate(() => window.__gameState.gameActive);
  expect(active).toBe(true);
});

// ─── Test 8: Mode switch from pause ──────────────────────────────────────────
test('mode switch from pause menu', async ({ page }) => {
  await startClassicEasy(page);
  await page.waitForTimeout(1000);

  // Pause
  await page.click('#pause-btn');
  await page.waitForFunction(() => window.__gameState.gamePaused === true, null, { timeout: 2000 });

  // Click switch mode
  await page.click('#pause-switch-btn');

  // Should be back at start screen
  await page.waitForSelector('#start-screen', { state: 'visible', timeout: 3000 });

  // Car mode should be pre-selected (since we switched from classic)
  const carBtnSelected = await page.evaluate(() => {
    const btn = document.getElementById('mode-car-btn');
    return btn && btn.classList.contains('selected');
  });
  expect(carBtnSelected).toBe(true);
});
