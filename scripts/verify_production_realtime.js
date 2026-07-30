#!/usr/bin/env node

const backendUrl = (process.argv[2] || process.env.BACKEND_URL || 'https://rivan.onrender.com').replace(/\/$/, '');
const accessToken = process.argv[3] || process.env.ACCESS_TOKEN || '';
const timeoutMs = Number(process.env.REALTIME_VERIFY_TIMEOUT_MS || 12000);
const maxAttempts = Math.max(1, Number(process.env.REALTIME_VERIFY_ATTEMPTS || 3));

if (String(process.env.ALLOW_INSECURE_TLS || '').toLowerCase() === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('WARN TLS verification is disabled for this smoke test run only.');
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchJson(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { ...(options.headers || {}) };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    try {
      const response = await fetch(`${backendUrl}${path}${path.includes('?') ? '&' : '?'}_t=${Date.now()}`, {
        cache: 'no-store',
        method: options.method || 'GET',
        headers,
        body: options.body,
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 240) };
      }
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}: ${JSON.stringify(data)}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const cause = lastError?.cause;
  const code = cause?.code || lastError?.code || lastError?.name || 'FETCH_ERROR';
  const message = cause?.message || lastError?.message || String(lastError);
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    throw new Error(`${path} failed TLS verification (${code}). Check local certificate trust, or run this local-only smoke test with ALLOW_INSECURE_TLS=true.`);
  }
  throw new Error(`${path} failed after ${maxAttempts} attempt(s): ${code} ${message}`);
}

async function verifyWebSocket() {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Node.js WebSocket API is unavailable. Use Node 22+ or verify manually in the browser.');
  }

  const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws/live${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`;

  return withTimeout(new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let opened = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {}
      resolve(result);
    };

    socket.onopen = () => {
      opened = true;
      socket.send(JSON.stringify({ action: 'ping', source: 'production-smoke-test' }));
    };

    socket.onmessage = (event) => {
      let payload = {};
      try {
        payload = JSON.parse(event.data);
      } catch {
        payload = { raw: String(event.data).slice(0, 240) };
      }
      finish({ url: wsUrl.replace(/token=[^&]+/, 'token=***'), firstMessage: payload });
    };

    socket.onerror = () => {
      reject(new Error(`WebSocket failed to connect to ${wsUrl.replace(/token=[^&]+/, 'token=***')}`));
    };

    socket.onclose = (event) => {
      if (!settled && !opened) {
        reject(new Error(`WebSocket closed before opening: code=${event.code || 'unknown'}`));
      }
    };
  }), 'WebSocket verification');
}

async function main() {
  console.log(`Verifying production backend: ${backendUrl}`);

  const health = await fetchJson('/api/health');
  console.log('health: ok', {
    mode: health.mode,
    live_updates_enabled: health.live_updates_enabled,
    live_updates_path: health.live_updates_path,
  });

  const ready = await fetchJson('/api/ready');
  console.log('ready: ok', ready);

  const ws = await verifyWebSocket();
  console.log('websocket: ok', ws);

  if (accessToken) {
    const push = await fetchJson('/api/push/status');
    console.log('push: ok', {
      firebase_configured: push.firebase_configured,
      native_capable: push.native_capable,
      web_push_configured: push.web_push_configured,
      registered_tokens: push.registered_tokens,
    });

    if (String(process.env.PUSH_TEST || '').toLowerCase() === 'true') {
      const pushTest = await fetchJson('/api/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      console.log('push-test: ok', pushTest);
    }
  } else {
    console.log('push: skipped (set ACCESS_TOKEN to verify authenticated push status)');
  }

  console.log('Production realtime smoke test passed.');
}

main().catch((error) => {
  console.error('Production realtime smoke test failed.');
  console.error(error?.message || error);
  process.exit(1);
});
