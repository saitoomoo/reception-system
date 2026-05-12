/**
 * Scenario 2: Polling fallback — no push permission
 *
 * Verifies that even without Web Push, a visitor can see status changes
 * on-screen through the 5-second polling interval.
 *
 * Flow:
 *   別ブラウザ（通知許可なし）で受付登録 → Web Push 案内でスキップ
 *   整理券取得 → Push 通知は届かない → 画面 polling で状態変化を確認できる
 */

import { test, expect } from '@playwright/test';
import { registerVisitor } from '../helpers';

const BOOTH_ID = process.env.TEST_BOOTH_ID ?? '1';
// Polling interval in the app is 5s for ticket status; allow a bit of slack.
const POLL_TIMEOUT_MS = 15_000;

test.describe('Polling fallback (no push permission)', () => {
  // Explicitly do NOT grant 'notifications' — starts as 'default'
  test.use({ permissions: [] });

  test('push prompt is shown but can be skipped', async ({ page }) => {
    await registerVisitor(page, BOOTH_ID);

    // Web Push prompt should appear since push is supported in Chromium
    const skipButton = page.getByRole('button', { name: 'スキップ' });
    if (await skipButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipButton.click();
    }

    // Should land on complete screen with no push UI active
    await expect(page.locator('text=マイページへ')).toBeVisible();
  });

  test('waiting-status screen shows ticket in waiting state via polling', async ({ page }) => {
    const { receptionNumber } = await registerVisitor(page, BOOTH_ID);

    // Skip push prompt if shown
    const skip = page.getByRole('button', { name: 'スキップ' });
    if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skip.click();
    }

    // Navigate to mypage and click through to waiting status
    await page.getByRole('button', { name: 'マイページへ' }).click();
    await page.waitForURL('**/mypage');

    // Ticket list should show the new ticket in waiting state
    await expect(page.locator('text=待機中')).toBeVisible({ timeout: 10_000 });

    // Reception number should be displayed
    await expect(page.locator(`text=${receptionNumber}`)).toBeVisible();
  });

  test('polling detects called status without push', async ({ page, context }) => {
    // This test requires a staff session to call the ticket.
    // It sets up two contexts: visitor + staff (same browser, different pages).

    const { receptionNumber } = await registerVisitor(page, BOOTH_ID);

    // Skip push prompt
    const skip = page.getByRole('button', { name: 'スキップ' });
    if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skip.click();
    }

    // Navigate to waiting status for the newly created ticket
    await page.getByRole('button', { name: 'マイページへ' }).click();
    await page.waitForURL('**/mypage');

    // Find the ticket link and open waiting status
    const ticketLink = page.locator('button', { hasText: receptionNumber }).first();
    if (await ticketLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ticketLink.click();
      await page.waitForURL('**/mypage/waiting**');
    }

    // Staff calls the ticket via the admin API directly using a second page
    const adminPage = await context.newPage();
    await adminPage.goto('/admin/global/login');
    await adminPage.getByPlaceholder('admin').fill('admin');
    await adminPage.getByPlaceholder('パスワードを入力').fill('admin');
    await adminPage.getByRole('button', { name: 'ログイン' }).click();
    await adminPage.waitForURL('**/admin/global/dashboard');

    // Navigate to the booth operations page and call the first waiting ticket
    await adminPage.goto(`/admin/booth/${BOOTH_ID}`);
    const callButton = adminPage.getByRole('button', { name: '呼び出す' }).first();
    if (await callButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await callButton.click();
    }
    await adminPage.close();

    // Back on visitor page: polling should detect the 'called' state
    await expect(page.locator('text=呼び出されました')).toBeVisible({
      timeout: POLL_TIMEOUT_MS,
    });
  });
});
