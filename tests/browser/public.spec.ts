import { test, expect } from '@playwright/test';
test.skip(Boolean(process.env.E2E_BASE_URL), 'Các ca này dành cho local chưa cấu hình backend.');
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
])
  test(`Trang giới thiệu ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Dạy nhẹ nhàng hơn/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Bắt đầu cùng/ })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/trang-chu-${viewport.width}.png`, fullPage: true });
    await page.getByRole('link', { name: /Bắt đầu cùng/ }).click();
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByRole('heading', { name: 'Kết nối không gian học tập' })).toBeVisible();
    expect(errors).toEqual([]);
  });
test('Các trang bảo vệ chuyển về cấu hình khi chưa có backend', async ({ page }) => {
  for (const route of [
    '/dashboard',
    '/classes',
    '/exams',
    '/results',
    '/profile',
    '/join/test',
    '/attempts/test',
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/setup/);
  }
});
