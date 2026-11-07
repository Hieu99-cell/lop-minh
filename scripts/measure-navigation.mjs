// Manual authenticated production benchmark. Login stays in browser memory;
// this script never writes storageState, cookies, credentials or page content.
import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline/promises';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.PERF_BASE_URL || 'https://web-nu-olive-jaqziuyjrj.vercel.app';
const browser = await chromium.launch({
  headless: false,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const ctx = await browser.newContext({
  viewport: process.argv.includes('--mobile')
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
const prompt = createInterface({ input: process.stdin, output: process.stdout });
try {
  await page.goto(base + '/auth');
  await prompt.question(
    'Đăng nhập trong trình duyệt, mở Tổng quan rồi nhấn Enter tại đây. Không nhập mật khẩu trong terminal. ',
  );
  await page.waitForURL(base + '/dashboard');
  const role = await page.locator('.user-chip small').innerText();
  const network = [];
  page.on('response', async (response) => {
    const req = response.request(),
      u = new URL(req.url());
    if (
      u.origin !== new URL(base).origin ||
      !['/dashboard', '/classes', '/exams', '/results'].includes(u.pathname)
    )
      return;
    const h = await response.allHeaders(),
      rh = await req.allHeaders();
    network.push({
      route: u.pathname,
      status: response.status(),
      requestId: h['x-performance-id'],
      serverTiming: h['server-timing'],
      ttfbMs: Math.round(req.timing().responseStart),
      prefetch: rh['next-router-prefetch'] === '1',
    });
  });
  const samples = [];
  for (let cycle = 0; cycle < 3; cycle++)
    for (const route of ['/classes', '/exams', '/results', '/dashboard']) {
      await page.evaluate(() => {
        window.__perfStart = performance.now();
        window.__perfFeedback = null;
        const observer = new MutationObserver(() => {
          window.__perfFeedback = performance.now() - window.__perfStart;
          observer.disconnect();
        });
        observer.observe(document.querySelector('main'), { childList: true, subtree: true });
      });
      const started = performance.now();
      await page.locator(`nav a[href="${route}"]`).click();
      await page.waitForURL(base + route);
      await page.waitForFunction(() => !document.querySelector('main [data-route-loading]'));
      if (route === '/dashboard' || route === '/results')
        await page.locator('main .stats-grid').waitFor();
      const completeMs = Math.round(performance.now() - started);
      samples.push({
        route,
        cycle,
        completeMs,
        feedbackMs: Math.round((await page.evaluate(() => window.__perfFeedback)) || completeMs),
      });
      await page.waitForTimeout(500);
    }
  const result = {
    base,
    role,
    mobile: process.argv.includes('--mobile'),
    date: new Date().toISOString(),
    samples,
    network,
  };
  await mkdir('.deployment-tools', { recursive: true });
  const target = `.deployment-tools/navigation-${Date.now()}.json`;
  await writeFile(target, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(samples, null, 2));
  console.log('Kết quả: ' + target);
} finally {
  prompt.close();
  await browser.close();
}
