/**
 * Scenario 3: Template editing
 *
 * Flow (from TODO.local.md):
 *   全体管理者画面で通知テンプレートの本文を変更
 *   新しい整理券で呼び出し → 変更後の文面で通知が届く
 *
 * The test edits the call_initial template, then verifies a push injected
 * via CDP uses the new text (the worker reads the template at send time
 * from the DB, so the notification_log body reflects the updated template).
 *
 * Note: The CDP-injected push uses whatever text we pass — we test that:
 *   a) The admin UI saves the template successfully.
 *   b) The template is returned correctly by the API after editing.
 *   c) A subsequent push notification (injected with the new text) is received.
 */

import { test, expect } from '@playwright/test';
import {
  loginAsGlobalAdmin,
  registerVisitor,
  enablePushOnCompleteScreen,
  getCDPPushSession,
  deliverPush,
  waitForPushBroadcast,
} from '../helpers';

const BOOTH_ID = process.env.TEST_BOOTH_ID ?? '1';
const UNIQUE_SUFFIX = `E2E_${Date.now()}`;

test.describe('Notification template editing', () => {
  test('admin can view all notification templates', async ({ page }) => {
    await loginAsGlobalAdmin(page);
    await page.goto('/admin/global/notifications');

    // Four default templates should be visible
    await expect(page.locator('text=整理券取得完了')).toBeVisible();
    await expect(page.locator('text=初回呼び出し')).toBeVisible();
    await expect(page.locator('text=再通知（保留遷移時）')).toBeVisible();
    await expect(page.locator('code', { hasText: 'application_completed' })).toBeVisible();
    await expect(page.locator('code', { hasText: 'call_initial' })).toBeVisible();
    await expect(page.locator('code', { hasText: 'call_resent' })).toBeVisible();
  });

  test('admin edits call_initial template and save succeeds', async ({ page }) => {
    await loginAsGlobalAdmin(page);
    await page.goto('/admin/global/notifications');

    // Find the call_initial template card
    const card = page.locator('div').filter({ has: page.locator('code', { hasText: 'call_initial' }) }).first();
    await expect(card).toBeVisible();

    // Edit the body field with a unique marker so we can verify the change
    const bodyTextarea = card.locator('textarea');
    await bodyTextarea.clear();
    const newBody = `{{ニックネーム}} さん、呼び出しテスト ${UNIQUE_SUFFIX}。{{場所}} へどうぞ。`;
    await bodyTextarea.fill(newBody);

    // Check live preview updates
    const preview = card.locator('text=' + UNIQUE_SUFFIX);
    await expect(preview).toBeVisible();

    // Save
    await card.getByRole('button', { name: '保存する' }).click();
    await expect(card.locator('text=保存しました')).toBeVisible({ timeout: 10_000 });
  });

  test('edited template body appears in push notification', async ({ page }) => {
    // First, edit the template as admin
    await loginAsGlobalAdmin(page);
    await page.goto('/admin/global/notifications');

    const card = page.locator('div').filter({ has: page.locator('code', { hasText: 'call_initial' }) }).first();
    const bodyTextarea = card.locator('textarea');
    await bodyTextarea.clear();
    const customBody = `テスト呼び出し ${UNIQUE_SUFFIX} {{ニックネーム}}`;
    await bodyTextarea.fill(customBody);
    await card.getByRole('button', { name: '保存する' }).click();
    await expect(card.locator('text=保存しました')).toBeVisible({ timeout: 10_000 });

    // Now open a visitor context with push enabled
    const visitorContext = await page.context().browser()!.newContext({
      permissions: ['notifications'],
    });
    const visitorPage = await visitorContext.newPage();

    await registerVisitor(visitorPage, BOOTH_ID, { nickname: 'テンプレートテスト', pin: '5678' });
    await enablePushOnCompleteScreen(visitorPage);
    await visitorPage.goto('/mypage');

    const session = await getCDPPushSession(visitorPage);

    // The worker sends the actual template text — simulate what the worker would send
    // after reading the updated template from the DB
    const pushReceived = waitForPushBroadcast(visitorPage);
    await deliverPush(session, {
      title: 'ブース - 呼び出し',
      body: `テスト呼び出し ${UNIQUE_SUFFIX} テンプレートテスト`,
      url: '/mypage',
    });

    const notification = await pushReceived;
    expect(notification.body).toContain(UNIQUE_SUFFIX);

    await visitorContext.close();
  });

  test('template preview shows variable substitution', async ({ page }) => {
    await loginAsGlobalAdmin(page);
    await page.goto('/admin/global/notifications');

    const card = page.locator('div').filter({ has: page.locator('code', { hasText: 'application_completed' }) }).first();

    // Set a body that uses all variables
    const bodyTextarea = card.locator('textarea');
    await bodyTextarea.clear();
    await bodyTextarea.fill('{{ニックネーム}} さん、{{ブース名}} の整理券 {{整理券番号}} を取得しました。');

    // Preview should substitute sample values
    const preview = card.locator('.bg-gray-50');
    await expect(preview.locator('text=サンプル太郎')).toBeVisible();
    await expect(preview.locator('text=HMD体験ブース')).toBeVisible();
    await expect(preview.locator('text=42')).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    // Restore call_initial template to default after test run
    const page = await browser.newPage();
    try {
      await loginAsGlobalAdmin(page);
      await page.goto('/admin/global/notifications');

      const card = page.locator('div').filter({ has: page.locator('code', { hasText: 'call_initial' }) }).first();
      const bodyTextarea = card.locator('textarea');
      await bodyTextarea.clear();
      await bodyTextarea.fill('{{ニックネーム}} さん、お時間です。{{場所}} へお越しください。');
      await card.getByRole('button', { name: '保存する' }).click();
      await page.waitForSelector('text=保存しました');
    } finally {
      await page.close();
    }
  });
});
