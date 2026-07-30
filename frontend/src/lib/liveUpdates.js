import { getWebSocketUrl, supportsLiveUpdates } from './auth';

const DEFAULT_POLL_INTERVAL_MS = 15000;
const DEFAULT_HEARTBEAT_MS = 25000;
const DEFAULT_STALE_MS = 65000;
const DEFAULT_CAPABILITY_RETRY_MS = 30000;
const DEFAULT_RECONNECT_DELAYS = [1000, 2500, 5000, 10000, 20000, 30000];

export function connectLiveUpdates({
  token,
  onStatus,
  onMessage,
  onRefresh,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  staleMs = DEFAULT_STALE_MS,
  capabilityRetryMs = DEFAULT_CAPABILITY_RETRY_MS,
  reconnectDelays = DEFAULT_RECONNECT_DELAYS,
}) {
  let closed = false;
  let socket = null;
  let poller = null;
  let heartbeat = null;
  let reconnectTimer = null;
  let capabilityRetryTimer = null;
  let reconnectAttempt = 0;
  let lastMessageAt = Date.now();

  const setStatus = (status) => {
    if (!closed) onStatus?.(status);
  };

  const stopPolling = () => {
    if (poller) window.clearInterval(poller);
    poller = null;
  };

  const stopHeartbeat = () => {
    if (heartbeat) window.clearInterval(heartbeat);
    heartbeat = null;
  };

  const stopCapabilityRetry = () => {
    if (capabilityRetryTimer) window.clearTimeout(capabilityRetryTimer);
    capabilityRetryTimer = null;
  };

  const startPolling = () => {
    if (closed || poller) return;
    setStatus('polling');
    onRefresh?.();
    poller = window.setInterval(() => onRefresh?.(), pollIntervalMs);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)];
    reconnectAttempt += 1;
    setStatus('reconnecting');
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  };

  const scheduleCapabilityRetry = () => {
    if (closed || capabilityRetryTimer) return;
    capabilityRetryTimer = window.setTimeout(() => {
      capabilityRetryTimer = null;
      checkCapabilityAndConnect();
    }, capabilityRetryMs);
  };

  const closeSocket = () => {
    stopHeartbeat();
    if (socket && socket.readyState <= WebSocket.OPEN) {
      try {
        socket.close();
      } catch {}
    }
    socket = null;
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeat = window.setInterval(() => {
      if (closed || !socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessageAt > staleMs) {
        closeSocket();
        startPolling();
        scheduleReconnect();
        return;
      }
      try {
        socket.send(JSON.stringify({ action: 'ping', sent_at: new Date().toISOString() }));
      } catch {
        closeSocket();
        startPolling();
        scheduleReconnect();
      }
    }, heartbeatMs);
  };

  function openSocket() {
    if (closed || !token || typeof WebSocket === 'undefined') {
      startPolling();
      return;
    }

    closeSocket();
    try {
      socket = new WebSocket(getWebSocketUrl(token));
    } catch {
      startPolling();
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      if (closed) return;
      reconnectAttempt = 0;
      lastMessageAt = Date.now();
      stopCapabilityRetry();
      stopPolling();
      setStatus('connected');
      startHeartbeat();
      try {
        socket.send(JSON.stringify({ action: 'subscribe-dashboard' }));
      } catch {}
    };

    socket.onmessage = (event) => {
      if (closed) return;
      lastMessageAt = Date.now();
      try {
        const message = JSON.parse(event.data);
        if (message?.event === 'live.pong') return;
        onMessage?.(message);
      } catch {}
    };

    socket.onerror = () => {
      if (closed) return;
      startPolling();
    };

    socket.onclose = () => {
      if (closed) return;
      closeSocket();
      startPolling();
      scheduleReconnect();
    };
  }

  function checkCapabilityAndConnect() {
    supportsLiveUpdates().then((enabled) => {
      if (closed) return;
      if (enabled) openSocket();
      else {
        startPolling();
        scheduleCapabilityRetry();
      }
    }).catch(() => {
      startPolling();
      scheduleCapabilityRetry();
    });
  }

  checkCapabilityAndConnect();

  return () => {
    closed = true;
    stopPolling();
    stopHeartbeat();
    stopCapabilityRetry();
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeSocket();
  };
}
