import type { BrowserContext, CDPSession, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

// ---------- Visitor registration ----------

export type VisitorInfo = { nickname: string; pin: string };

/**
 * Registers a new visitor via the booth reservation flow.
 * Returns after the complete screen is displayed (shows 受付番号 + QR).
 * Requires a booth to exist with the given boothId.
 */
export async function registerVisitor(
  page: Page,
  boothId: string,
  info: VisitorInfo = { nickname: 'テストユーザー', pin: '1234' },
): Promise<{ receptionNumber: string }> {
  await page.goto(`/booths/${boothId}/reserve/new`);

  // InputStep: nickname + PIN
  await page.getByPlaceholder('ニックネームを入力').fill(info.nickname);
  await page.locator('input[placeholder="0000"]').first().fill(info.pin);
  await page.locator('input[placeholder="0000"]').nth(1).fill(info.pin);
  await page.getByRole('button', { name: '次へ' }).click();

  // AgeInputStep: single adult participant
  await page.getByPlaceholder('人数').fill('1');
  await page.getByRole('button', { name: '次へ' }).click();
  // age input for participant 1
  await page.locator('input[type="number"]').first().fill('25');
  await page.getByRole('button', { name: '整理券を取得する' }).click();

  // Wait for complete screen
  await page.waitForURL(`**/reserve/new/complete`);
  const receptionNumber = await page.locator('text=/[A-Z]-\\d{3}/').first().textContent() ?? '';

  return { receptionNumber: receptionNumber.trim() };
}

// ---------- Push subscription ----------

/**
 * Enables push notifications and returns the CDP session with the SW registration.
 * Call AFTER registerVisitor (on the complete screen) or via Mypage toggle.
 */
export async function enablePushOnCompleteScreen(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: '通知を有効にする' });
  if (await button.isVisible()) {
    await button.click();
    // wait for "通知が有効になりました" confirmation
    await page.waitForSelector('text=通知が有効になりました', { timeout: 10_000 });
  }
}

// ---------- CDP push injection ----------

type CDPPushSession = { cdp: CDPSession; registrationId: string };

/**
 * Sets up a CDP session and waits for the service worker registration.
 * Must be called after the SW has been registered (i.e. after subscribePush).
 */
export async function getCDPPushSession(page: Page): Promise<CDPPushSession> {
  const cdp = await page.context().newCDPSession(page);

  const registrationId = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('SW registration not detected within timeout')),
      10_000,
    );
    cdp.on('ServiceWorker.workerRegistrationUpdated', (event) => {
      const reg = (event as { registrations: { registrationId: string; scopeURL: string; isDeleted?: boolean }[] })
        .registrations
        .find((r) => !r.isDeleted && r.scopeURL.startsWith(BASE_URL));
      if (reg) {
        clearTimeout(timer);
        resolve(reg.registrationId);
      }
    });

    cdp.send('ServiceWorker.enable').catch(reject);
  });

  return { cdp, registrationId };
}

/**
 * Injects a synthetic push event into the service worker via CDP.
 * The SW's push listener will fire exactly as if a real push arrived.
 */
export async function deliverPush(
  session: CDPPushSession,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  await session.cdp.send('ServiceWorker.deliverPushMessage', {
    origin: BASE_URL,
    registrationId: session.registrationId,
    data: JSON.stringify(payload),
  });
}

/**
 * Waits for the service worker to broadcast a PUSH_RECEIVED message to the page.
 * Resolves with the message data so tests can assert on title/body.
 */
export function waitForPushBroadcast(
  page: Page,
): Promise<{ title: string; body: string; url: string }> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('message', function handler(e: MessageEvent) {
          if (e.data?.type === 'PUSH_RECEIVED') {
            navigator.serviceWorker.removeEventListener('message', handler);
            resolve(e.data as { title: string; body: string; url: string });
          }
        });
      }),
  );
}

// ---------- Admin helpers ----------

/**
 * Logs in as global admin and navigates to the dashboard.
 */
export async function loginAsGlobalAdmin(
  page: Page,
  credentials: { name: string; password: string } = { name: 'admin', password: 'admin' },
): Promise<void> {
  await page.goto('/admin/global/login');
  await page.getByPlaceholder('admin').fill(credentials.name);
  await page.getByPlaceholder('パスワードを入力').fill(credentials.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('**/admin/global/dashboard');
}

/**
 * Logs in as a booth staff member.
 */
export async function loginAsStaff(
  page: Page,
  boothId: string,
  password: string,
): Promise<void> {
  await page.goto('/admin');
  // select booth
  await page.selectOption('select', boothId);
  await page.getByPlaceholder('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL(`**/admin/booth/${boothId}/**`);
}

/**
 * Creates a BrowserContext with notification permission denied.
 */
export async function deniedNotificationContext(
  context: BrowserContext,
): Promise<void> {
  await context.clearPermissions();
  // Do NOT grant 'notifications' — leaves it in 'prompt' state.
  // To force denial we can override it:
  await context.grantPermissions([]);
}
