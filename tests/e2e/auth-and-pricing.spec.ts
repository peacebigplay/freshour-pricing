import { test, expect } from '@playwright/test';

// Freshour Master Prompt v2, Section 38 (E2E list): login by role, role
// navigation, PDF-derived product visible, margin target visible, central
// approval. Run against a seeded DB (see docs/TEST_RESULTS.md for how this
// was executed in the dev sandbox via PGlite).

test('unauthenticated visitor is redirected to /login', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page).toHaveURL(/\/login/);
});

test('PRICING user logs in, lands on /pricing, and sees real PDF-derived data', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('อีเมล').fill('pricing@freshour.dev');
  await page.getByLabel('รหัสผ่าน').fill('Freshour2026!');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByText('Pricing')).toBeVisible();

  await page.goto('/pricing/central');
  // A real product name transcribed from the source PDF must appear.
  await expect(page.getByText('หมูบดA มัน10%')).toBeVisible();
});

test('SALES user cannot reach /pricing (RBAC redirect)', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('อีเมล').fill('sales@freshour.dev');
  await page.getByLabel('รหัสผ่าน').fill('Freshour2026!');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

  await expect(page).toHaveURL(/\/sales$/);

  await page.goto('/pricing');
  await expect(page).toHaveURL(/\/sales$/); // bounced back to own role home
});

test('Executive dashboard shows "no production data yet" instead of fake revenue', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('อีเมล').fill('exec@freshour.dev');
  await page.getByLabel('รหัสผ่าน').fill('Freshour2026!');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

  await expect(page).toHaveURL(/\/exec$/);
  await expect(page.getByText('No production data yet')).toBeVisible();
});
