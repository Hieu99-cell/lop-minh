import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test.skip(!process.env.E2E_BASE_URL, 'Chỉ chạy khi chỉ định URL triển khai thật.');
const examId = '11111111-1111-4111-8111-111111111111';

test('Nhập JSON yêu cầu đăng nhập; schema và mẫu công khai tải được', async ({ page, request }) => {
  await page.goto('/exams/import-json');
  await expect(page).toHaveURL(/\/auth\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/exams/import-json');
  const schema = await request.get('/import/exam.schema.json');
  expect(schema.status()).toBe(200);
  expect((await schema.json()).properties.version.const).toBe(1);
  expect(await schema.text()).toContain('"tables"');
  expect(await schema.text()).toContain('"placement"');
  const sample = await request.get('/import/example.json');
  expect(sample.status()).toBe(200);
  expect((await sample.json()).sections.map((s: { id: string }) => s.id)).toEqual([
    'I',
    'II',
    'III',
  ]);
  const zip = await request.get('/import/example-with-images.zip');
  expect(zip.status()).toBe(200);
  expect((await zip.body()).subarray(0, 2).toString()).toBe('PK');
  const contentSample = await request.get('/import/content-example.zip');
  expect(contentSample.status()).toBe(200);
  expect((await contentSample.body()).subarray(0, 2).toString()).toBe('PK');
  const response = await request.post('/api/json-import', {
    headers: { 'content-type': 'application/octet-stream' },
    data: '{}',
    maxRedirects: 0,
  });
  expect([303, 307]).toContain(response.status());
  expect(response.headers().location).toContain('/auth?next=');
});

for (const width of [1440, 390])
  test(`Production hiển thị và đăng nhập ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Dạy nhẹ nhàng hơn/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('link', { name: /Bắt đầu cùng/ }).click();
    await expect(page).toHaveURL(/\/auth\?next=/);
    await expect(page.getByRole('heading', { name: 'Chào mừng bạn trở lại' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/production-auth-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

test('Giữ đường dẫn link mời và đề qua bước đăng nhập', async ({ page }) => {
  for (const path of ['/join/test-invite', `/exams/${examId}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\?next=/);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('next')).toBe(path);
  }
  await page.goto('/auth?next=https://example.invalid');
  await expect(page.locator('input[name=next]').first()).toHaveValue('/dashboard');
});

test('Biểu mẫu đăng ký, quên mật khẩu và từ chối đăng nhập sai', async ({ page }) => {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await expect(page.getByLabel('Họ và tên')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo tài khoản', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).first().click();
  await page.getByRole('button', { name: 'Quên mật khẩu?' }).click();
  await expect(page.getByRole('button', { name: 'Gửi liên kết đặt lại' })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).first().click();
  await page.getByLabel('Email', { exact: true }).fill('nobody@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Not-a-real-password-2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
  await expect(page.locator('.notice[role="alert"]')).toContainText('Email hoặc mật khẩu');
});

test('Supabase thật bật xác minh email và chặn RPC riêng tư cho anonymous', async ({ request }) => {
  const env = fs.readFileSync('.env.local', 'utf8');
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)![1].trim();
  const key = env.match(/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)![1].trim();
  const headers = { apikey: key };
  const response = await request.get(`${url}/auth/v1/settings`, { headers });
  expect(response.status()).toBe(200);
  const settings = await response.json();
  expect(settings.disable_signup).toBe(false);
  expect(settings.mailer_autoconfirm).toBe(false);
  for (const fn of ['author_exam', 'get_attempt', 'attempt_result']) {
    const result = await request.post(`${url}/rest/v1/rpc/${fn}`, {
      headers,
      data: { p_id: examId },
    });
    expect([401, 403]).toContain(result.status());
  }
  const profile = await request.get(`${url}/rest/v1/profiles?select=id,role`, { headers });
  expect([401, 403]).toContain(profile.status());
});

test('Google tạm bỏ theo yêu cầu: chỉ hiển thị đăng nhập email và quên mật khẩu', async ({
  page,
}) => {
  await page.goto('/auth');
  await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quên mật khẩu?' })).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});
