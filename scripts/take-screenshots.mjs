#!/usr/bin/env node

/**
 * Take screenshots of every major page for docs/screenshots/.
 *
 * Usage:
 *   node scripts/take-screenshots.mjs [--base-url http://localhost:3001]
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __puppeteerEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'frontend', 'node_modules', 'puppeteer',
  'lib', 'esm', 'puppeteer', 'puppeteer.js',
);
const puppeteerModule = await import(pathToFileURL(__puppeteerEntry).href);
const puppeteer = puppeteerModule.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(ROOT, 'docs', 'screenshots');

const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3001';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'changeme';
const VIEWPORT = { width: 1100, height: 720 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await sleep(500);
  const usernameInput = await page.waitForSelector('#login-username');
  await usernameInput.click({ clickCount: 3 });
  await usernameInput.type(USERNAME, { delay: 30 });
  const passwordInput = await page.waitForSelector('#login-password');
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(PASSWORD, { delay: 30 });
  const submitBtn = await page.waitForSelector('button[type="submit"]');
  await submitBtn.click();
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await sleep(1000);
}

const pages = [
  { path: '/workflow', name: 'screenshot-workflow' },
  { path: '/monitor', name: 'screenshot-monitor' },
  { path: '/playground', name: 'screenshot-playground' },
  { path: '/history', name: 'screenshot-history' },
  { path: '/settings', name: 'screenshot-settings' },
];

async function main() {
  console.log('📸 Taking screenshots...');
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  await login(page);

  for (const p of pages) {
    console.log(`  -> ${p.name}`);
    await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'networkidle0' });
    await sleep(1500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${p.name}.png`),
      fullPage: false,
    });
  }

  // Detail page — pick first history item if available
  console.log('  -> screenshot-detail');
  await page.goto(`${BASE_URL}/history`, { waitUntil: 'networkidle0' });
  await sleep(1000);
  const firstRow = await page.$('tr[data-row-key], .ant-table-row, [class*="history"] a, [class*="history"] [class*="card"]');
  if (firstRow) {
    await firstRow.click();
    await sleep(1500);
  }
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'screenshot-detail.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('✅ All screenshots saved to docs/screenshots/');
}

main().catch((err) => {
  console.error('❌ Screenshot failed:', err);
  process.exit(1);
});
