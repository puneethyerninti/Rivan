#!/usr/bin/env node

const backendUrl = (process.argv[2] || process.env.BACKEND_URL || 'https://rivan.onrender.com').replace(/\/$/, '');
const accessToken = process.argv[3] || process.env.ACCESS_TOKEN || '';
const expectedRole = String(process.argv[4] || process.env.EXPECTED_ROLE || '').trim().toLowerCase();
const timeoutMs = Number(process.env.PRODUCTION_VERIFY_TIMEOUT_MS || 15000);
const maxAttempts = Math.max(1, Number(process.env.PRODUCTION_VERIFY_ATTEMPTS || 3));

if (String(process.env.ALLOW_INSECURE_TLS || '').toLowerCase() === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('WARN TLS verification is disabled for this smoke test run only.');
}

const checks = [];

function addCheck(name, status, details = '') {
  checks.push({ name, status, details });
  const suffix = details ? ` - ${details}` : '';
  console.log(`${status === 'ok' ? 'OK' : status === 'skip' ? 'SKIP' : 'FAIL'} ${name}${suffix}`);
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
    if (options.body && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    try {
      const response = await fetch(`${backendUrl}${path}${path.includes('?') ? '&' : '?'}_t=${Date.now()}`, {
        cache: 'no-store',
        method: options.method || 'GET',
        headers,
        body: typeof options.body === 'string' ? options.body : options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 240) };
      }
      return { ok: response.ok, status: response.status, data };
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

function requireOk(name, result, detailBuilder = null) {
  if (!result.ok) {
    throw new Error(`${name} returned ${result.status}: ${JSON.stringify(result.data)}`);
  }
  addCheck(name, 'ok', detailBuilder ? detailBuilder(result.data) : '');
  return result.data;
}

async function verifyPublicReadiness() {
  const health = requireOk('/api/health', await fetchJson('/api/health'), (data) => {
    const live = data.live_updates_enabled === true ? 'live updates advertised' : 'live updates disabled/degraded';
    return `${data.mode || 'unknown mode'}, ${live}`;
  });

  const ready = requireOk('/api/ready', await fetchJson('/api/ready'), (data) => {
    const db = data.database || data.db || (data.ok ? 'ready' : 'unknown');
    return `database=${db}`;
  });

  if (ready.ok === false) {
    throw new Error('/api/ready reported not ready');
  }

  return { health, ready };
}

async function verifyPaymentsOnHold() {
  const result = await fetchJson('/api/payments/summary');
  if (result.status === 401) {
    addCheck('payments hold boundary', 'ok', 'unauthenticated requests are protected');
    return;
  }
  if ([410, 501].includes(result.status)) {
    addCheck('payments hold boundary', 'ok', `returned ${result.status}`);
    return;
  }
  throw new Error(`/api/payments/summary should be protected or on hold, got ${result.status}: ${JSON.stringify(result.data)}`);
}

async function verifyAuthenticatedBase() {
  if (!accessToken) {
    addCheck('authenticated workflow checks', 'skip', 'set ACCESS_TOKEN to verify role dashboards');
    return null;
  }

  const me = requireOk('/api/auth/me', await fetchJson('/api/auth/me'), (data) => {
    const role = data.portal_role || data.role || 'unknown';
    return `${data.name || data.phone || data.id || 'user'} (${role})`;
  });
  const role = String(me.portal_role || me.role || '').toLowerCase();
  if (expectedRole && role !== expectedRole) {
    throw new Error(`Expected token role ${expectedRole}, but /api/auth/me returned ${role || 'unknown'}`);
  }

  requireOk('/api/notifications', await fetchJson('/api/notifications'), (data) => {
    const count = Array.isArray(data) ? data.length : Array.isArray(data.notifications) ? data.notifications.length : 0;
    return `${count} records`;
  });

  requireOk('/api/push/status', await fetchJson('/api/push/status'), (data) => {
    const configured = data.firebase_configured ? 'firebase configured' : 'firebase missing';
    const tokens = Number(data.registered_tokens || 0);
    return `${configured}, registered_tokens=${tokens}`;
  });

  return { me, role };
}

async function verifyRoleDashboards(role) {
  if (!accessToken || !role) return;

  if (role === 'agent') {
    requireOk('/api/agent/dashboard', await fetchJson('/api/agent/dashboard'), (data) => {
      const kpis = data.kpis || {};
      return `assets=${kpis.assets ?? data.assets?.length ?? 0}, bookings=${kpis.bookings ?? data.bookings?.length ?? 0}, visits=${kpis.visits ?? data.visits?.length ?? 0}`;
    });
    requireOk('/api/crm/dashboard/agent', await fetchJson('/api/crm/dashboard/agent'), (data) => {
      return `leads=${data.leads?.length ?? 0}, tasks=${data.tasks?.length ?? 0}`;
    });
    requireOk('/api/agent/site-visits', await fetchJson('/api/agent/site-visits'), (data) => {
      const rows = Array.isArray(data) ? data : data.visits || [];
      return `${rows.length} visits`;
    });
    return;
  }

  if (role === 'admin') {
    requireOk('/api/admin/stats', await fetchJson('/api/admin/stats'), (data) => {
      return `users=${data.users ?? 0}, partners=${data.agents ?? 0}, bookings=${data.bookings ?? 0}, visits=${data.visits ?? 0}`;
    });
    requireOk('/api/admin/overview', await fetchJson('/api/admin/overview'), (data) => {
      return `agents=${data.agents?.length ?? 0}, visits=${data.visits?.length ?? 0}`;
    });
    requireOk('/api/admin/bookings', await fetchJson('/api/admin/bookings'), (data) => {
      return `${Array.isArray(data) ? data.length : 0} bookings`;
    });
    requireOk('/api/admin/visits', await fetchJson('/api/admin/visits'), (data) => {
      return `${Array.isArray(data) ? data.length : 0} visits`;
    });
    return;
  }

  requireOk('/api/properties', await fetchJson('/api/properties'), (data) => {
    return `${Array.isArray(data) ? data.length : 0} properties`;
  });
  requireOk('/api/myland', await fetchJson('/api/myland'), (data) => {
    return `${Array.isArray(data) ? data.length : 0} records`;
  });
}

async function main() {
  console.log(`Verifying production workflows: ${backendUrl}`);
  await verifyPublicReadiness();
  await verifyPaymentsOnHold();
  const auth = await verifyAuthenticatedBase();
  await verifyRoleDashboards(auth?.role);

  const failures = checks.filter((check) => check.status === 'fail');
  if (failures.length) {
    throw new Error(`${failures.length} production workflow checks failed`);
  }
  console.log(`Production workflow smoke test passed (${checks.length} checks).`);
}

main().catch((error) => {
  console.error('Production workflow smoke test failed.');
  console.error(error?.message || error);
  process.exit(1);
});
