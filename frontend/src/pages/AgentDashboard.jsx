import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getJson,
  getWebSocketUrl,
  loadSession,
  logoutSession,
  postJson,
  putJson,
  saveSession,
  supportsLiveUpdates,
} from '../lib/auth';

const cardStyle = {
  background: '#fff',
  border: '1px solid #e7ede3',
  borderRadius: '18px',
  padding: '18px',
  boxShadow: '0 14px 34px -28px rgba(18,53,29,.55)',
};

function badgeTone(value) {
  const key = String(value || '').trim().toLowerCase();
  const map = {
    new: ['#eef2fb', '#2a6fdb'],
    contacted: ['#eef2fb', '#2a6fdb'],
    qualified: ['#f3eefb', '#7a4fce'],
    site_visit_scheduled: ['#fdf3e8', '#c2711f'],
    site_visit_completed: ['#e6f4ea', '#1a8a4a'],
    negotiation: ['#fdf3e8', '#c2711f'],
    booking_requested: ['#fdf3e8', '#c2711f'],
    booked: ['#e6f4ea', '#1a8a4a'],
    closed_won: ['#e6f4ea', '#1a8a4a'],
    closed_lost: ['#fdeaea', '#c93b3b'],
    open: ['#fdf3e8', '#c2711f'],
    pending: ['#fdf3e8', '#c2711f'],
    scheduled: ['#eef2fb', '#2a6fdb'],
    completed: ['#e6f4ea', '#1a8a4a'],
    cancelled: ['#fdeaea', '#c93b3b'],
    rejected: ['#fdeaea', '#c93b3b'],
    rescheduled: ['#f3eefb', '#7a4fce'],
    available: ['#e6f4ea', '#1a8a4a'],
    reserved: ['#fdf3e8', '#c2711f'],
    booked_asset: ['#eef2fb', '#2a6fdb'],
    sold: ['#fdeaea', '#c93b3b'],
    high: ['#fdeaea', '#c93b3b'],
    medium: ['#fdf3e8', '#c2711f'],
    low: ['#eef2fb', '#2a6fdb'],
  };
  const [background, color] = map[key] || ['#eef3ec', '#3d4f40'];
  return {
    background,
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

function formatDateOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

function initialsOf(name) {
  return String(name || 'AG')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'AG';
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

function isoNowLocalDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function AgentDashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => loadSession());
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agentData, setAgentData] = useState({ profile: {}, kpis: {}, assets: [], bookings: [] });
  const [crmData, setCrmData] = useState({ leads: [], opportunities: [], tasks: [], activities: [], metrics: {}, stage_counts: {} });
  const [visits, setVisits] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profileForm, setProfileForm] = useState({
    name: session?.user?.name || '',
    email: session?.user?.email || '',
    address: session?.user?.address || '',
    occupation: session?.user?.occupation || '',
    age: session?.user?.age || '',
    aadhaar_number: session?.user?.aadhaar_number || '',
    bank_details: session?.user?.bank_details || '',
    agent_brand_name: session?.user?.agent_brand_name || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [visitForm, setVisitForm] = useState({
    property_id: '',
    plot_id: '',
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    visit_date: isoNowLocalDate(),
    visit_time: '11:00 AM',
    notes: '',
  });
  const [bookingForm, setBookingForm] = useState({
    plot_id: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    visit_date: isoNowLocalDate(),
    visit_time: '11:00 AM',
    notes: '',
  });
  const [submittingVisit, setSubmittingVisit] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [liveStatus, setLiveStatus] = useState('connecting');

  useEffect(() => {
    if (!session?.access_token || session?.user?.role !== 'agent') {
      navigate('/login', { replace: true });
    }
  }, [navigate, session]);

  const user = session?.user || {};
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !(item.read ?? item.is_read)).length,
    [notifications],
  );

  const refreshAll = async (showLoader = true) => {
    if (!session?.access_token) return;
    if (showLoader) setLoading(true);
    setError('');
    const errors = [];
    try {
      const results = await Promise.allSettled([
        getJson('/api/agent/dashboard', session.access_token),
        getJson('/api/crm/dashboard/agent', session.access_token),
        getJson('/api/agent/site-visits', session.access_token),
        getJson('/api/notifications', session.access_token),
      ]);

      const nextAgentData = results[0].status === 'fulfilled' ? results[0].value : { profile: {}, kpis: {}, assets: [], bookings: [] };
      const nextCrmData = results[1].status === 'fulfilled' ? results[1].value : { leads: [], opportunities: [], tasks: [], activities: [], metrics: {}, stage_counts: {} };
      const nextVisits = results[2].status === 'fulfilled' ? results[2].value : [];
      const nextNotifications = results[3].status === 'fulfilled' ? results[3].value : [];

      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const label = ['Dashboard', 'CRM', 'Visits', 'Notifications'][i];
          console.error(`[AgentDashboard] ${label} API failed:`, r.reason);
          errors.push(`${label}: ${r.reason?.message || 'unknown error'}`);
        }
      });

      setAgentData(nextAgentData);
      setCrmData(nextCrmData);
      setVisits(Array.isArray(nextVisits) ? nextVisits : []);
      setNotifications(Array.isArray(nextNotifications) ? nextNotifications : []);

      const firstAsset = nextAgentData.assets?.[0];
      setVisitForm((current) => ({
        ...current,
        property_id: current.property_id || firstAsset?.property_id || '',
        plot_id: current.plot_id || firstAsset?.id || '',
      }));
      setBookingForm((current) => ({
        ...current,
        plot_id: current.plot_id || firstAsset?.id || '',
      }));

      const profileSource = nextAgentData.profile || user;
      setProfileForm({
        name: profileSource.name || user.name || '',
        email: profileSource.email || user.email || '',
        address: profileSource.address || user.address || '',
        occupation: profileSource.occupation || user.occupation || '',
        age: profileSource.age || user.age || '',
        aadhaar_number: profileSource.aadhaar_number || user.aadhaar_number || '',
        bank_details: profileSource.bank_details || user.bank_details || '',
        agent_brand_name: profileSource.agent_brand_name || user.agent_brand_name || '',
      });

      if (errors.length > 0) {
        setError('Some data failed to load: ' + errors.join('; '));
      }
    } catch (err) {
      console.error('[AgentDashboard] Fatal error loading dashboard:', err);
      setError(err?.message || 'Failed to load agent dashboard');
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
            ['booking.updated', 'visit.updated', 'dashboard.metrics_updated', 'agent.status_updated'].includes(type)
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

  const assets = agentData.assets || [];
  const bookings = agentData.bookings || [];
  const leads = crmData.leads || [];
  const opportunities = crmData.opportunities || [];
  const tasks = crmData.tasks || [];
  const activities = crmData.activities || [];
  const dashboardMetrics = crmData.metrics || {};
  const stageCounts = crmData.stage_counts || {};
  const propertyChoices = Array.from(
    new Map(
      assets.map((asset) => [
        asset.property_id,
        { property_id: asset.property_id, property_name: asset.property_name || asset.property_id },
      ]),
    ).values(),
  );
  const filteredPlotsForVisit = assets.filter(
    (asset) => !visitForm.property_id || asset.property_id === visitForm.property_id,
  );

  const navItems = [
    ['dashboard', 'Dashboard'],
    ['leads', `Leads (${leads.length})`],
    ['opportunities', `Deals (${opportunities.length})`],
    ['tasks', `Tasks (${tasks.length})`],
    ['visits', `Site Visits (${visits.length})`],
    ['bookings', `Bookings (${bookings.length})`],
    ['properties', `Properties (${assets.length})`],
    ['notifications', `Notifications (${unreadNotifications})`],
    ['profile', 'Profile'],
  ];

  const topCards = [
    { label: 'Assigned Assets', value: agentData.kpis?.assets ?? assets.length },
    { label: 'Bookings', value: agentData.kpis?.bookings ?? bookings.length },
    { label: 'Visits', value: agentData.kpis?.visits ?? visits.length },
    { label: 'Leads', value: dashboardMetrics.lead_count ?? leads.length },
    { label: 'Active Deals', value: dashboardMetrics.active_deals ?? opportunities.length },
    { label: 'Closed Sales', value: agentData.kpis?.closed_sales ?? 0 },
    { label: 'Commission Earned', value: `₹${Math.round(agentData.kpis?.commission_earned ?? 0).toLocaleString('en-IN')}` },
    { label: 'Unread Notifications', value: agentData.kpis?.unread_notifications ?? unreadNotifications },
  ];

  const renderTable = (columns, rows) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
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
    </div>
  );

  const logout = async () => {
    await logoutSession();
    navigate('/login', { replace: true });
  };

  const markAllRead = async () => {
    await postJson('/api/notifications/read-all', {}, session.access_token).catch(() => null);
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  };

  const submitVisit = async () => {
    setSubmittingVisit(true);
    setError('');
    try {
      await postJson('/api/agent/site-visits', visitForm, session.access_token);
      setVisitForm((current) => ({
        ...current,
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        notes: '',
      }));
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to schedule site visit');
    } finally {
      setSubmittingVisit(false);
    }
  };

  const submitBooking = async () => {
    setSubmittingBooking(true);
    setError('');
    try {
      await postJson('/api/agent/bookings', bookingForm, session.access_token);
      setBookingForm((current) => ({
        ...current,
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        notes: '',
      }));
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to create booking');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const updateVisitStatus = async (visitId, status) => {
    try {
      await putJson(`/api/agent/site-visits/${visitId}`, { status }, session.access_token);
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to update visit');
    }
  };

  const updateBookingStatus = async (bookingId, status) => {
    try {
      await putJson(`/api/agent/bookings/${bookingId}/status`, { status }, session.access_token);
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to update booking');
    }
  };

  const completeTask = async (taskId) => {
    try {
      await postJson(`/api/crm/tasks/${taskId}/complete`, { completion_note: 'Completed from dashboard' }, session.access_token);
      refreshAll(false);
    } catch (err) {
      setError(err?.message || 'Failed to complete task');
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload = { ...profileForm };
      Object.keys(payload).forEach(k => {
        if (payload[k] === '') payload[k] = null;
      });
      const updated = await putJson('/api/auth/profile', payload, session.access_token);
      const nextSession = { ...session, user: updated };
      saveSession(nextSession);
      setSession(nextSession);
    } catch (err) {
      setError(err?.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#eef2ec', color: '#16231a' }}>
      <aside style={{ width: '260px', background: '#1f5a31', color: '#fff', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <img src="/assets/logo-full.png" alt="Rivan" style={{ width: '152px', height: 'auto' }} />
          <p style={{ margin: '18px 0 0', fontSize: '12px', color: '#bcd6bd', lineHeight: 1.5 }}>
            Manage your leads, visits, bookings, and customer follow-ups in one place.
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
                color: page === id ? '#1f5a31' : '#fff',
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
            <h1 style={{ margin: 0, fontSize: '32px', color: '#1f5a31' }}>
              {page === 'dashboard' ? 'Agent Dashboard' : navItems.find(([id]) => id === page)?.[1] || 'Agent'}
            </h1>
            <p style={{ margin: '6px 0 0', color: '#8a9a8c', fontSize: '12px' }}>
              {liveStatusLabel(liveStatus)}
            </p>
            <p style={{ margin: '6px 0 0', color: '#6d7d6f', fontSize: '14px' }}>
              Welcome, {user.name || 'Agent'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button onClick={() => setPage('notifications')} style={{ position: 'relative', width: '52px', height: '52px', borderRadius: '16px', border: '1px solid #e7ede3', background: '#fff', cursor: 'pointer' }}>
              <span style={{ fontSize: '20px' }}>🔔</span>
              {unreadNotifications > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', minWidth: '22px', height: '22px', borderRadius: '999px', background: '#e2822a', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 6px' }}>
                  {unreadNotifications}
                </span>
              )}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px', borderRadius: '18px', border: '1px solid #e7ede3', background: '#fff' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'linear-gradient(160deg,#2b6d3d,#3f8a54)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                {initialsOf(user.name)}
              </div>
              <div>
                <div style={{ fontWeight: 800 }}>{user.name || 'Agent'}</div>
                <div style={{ fontSize: '12px', color: '#8a9a8c' }}>{formatPhoneDisplay(user.phone) || 'Agent'}</div>
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ ...cardStyle, marginBottom: '18px', color: '#c93b3b', fontWeight: 700 }}>{error}</div>}
        {loading && <div style={cardStyle}>Loading live agent data...</div>}

        {!loading && page === 'dashboard' && (
          <div style={{ display: 'grid', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px' }}>
              {topCards.map((item) => (
                <div key={item.label} style={cardStyle}>
                  <div style={{ fontSize: '12px', color: '#8a9a8c', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ marginTop: '10px', fontSize: '30px', fontWeight: 800, color: '#1f5a31' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <section style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Pipeline Stages</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '12px' }}>
                  {Object.entries(stageCounts).map(([key, value]) => (
                    <div key={key} style={{ border: '1px solid #eef3ec', borderRadius: '14px', padding: '14px', background: '#fbfdfa' }}>
                      <div style={{ fontSize: '12px', color: '#8a9a8c', fontWeight: 700, textTransform: 'capitalize' }}>{key.replaceAll('_', ' ')}</div>
                      <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Recent Activity</h3>
                {activities.length === 0 ? (
                  <p style={{ margin: 0, color: '#6d7d6f' }}>No recent activity yet.</p>
                ) : (
                  activities.slice(0, 8).map((item) => (
                    <div key={item.id} style={{ padding: '12px 0', borderTop: '1px solid #eef3ec' }}>
                      <div style={{ fontWeight: 800 }}>{item.message || item.activity_type || 'Activity'}</div>
                      <div style={{ marginTop: '4px', color: '#6d7d6f', fontSize: '13px' }}>{formatDateTime(item.created_at)}</div>
                    </div>
                  ))
                )}
              </section>
            </div>
          </div>
        )}

        {!loading && page === 'leads' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Assigned Leads</h3>
            {renderTable(
              ['Lead', 'Phone', 'Source', 'Tags', 'Updated'],
              leads.map((item) => [
                item.name || 'Lead',
                item.phone ? `+91 ${item.phone}` : '—',
                item.source || 'manual',
                (item.tags || []).join(', ') || '—',
                formatDateTime(item.updated_at),
              ]),
            )}
          </section>
        )}

        {!loading && page === 'opportunities' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Opportunities</h3>
            {renderTable(
              ['Lead', 'Property', 'Plot', 'Stage', 'Updated'],
              opportunities.map((item) => [
                item.lead_name || item.name || item.lead_id || 'Lead',
                item.property_name || item.property_id || 'Property',
                item.plot_number || item.plot_id || '—',
                <span style={badgeTone(item.stage)}>{String(item.stage || 'new').replaceAll('_', ' ')}</span>,
                formatDateTime(item.updated_at),
              ]),
            )}
          </section>
        )}

        {!loading && page === 'tasks' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Tasks</h3>
            {renderTable(
              ['Task', 'Priority', 'Due', 'Status', 'Action'],
              tasks.map((item) => [
                <div>
                  <div style={{ fontWeight: 800 }}>{item.title || 'Task'}</div>
                  <div style={{ marginTop: '4px', color: '#6d7d6f', fontSize: '12px' }}>{item.description || item.task_type || ''}</div>
                </div>,
                <span style={badgeTone(item.priority || 'medium')}>{item.priority || 'medium'}</span>,
                formatDateTime(item.due_at),
                <span style={badgeTone(item.status || 'open')}>{item.status || 'open'}</span>,
                item.status === 'completed' ? (
                  <span style={{ color: '#1a8a4a', fontWeight: 800 }}>Done</span>
                ) : (
                  <button onClick={() => completeTask(item.id)} style={{ border: 'none', borderRadius: '10px', background: '#2b6d3d', color: '#fff', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>
                    Complete
                  </button>
                ),
              ]),
            )}
          </section>
        )}

        {!loading && page === 'visits' && (
          <div style={{ display: 'grid', gap: '18px' }}>
            <section style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Schedule New Visit</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
                <select value={visitForm.property_id} onChange={(event) => setVisitForm((current) => ({ ...current, property_id: event.target.value, plot_id: '' }))} style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }}>
                  <option value="">Select property</option>
                  {propertyChoices.map((item) => (
                    <option key={item.property_id} value={item.property_id}>{item.property_name}</option>
                  ))}
                </select>
                <select value={visitForm.plot_id} onChange={(event) => setVisitForm((current) => ({ ...current, plot_id: event.target.value }))} style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }}>
                  <option value="">Select plot</option>
                  {filteredPlotsForVisit.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.plot_number || asset.id} • {asset.property_name}</option>
                  ))}
                </select>
                <input value={visitForm.customer_name} onChange={(event) => setVisitForm((current) => ({ ...current, customer_name: event.target.value }))} placeholder="Customer name" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={visitForm.customer_phone} onChange={(event) => setVisitForm((current) => ({ ...current, customer_phone: event.target.value }))} placeholder="Customer phone" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={visitForm.customer_email} onChange={(event) => setVisitForm((current) => ({ ...current, customer_email: event.target.value }))} placeholder="Customer email" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input type="date" value={visitForm.visit_date} onChange={(event) => setVisitForm((current) => ({ ...current, visit_date: event.target.value }))} style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={visitForm.visit_time} onChange={(event) => setVisitForm((current) => ({ ...current, visit_time: event.target.value }))} placeholder="Visit time" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={visitForm.notes} onChange={(event) => setVisitForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
              </div>
              <button onClick={submitVisit} disabled={submittingVisit} style={{ marginTop: '14px', height: '44px', border: 'none', borderRadius: '12px', background: '#2b6d3d', color: '#fff', padding: '0 18px', fontWeight: 800, cursor: 'pointer', opacity: submittingVisit ? 0.7 : 1 }}>
                {submittingVisit ? 'Scheduling...' : 'Schedule Visit'}
              </button>
            </section>

            <section style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Managed Site Visits</h3>
              {renderTable(
                ['Customer', 'Property', 'Visit Date', 'Status', 'Actions'],
                visits.map((item) => [
                  item.customer_name || item.name || 'Customer',
                  item.property_name || item.property_id || item.centre_name || 'Property',
                  `${formatDateOnly(item.visit_date)} ${item.visit_time ? `• ${item.visit_time}` : ''}`,
                  <span style={badgeTone(item.status || 'scheduled')}>{String(item.status || 'scheduled').replaceAll('_', ' ')}</span>,
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => updateVisitStatus(item.id, 'agent_approved')} style={{ border: 'none', borderRadius: '10px', background: '#eef6ea', color: '#2b6d3d', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => updateVisitStatus(item.id, 'rescheduled')} style={{ border: 'none', borderRadius: '10px', background: '#f3eefb', color: '#7a4fce', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Reschedule</button>
                    <button onClick={() => updateVisitStatus(item.id, 'completed')} style={{ border: 'none', borderRadius: '10px', background: '#e6f4ea', color: '#1a8a4a', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Complete</button>
                  </div>,
                ]),
              )}
            </section>
          </div>
        )}

        {!loading && page === 'bookings' && (
          <div style={{ display: 'grid', gap: '18px' }}>
            <section style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Create New Booking</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
                <select value={bookingForm.plot_id} onChange={(event) => setBookingForm((current) => ({ ...current, plot_id: event.target.value }))} style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }}>
                  <option value="">Select plot</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.plot_number || asset.id} • {asset.property_name}</option>
                  ))}
                </select>
                <input value={bookingForm.customer_name} onChange={(event) => setBookingForm((current) => ({ ...current, customer_name: event.target.value }))} placeholder="Customer name" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={bookingForm.customer_phone} onChange={(event) => setBookingForm((current) => ({ ...current, customer_phone: event.target.value }))} placeholder="Customer phone" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={bookingForm.customer_email} onChange={(event) => setBookingForm((current) => ({ ...current, customer_email: event.target.value }))} placeholder="Customer email" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input type="date" value={bookingForm.visit_date} onChange={(event) => setBookingForm((current) => ({ ...current, visit_date: event.target.value }))} style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={bookingForm.visit_time} onChange={(event) => setBookingForm((current) => ({ ...current, visit_time: event.target.value }))} placeholder="Visit time" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
                <input value={bookingForm.notes} onChange={(event) => setBookingForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" style={{ height: '46px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 12px', fontFamily: 'inherit' }} />
              </div>
              <button onClick={submitBooking} disabled={submittingBooking} style={{ marginTop: '14px', height: '44px', border: 'none', borderRadius: '12px', background: '#2b6d3d', color: '#fff', padding: '0 18px', fontWeight: 800, cursor: 'pointer', opacity: submittingBooking ? 0.7 : 1 }}>
                {submittingBooking ? 'Creating...' : 'Create Booking'}
              </button>
            </section>

            <section style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Booking Pipeline</h3>
              {renderTable(
                ['Customer', 'Property', 'Plot', 'Status', 'Actions'],
                bookings.map((item) => [
                  item.customer?.name || item.name || 'Customer',
                  item.property_name || item.property_id || 'Property',
                  item.plot_number || item.plot_id || 'Plot',
                  <span style={badgeTone(item.status || 'pending')}>{String(item.status || 'pending').replaceAll('_', ' ')}</span>,
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => updateBookingStatus(item.id, 'agent_approved')} style={{ border: 'none', borderRadius: '10px', background: '#eef6ea', color: '#2b6d3d', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => updateBookingStatus(item.id, 'completed')} style={{ border: 'none', borderRadius: '10px', background: '#e6f4ea', color: '#1a8a4a', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Complete</button>
                    <button onClick={() => updateBookingStatus(item.id, 'cancelled')} style={{ border: 'none', borderRadius: '10px', background: '#fdeaea', color: '#c93b3b', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  </div>,
                ]),
              )}
            </section>
          </div>
        )}

        {!loading && page === 'properties' && (
          <section style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Assigned Properties & Plots</h3>
            {renderTable(
              ['Property', 'Plot', 'Facing', 'Size', 'Status'],
              assets.map((item) => [
                item.property_name || item.property_id || 'Property',
                item.plot_number || item.id,
                item.facing || '—',
                item.size || item.size_sqy ? `${item.size || `${item.size_sqy} sq yards`}` : '—',
                <span style={badgeTone(item.status === 'booked' ? 'booked_asset' : item.status)}>{item.status || 'available'}</span>,
              ]),
            )}
          </section>
        )}

        {!loading && page === 'notifications' && (
          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0 }}>Notifications</h3>
              <button onClick={markAllRead} style={{ border: '1px solid #d7e4d4', background: '#fff', color: '#2b6d3d', borderRadius: '10px', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>
                Mark all read
              </button>
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
                    {!item.read && <span style={badgeTone('open')}>New</span>}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#8a9a8c' }}>{formatDateTime(item.created_at)}</div>
                </div>
              ))
            )}
          </section>
        )}

        {!loading && page === 'profile' && (
          <section style={{ ...cardStyle, maxWidth: '720px' }}>
            <h3 style={{ marginTop: 0 }}>Agent Profile</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={formatPhoneDisplay(user.phone)} readOnly style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit', background: '#f6faf4' }} />
              <input value={profileForm.address} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={profileForm.occupation} onChange={(event) => setProfileForm((current) => ({ ...current, occupation: event.target.value }))} placeholder="Occupation" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={profileForm.age} type="number" onChange={(event) => setProfileForm((current) => ({ ...current, age: event.target.value }))} placeholder="Age" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={profileForm.aadhaar_number} onChange={(event) => setProfileForm((current) => ({ ...current, aadhaar_number: event.target.value }))} placeholder="Aadhaar Number" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={profileForm.bank_details} onChange={(event) => setProfileForm((current) => ({ ...current, bank_details: event.target.value }))} placeholder="Bank Details" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
              <input value={profileForm.agent_brand_name} onChange={(event) => setProfileForm((current) => ({ ...current, agent_brand_name: event.target.value }))} placeholder="Agent Brand Name" style={{ height: '48px', borderRadius: '12px', border: '1px solid #dfe8dc', padding: '0 14px', fontFamily: 'inherit' }} />
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
