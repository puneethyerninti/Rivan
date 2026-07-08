import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, clearSession, getJson, getWebSocketUrl, loadSession, postJson, putJson, requestJson, saveSession, supportsLiveUpdates } from '../lib/auth';

const cardStyle = {
  background: '#fff',
  border: '1px solid #e7ede3',
  borderRadius: '18px',
  padding: '18px',
  boxShadow: '0 14px 34px -28px rgba(18,53,29,.55)',
};

const statusTone = {
  approved: ['#e6f4ea', '#1a8a4a'],
  active: ['#e6f4ea', '#1a8a4a'],
  open: ['#fdf3e8', '#c2711f'],
  pending: ['#fdf3e8', '#c2711f'],
  rejected: ['#fdeaea', '#c93b3b'],
  suspended: ['#fdeaea', '#c93b3b'],
  resolved: ['#eef2fb', '#2a6fdb'],
  completed: ['#eef2fb', '#2a6fdb'],
  booked: ['#eef2fb', '#2a6fdb'],
  reserved: ['#e9f4e6', '#1a5e2e'],
  sold: ['#e9f4e6', '#1a5e2e'],
};

function tone(label) {
  const key = String(label || '').trim().toLowerCase();
  const [bg, color] = statusTone[key] || ['#eef3ec', '#3d4f40'];
  return {
    background: bg,
    color,
    padding: '5px 11px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 800,
    display: 'inline-flex',
  };
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

function initialsOf(name) {
  return String(name || 'AD')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'AD';
}

function formatPhoneDisplay(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(-10);
  return digits ? `+91 ${digits}` : '';
}

function liveStatusLabel(value) {
  if (value === 'connected') return 'Live updates are on';
  if (value === 'polling') return 'Refreshing automatically';
  if (value === 'disconnected') return 'Reconnecting updates';
  return 'Connecting updates';
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => loadSession());
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [properties, setProperties] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [visits, setVisits] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({ permissions: {}, notification_preferences: {}, role_label: 'Admin' });
  const [profileForm, setProfileForm] = useState({
    name: session?.user?.name || '',
    email: session?.user?.email || '',
    address: session?.user?.address || '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [liveStatus, setLiveStatus] = useState('connecting');

  useEffect(() => {
    if (!session?.access_token || session?.user?.role !== 'admin') {
      navigate('/login', { replace: true });
    }
  }, [navigate, session]);

  const user = session?.user || {};
  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  const defaultSettings = {
    permissions: {},
    notification_preferences: {},
    role_label: 'Admin',
  };

  const getOptional = async (path, fallback) => {
    try {
      return await getJson(path, session.access_token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return fallback;
      }
      throw err;
    }
  };

  const loadSupportTickets = async () => {
    try {
      return await getJson('/api/admin/support-tickets', session.access_token);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) {
        throw err;
      }

      const requests = await getJson('/api/admin/service-requests', session.access_token).catch(() => []);
      return requests.map((item, index) => ({
        id: item.id || `sr-${index}`,
        ticket_number: item.ticket_number || item.id || `SR-${index + 1}`,
        customer_name: item.customer_name || item.user_name || 'Customer',
        subject: item.subject || item.title || item.request_type || 'Service Request',
        priority: item.priority || 'medium',
        status: item.status || 'open',
        created_at: item.created_at,
      }));
    }
  };

  const refreshAll = async (showLoader = true) => {
    if (!session?.access_token) return;
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [
        nextStats,
        nextUsers,
        nextAgents,
        nextProperties,
        nextBookings,
        nextVisits,
        nextSupport,
        nextAudit,
        nextNotifications,
        nextSettings,
      ] = await Promise.all([
        getJson('/api/admin/stats', session.access_token).catch(() => null),
        getJson('/api/admin/users', session.access_token).catch(() => []),
        getJson('/api/admin/agents', session.access_token).catch(() => []),
        getJson('/api/admin/properties', session.access_token).catch(() => []),
        getJson('/api/admin/bookings', session.access_token).catch(() => []),
        getOptional('/api/admin/visits', []),
        loadSupportTickets(),
        getJson('/api/admin/audit-logs', session.access_token).catch(() => []),
        getJson('/api/notifications', session.access_token).catch(() => []),
        getOptional('/api/admin/settings', defaultSettings),
      ]);

      setStats(nextStats);
      setUsers(nextUsers);
      setAgents(nextAgents);
      setProperties(nextProperties);
      setBookings(nextBookings);
      setVisits(nextVisits);
      setSupportTickets(nextSupport);
      setAuditLogs(nextAudit);
      setNotifications(nextNotifications);
      setSettings(nextSettings);
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        address: user.address || '',
      });
    } catch (err) {
      setError(err?.message || 'Failed to load admin dashboard');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return undefined;
    let closed = false;
    let poller = null;
    let ws = null;

    const beginPolling = () => {
      if (closed) return;
      setLiveStatus('polling');
      if (!poller) {
        poller = window.setInterval(() => {
          refreshAll(false);
        }, 15000);
      }
    };

    supportsLiveUpdates().then((enabled) => {
      if (closed) return;
      if (!enabled) {
        beginPolling();
        return;
      }

      ws = new WebSocket(getWebSocketUrl(session.access_token));

      ws.onopen = () => {
        if (closed) return;
        setLiveStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const type = message?.event;
          const payload = message?.payload || {};

          if (type === 'notification.created' && payload.notification) {
            setNotifications((current) => [payload.notification, ...current]);
          } else if (type === 'notification.read') {
            setNotifications((current) =>
              current.map((item) =>
                payload.all || item.id === payload.notification_id ? { ...item, read: true } : item,
              ),
            );
          } else if (
            ['dashboard.metrics_updated', 'agent.status_updated', 'booking.updated', 'visit.updated', 'service_request.updated'].includes(type)
          ) {
            refreshAll(false);
          }
        } catch {}
      };

      ws.onerror = () => {
        beginPolling();
      };

      ws.onclose = () => {
        if (closed) return;
        setLiveStatus((current) => (current === 'connected' ? 'disconnected' : 'polling'));
        beginPolling();
      };
    });

    return () => {
      closed = true;
      if (poller) window.clearInterval(poller);
      ws?.close();
    };
  }, [session?.access_token]);

  const pendingAgents = agents.filter((item) => item.approval_status === 'pending');

  const dashboardCards = [
    { label: 'Users', value: stats?.users ?? users.length },
    { label: 'Agents', value: stats?.agents ?? agents.length },
    { label: 'Bookings', value: stats?.bookings ?? bookings.length },
    { label: 'Visits', value: stats?.visits ?? visits.length },
    { label: 'Service Requests', value: stats?.service_requests ?? supportTickets.length },
    { label: 'Properties', value: stats?.properties ?? properties.length },
  ];

  const latestBookings = bookings.slice(0, 6);
  const latestVisits = visits.slice(0, 6);
  const latestTickets = supportTickets.slice(0, 6);
  const latestAudit = auditLogs.slice(0, 8);

  const markAllRead = async () => {
    await postJson('/api/notifications/read-all', {}, session.access_token).catch(() => null);
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  };

  const updateAgentStatus = async (agentId, approvalStatus) => {
    try {
      try {
        await requestJson(
          `/api/admin/agents/${agentId}/status`,
          { method: 'POST', body: { approval_status: approvalStatus, review_notes: '' } },
          session.access_token,
        );
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 405) {
          throw err;
        }
        await putJson(
          `/api/admin/agents/${agentId}/status`,
          { approval_status: approvalStatus, review_notes: '' },
          session.access_token,
        );
      }
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to update agent status');
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const response = await putJson('/api/admin/settings', settings, session.access_token);
      setSettings(response.settings || settings);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Settings endpoint is not live on the current backend deployment yet.');
        return;
      }
      setError(err?.message || 'Failed to save admin settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await putJson('/api/auth/profile', profileForm, session.access_token);
      const nextSession = { ...session, user: updated };
      saveSession(nextSession);
      setSession(nextSession);
    } catch (err) {
      setError(err?.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  const navItems = [
    ['dashboard', 'Dashboard'],
    ['approvals', `Approvals (${pendingAgents.length})`],
    ['users', 'Users'],
    ['properties', 'Properties'],
    ['bookings', 'Bookings'],
    ['visits', 'Visits'],
    ['support', 'Support'],
    ['notifications', `Notifications (${unreadCount})`],
    ['audit', 'Audit'],
    ['settings', 'Settings'],
    ['profile', 'Profile'],
  ];

  const renderTable = (columns, rows) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            {columns.map((column) => (
              <th key={column} style={{ fontSize: '11px', fontWeight: 800, color: '#8a9a8c', textTransform: 'uppercase', padding: '0 12px 12px 0' }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ borderTop: '1px solid #eef3ec' }}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ padding: '13px 12px 13px 0', fontSize: '13px', color: '#16231a' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#eef2ec', color: '#16231a' }}>
      <aside style={{ width: '260px', background: '#12351d', color: '#fff', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <img src="/assets/logo-full.png" alt="Rivan" style={{ width: '152px', height: 'auto' }} />
          <p style={{ margin: '18px 0 0', fontSize: '12px', color: '#bcd6bd', lineHeight: 1.5 }}>
            Manage approvals, users, properties, bookings, and support activity from one place.
          </p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {navItems.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                border: 'none',
                borderRadius: '12px',
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: 700,
                background: page === id ? '#fff' : 'rgba(255,255,255,.08)',
                color: page === id ? '#12351d' : '#fff',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          onClick={logout}
          style={{ marginTop: 'auto', height: '46px', border: 'none', borderRadius: '12px', background: '#e2822a', color: '#fff', fontFamily: 'inherit', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
        >
          Logout
        </button>
      </aside>

      <main style={{ flex: 1, padding: '24px' }}>
        <div style={{ ...cardStyle, marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', color: '#12351d' }}>
              {page === 'dashboard' ? 'Admin Dashboard' : navItems.find(([id]) => id === page)?.[1] || 'Admin'}
            </h1>
            <p style={{ margin: '6px 0 0', color: '#8a9a8c', fontSize: '12px' }}>
              {liveStatusLabel(liveStatus)}
            </p>
            <p style={{ margin: '6px 0 0', color: '#6d7d6f', fontSize: '14px' }}>
              Welcome, {user.name || 'Admin'} • {settings.role_label || 'Admin'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button onClick={() => setPage('notifications')} style={{ position: 'relative', width: '52px', height: '52px', borderRadius: '16px', border: '1px solid #e7ede3', background: '#fff', cursor: 'pointer' }}>
              <span style={{ fontSize: '20px' }}>🔔</span>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', minWidth: '22px', height: '22px', borderRadius: '999px', background: '#e2822a', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 6px' }}>
                  {unreadCount}
                </span>
              )}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px', borderRadius: '18px', border: '1px solid #e7ede3', background: '#fff' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'linear-gradient(160deg,#1a5e2e,#124423)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                {initialsOf(user.name)}
              </div>
              <div>
                <div style={{ fontWeight: 800 }}>{user.name || 'Admin'}</div>
                <div style={{ fontSize: '12px', color: '#8a9a8c' }}>{formatPhoneDisplay(user.phone) || settings.role_label || 'Admin'}</div>
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ ...cardStyle, marginBottom: '18px', color: '#c93b3b', fontWeight: 700 }}>{error}</div>}
        {loading && <div style={cardStyle}>Loading live admin data...</div>}

        {!loading && page === 'dashboard' && (
          <div style={{ display: 'grid', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px' }}>
              {dashboardCards.map((item) => (
                <div key={item.label} style={cardStyle}>
                  <div style={{ fontSize: '12px', color: '#8a9a8c', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ marginTop: '10px', fontSize: '30px', fontWeight: 800, color: '#12351d' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: '18px' }}>
              <section style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Latest Bookings</h3>
                {renderTable(
                  ['Customer', 'Property', 'Plot', 'Status', 'Created'],
                  latestBookings.map((item) => [
                    item.name || item.customer?.name || 'Customer',
                    item.property_name || item.property_id || 'Property',
                    item.plot_number || item.plot_id || 'Plot',
                    <span style={tone(item.status)}>{String(item.status || 'pending').replace('_', ' ')}</span>,
                    formatDateTime(item.created_at),
                  ]),
                )}
              </section>
              <section style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Pending Agent Approvals</h3>
                {pendingAgents.length === 0 ? (
                  <p style={{ margin: 0, color: '#6d7d6f' }}>No pending applications right now.</p>
                ) : (
                  pendingAgents.slice(0, 6).map((agent) => (
                    <div key={agent.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '12px 0', borderTop: '1px solid #eef3ec' }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{agent.name}</div>
                        <div style={{ fontSize: '12px', color: '#8a9a8c' }}>{agent.phone ? `+91 ${agent.phone}` : 'No phone'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => updateAgentStatus(agent.id, 'approved')} style={{ border: 'none', borderRadius: '10px', background: '#1a5e2e', color: '#fff', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => updateAgentStatus(agent.id, 'rejected')} style={{ border: '1px solid #f0c8c8', borderRadius: '10px', background: '#fff', color: '#c93b3b', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>
          </div>
        )}

        {!loading && page === 'approvals' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Agent Applications</h3>
            {renderTable(
              ['Name', 'Phone', 'Email', 'Status', 'Applied'],
              agents.map((agent) => [
                agent.name || 'Agent',
                agent.phone ? `+91 ${agent.phone}` : '—',
                agent.email || '—',
                <span style={tone(agent.approval_status || agent.status)}>{agent.approval_status || agent.status || 'pending'}</span>,
                formatDateTime(agent.agent_application_submitted_at || agent.created_at),
              ]),
            )}
          </section>
        )}

        {!loading && page === 'users' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Users</h3>
            {renderTable(
              ['Name', 'Role', 'Phone', 'Status', 'Joined'],
              users.map((item) => [
                item.name || 'User',
                item.role || '—',
                item.phone ? `+91 ${item.phone}` : '—',
                <span style={tone(item.status || item.approval_status)}>{item.status || item.approval_status || '—'}</span>,
                formatShortDate(item.created_at),
              ]),
            )}
          </section>
        )}

        {!loading && page === 'properties' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Properties</h3>
            {renderTable(
              ['Property', 'Location', 'Category', 'Starting Price', 'Updated'],
              properties.map((item) => [
                item.name || 'Property',
                item.location || '—',
                item.category || '—',
                item.starting_price ? `₹${Number(item.starting_price).toLocaleString('en-IN')}` : '—',
                formatShortDate(item.updated_at),
              ]),
            )}
          </section>
        )}

        {!loading && page === 'bookings' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Bookings</h3>
            {renderTable(
              ['Customer', 'Property', 'Plot', 'Status', 'Created'],
              bookings.map((item) => [
                item.name || item.customer?.name || 'Customer',
                item.property_name || item.property_id || 'Property',
                item.plot_number || item.plot_id || 'Plot',
                <span style={tone(item.status)}>{String(item.status || 'pending').replace('_', ' ')}</span>,
                formatDateTime(item.created_at),
              ]),
            )}
          </section>
        )}

        {!loading && page === 'visits' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Visits</h3>
            {renderTable(
              ['Customer', 'Property', 'Date', 'Time', 'Status'],
              latestVisits.length ? visits.map((item) => [
                item.name || item.customer_name || 'Customer',
                item.property_name || item.centre_name || item.property_id || 'Property',
                formatShortDate(item.visit_date || item.created_at),
                item.visit_time || '—',
                <span style={tone(item.status)}>{item.status || 'pending'}</span>,
              ]) : [[<span style={{ color: '#8a9a8c' }}>No visits available.</span>, '', '', '', '']],
            )}
          </section>
        )}

        {!loading && page === 'support' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Service Request Queue</h3>
            {renderTable(
              ['Ticket #', 'Customer', 'Subject', 'Priority', 'Status', 'Date'],
              latestTickets.length
                ? supportTickets.map((item) => [
                    item.ticket_number,
                    item.customer_name,
                    item.subject,
                    <span style={tone(item.priority)}>{item.priority}</span>,
                    <span style={tone(item.status)}>{item.status}</span>,
                    formatDateTime(item.created_at),
                  ])
                : [[<span style={{ color: '#8a9a8c' }}>No support tickets yet.</span>, '', '', '', '', '']],
            )}
          </section>
        )}

        {!loading && page === 'notifications' && (
          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0 }}>Notifications</h3>
              <button onClick={markAllRead} style={{ border: '1px solid #d7e4d4', background: '#fff', color: '#1a5e2e', borderRadius: '10px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Mark all read</button>
            </div>
            {notifications.length === 0 ? (
              <p style={{ margin: 0, color: '#6d7d6f' }}>No notifications yet.</p>
            ) : (
              notifications.map((item) => (
                <div key={item.id} style={{ padding: '14px 0', borderTop: '1px solid #eef3ec', background: item.read ? '#fff' : '#f7fbf5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{item.title || 'Notification'}</div>
                      <div style={{ marginTop: '4px', color: '#6d7d6f', fontSize: '13px', lineHeight: 1.5 }}>{item.body || item.message || ''}</div>
                    </div>
                    {!item.read && <span style={tone('open')}>New</span>}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#8a9a8c' }}>{formatDateTime(item.created_at)}</div>
                </div>
              ))
            )}
          </section>
        )}

        {!loading && page === 'audit' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Audit Logs</h3>
            {renderTable(
              ['Action', 'Entity', 'Actor', 'When'],
              latestAudit.length
                ? auditLogs.map((item) => [
                    item.action || 'Action',
                    `${item.entity_type || 'entity'}${item.entity_id ? ` • ${item.entity_id}` : ''}`,
                    item.actor_user_id || 'system',
                    formatDateTime(item.created_at),
                  ])
                : [[<span style={{ color: '#8a9a8c' }}>No audit logs yet.</span>, '', '', '']],
            )}
          </section>
        )}

        {!loading && page === 'settings' && (
          <div style={{ display: 'grid', gap: '18px' }}>
            <section style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Access & Role Settings</h3>
              <p style={{ marginTop: 0, color: '#6d7d6f', fontSize: '13px' }}>
                Current access level: <strong>{settings.role_label || 'Admin'}</strong>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
                {Object.entries(settings.permissions || {}).map(([key, value]) => (
                  <label key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #eef3ec', borderRadius: '12px', background: '#fbfdfa' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{key}</span>
                    <input
                      type="checkbox"
                      checked={!!value}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          permissions: { ...current.permissions, [key]: event.target.checked },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
            <section style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Notification Preferences</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
                {Object.entries(settings.notification_preferences || {}).map(([key, value]) => (
                  <label key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #eef3ec', borderRadius: '12px', background: '#fbfdfa' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{key}</span>
                    <input
                      type="checkbox"
                      checked={!!value}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          notification_preferences: { ...current.notification_preferences, [key]: event.target.checked },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <button onClick={saveSettings} disabled={savingSettings} style={{ marginTop: '16px', height: '44px', border: 'none', borderRadius: '12px', background: '#1a5e2e', color: '#fff', padding: '0 18px', fontWeight: 800, cursor: 'pointer', opacity: savingSettings ? 0.7 : 1 }}>
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </section>
          </div>
        )}

        {!loading && page === 'profile' && (
          <section style={{ ...cardStyle, maxWidth: '720px' }}>
            <h3 style={{ marginTop: 0 }}>Admin Profile</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <input name="name" value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input name="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={formatPhoneDisplay(user.phone)} readOnly style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit', background: '#f6faf4' }} />
              <input name="address" value={profileForm.address} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <button onClick={saveProfile} disabled={savingProfile} style={{ height: '46px', border: 'none', borderRadius: '12px', background: '#1a5e2e', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: savingProfile ? 0.7 : 1 }}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
