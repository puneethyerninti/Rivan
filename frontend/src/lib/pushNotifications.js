import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { loadSession, postJson } from './auth';

const DEVICE_ID_KEY = 'rivan_device_id';
let listenersAttached = false;
let registering = false;

function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `rv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function isNativePushAvailable() {
  return typeof window !== 'undefined' && Capacitor?.isNativePlatform?.();
}

function attachListeners(session) {
  if (listenersAttached) return;
  listenersAttached = true;

  PushNotifications.addListener('registration', async (token) => {
    try {
      await postJson(
        '/api/push/register',
        {
          token: token.value,
          platform: Capacitor.getPlatform(),
          device_id: getDeviceId(),
          app_version: import.meta.env.VITE_APP_VERSION || '1.0.0',
        },
        session.access_token,
      );
      localStorage.setItem('rivan_push_registered_at', new Date().toISOString());
    } catch (error) {
      console.warn('[Push] Unable to register token with backend:', error);
    }
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.warn('[Push] Device registration failed:', error);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const activeSession = loadSession();
    const role = activeSession?.user?.role;
    const target = event?.notification?.data?.type;
    if (role === 'admin') window.location.href = '/admin';
    else if (role === 'agent') window.location.href = '/agent';
    else if (target === 'visit') window.location.href = '/app#visits';
    else if (target === 'booking') window.location.href = '/app#props';
    else window.location.href = '/app';
  });
}

export async function registerPushNotifications(session) {
  if (!session?.access_token || !isNativePushAvailable() || registering) {
    return { registered: false, reason: 'not_available' };
  }

  registering = true;
  try {
    attachListeners(session);
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      return { registered: false, reason: 'permission_denied' };
    }
    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'rivan_updates',
        name: 'Rivan updates',
        description: 'Bookings, visits, approvals, and account updates',
        importance: 5,
        visibility: 1,
        lights: true,
        vibration: true,
      }).catch(() => null);
    }
    await PushNotifications.register();
    return { registered: true };
  } catch (error) {
    console.warn('[Push] Setup failed:', error);
    return { registered: false, reason: error?.message || 'setup_failed' };
  } finally {
    registering = false;
  }
}
