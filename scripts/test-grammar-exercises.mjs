import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS_DIR = '/tmp/indonesian-test-screenshots4';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let screenshotCount = 0;
async function screenshot(page, label) {
  screenshotCount++;
  const filename = join(SCREENSHOTS_DIR, `${screenshotCount.toString().padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`SCREENSHOT: ${filename}`);
  return filename;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // ── Step 1: Login ─────────────────────────────────────────────────────────
  console.log('\n=== Step 1: Login ===');
  await page.goto('https://indonesian.duin.home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const usernameInput = await page.$('input[placeholder="Username"]');
  if (usernameInput) {
    await usernameInput.fill('testuser');
    const pwInput = await page.$('input[placeholder="Password"]');
    await pwInput.fill('TestUser123!');
    const btn = await page.$('button');
    await btn.click();
    try { await page.waitForURL('**/indonesian.duin.home/**', { timeout: 15000 }); }
    catch { await sleep(3000); }
    console.log('Logged in:', page.url());
    await screenshot(page, 'dashboard');
  }

  // ── Step 2: Navigate to session ───────────────────────────────────────────
  console.log('\n=== Step 2: Start session ===');
  // Try dashboard start button first
  await sleep(1000);
  const startBtn = await page.$('button:has-text("Start vandaag je sessie")');
  if (startBtn) {
    await startBtn.click();
    try { await page.waitForURL('**/session**', { timeout: 8000 }); }
    catch { await sleep(2000); }
  }

  // Ensure we're on /session
  if (!page.url().includes('/session')) {
    await page.goto('https://indonesian.duin.home/session', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
  }
  console.log('Session URL:', page.url());
  await screenshot(page, 'session-page');

  // ── Step 3: Exercise loop ─────────────────────────────────────────────────
  console.log('\n=== Step 3: Exercise loop ===');

  const exerciseLog = []; // { num, type, question, options, hasObjObj }
  const issues = [];
  const maxIterations = 25;
  let lastExNum = 0;
  let stuckCount = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    await sleep(1000);

    const state = await page.evaluate(() => {
      const text = document.body.innerText;

      // Progress
      const pm = text.match(/Oefening\s+(\d+)\s+van\s+(\d+)/);
      const exNum = pm ? parseInt(pm[1]) : null;
      const exTotal = pm ? parseInt(pm[2]) : null;

      // Session ended
      const ended = ['Sessie voltooid', 'Session complete', 'Well done', 'Goed gedaan',
        'Alle items gedaan', 'All done', 'Geen items'].some(w => text.includes(w));

      // Object Object bug
      const hasObjObj = text.includes('[object Object]');

      // All buttons
      const allBtns = Array.from(document.querySelectorAll('button'))
        .map(b => ({
          text: (b.textContent || '').trim(),
          rect: b.getBoundingClientRect(),
          bg: window.getComputedStyle(b).backgroundColor,
        }))
        .filter(b => b.text.length > 0);

      // Content area buttons (x > 230, wide, in main area)
      const navTexts = new Set(['NL', 'EN', 'Uitloggen', 'Home', 'Lessen', 'Podcasts',
        'Voortgang', 'Ranglijst', 'Secties', 'Oefeningen']);
      const contentBtns = allBtns.filter(b =>
        b.rect.left > 230 && b.rect.width > 100 && b.rect.top > 50 && b.rect.top < 700 &&
        !navTexts.has(b.text) && b.text.length < 300
      );

      // Answer buttons — content area, not "Check Answer" / "Doorgaan"
      const actionWords = ['check answer', 'doorgaan', 'volgende', 'next', 'continue', 'skip'];
      const answerBtns = contentBtns.filter(b =>
        !actionWords.some(w => b.text.toLowerCase().includes(w))
      );

      // Text input fields
      const textInputs = Array.from(document.querySelectorAll('input[type="text"], textarea'))
        .filter(el => el.offsetParent !== null) // visible
        .map(el => ({ placeholder: el.placeholder, value: el.value }));

      // Feedback indicators
      const hasFout = text.includes('Fout') || document.querySelector('[class*="wrong"], [class*="incorrect"], [class*="error-state"]') !== null;
      const hasCorrect = text.includes('Correct!') || text.includes('Goed!') ||
        document.querySelector('[class*="correct-state"], [class*="success"]') !== null;
      const hasCorrectAntwoord = text.includes('CORRECT ANTWOORD') || text.includes('Correct antwoord') ||
        text.includes('correct answer') || document.querySelector('[class*="correct-answer"]') !== null;
      const hasDoorgaan = contentBtns.some(b => b.text.toLowerCase() === 'doorgaan');
      const hasCheckAnswer = contentBtns.some(b => b.text.toLowerCase() === 'check answer');

      // What kind of exercise?
      // sentence_transformation: has text input + "Check Answer"
      // recognition_mcq: has 4 answer buttons
      // contrast_pair: typically 2 longer sentence options

      let detectedType = 'unknown';
      if (textInputs.length > 0 && hasCheckAnswer) {
        detectedType = 'sentence_transformation';
      } else if (answerBtns.length >= 3) {
        // Check if it looks like contrast_pair (longer button text / sentence-like)
        const avgLen = answerBtns.reduce((s, b) => s + b.text.length, 0) / answerBtns.length;
        detectedType = avgLen > 30 ? 'contrast_pair_candidate' : 'recognition_mcq';
      } else if (answerBtns.length === 2) {
        detectedType = 'contrast_pair_candidate';
      }

      // Question area text
      const questionArea = document.querySelector('[class*="question"], [class*="card"], [class*="exercise-card"]');
      const questionText = questionArea ? questionArea.textContent.trim().substring(0, 200) : '';

      return {
        exNum, exTotal, ended, hasObjObj,
        allBtnTexts: allBtns.map(b => b.text),
        contentBtnTexts: contentBtns.map(b => b.text),
        answerBtnTexts: answerBtns.map(b => b.text),
        textInputs,
        hasFout, hasCorrect, hasCorrectAntwoord, hasDoorgaan, hasCheckAnswer,
        detectedType,
        questionText,
        textSnippet: text.substring(0, 500),
      };
    });

    if (state.ended) {
      console.log('\n✓ Session complete!');
      await screenshot(page, 'session-complete');
      break;
    }

    const exNum = state.exNum;
    const exKey = `${exNum}`;
    const alreadySeen = exerciseLog.some(e => e.num === exNum && e.type !== 'unknown');

    // Stuck detection
    if (exNum === lastExNum) {
      stuckCount++;
    } else {
      stuckCount = 0;
      lastExNum = exNum;
    }

    console.log(`\n--- Iter ${iter + 1}, Exercise ${exNum}/${state.exTotal} [${state.detectedType}] (stuck:${stuckCount}) ---`);
    console.log('Answer buttons:', state.answerBtnTexts);
    console.log('Text inputs:', state.textInputs);
    console.log('Content buttons:', state.contentBtnTexts);
    console.log('hasCheckAnswer:', state.hasCheckAnswer, '| hasDoorgaan:', state.hasDoorgaan);
    console.log('hasFout:', state.hasFout, '| hasCorrect:', state.hasCorrect, '| hasCorrectAntwoord:', state.hasCorrectAntwoord);
    console.log('[object Object]:', state.hasObjObj);

    if (state.hasObjObj) {
      issues.push(`Ex ${exNum}: [object Object] in page!`);
      console.log('!!! BUG: [object Object] !!!');
      await screenshot(page, `BUG-object-object-ex${exNum}`);
    }

    // Screenshot logic
    if (!alreadySeen) {
      const isGrammar = ['sentence_transformation', 'contrast_pair', 'contrast_pair_candidate'].includes(state.detectedType);
      const label = isGrammar ? `GRAMMAR-${state.detectedType}-ex${exNum}` : `vocab-ex${exNum}`;
      await screenshot(page, label);
      exerciseLog.push({ num: exNum, type: state.detectedType, hasObjObj: state.hasObjObj });
      if (isGrammar) console.log(`*** GRAMMAR EXERCISE: ${state.detectedType} ***`);
    }

    // ── Handle feedback state (hasDoorgaan = we answered, waiting to advance) ──
    if (state.hasDoorgaan) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => (b.textContent || '').trim().toLowerCase() === 'doorgaan');
        if (btn) btn.click();
      });
      console.log('Clicked Doorgaan');
      continue;
    }

    // ── Handle sentence_transformation: fill text + click Check Answer ────────
    if (state.detectedType === 'sentence_transformation' || (state.textInputs.length > 0 && state.hasCheckAnswer)) {
      // Type something into the input field
      const inputEl = await page.$('input[type="text"]:not([type="hidden"]), textarea');
      if (inputEl) {
        // Clear and fill with a placeholder answer
        await inputEl.click();
        await inputEl.fill('Saya membeli pisang kemarin.');
        console.log('Filled text input');
        await sleep(300);
      }
      // Click Check Answer
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => (b.textContent || '').trim().toLowerCase() === 'check answer');
        if (btn) btn.click();
      });
      console.log('Clicked Check Answer');
      await sleep(1000);
      await screenshot(page, `check-answer-feedback-ex${exNum}`);
      continue;
    }

    // ── Handle MCQ / contrast_pair: click first answer button ─────────────────
    if (state.answerBtnTexts.length > 0) {
      const target = state.answerBtnTexts[0];
      await page.evaluate((t) => {
        const btns = Array.from(document.querySelectorAll('button'));
        const navTexts = new Set(['NL', 'EN', 'Uitloggen']);
        const btn = btns.find(b => {
          const txt = (b.textContent || '').trim();
          const rect = b.getBoundingClientRect();
          return txt === t && rect.left > 230 && !navTexts.has(txt);
        });
        if (btn) btn.click();
      }, target);
      console.log(`Clicked answer: "${target.substring(0, 60)}"`);
      await sleep(800);

      // Check feedback
      const fb = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasFout: text.includes('Fout'),
          hasCorrect: text.includes('Correct!') || text.includes('Goed!'),
          hasCorrectAntwoord: text.includes('CORRECT ANTWOORD') || text.includes('Correct antwoord'),
          hasDoorgaan: Array.from(document.querySelectorAll('button')).some(b =>
            (b.textContent || '').trim().toLowerCase() === 'doorgaan'
          ),
        };
      });

      if (fb.hasFout) {
        console.log(`Wrong answer. Correct antwoord shown: ${fb.hasCorrectAntwoord}`);
        if (!fb.hasCorrectAntwoord) {
          issues.push(`Ex ${exNum}: Wrong answer but "CORRECT ANTWOORD" not shown`);
        }
        await screenshot(page, `wrong-feedback-ex${exNum}`);
      } else if (fb.hasCorrect) {
        console.log('Correct answer!');
        await screenshot(page, `correct-feedback-ex${exNum}`);
      }

      if (fb.hasDoorgaan) {
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b =>
            (b.textContent || '').trim().toLowerCase() === 'doorgaan'
          );
          if (btn) btn.click();
        });
        console.log('Clicked Doorgaan');
      }
      continue;
    }

    // ── Nothing to click ──────────────────────────────────────────────────────
    if (stuckCount > 3) {
      console.log('Stuck too long, giving up');
      await screenshot(page, `stuck-ex${exNum}`);
      break;
    }
    console.log('No interaction found, waiting...');
    await screenshot(page, `no-interaction-iter${iter + 1}`);
  }

  await sleep(500);
  await screenshot(page, 'final-state');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n======== FINAL SUMMARY ========');

  const uniqueExercises = exerciseLog.filter((e, i, arr) =>
    arr.findIndex(x => x.num === e.num) === i
  );
  console.log(`Total unique exercises seen: ${uniqueExercises.length}`);
  uniqueExercises.forEach(e => {
    console.log(`  Ex ${e.num}: type=${e.type}, [object Object]=${e.hasObjObj}`);
  });

  const grammarExs = uniqueExercises.filter(e =>
    ['sentence_transformation', 'contrast_pair', 'contrast_pair_candidate'].includes(e.type)
  );
  console.log(`\nGrammar exercises seen: ${grammarExs.length}`);
  grammarExs.forEach(e => console.log(`  - Ex ${e.num}: ${e.type}`));

  console.log(`\nIssues (${issues.length}):`);
  if (issues.length === 0) console.log('  NONE');
  else issues.forEach(i => console.log(`  - ${i}`));

  console.log(`\nConsole errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 120)}`));

  console.log('\nScreenshots dir:', SCREENSHOTS_DIR);
  await browser.close();
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
