import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { loadSession, postJson } from './auth';

const DEVICE_ID_KEY = 'rivan_device_id';
const PUSH_PERMISSION_PRIMER_KEY = 'rivan_push_permission_primer_seen';
const PUSH_STATUS_KEY = 'rivan_push_status';
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

function savePushStatus(status) {
  try {
    localStorage.setItem(PUSH_STATUS_KEY, JSON.stringify({ ...status, checked_at: new Date().toISOString() }));
  } catch {
    // Push diagnostics are helpful but should never block app use.
  }
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
      savePushStatus({ registered: true, platform: Capacitor.getPlatform(), reason: '' });
    } catch (error) {
      console.warn('[Push] Unable to register token with backend:', error);
      savePushStatus({ registered: false, platform: Capacitor.getPlatform(), reason: error?.message || 'backend_registration_failed' });
    }
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.warn('[Push] Device registration failed:', error);
    savePushStatus({ registered: false, platform: Capacitor.getPlatform(), reason: error?.message || 'device_registration_failed' });
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
    const result = { registered: false, reason: 'not_available' };
    savePushStatus(result);
    return result;
  }

  registering = true;
  try {
    attachListeners(session);
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') {
      const primerSeen = localStorage.getItem(PUSH_PERMISSION_PRIMER_KEY) === 'true';
      if (!primerSeen) {
        const accepted = window.confirm(
          'Allow Rivan Realty to send visit, booking, approval, and account update notifications on this device?',
        );
        localStorage.setItem(PUSH_PERMISSION_PRIMER_KEY, 'true');
        if (!accepted) {
          const result = { registered: false, reason: 'primer_declined' };
          savePushStatus(result);
          return result;
        }
      }
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      const result = { registered: false, reason: 'permission_denied' };
      savePushStatus(result);
      return result;
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
    const result = { registered: true, reason: 'native_registration_started' };
    savePushStatus(result);
    return result;
  } catch (error) {
    console.warn('[Push] Setup failed:', error);
    const result = { registered: false, reason: error?.message || 'setup_failed' };
    savePushStatus(result);
    return result;
  } finally {
    registering = false;
  }
}
