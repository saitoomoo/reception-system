// Registers the Service Worker and requests notification permission.
// Returns true if the SW was registered and permission was granted.
// Returns false if the browser doesn't support push, permission was denied,
// or an error occurred.

export async function registerPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return false;
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
    return true;
  } catch {
    return false;
  }
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function currentPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}
