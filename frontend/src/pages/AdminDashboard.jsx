import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, getJson, getWebSocketUrl, loadSession, logoutSession, postJson, putJson, requestJson, saveSession, supportsLiveUpdates } from '../lib/auth';

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
  assigned: ['#eef2fb', '#2a6fdb'],
  agent_approved: ['#eef2fb', '#2a6fdb'],
  admin_approved: ['#e6f4ea', '#1a8a4a'],
  pending_agent_approval: ['#fdf3e8', '#c2711f'],
  open: ['#fdf3e8', '#c2711f'],
  pending: ['#fdf3e8', '#c2711f'],
  rejected: ['#fdeaea', '#c93b3b'],
  suspended: ['#fdeaea', '#c93b3b'],
  resolved: ['#eef2fb', '#2a6fdb'],
  completed: ['#eef2fb', '#2a6fdb'],
  booked: ['#eef2fb', '#2a6fdb'],
  reserved: ['#e9f4e6', '#2b6d3d'],
  sold: ['#e9f4e6', '#2b6d3d'],
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

function isPlaceholderName(value) {
  return ['agent', 'partner', 'admin', 'customer', 'user'].includes(String(value || '').trim().toLowerCase());
}

function firstRealValue(...values) {
  return values.find((value) => String(value || '').trim() && !isPlaceholderName(value)) || values.find((value) => String(value || '').trim()) || '';
}

function mergeAdminIdentity(...sources) {
  const merged = Object.assign({}, ...sources.filter(Boolean));
  return {
    ...merged,
    name: firstRealValue(...sources.map((source) => source?.name), merged.name),
    email: firstRealValue(...sources.map((source) => source?.email), merged.email),
    phone: firstRealValue(...sources.map((source) => source?.phone), merged.phone),
  };
}

function formatPhoneDisplay(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(-10);
  return digits ? `+91 ${digits}` : '';
}

function formatMoney(value) {
  return `₹${Math.round(Number(value || 0)).toLocaleString('en-IN')}`;
}

