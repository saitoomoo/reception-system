// Subscribes to Web Push and sends the subscription to the backend.

import { create } from '@bufbuild/protobuf';
import { visitorClient } from '@/lib/connect/client';
import { RegisterPushSubscriptionRequestSchema } from '@/gen/ts/visitor/v1/visitor_pb';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// subscribePush creates a PushSubscription and registers it with the backend.
// Call this after notification permission has been granted and the SW is registered.
// Returns true on success, false on any failure.
export async function subscribePush(visitorId: string): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) {
    console.error('VITE_VAPID_PUBLIC_KEY is not set');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const json = subscription.toJSON();
    const endpoint = json.endpoint ?? '';
    const p256dh = json.keys?.p256dh ?? '';
    const auth = json.keys?.auth ?? '';

    if (!endpoint || !p256dh || !auth) {
      return false;
    }

    await visitorClient.registerPushSubscription(
      create(RegisterPushSubscriptionRequestSchema, {
        visitorId,
        endpoint,
        p256dhKey: p256dh,
        authKey: auth,
      })
    );
    return true;
  } catch (err) {
    console.error('subscribePush failed:', err);
    return false;
  }
}
