#!/usr/bin/env node

/**
 * Puppeteer demo recorder for LLM API Bench.
 *
 * Launches a headless browser, logs in, navigates through every major page,
 * and records a screencast saved as WebM. The companion shell script
 * (record-demo.sh) converts the WebM to an optimized GIF via ffmpeg.
 *
 * Usage:
 *   node scripts/record-demo.mjs [--base-url http://localhost:3001]
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { installRedactObserver } from './redact-sensitive.mjs';

// Resolve puppeteer from frontend/node_modules regardless of cwd
const __puppeteerEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'frontend', 'node_modules', 'puppeteer',
  'lib', 'esm', 'puppeteer', 'puppeteer.js',
);
const puppeteerModule = await import(pathToFileURL(__puppeteerEntry).href);
const puppeteer = puppeteerModule.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3001';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'changeme';
const OUTPUT = path.join(ROOT, 'docs', 'demo.webm');
const VIEWPORT = { width: 1100, height: 720 };

// Timing helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Page actions
// ---------------------------------------------------------------------------

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await sleep(800);

  // Type username
  const usernameInput = await page.waitForSelector('#login-username');
  await usernameInput.click({ clickCount: 3 });
  await usernameInput.type(USERNAME, { delay: 80 });
  await sleep(300);

  // Type password
  const passwordInput = await page.waitForSelector('#login-password');
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(PASSWORD, { delay: 80 });
  await sleep(300);

  // Submit
  const submitBtn = await page.waitForSelector('button[type="submit"]');
  await submitBtn.click();
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await sleep(1500);
}

async function visitPage(page, urlPath, label, extraActions) {
  console.log(`  -> ${label}`);
  await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: 'networkidle0' });
  await sleep(1500);

  if (extraActions) {
    await extraActions(page);
  }

  // Gentle scroll down and back up to show page content
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await sleep(1000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(800);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🎬 Starting demo recording...');
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   Output: ${OUTPUT}`);

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Install persistent DOM redaction before any navigation
  await installRedactObserver(page);

  // Start screencast recording
  const recorder = await page.screencast({ path: OUTPUT, speed: 1 });
  console.log('📹 Recording started');

  try {
    // 1. Login
    console.log('  -> Login');
    await login(page);

    // 2. Workflow page (default after login)
    await visitPage(page, '/workflow', 'Workflow');

    // 3. Monitor
    await visitPage(page, '/monitor', 'Monitor');

    // 4. Playground
    await visitPage(page, '/playground', 'Playground');

    // 5. History
    await visitPage(page, '/history', 'History');

    // 6. Settings
    await visitPage(page, '/settings', 'Settings');

    // Final pause
    await sleep(1000);
  } finally {
    // Stop recording
    await recorder.stop();
    console.log('⏹️  Recording stopped');

    await browser.close();
  }

  console.log(`✅ Demo saved to ${OUTPUT}`);
}

main().catch((err) => {
  console.error('❌ Recording failed:', err);
  process.exit(1);
});