function formatSize(value, fallback) {
  const direct = value || fallback;
  if (!direct) return '—';
  return String(direct).includes('yard') ? String(direct) : `${direct} sq yards`;
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
  const [selectedApprovalId, setSelectedApprovalId] = useState(null);
  const [profileForm, setProfileForm] = useState({
    name: session?.user?.name || '',
    email: session?.user?.email || '',
    address: session?.user?.address || '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [liveStatus, setLiveStatus] = useState('connecting');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 860);
  const [profileDirty, setProfileDirty] = useState(false);
  const profileDirtyRef = useRef(false);
  const pageRef = useRef(page);

  useEffect(() => {
    if (!session?.access_token || session?.user?.role !== 'admin') {
      navigate('/login', { replace: true });
    }
  }, [navigate, session]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    profileDirtyRef.current = profileDirty;
  }, [profileDirty]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 860);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        nextMe,
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
        getJson('/api/auth/me', session.access_token).catch(() => null),
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
      if (nextMe) {
        const nextSession = { ...session, user: mergeAdminIdentity(user, nextMe) };
        saveSession(nextSession);
        setSession(nextSession);
      }
      const profileSource = mergeAdminIdentity(user, nextMe);
      if (!profileDirtyRef.current || pageRef.current !== 'profile') {
        setProfileForm({
          name: profileSource.name || '',
          email: profileSource.email || '',
          address: profileSource.address || '',
        });
      }
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
  const selectedApproval = agents.find((item) => item.id === selectedApprovalId) || pendingAgents[0] || null;
  const commissionDefaults = settings.commission_defaults || { enabled: true, model: 'percentage', percentage: 2, flat_amount: 0 };
  const normalizedBookings = bookings.map((item) => ({
    ...item,
    booking_value: Number(item.booking_value || item.total_amount || item.sale_value || 0),
  }));
  const closedBookings = normalizedBookings.filter((item) => ['completed', 'closed'].includes(String(item.status || '').toLowerCase()));
  const commissionTotal = closedBookings.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const propertyLookup = new Map(properties.map((item) => [item.id, item]));
  const areaSales = closedBookings.reduce((acc, item) => {
    const property = propertyLookup.get(item.property_id) || {};
    const key = item.location || item.property_location || property.location || item.property_name || property.name || 'Unassigned';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topSellingArea = Object.entries(areaSales).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No closed sales yet';
  const agentApprovalCounts = agents.reduce((acc, item) => {
    const key = String(item.approval_status || item.status || 'pending').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const latestVisits = visits.slice(0, 6);
  const assignableAgents = agents.filter((item) => {
    const approval = String(item.approval_status || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    return approval === 'approved' || status === 'active';
  });
  const bookingStatusCounts = stats?.booking_status_counts || normalizedBookings.reduce((acc, item) => {
    const key = String(item.status || 'pending').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const visitStatusCounts = stats?.visit_status_counts || visits.reduce((acc, item) => {
    const key = String(item.status || 'pending').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const pendingVisits = visits.filter((item) => ['pending_agent_approval', 'agent_approved', 'pending'].includes(String(item.status || '').toLowerCase()));
  const unassignedVisits = visits.filter((item) => !item.assigned_agent_id && !['completed', 'cancelled', 'rejected'].includes(String(item.status || '').toLowerCase()));
  const propertyPerformance = properties.map((property) => {
    const propertyBookings = normalizedBookings.filter((booking) => booking.property_id === property.id || booking.property_code === property.property_code);
    const propertyVisits = visits.filter((visit) => visit.property_id === property.id || visit.property_code === property.property_code);
    const closedCount = propertyBookings.filter((booking) => ['completed', 'closed'].includes(String(booking.status || '').toLowerCase())).length;
    return { ...property, bookings: propertyBookings.length, visits: propertyVisits.length, closed: closedCount };
  }).sort((a, b) => (b.closed - a.closed) || (b.bookings - a.bookings) || (b.visits - a.visits));
  const displayedUser = mergeAdminIdentity(user, profileDirty ? profileForm : null);
  const shellStyle = {
    height: '100dvh',
    maxHeight: '100dvh',
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    background: '#eef2ec',
    color: '#16231a',
    overflow: 'hidden',
  };
  const sidebarStyle = {
    width: isMobile ? 'auto' : '260px',
    flex: isMobile ? '0 0 auto' : '0 0 260px',
    background: '#1f5a31',
    color: '#fff',
    padding: isMobile ? '12px 12px 10px' : '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: isMobile ? '10px' : '18px',
    position: 'relative',
    flexShrink: 0,
    top: 0,
    zIndex: 30,
    boxShadow: isMobile ? '0 12px 28px -24px rgba(9,32,16,.9)' : 'none',
  };
  const navStyle = {
    display: 'flex',
    flexDirection: isMobile ? 'row' : 'column',
    gap: '8px',
    overflowX: isMobile ? 'auto' : 'visible',
    paddingBottom: isMobile ? '4px' : 0,
    flex: 1,
    minWidth: 0,
    scrollbarWidth: 'none',
  };
  const mainStyle = {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    padding: isMobile ? '14px 12px 24px' : '24px',
    overflowX: 'hidden',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
  };
  const dashboardGridStyle = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.35fr) minmax(300px,.65fr)', gap: '18px', alignItems: 'start' };
  const formGridStyle = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' };

  const legacyDashboardCards = [
    { label: 'Users', value: stats?.users ?? users.length },
    { label: 'Partners', value: stats?.agents ?? agents.length },
    { label: 'Closed Sales', value: closedBookings.length },
    { label: 'Commission Total', value: `₹${Math.round(commissionTotal).toLocaleString('en-IN')}` },
    { label: 'Bookings', value: stats?.bookings ?? bookings.length },
    { label: 'Visits', value: stats?.visits ?? visits.length },
    { label: 'Top Area', value: topSellingArea },
    { label: 'Properties', value: stats?.properties ?? properties.length },
  ];

  const dashboardCards = [
    { label: 'Users', value: stats?.users ?? users.length },
    { label: 'Partners', value: stats?.agents ?? agents.length },
    { label: 'Closed Sales', value: stats?.closed_sales ?? closedBookings.length },
    { label: 'Commission Total', value: formatMoney(stats?.commission_total ?? commissionTotal) },
    { label: 'Bookings', value: stats?.bookings ?? bookings.length },
    { label: 'Visits', value: stats?.visits ?? visits.length },
    { label: 'Needs Assignment', value: unassignedVisits.length },
    { label: 'Top Area', value: stats?.top_selling_area || topSellingArea },
    { label: 'Properties', value: stats?.properties ?? properties.length },
  ];

  const latestBookings = bookings.slice(0, 6);
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
        setError('Settings are not available right now.');
        return;
      }
      setError(err?.message || 'Failed to save admin settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const updateVisitWorkflow = async (visitId, payload) => {
    try {
      await requestJson(
        `/api/admin/visits/${visitId}/status`,
        { method: 'POST', body: payload },
        session.access_token,
      );
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to update visit workflow');
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await putJson('/api/auth/profile', profileForm, session.access_token);
      const mergedUser = mergeAdminIdentity(user, updated, profileForm);
      const nextSession = { ...session, user: mergedUser };
      saveSession(nextSession);
      setSession(nextSession);
      setProfileForm({
        name: mergedUser.name || '',
        email: mergedUser.email || '',
        address: mergedUser.address || '',
      });
      setProfileDirty(false);
    } catch (err) {
      setError(err?.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const updateProfileField = (field, value) => {
    profileDirtyRef.current = true;
    setProfileDirty(true);
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const confirmBooking = async (bookingId) => {
    try {
      await postJson(`/api/admin/bookings/${bookingId}/confirm`, {}, session.access_token);
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to confirm booking');
    }
  };

  const updateBookingStatus = async (bookingId, status) => {
    try {
      await postJson(`/api/admin/bookings/${bookingId}/status`, { status }, session.access_token);
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to update booking');
    }
  };

  const logout = async () => {
    await logoutSession();
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
    <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
      {isMobile ? (
        rows.length === 0 ? (
          <p style={{ margin: 0, color: '#6d7d6f' }}>No records yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} style={{ border: '1px solid #eef3ec', borderRadius: '16px', padding: '14px', background: '#fbfdf9' }}>
                {row.map((cell, cellIndex) => (
                  <div key={cellIndex} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr)', gap: '10px', padding: cellIndex === 0 ? '0 0 8px' : '8px 0', borderTop: cellIndex === 0 ? 'none' : '1px solid #eef3ec' }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#8a9a8c', textTransform: 'uppercase' }}>{columns[cellIndex]}</span>
                    <div style={{ minWidth: 0, fontSize: '13px', color: '#16231a', overflowWrap: 'anywhere' }}>{cell}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : (
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
                <td key={cellIndex} style={{ padding: '13px 12px 13px 0', fontSize: '13px', color: '#16231a', verticalAlign: 'top' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );

  return (
    <div style={shellStyle}>
      <aside style={sidebarStyle}>
        <div style={{ display: isMobile ? 'flex' : 'block', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <img src="/RivanRealtyLogo.png" alt="Rivan Realty" style={{ width: isMobile ? '116px' : '152px', height: 'auto', borderRadius: '10px' }} />
          <p style={{ margin: '18px 0 0', fontSize: '12px', color: '#bcd6bd', lineHeight: 1.5, display: isMobile ? 'none' : 'block' }}>
            Manage approvals, users, properties, bookings, and support activity from one place.
          </p>
          {isMobile && (
            <button
              onClick={logout}
              style={{ height: '40px', border: 'none', borderRadius: '12px', background: '#e2822a', color: '#fff', fontFamily: 'inherit', fontSize: '12px', fontWeight: 800, cursor: 'pointer', minWidth: '84px' }}
            >
              Logout
            </button>
          )}
        </div>
        <nav style={navStyle}>
          {navItems.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                border: 'none',
                borderRadius: '12px',
                padding: isMobile ? '9px 12px' : '12px 14px',
                textAlign: isMobile ? 'center' : 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: 700,
                background: page === id ? '#fff' : 'rgba(255,255,255,.08)',
                color: page === id ? '#1f5a31' : '#fff',
                whiteSpace: 'nowrap',
                flex: isMobile ? '0 0 auto' : 'initial',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          onClick={logout}
          style={{ display: isMobile ? 'none' : 'block', marginTop: 'auto', height: '46px', border: 'none', borderRadius: '12px', background: '#e2822a', color: '#fff', fontFamily: 'inherit', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
        >
          Logout
        </button>
      </aside>

      <main style={mainStyle}>
        <div style={{ ...cardStyle, minWidth: 0, marginBottom: '18px', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? '26px' : '32px', color: '#1f5a31' }}>
              {page === 'dashboard' ? 'Admin Dashboard' : navItems.find(([id]) => id === page)?.[1] || 'Admin'}
            </h1>
            <p style={{ margin: '6px 0 0', color: '#8a9a8c', fontSize: '12px' }}>
              {liveStatusLabel(liveStatus)}
            </p>
            <p style={{ margin: '6px 0 0', color: '#6d7d6f', fontSize: '14px' }}>
              Welcome, {displayedUser.name || 'Admin'} • {settings.role_label || 'Admin'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
            <button onClick={() => setPage('notifications')} aria-label="Notifications" style={{ position: 'relative', width: '52px', height: '52px', borderRadius: '16px', border: '1px solid #e7ede3', background: '#fff', color: '#1f5a31', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                <path d="M10 20a2 2 0 0 0 4 0" />
              </svg>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', minWidth: '22px', height: '22px', borderRadius: '999px', background: '#e2822a', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 6px' }}>
                  {unreadCount}
                </span>
              )}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px', borderRadius: '18px', border: '1px solid #e7ede3', background: '#fff', minWidth: 0 }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'linear-gradient(160deg,#2b6d3d,#3f8a54)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                {initialsOf(displayedUser.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isMobile ? '150px' : '180px' }}>{displayedUser.name || 'Admin'}</div>
                <div style={{ fontSize: '12px', color: '#8a9a8c' }}>{formatPhoneDisplay(displayedUser.phone) || settings.role_label || 'Admin'}</div>
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ ...cardStyle, marginBottom: '18px', color: '#c93b3b', fontWeight: 700 }}>{error}</div>}
        {loading && <div style={cardStyle}>Loading live admin data...</div>}

        {!loading && page === 'dashboard' && (
          <div style={{ display: 'grid', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(180px,1fr))', gap: isMobile ? '10px' : '14px' }}>
              {dashboardCards.map((item) => (
                <div key={item.label} style={{ ...cardStyle, padding: isMobile ? '14px' : cardStyle.padding }}>
                  <div style={{ fontSize: '12px', color: '#8a9a8c', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ marginTop: '10px', fontSize: isMobile ? '24px' : '30px', fontWeight: 800, color: '#1f5a31' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={dashboardGridStyle}>
              <section style={{ ...cardStyle, minWidth: 0 }}>
                <h3 style={{ marginTop: 0 }}>Latest Bookings</h3>
                {renderTable(
                  ['Customer', 'Property', 'Code', 'Plot', 'Status', 'Created'],
                  latestBookings.map((item) => [
                    item.name || item.customer?.name || 'Customer',
                    item.property_name || item.property_id || 'Property',
                    item.property_code || '—',
                    item.plot_number || item.plot_id || 'Plot',
                    <span style={tone(item.status)}>{String(item.status || 'pending').replace('_', ' ')}</span>,
                    formatDateTime(item.created_at),
                  ]),
                )}
              </section>
              <section style={{ ...cardStyle, minWidth: 0, overflow: 'hidden' }}>
                <h3 style={{ marginTop: 0 }}>Pending Partner Approvals</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {Object.entries(agentApprovalCounts).map(([key, value]) => (
                    <span key={key} style={tone(key)}>{key.replace('_', ' ')}: {value}</span>
                  ))}
                </div>
                {pendingAgents.length === 0 ? (
                  <p style={{ margin: 0, color: '#6d7d6f' }}>No pending applications right now.</p>
                ) : (
                  pendingAgents.slice(0, 6).map((agent) => (
                    <div key={agent.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '12px 0', borderTop: '1px solid #eef3ec', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800 }}>{agent.name}</div>
                        <div style={{ fontSize: '12px', color: '#8a9a8c' }}>{agent.id}</div>
                        <div style={{ fontSize: '12px', color: '#8a9a8c' }}>{agent.phone ? formatPhoneDisplay(agent.phone) : 'No phone'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => { setSelectedApprovalId(agent.id); setPage('approvals'); }} style={{ border: '1px solid #d7e4d4', borderRadius: '10px', background: '#fff', color: '#2b6d3d', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Review</button>
                        <button onClick={() => updateAgentStatus(agent.id, 'approved')} style={{ border: 'none', borderRadius: '10px', background: '#2b6d3d', color: '#fff', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => updateAgentStatus(agent.id, 'rejected')} style={{ border: '1px solid #f0c8c8', borderRadius: '10px', background: '#fff', color: '#c93b3b', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                      </div>
                    </div>
                  ))
                )}
              </section>
              <section style={{ ...cardStyle, minWidth: 0, overflow: 'hidden' }}>
                <h3 style={{ marginTop: 0 }}>Operational Health</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#8a9a8c', fontWeight: 800, marginBottom: '8px' }}>Booking pipeline</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {Object.entries(bookingStatusCounts).map(([key, value]) => (
                        <span key={key} style={tone(key)}>{key.replaceAll('_', ' ')}: {value}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#8a9a8c', fontWeight: 800, marginBottom: '8px' }}>Visit pipeline</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {Object.entries(visitStatusCounts).map(([key, value]) => (
                        <span key={key} style={tone(key)}>{key.replaceAll('_', ' ')}: {value}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '14px', background: '#fbfdfa', border: '1px solid #eef3ec' }}>
                    <div style={{ fontWeight: 800 }}>{pendingVisits.length} visits need review</div>
                    <div style={{ marginTop: '4px', color: '#6d7d6f', fontSize: '12px' }}>{unassignedVisits.length} still need an assigned partner.</div>
                  </div>
                </div>
              </section>
              <section style={{ ...cardStyle, minWidth: 0, overflow: 'hidden' }}>
                <h3 style={{ marginTop: 0 }}>Property Performance</h3>
                {propertyPerformance.slice(0, 5).map((item) => (
                  <div key={item.id || item.property_code} style={{ padding: '12px 0', borderTop: '1px solid #eef3ec' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name || 'Property'}</div>
                        <div style={{ color: '#2b6d3d', fontSize: '12px', fontWeight: 800 }}>{item.property_code || 'Code pending'}</div>
                      </div>
                      <span style={tone(item.closed ? 'sold' : item.bookings ? 'booked' : 'available')}>{item.closed} sold</span>
                    </div>
                    <div style={{ marginTop: '6px', color: '#6d7d6f', fontSize: '12px' }}>{item.bookings} bookings • {item.visits} visits</div>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}

        {!loading && page === 'approvals' && (
          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Partner Applications</h3>
              {selectedApprovalId && <button onClick={() => setSelectedApprovalId(null)} style={{ border: '1px solid #d7e4d4', borderRadius: '10px', background: '#fff', padding: '6px 12px', cursor: 'pointer' }}>Back to List</button>}
            </div>
            {selectedApprovalId && selectedApproval ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#fcfdfb', padding: '16px', borderRadius: '12px', border: '1px solid #e7ede3' }}>
                <h4 style={{ margin: '0 0 8px' }}>Application Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                  <div><strong>Name:</strong> {selectedApproval.name}</div>
                  <div><strong>Phone:</strong> {selectedApproval.phone ? formatPhoneDisplay(selectedApproval.phone) : '—'}</div>
                  <div><strong>Email:</strong> {selectedApproval.email || '—'}</div>
                  <div><strong>Age:</strong> {selectedApproval.age || '—'}</div>
                  <div><strong>Occupation:</strong> {selectedApproval.occupation || '—'}</div>
                  <div><strong>Aadhaar:</strong> {selectedApproval.aadhaar_number || '—'}</div>
                  <div><strong>Brand Name:</strong> {selectedApproval.agent_brand_name || '—'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>Address:</strong> {selectedApproval.address || '—'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {selectedApproval.application_notes || '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <button onClick={() => { updateAgentStatus(selectedApproval.id, 'approved'); setSelectedApprovalId(null); }} style={{ border: 'none', borderRadius: '10px', background: '#2b6d3d', color: '#fff', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>Approve Partner</button>
                  <button onClick={() => { updateAgentStatus(selectedApproval.id, 'rejected'); setSelectedApprovalId(null); }} style={{ border: '1px solid #f0c8c8', borderRadius: '10px', background: '#fff', color: '#c93b3b', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>Reject Partner</button>
                </div>
              </div>
            ) : (
              renderTable(
                ['Name', 'Phone', 'Email', 'Status', 'Applied', 'Action'],
                agents.map((agent) => [
                  agent.name || 'Partner',
                  agent.phone ? formatPhoneDisplay(agent.phone) : '—',
                  agent.email || '—',
                  <span style={tone(agent.approval_status || agent.status)}>{agent.approval_status || agent.status || 'pending'}</span>,
                  formatDateTime(agent.agent_application_submitted_at || agent.created_at),
                  <button onClick={() => setSelectedApprovalId(agent.id)} style={{ border: '1px solid #d7e4d4', borderRadius: '8px', background: '#fff', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>Review</button>
                ]),
              )
            )}
          </section>
        )}

        {!loading && page === 'users' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Customer Logins</h3>
            {renderTable(
              ['Name', 'Phone', 'Joined'],
              users.filter(u => u.role === 'customer').map((item) => [
                item.name || 'Customer',
                item.phone ? formatPhoneDisplay(item.phone) : '—',
                formatShortDate(item.created_at),
              ]),
            )}
            <h3 style={{ marginTop: '32px' }}>Partner Profiles</h3>
            {renderTable(
              ['Name', 'Phone', 'Brand', 'Status', 'Joined'],
              users.filter(u => u.role === 'agent' || u.role === 'admin').map((item) => [
                item.name || 'Partner',
                item.phone ? formatPhoneDisplay(item.phone) : '—',
                item.agent_brand_name || '—',
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
                <div>
                  <div style={{ fontWeight: 800 }}>{item.name || 'Property'}</div>
                  <div style={{ marginTop: '4px', color: '#2b6d3d', fontSize: '12px', fontWeight: 800 }}>{item.property_code || 'Code pending'}</div>
                </div>,
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
              ['Customer', 'Property', 'Code', 'Plot', 'Facing', 'Sq Yards', 'Status', 'Created', 'Actions'],
              bookings.map((item) => [
                item.name || item.customer?.name || 'Customer',
                item.property_name || item.property_id || 'Property',
                item.property_code || 'Code pending',
                item.plot_number || item.plot_id || 'Plot',
                item.facing || '—',
                formatSize(item.size_sqy, item.size),
                <span style={tone(item.status)}>{String(item.status || 'pending').replace('_', ' ')}</span>,
                formatDateTime(item.created_at),
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['pending', 'agent_approved'].includes(String(item.status || '').toLowerCase()) && (
                    <button onClick={() => confirmBooking(item.id)} style={{ border: 'none', borderRadius: '10px', background: '#2b6d3d', color: '#fff', padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }}>
                      Reserve
                    </button>
                  )}
                  <button onClick={() => updateBookingStatus(item.id, 'completed')} style={{ border: 'none', borderRadius: '10px', background: '#e6f4ea', color: '#1a8a4a', padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }}>
                    Close Sale
                  </button>
                  <button onClick={() => updateBookingStatus(item.id, 'rejected')} style={{ border: 'none', borderRadius: '10px', background: '#fdeaea', color: '#c93b3b', padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }}>
                    Reject
                  </button>
                </div>,
              ]),
            )}
          </section>
        )}

        {!loading && page === 'visits' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Visits</h3>
            {renderTable(
              ['Customer', 'Property', 'Date', 'Time', 'Partner', 'Status', 'Actions'],
              latestVisits.length ? visits.map((item) => [
                item.name || item.customer_name || 'Customer',
                <div>
                  <div style={{ fontWeight: 800 }}>{item.property_name || item.centre_name || item.property_id || 'Property'}</div>
                  <div style={{ marginTop: '4px', color: '#2b6d3d', fontSize: '12px', fontWeight: 800 }}>{item.property_code || 'Code pending'}</div>
                </div>,
                formatShortDate(item.visit_date || item.created_at),
                item.visit_time || '—',
                item.assigned_agent_name || 'Unassigned',
                <span style={tone(item.status)}>{String(item.status || 'pending').replaceAll('_', ' ')}</span>,
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select
                    value={item.assigned_agent_id || ''}
                    onChange={(event) => event.target.value && updateVisitWorkflow(item.id, { assigned_agent_id: event.target.value })}
                    style={{ height: '34px', borderRadius: '9px', border: '1px solid #dfe8dc', padding: '0 8px', fontFamily: 'inherit', maxWidth: '180px' }}
                  >
                    <option value="">Assign partner</option>
                    {assignableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>Assign to {agent.name || agent.phone || 'Partner'}</option>
                    ))}
                  </select>
                  <button onClick={() => updateVisitWorkflow(item.id, { status: 'scheduled' })} style={{ border: 'none', borderRadius: '9px', background: '#eef2fb', color: '#2a6fdb', padding: '8px 10px', fontWeight: 800, cursor: 'pointer' }}>✓ Schedule</button>
                  <button onClick={() => updateVisitWorkflow(item.id, { status: 'completed' })} style={{ border: 'none', borderRadius: '9px', background: '#e6f4ea', color: '#1a8a4a', padding: '8px 10px', fontWeight: 800, cursor: 'pointer' }}>✓ Complete</button>
                  <button onClick={() => updateVisitWorkflow(item.id, { status: 'rejected' })} style={{ border: 'none', borderRadius: '9px', background: '#fdeaea', color: '#c93b3b', padding: '8px 10px', fontWeight: 800, cursor: 'pointer' }}>× Reject</button>
                </div>,
              ]) : [[<span style={{ color: '#8a9a8c' }}>No visits available.</span>, '', '', '', '', '', '']],
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
              <button onClick={markAllRead} style={{ border: '1px solid #d7e4d4', background: '#fff', color: '#2b6d3d', borderRadius: '10px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Mark all read</button>
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
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Commission Enabled</span>
                  <input type="checkbox" checked={!!commissionDefaults.enabled} onChange={(event) => setSettings((current) => ({ ...current, commission_defaults: { ...commissionDefaults, enabled: event.target.checked } }))} />
                </label>
                <label style={{ display: 'grid', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Commission Model</span>
                  <select value={commissionDefaults.model || 'percentage'} onChange={(event) => setSettings((current) => ({ ...current, commission_defaults: { ...commissionDefaults, model: event.target.value } }))} style={{ height: '44px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }}>
                    <option value="percentage">Percentage</option>
                    <option value="flat">Flat Amount</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Percentage</span>
                  <input value={commissionDefaults.percentage ?? 0} onChange={(event) => setSettings((current) => ({ ...current, commission_defaults: { ...commissionDefaults, percentage: Number(event.target.value || 0) } }))} style={{ height: '44px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                </label>
                <label style={{ display: 'grid', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Flat Amount</span>
                  <input value={commissionDefaults.flat_amount ?? 0} onChange={(event) => setSettings((current) => ({ ...current, commission_defaults: { ...commissionDefaults, flat_amount: Number(event.target.value || 0) } }))} style={{ height: '44px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                </label>
              </div>
              <button onClick={saveSettings} disabled={savingSettings} style={{ marginTop: '16px', height: '44px', border: 'none', borderRadius: '12px', background: '#2b6d3d', color: '#fff', padding: '0 18px', fontWeight: 800, cursor: 'pointer', opacity: savingSettings ? 0.7 : 1 }}>
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </section>
          </div>
        )}

        {!loading && page === 'profile' && (
          <section style={{ ...cardStyle, maxWidth: '720px' }}>
            <h3 style={{ marginTop: 0 }}>Admin Profile</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <input name="name" value={profileForm.name} onChange={(event) => updateProfileField('name', event.target.value)} placeholder="Name" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input name="email" value={profileForm.email} onChange={(event) => updateProfileField('email', event.target.value)} placeholder="Email" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={formatPhoneDisplay(user.phone)} readOnly style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit', background: '#f6faf4' }} />
              <input name="address" value={profileForm.address} onChange={(event) => updateProfileField('address', event.target.value)} placeholder="Address" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <button onClick={saveProfile} disabled={savingProfile} style={{ height: '46px', border: 'none', borderRadius: '12px', background: '#2b6d3d', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: savingProfile ? 0.7 : 1 }}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
