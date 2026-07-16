import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson, loadSession, requestJson } from '../lib/auth';

export default function Visits() {
  const navigate = useNavigate();
  const [session] = useState(() => loadSession());

  const [stack, setStack] = useState(['visits']);
  const [tab, setTab] = useState('Upcoming');
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState('book');
  const [pickDate, setPickDate] = useState(() => new Date().getDate());
  const [pickTime, setPickTime] = useState('11:00 AM');
  const [showCancel, setShowCancel] = useState(false);
  const [visitRows, setVisitRows] = useState([]);
  const [propertyRows, setPropertyRows] = useState([]);
  const [notice, setNotice] = useState('');

  const cur = stack[stack.length - 1];

  const go = (s) => {
    setStack((st) => [...st, s]);
    setTimeout(top, 10);
  };
  const reset = (s) => {
    setStack([s]);
    setTimeout(top, 10);
  };
  const back = () => {
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
    setTimeout(top, 10);
  };
  const top = () => {
    const el = document.querySelector('.rv-scroll');
    if (el) el.scrollTop = 0;
  };
  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };
  const refreshVisits = async () => {
    if (!session?.access_token) return [];
    const latest = await getJson('/api/visits/mine', session.access_token).catch(() => []);
    const rows = Array.isArray(latest) ? latest : [];
    setVisitRows(rows);
    return rows;
  };
  const buildVisitDate = () => {
    const base = new Date();
    const selected = Number(pickDate || base.getDate());
    const next = new Date(base.getFullYear(), base.getMonth(), selected);
    next.setHours(0, 0, 0, 0);
    return next.toISOString().slice(0, 10);
  };

  useEffect(() => {
    if (!session?.access_token || session?.user?.role !== 'customer') {
      navigate('/login', { replace: true });
      return;
    }
    let active = true;
    Promise.all([
      getJson('/api/visits/mine', session.access_token).catch(() => []),
      getJson('/api/properties', session.access_token).catch(() => []),
    ]).then(([visits, properties]) => {
      if (!active) return;
      setVisitRows(Array.isArray(visits) ? visits : []);
      setPropertyRows(Array.isArray(properties) ? properties : []);
    });
    return () => { active = false; };
  }, [navigate, session?.access_token, session?.user?.role]);

  const I = {
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 12a2.5 2.5 0 1 0 0 .01',
    map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
    layout: 'M4 4h16v16H4zM4 10h16M10 10v10',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
    nav: 'M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
    phone: 'M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
    tag: 'M4 4h8l8 8-8 8-8-8zM8 8h.01',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6s7 2.5 7 6',
    pin2: 'M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
    reschedule: 'M21 12a9 9 0 1 1-3-6.7M21 4v4h-4',
    share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
    heart: 'M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5-7 9.5-7 9.5z',
  };

  const statusStyle = (status, big) => {
    const m = {
      Upcoming: ['#b5760f', '#fdefd6'],
      Confirmed: ['#2b6d3d', '#e8f3e3'],
      Rescheduled: ['#b5760f', '#fdefd6'],
      Completed: ['#4a6b4a', '#eef3ec'],
      Cancelled: ['#c0392b', '#fdecec'],
    };
    const [c, bg] = m[status] || m['Confirmed'];
    const pad = big ? '6px 14px' : '4px 10px';
    const fs = big ? '12px' : '10.5px';
    return { fontSize: fs, fontWeight: '700', color: c, background: bg, padding: pad, borderRadius: '20px', flex: 'none' };
  };

  const actStyle = (danger) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', height: '40px',
    borderRadius: '12px', fontFamily: 'inherit', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer',
    border: danger ? '1px solid #f3d3d0' : '1px solid #cfe6c6',
    background: '#fff', color: danger ? '#c0392b' : '#2b6d3d'
  });

  const openVisit = (v) => {
    setSel(v);
    setStack((st) => [...st, 'detail']);
    setTimeout(top, 10);
  };
  const call = () => {
    const phone = sel?.assignedAgentPhone || selData?.assignedAgentPhone || session?.user?.phone || '';
    if (!phone) {
      showNotice('A live callback number is not attached to this visit yet.');
      return;
    }
    try { window.open(`tel:${phone}`); } catch (e) {}
  };
  const share = () => { try { if (navigator.share) navigator.share({ title: 'Rivan Site Visit', text: 'My site visit details' }); } catch (e) {} };
  const dir = () => {
    const query = encodeURIComponent(sel?.location || selData?.location || 'Achutapuram Visakhapatnam');
    try { window.open(`https://maps.google.com/?q=${query}`, '_blank'); } catch (e) {}
  };

  const G = [
    'linear-gradient(150deg,#2f6b3a 0%,#6ba15a 55%,#c7dc9c 100%)',
    'linear-gradient(150deg,#3a6b4a 0%,#6ea078 55%,#c2dcc4 100%)',
    'linear-gradient(150deg,#4a6b2f 0%,#84a95a 55%,#d3dfa0 100%)',
    'linear-gradient(150deg,#356b52 0%,#5a9a7a 55%,#b6d7bf 100%)',
  ];

  const upcoming = [];
  const completed = [];

  if (visitRows.length) {
    const propertyLookup = Object.fromEntries(propertyRows.map((item) => [item.id, item]));
    const mappedVisits = visitRows.map((visit, index) => {
      const property = propertyLookup[visit.property_id] || {};
      const status = String(visit.status || '').toLowerCase();
      const visitAt = new Date(visit.visit_date || visit.updated_at || Date.now()).getTime();
      const isDone = ['completed', 'confirmed', 'approved'].includes(status) && visitAt < Date.now();
      const isClosed = ['cancelled', 'rejected'].includes(status);
      return {
        id: visit.id || `visit-${index}`,
        name: visit.property_name || property.name || 'Sirpuram Gardens',
        project: visit.property_name || property.name || 'Sirpuram Gardens',
        plot: visit.plot_number || visit.plot_id || 'Site Visit',
        type: String(property.property_type || 'Plot / Land'),
        location: property.location || property.address || 'Achutapuram, Visakhapatnam',
        date: visit.visit_date ? new Date(visit.visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        time: visit.visit_time || '11:00 AM',
        bookingId: visit.id || 'Visit',
        status: isDone ? 'Completed' : (status === 'cancelled' ? 'Cancelled' : status === 'rescheduled' ? 'Rescheduled' : status === 'pending_agent_approval' ? 'Upcoming' : 'Confirmed'),
        countdown: 'Visit status synced live',
        grad: G[index % G.length],
        phase: isDone || isClosed ? 'completed' : 'upcoming',
        assignedAgentName: visit.assigned_agent_name || 'Assigned after approval',
        assignedAgentPhone: visit.assigned_agent_phone || '',
        specs: [
          ['Property', visit.property_name || property.name || 'Sirpuram Gardens'],
          ['Date', visit.visit_date ? new Date(visit.visit_date).toLocaleDateString('en-IN') : '—'],
          ['Time', visit.visit_time || '11:00 AM'],
          ['Status', String(visit.status || 'pending')],
        ],
        notes: visit.review_notes || '',
      };
    });
    upcoming.splice(0, upcoming.length, ...mappedVisits.filter((item) => item.phase === 'upcoming'));
    completed.splice(0, completed.length, ...mappedVisits.filter((item) => item.phase === 'completed'));
  }

  const getTab = (l) => ({
    label: l,
    pick: () => setTab(l),
    style: tab === l
      ? { flex: 1, height: '40px', borderRadius: '11px', border: 'none', background: '#fff', color: '#1f5a31', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer' }
      : { flex: 1, height: '40px', borderRadius: '11px', border: 'none', background: 'transparent', color: '#cfe0cd', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' },
  });
  const tabs = [getTab('Upcoming'), getTab('Completed')];

  const cardActions = (v) => v.phase === 'upcoming' ? [
    { label: 'Directions', icon: I.nav, go: (e) => { e.stopPropagation(); dir(); }, style: actStyle(false), stroke: '#2b6d3d' },
    { label: 'Reschedule', icon: I.reschedule, go: (e) => { e.stopPropagation(); setSel(v); setMode('reschedule'); setStack((st) => [...st, 'book']); setTimeout(top, 10); }, style: actStyle(false), stroke: '#2b6d3d' },
    { label: 'Cancel', icon: 'M6 6l12 12M18 6 6 18', go: (e) => { e.stopPropagation(); setSel(v); setShowCancel(true); }, style: actStyle(true), stroke: '#c0392b' },
  ] : [
    { label: 'View Again', icon: I.eye, go: (e) => { e.stopPropagation(); openVisit(v); }, style: actStyle(false), stroke: '#2b6d3d' },
    { label: 'Book Again', icon: I.cal, go: (e) => { e.stopPropagation(); setSel(v); setMode('book'); setStack((st) => [...st, 'book']); setTimeout(top, 10); }, style: actStyle(false), stroke: '#2b6d3d' },
  ];

  const decorate = (v) => {
    const up = v.phase === 'upcoming';
    const cdColor = v.status === 'Confirmed' ? '#2b6d3d' : '#b5760f';
    const cdBg = v.status === 'Confirmed' ? '#e8f3e3' : '#fdefd6';
    return {
      ...v, showCountdown: up, cdColor, cdBg,
      statusStyle: statusStyle(v.status, false), statusStyleLg: statusStyle(v.status, true),
      isUpcoming: up, isCompleted: !up, hasNotes: !!v.notes,
      actions: cardActions(v), open: () => openVisit(v)
    };
  };
  const list = (tab === 'Upcoming' ? upcoming : completed).map(decorate);
  const emptyVisit = {
    id: 'empty-visit',
    name: 'Siripuram Property Visit',
    project: 'Siripuram Gardens',
    plot: 'Visit will be assigned after scheduling',
    type: 'Plot / Land',
    location: 'Achutapuram, Visakhapatnam',
    date: '—',
    time: '11:00 AM',
    bookingId: 'Visit',
    status: 'Upcoming',
    countdown: 'Schedule a live visit to continue.',
    grad: G[0],
    phase: tab === 'Completed' ? 'completed' : 'upcoming',
    assignedAgentName: 'Assigned after approval',
    assignedAgentPhone: '',
    specs: [
      ['Property', 'Siripuram Gardens'],
      ['Date', '—'],
      ['Time', '11:00 AM'],
      ['Status', 'pending'],
    ],
    notes: '',
  };
  const selData = sel ? decorate(sel) : (list[0] || decorate(emptyVisit));

  const propSpecs = (selData.specs || []).map(([k, v], idx) => ({ k, v, color: idx === 3 ? '#2b6d3d' : '#16231a' }));
  const selectedVisitDateLabel = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(buildVisitDate()));
  const visitInfo = [
    { k: 'Date', v: selData.date, icon: I.cal },
    { k: 'Time', v: selData.time, icon: I.clock },
    { k: 'Booking ID', v: selData.bookingId, icon: I.tag },
    { k: 'Meeting Point', v: 'Project Site Office', icon: I.pin2 },
  ].map((r, idx) => ({ ...r, border: idx === 0 ? 'none' : '1px solid #f0f4ee' }));
  const quickActions = [
    { label: 'Interactive Layout', icon: I.layout, go: () => navigate('/my-lands') },
    { label: 'Property Details', icon: I.info, go: () => navigate('/my-lands') },
    { label: 'Contact Executive', icon: I.phone, go: () => call() },
    { label: 'Share Details', icon: I.share, go: () => share() },
  ];

  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const calendarBase = new Date();
  const calendarYear = calendarBase.getFullYear();
  const calendarMonth = calendarBase.getMonth();
  const todayDate = calendarBase.getDate();
  const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(calendarYear, calendarMonth, 1),
  );
  const calendar = [
    ...Array.from({ length: firstWeekday }, () => ({
      label: '',
      pick: undefined,
      style: { height: '38px', border: 'none', background: 'transparent', cursor: 'default' },
    })),
    ...Array.from({ length: daysInMonth }, (_, offset) => {
      const dayNumber = offset + 1;
      const isPast = dayNumber < todayDate;
      const isSelected = dayNumber === pickDate;
      return {
        label: isPast ? '' : String(dayNumber),
        pick: isPast ? undefined : () => setPickDate(dayNumber),
        style: isSelected
          ? { height: '38px', borderRadius: '11px', border: 'none', background: '#2b6d3d', color: '#fff', fontFamily: 'inherit', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }
          : isPast
          ? { height: '38px', border: 'none', background: 'transparent', color: 'transparent', cursor: 'default' }
          : { height: '38px', borderRadius: '11px', border: '1px solid #edf2ea', background: '#fff', color: '#3d4f40', fontFamily: 'inherit', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }
      };
    }),
  ];
  const slotList = ['10:00 AM', '11:00 AM', '12:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
  const slots = slotList.map((l) => ({
    label: l, pick: () => setPickTime(l),
    style: pickTime === l
      ? { height: '46px', borderRadius: '13px', border: 'none', background: '#2b6d3d', color: '#fff', fontFamily: 'inherit', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }
      : { height: '46px', borderRadius: '13px', border: '1px solid #e2e8e0', background: '#fff', color: '#3d4f40', fontFamily: 'inherit', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }
  }));

  const successRows = [
    { k: 'Property', v: selData.name }, { k: 'Plot', v: selData.plot }, { k: 'Date', v: selectedVisitDateLabel }, { k: 'Time', v: pickTime },
  ].map((r, idx) => ({ ...r, border: idx === 0 ? 'none' : '1px solid #f0f4ee' }));

  const showNav = cur === 'visits';
  const green = cur === 'visits' || cur === 'book';
  const emptyMap = {
    Upcoming: ['No upcoming visits', 'Schedule a site visit to see your appointments here.'],
    Completed: ['No completed visits', 'Your finished site visits will appear here.']
  };

  const statusColor = (cur === 'detail' || cur === 'success') ? (cur === 'success' ? '#1f5a31' : '#ffffff') : (green ? '#ffffff' : '#1f5a31');
  const isVisits = cur === 'visits';
  const isDetail = cur === 'detail';
  const isBook = cur === 'book';
  const isSuccess = cur === 'success';

  const goHome = () => navigate('/app');
  const goPayments = () => navigate('/app#payments');
  const goProfile = () => navigate('/app#profile');
  const goLandsPage = () => navigate('/my-lands');
  const goVisitsPage = () => reset('visits');
  const goVisitsTab = () => reset('visits');

  const directions = () => dir();
  const listShow = list.length > 0;
  const listEmpty = list.length === 0;
  const emptyTitle = emptyMap[tab][0];
  const emptyText = emptyMap[tab][1];

  const goReschedule = () => { setMode('reschedule'); setStack((st) => [...st, 'book']); setTimeout(top, 10); };
  const askCancel = () => setShowCancel(true);
  const dismiss = () => setShowCancel(false);
  const goBook = () => { setMode('book'); setStack((st) => [...st, 'book']); setTimeout(top, 10); };
  const confirmBook = async () => {
    if (!session?.access_token) return;
    const visitDate = buildVisitDate();
    const selectedProperty = propertyRows.find((item) => item.name === (sel?.name || selData?.name)) || propertyRows[0];
    if (!selectedProperty) {
      showNotice('No live property is attached to this visit yet.');
      return;
    }
    try {
      if (mode === 'reschedule' && sel?.id) {
        await requestJson(`/api/visits/${sel.id}`, {
          method: 'PUT',
          body: {
            status: 'rescheduled',
            visit_date: visitDate,
            visit_time: pickedTime,
          },
        }, session.access_token);
      } else {
        await requestJson('/api/visits/site', {
          method: 'POST',
          body: {
            property_id: selectedProperty.id,
            visit_date: visitDate,
            visit_time: pickedTime,
            name: session.user?.name || 'Customer',
            mobile: session.user?.phone || '',
          },
        }, session.access_token);
      }
      await refreshVisits();
      setStack((st) => [...st, 'success']);
      setTimeout(top, 10);
    } catch (error) {
      showNotice(error?.message || (mode === 'reschedule'
        ? 'Unable to reschedule this visit right now.'
        : 'Unable to schedule this visit right now.'));
    }
  };
  const requestBookingFromVisit = async () => {
    if (!session?.access_token) return;
    const selectedProperty = propertyRows.find((item) => item.name === (sel?.name || selData?.name)) || propertyRows[0];
    if (!selectedProperty?.id) {
      showNotice('No live property is attached to this visit yet.');
      return;
    }
    try {
      const plots = await getJson(`/api/properties/${selectedProperty.id}/plots`, session.access_token).catch(() => []);
      const plot = Array.isArray(plots) ? plots.find((item) => ['available', 'reserved'].includes(String(item.status || '').toLowerCase())) : null;
      if (!plot?.id) {
        showNotice('No live plot is available for booking on this property right now.');
        return;
      }
      await requestJson('/api/bookings', {
        method: 'POST',
        body: {
          plot_id: plot.id,
          name: session.user?.name || 'Customer',
          mobile: session.user?.phone || '',
          whatsapp: session.user?.phone || '',
          message: `Booking request created from visit ${selData?.bookingId || ''}`.trim(),
        },
      }, session.access_token);
      showNotice('Live booking request submitted successfully.');
    } catch (error) {
      showNotice(error?.message || 'Unable to create the booking request right now.');
    }
  };
  const goVisits = () => reset('visits');

  const bookTitle = mode === 'reschedule' ? 'Reschedule Visit' : 'Book Site Visit';
  const confirmLabel = mode === 'reschedule' ? 'Confirm Reschedule' : 'Confirm Visit';

  const SW = [
    ['visits', 'Visits'], ['detailU', 'Upcoming Detail'], ['detailC', 'Completed Detail'], ['book', 'Book'], ['success', 'Confirmed']
  ];
  const switcher = SW.map(([id, label]) => ({
    label,
    go: () => {
      if (id === 'visits') reset('visits');
      else if (id === 'detailU') {
        if (upcoming[0]) openVisit(decorate(upcoming[0]));
        else showNotice('No upcoming live visits are available yet.');
      }
      else if (id === 'detailC') {
        setTab('Completed');
        if (completed[0]) openVisit(decorate(completed[0]));
        else showNotice('No completed live visits are available yet.');
      }
      else if (id === 'book') { setSel(selData); setMode('book'); setStack((st) => [...st, 'book']); setTimeout(top, 10); }
      else { setStack((st) => [...st, 'success']); setTimeout(top, 10); }
    },
    style: (cur === id || (id === 'detailU' && cur === 'detail' && selData.phase === 'upcoming') || (id === 'detailC' && cur === 'detail' && selData.phase === 'completed'))
      ? { padding: '6px 11px', borderRadius: '9px', border: 'none', background: '#1f5a31', color: '#fff', fontFamily: 'inherit', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }
      : { padding: '6px 11px', borderRadius: '9px', border: 'none', background: 'rgba(18,53,29,.06)', color: '#3d4f40', fontFamily: 'inherit', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }
  }));

  
  const pickedDate = pickDate;
  const pickedTime = pickTime;

  return (
    <>


  <div className="rv-phone">

    <div className="rv-scroll with-nav" style={{'position': 'absolute', 'inset': '0', 'overflowY': 'auto'}}>
      {notice && (
        <div style={{ position: 'sticky', top: '12px', zIndex: 20, margin: '12px 22px 0', background: '#1f5a31', color: '#fff', borderRadius: '14px', padding: '12px 14px', fontSize: '12.5px', fontWeight: 600, boxShadow: '0 12px 24px -18px rgba(18,53,29,.75)' }}>
          {notice}
        </div>
      )}

      {/* ===================== VISITS HOME ===================== */}
      {isVisits && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 20px', 'borderRadius': '0 0 26px 26px'}}>
          <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between'}}>
            <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '10px'}}>
              <img src="/RivanRealtyLogo.png" alt="Rivan Realty" style={{'height': '26px', 'width': '44px', 'objectFit': 'contain', 'borderRadius': '8px', 'opacity': '.95'}} />
              <span style={{'fontSize': '19px', 'fontWeight': '800', 'color': '#fff'}}>My Visits</span>
            </div>
            <button style={{'width': '40px', 'height': '40px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'cursor': 'pointer'}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"/></svg>
            </button>
          </div>
          <p style={{'margin': '12px 0 0', 'fontSize': '13px', 'color': '#bcd6bd', 'fontWeight': '500'}}>Manage all your property site visits in one place</p>
          <div style={{'marginTop': '16px', 'display': 'flex', 'background': 'rgba(255,255,255,.12)', 'borderRadius': '14px', 'padding': '5px', 'gap': '5px'}}>
            { tabs.map((t, index) => (
              <button onClick={t.pick} style={t.style}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{'padding': '18px 22px 0'}}>
          {/* EMPTY */}
          {listEmpty && (
          <div style={{'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'textAlign': 'center', 'padding': '56px 24px'}}>
            <div style={{'width': '90px', 'height': '90px', 'borderRadius': '28px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#8fae8c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/></svg>
            </div>
            <p style={{'margin': '20px 0 6px', 'fontSize': '16px', 'fontWeight': '800', 'color': '#1f5a31'}}>{emptyTitle}</p>
            <p style={{'margin': '0 0 22px', 'fontSize': '13px', 'color': '#8a988c', 'maxWidth': '230px', 'lineHeight': '1.5'}}>{emptyText}</p>
            <button onClick={goBook} style={{'height': '50px', 'padding': '0 28px', 'border': 'none', 'borderRadius': '15px', 'background': 'linear-gradient(180deg,#eb9236,#e2822a)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '14.5px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 12px 24px -10px rgba(226,130,42,.6)'}}>Book a Site Visit</button>
          </div>
          )}

          {/* LIST */}
          {listShow && (
          <div style={{'display': 'flex', 'flexDirection': 'column', 'gap': '16px'}}>
            { list.map((v, index) => (
              <div style={{'background': '#fff', 'borderRadius': '22px', 'border': '1px solid #eef3ec', 'overflow': 'hidden', 'boxShadow': '0 14px 34px -24px rgba(18,53,29,.55)'}}>
                {/* countdown strip (upcoming only) */}
                {v.showCountdown && (
                <div style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: v.cdBg}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={v.cdColor} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2"/></svg>
                  <span style={{fontSize: '12px', fontWeight: '700', color: v.cdColor}}>{v.countdown}</span>
                </div>
                )}
                <div onClick={v.open} style={{'padding': '14px', 'cursor': 'pointer'}}>
                  <div style={{'display': 'flex', 'gap': '13px'}}>
                    <div style={{width: '88px', height: '88px', borderRadius: '15px', background: v.grad, flex: 'none', position: 'relative'}}>
                      <span style={{'position': 'absolute', 'bottom': '6px', 'left': '6px', 'background': 'rgba(9,32,16,.6)', 'color': '#fff', 'fontSize': '9px', 'fontWeight': '700', 'padding': '2px 7px', 'borderRadius': '20px', 'backdropFilter': 'blur(4px)'}}>{v.type}</span>
                    </div>
                    <div style={{'flex': '1', 'minWidth': '0'}}>
                      <div style={{'display': 'flex', 'alignItems': 'flex-start', 'justifyContent': 'space-between', 'gap': '8px'}}>
                        <p style={{'margin': '0', 'fontSize': '15.5px', 'fontWeight': '800', 'color': '#16231a'}}>{v.name}</p>
                        <span style={v.statusStyle}>{v.status}</span>
                      </div>
                      <p style={{'margin': '3px 0 6px', 'fontSize': '12px', 'color': '#8a988c', 'fontWeight': '500'}}>{v.project} · {v.plot}</p>
                      <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '6px', 'marginBottom': '4px'}}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a988c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/></svg>
                        <span style={{'fontSize': '11.5px', 'color': '#6d7d6f', 'fontWeight': '500'}}>{v.location}</span>
                      </div>
                      <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '6px'}}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/></svg>
                        <span style={{'fontSize': '11.5px', 'color': '#3d4f40', 'fontWeight': '700'}}>{v.date} · {v.time}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between', 'marginTop': '12px', 'paddingTop': '11px', 'borderTop': '1px solid #f0f4ee'}}>
                    <span style={{'fontSize': '11px', 'color': '#9aa89c', 'fontWeight': '600'}}>Booking ID: {v.bookingId}</span>
                    <span style={{'fontSize': '12px', 'color': '#e2822a', 'fontWeight': '700'}}>View Details →</span>
                  </div>
                </div>
                {/* actions */}
                <div style={{'display': 'flex', 'gap': '8px', 'padding': '0 14px 14px'}}>
                  { v.actions.map((a, index) => (
                    <button onClick={a.go} style={a.style}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={a.stroke} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={a.icon}/></svg>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
      )}

      {/* ===================== VISIT DETAILS ===================== */}
      {isDetail && (
      <div className="rv-screen">
          <div style={{position: 'relative', height: '230px', background: selData.grad}}>
          <div style={{'position': 'absolute', 'inset': '0', 'background': 'linear-gradient(180deg,rgba(9,32,16,.3),transparent 40%,rgba(9,32,16,.5))'}}></div>
          <div style={{'position': 'absolute', 'top': '52px', 'left': '20px', 'right': '20px', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between'}}>
            <button onClick={back} style={{'width': '40px', 'height': '40px', 'borderRadius': '13px', 'border': 'none', 'background': 'rgba(255,255,255,.92)', 'color': '#1f5a31', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
            <span style={{'fontSize': '15px', 'fontWeight': '800', 'color': '#fff', 'textShadow': '0 1px 6px rgba(0,0,0,.4)'}}>Visit Details</span>
            <button onClick={share} style={{'width': '40px', 'height': '40px', 'borderRadius': '13px', 'border': 'none', 'background': 'rgba(255,255,255,.92)', 'cursor': 'pointer', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1f5a31" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/></svg>
            </button>
          </div>
          <div style={{'position': 'absolute', 'bottom': '16px', 'left': '20px', 'display': 'flex', 'gap': '8px'}}>
            <span style={selData.statusStyleLg}>{selData.status}</span>
          </div>
          <div style={{'position': 'absolute', 'bottom': '16px', 'right': '20px', 'display': 'flex', 'gap': '5px'}}>
            <span style={{'width': '20px', 'height': '5px', 'borderRadius': '3px', 'background': '#fff'}}></span>
            <span style={{'width': '5px', 'height': '5px', 'borderRadius': '3px', 'background': 'rgba(255,255,255,.6)'}}></span>
            <span style={{'width': '5px', 'height': '5px', 'borderRadius': '3px', 'background': 'rgba(255,255,255,.6)'}}></span>
          </div>
        </div>

        <div style={{'padding': '20px 22px 0', 'marginTop': '-24px', 'background': '#f8fbf6', 'borderRadius': '24px 24px 0 0', 'position': 'relative'}}>
          {/* countdown */}
          {selData.showCountdown && (
          <div style={{display: 'flex', alignItems: 'center', gap: '9px', background: selData.cdBg, borderRadius: '14px', padding: '12px 14px', marginBottom: '16px'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={selData.cdColor} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2"/></svg>
            <span style={{fontSize: '13px', fontWeight: '700', color: selData.cdColor}}>{selData.countdown}</span>
          </div>
          )}

          {/* property info */}
          <p style={{'margin': '0 0 10px', 'fontSize': '12px', 'fontWeight': '800', 'color': '#8a988c', 'letterSpacing': '.5px', 'textTransform': 'uppercase'}}>Property Information</p>
          <p style={{'margin': '0', 'fontSize': '21px', 'fontWeight': '800', 'color': '#1f5a31'}}>{selData.name}</p>
          <p style={{'margin': '5px 0 0', 'fontSize': '13px', 'color': '#6d7d6f', 'fontWeight': '500'}}>{selData.project}</p>
          <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '6px', 'marginTop': '8px'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a988c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/></svg>
            <span style={{'fontSize': '12.5px', 'color': '#6d7d6f', 'fontWeight': '500'}}>{selData.location}</span>
          </div>
          <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '11px', 'marginTop': '16px'}}>
            { propSpecs.map((p, index) => (
              <div style={{'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '14px', 'padding': '12px 14px'}}>
                <p style={{'margin': '0', 'fontSize': '11px', 'color': '#8a988c', 'fontWeight': '600'}}>{p.k}</p>
                <p style={{margin: '5px 0 0', fontSize: '14px', fontWeight: '700', color: p.color}}>{p.v}</p>
              </div>
            ))}
          </div>

          {/* visit info */}
          <p style={{'margin': '24px 0 12px', 'fontSize': '12px', 'fontWeight': '800', 'color': '#8a988c', 'letterSpacing': '.5px', 'textTransform': 'uppercase'}}>Visit Information</p>
          <div style={{'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '18px', 'padding': '6px 16px', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            { visitInfo.map((r, index) => (
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 0', borderTop: r.border}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={r.icon}/></svg>
                <span style={{'flex': '1', 'fontSize': '12.5px', 'color': '#6d7d6f', 'fontWeight': '500'}}>{r.k}</span>
                <span style={{'fontSize': '13px', 'color': '#16231a', 'fontWeight': '700'}}>{r.v}</span>
              </div>
            ))}
          </div>

          {/* sales executive */}
          <div style={{'marginTop': '14px', 'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '18px', 'padding': '16px', 'display': 'flex', 'alignItems': 'center', 'gap': '13px', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            <div style={{'width': '50px', 'height': '50px', 'borderRadius': '15px', 'background': 'linear-gradient(160deg,#2b6d3d,#3f8a54)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'fontSize': '17px', 'fontWeight': '800', 'color': '#fff'}}>{String(selData.assignedAgentName || 'AG').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'AG'}</div>
            <div style={{'flex': '1'}}><p style={{'margin': '0', 'fontSize': '11px', 'color': '#8a988c', 'fontWeight': '600'}}>Assigned Agent</p><p style={{'margin': '4px 0 0', 'fontSize': '14.5px', 'fontWeight': '800', 'color': '#16231a'}}>{selData.assignedAgentName || 'Assigned after approval'}</p><p style={{'margin': '2px 0 0', 'fontSize': '11.5px', 'color': '#6d7d6f', 'fontWeight': '500'}}>{selData.assignedAgentPhone || 'Live number will appear after assignment'}</p></div>
            <button onClick={call} style={{'width': '44px', 'height': '44px', 'borderRadius': '13px', 'border': 'none', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'cursor': 'pointer'}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>
            </button>
          </div>

          {/* map / navigation */}
          <div style={{'marginTop': '14px', 'borderRadius': '18px', 'overflow': 'hidden', 'border': '1px solid #eef3ec', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            <div style={{'height': '120px', 'position': 'relative', 'background': 'linear-gradient(160deg,#eef6ea,#dce9d4)'}}>
              <div style={{'position': 'absolute', 'inset': '0', 'backgroundImage': 'linear-gradient(#cfe0c4 1px,transparent 1px),linear-gradient(90deg,#cfe0c4 1px,transparent 1px)', 'backgroundSize': '24px 24px', 'opacity': '.6'}}></div>
              <div style={{'position': 'absolute', 'top': '52px', 'left': '44%', 'width': '2px', 'height': '60px', 'background': '#c2a06a'}}></div>
              <div style={{'position': 'absolute', 'top': '20px', 'left': '20%', 'right': '30%', 'height': '2px', 'background': '#c2a06a', 'opacity': '.7'}}></div>
              <div style={{'position': 'absolute', 'top': '44px', 'left': 'calc(44% - 12px)', 'width': '26px', 'height': '26px', 'borderRadius': '50% 50% 50% 0', 'transform': 'rotate(-45deg)', 'background': '#e2822a', 'boxShadow': '0 4px 10px -2px rgba(226,130,42,.6)'}}></div>
            </div>
            <button onClick={directions} style={{'width': '100%', 'height': '50px', 'border': 'none', 'background': '#fff', 'color': '#2b6d3d', 'fontFamily': 'inherit', 'fontSize': '14px', 'fontWeight': '700', 'cursor': 'pointer', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'gap': '8px', 'borderTop': '1px solid #f0f4ee'}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/></svg>
              Get Directions
            </button>
          </div>

          {/* quick actions */}
          <p style={{'margin': '24px 0 12px', 'fontSize': '12px', 'fontWeight': '800', 'color': '#8a988c', 'letterSpacing': '.5px', 'textTransform': 'uppercase'}}>Quick Actions</p>
          <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '11px'}}>
            { quickActions.map((q, index) => (
              <button onClick={q.go} style={{'display': 'flex', 'alignItems': 'center', 'gap': '11px', 'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '15px', 'padding': '14px', 'cursor': 'pointer', 'fontFamily': 'inherit', 'textAlign': 'left'}}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style={{'flex': 'none'}}><path d={q.icon}/></svg>
                <span style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a', 'lineHeight': '1.25'}}>{q.label}</span>
              </button>
            ))}
          </div>

          {/* primary actions */}
          {selData.isUpcoming && (
          <div style={{'display': 'flex', 'gap': '12px', 'margin': '20px 0'}}>
            <button onClick={goReschedule} style={{'flex': '1', 'height': '54px', 'borderRadius': '16px', 'border': '1.5px solid #2b6d3d', 'background': '#fff', 'color': '#2b6d3d', 'fontFamily': 'inherit', 'fontSize': '14px', 'fontWeight': '700', 'cursor': 'pointer'}}>Reschedule</button>
            <button onClick={askCancel} style={{'flex': '1', 'height': '54px', 'borderRadius': '16px', 'border': '1.5px solid #f3d3d0', 'background': '#fff', 'color': '#c0392b', 'fontFamily': 'inherit', 'fontSize': '14px', 'fontWeight': '700', 'cursor': 'pointer'}}>Cancel Visit</button>
          </div>
          )}
          {selData.isCompleted && (
          <div style={{'margin': '20px 0'}}>
            {selData.hasNotes && (
            <div style={{'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '16px', 'padding': '15px', 'marginBottom': '14px'}}>
              <p style={{'margin': '0 0 6px', 'fontSize': '12px', 'fontWeight': '800', 'color': '#8a988c', 'textTransform': 'uppercase', 'letterSpacing': '.5px'}}>Visit Notes</p>
              <p style={{'margin': '0', 'fontSize': '13px', 'color': '#4a5c4d', 'lineHeight': '1.55'}}>{selData.notes}</p>
            </div>
            )}
            <button onClick={goBook} style={{'width': '100%', 'height': '54px', 'borderRadius': '16px', 'border': 'none', 'background': 'linear-gradient(180deg,#eb9236,#e2822a)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '14.5px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 12px 24px -12px rgba(226,130,42,.55)', 'marginBottom': '12px'}}>Book Another Visit</button>
            <div style={{'display': 'flex', 'gap': '12px'}}>
              <button onClick={requestBookingFromVisit} style={{'flex': '1', 'height': '50px', 'borderRadius': '15px', 'border': '1.5px solid #cfe6c6', 'background': '#fff', 'color': '#2b6d3d', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'fontWeight': '700', 'cursor': 'pointer'}}>♡ Mark Interested</button>
              <button onClick={call} style={{'flex': '1', 'height': '50px', 'borderRadius': '15px', 'border': '1.5px solid #cfe6c6', 'background': '#fff', 'color': '#2b6d3d', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'fontWeight': '700', 'cursor': 'pointer'}}>Request Callback</button>
            </div>
          </div>
          )}
        </div>
      </div>
      )}

      {/* ===================== BOOK / RESCHEDULE ===================== */}
      {isBook && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 20px', 'borderRadius': '0 0 26px 26px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
          <button onClick={back} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
          <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>{bookTitle}</span>
        </div>

        <div style={{'padding': '18px 22px 0'}}>
          <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '12px', 'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '16px', 'padding': '12px', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            <div style={{width: '52px', height: '52px', borderRadius: '13px', background: selData.grad, flex: 'none'}}></div>
            <div style={{'flex': '1'}}><p style={{'margin': '0', 'fontSize': '14.5px', 'fontWeight': '800', 'color': '#16231a'}}>{selData.name}</p><p style={{'margin': '3px 0 0', 'fontSize': '11.5px', 'color': '#8a988c', 'fontWeight': '500'}}>{selData.plot} · {selData.location}</p></div>
          </div>

          <p style={{'margin': '22px 0 12px', 'fontSize': '14px', 'fontWeight': '800', 'color': '#1f5a31'}}>{`Select Date · ${monthLabel}`}</p>
          <div style={{'display': 'grid', 'gridTemplateColumns': 'repeat(7,1fr)', 'gap': '6px'}}>
            { weekdays.map((w, index) => (<span style={{'textAlign': 'center', 'fontSize': '10.5px', 'fontWeight': '700', 'color': '#9aa89c'}}>{w}</span>))}
            { calendar.map((d, index) => (
              <button key={`calendar-${index}`} onClick={d.pick} disabled={!d.pick} style={d.style}>{d.label}</button>
            ))}
          </div>

          <p style={{'margin': '22px 0 12px', 'fontSize': '14px', 'fontWeight': '800', 'color': '#1f5a31'}}>Select Time Slot</p>
          <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr 1fr', 'gap': '9px'}}>
            { slots.map((s, index) => (
              <button onClick={s.pick} style={s.style}>{s.label}</button>
            ))}
          </div>

          <div style={{'marginTop': '20px', 'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '16px', 'padding': '16px', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            <p style={{'margin': '0 0 10px', 'fontSize': '12px', 'fontWeight': '800', 'color': '#8a988c', 'textTransform': 'uppercase', 'letterSpacing': '.5px'}}>Your Details</p>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'padding': '6px 0'}}><span style={{'fontSize': '12.5px', 'color': '#6d7d6f', 'fontWeight': '500'}}>Name</span><span style={{'fontSize': '13px', 'color': '#16231a', 'fontWeight': '700'}}>{session?.user?.name || 'Customer'}</span></div>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'padding': '6px 0'}}><span style={{'fontSize': '12.5px', 'color': '#6d7d6f', 'fontWeight': '500'}}>Mobile</span><span style={{'fontSize': '13px', 'color': '#16231a', 'fontWeight': '700'}}>{session?.user?.phone ? `+${String(session.user.phone).replace(/^\+/, '')}` : '—'}</span></div>
          </div>

          <button onClick={confirmBook} style={{'margin': '20px 0', 'width': '100%', 'height': '56px', 'border': 'none', 'borderRadius': '16px', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 14px 26px -12px rgba(18,68,35,.7)'}}>{confirmLabel} · {selectedVisitDateLabel}, {pickedTime}</button>
        </div>
      </div>
      )}

      {/* ===================== SUCCESS ===================== */}
      {isSuccess && (
      <div className="rv-screen" style={{'minHeight': '820px', 'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'justifyContent': 'center', 'textAlign': 'center', 'padding': '40px 34px'}}>
        <div style={{'position': 'relative', 'width': '110px', 'height': '110px', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
          <span style={{'position': 'absolute', 'inset': '0', 'borderRadius': '50%', 'background': '#2b6d3d', 'animation': 'rvRing 1.6s ease-out infinite'}}></span>
          <div style={{'position': 'relative', 'width': '100px', 'height': '100px', 'borderRadius': '50%', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'boxShadow': '0 18px 40px -14px rgba(18,68,35,.8)'}}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4 10-10"/></svg>
          </div>
        </div>
        <p style={{'margin': '26px 0 8px', 'fontSize': '23px', 'fontWeight': '800', 'color': '#1f5a31'}}>Site Visit Confirmed!</p>
        <p style={{'margin': '0', 'fontSize': '14px', 'color': '#6d7d6f', 'lineHeight': '1.55', 'maxWidth': '270px'}}>We've scheduled your visit. Our sales executive will meet you at the site.</p>
        <div style={{'marginTop': '26px', 'width': '100%', 'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '18px', 'padding': '6px 18px', 'boxShadow': '0 14px 34px -24px rgba(18,53,29,.55)'}}>
          { successRows.map((r, index) => (
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: r.border}}><span style={{'fontSize': '12.5px', 'color': '#8a988c', 'fontWeight': '500'}}>{r.k}</span><span style={{'fontSize': '13.5px', 'color': '#16231a', 'fontWeight': '700'}}>{r.v}</span></div>
          ))}
        </div>
        <button onClick={goVisits} style={{'marginTop': '28px', 'width': '100%', 'height': '56px', 'border': 'none', 'borderRadius': '16px', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 14px 26px -12px rgba(18,68,35,.7)'}}>View My Visits</button>
        <button onClick={goHome} style={{'marginTop': '12px', 'width': '100%', 'height': '56px', 'border': '1.5px solid #cfe6c6', 'borderRadius': '16px', 'background': '#fff', 'color': '#2b6d3d', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '700', 'cursor': 'pointer'}}>Back to Home</button>
      </div>
      )}

    </div>


    {/* ===================== MAIN NAV ===================== */}
    <nav className="rv-nav">
      <button className="rv-nav-btn" onClick={goHome}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5"/></svg>
        <span className="nav-label">Home</span>
      </button>
      <button className="rv-nav-btn active" onClick={goVisitsPage}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 14l2 2 4-4"/></svg>
        <span className="nav-label">Site Visits</span>
      </button>
      <button className="rv-nav-btn" onClick={goLandsPage}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4h9v17M9 8h3M9 12h3M9 16h3M6 21h13"/></svg>
        <span className="nav-label">My Lands</span>
      </button>
      <button className="rv-nav-btn" onClick={goPayments}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v11H3zM3 10.5h18"/></svg>
        <span className="nav-label">Payments</span>
      </button>
      <button className="rv-nav-btn" onClick={goProfile}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>
        <span className="nav-label">Profile</span>
      </button>
    </nav>


    {/* CANCEL MODAL */}
    {showCancel && (
    <div onClick={dismiss} style={{'position': 'absolute', 'inset': '0', 'background': 'rgba(9,32,16,.5)', 'backdropFilter': 'blur(3px)', 'display': 'flex', 'alignItems': 'flex-end', 'zIndex': '70'}}>
      <div style={{'background': '#fff', 'borderRadius': '26px 26px 0 0', 'padding': '28px 24px 26px', 'width': '100%', 'animation': 'rvPop .28s cubic-bezier(.22,1.2,.5,1) both'}}>
        <div style={{'width': '64px', 'height': '64px', 'borderRadius': '20px', 'background': '#fdecec', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'margin': '0 auto'}}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c0392b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16h.01M10.3 3.8 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/></svg>
        </div>
        <p style={{'margin': '16px 0 6px', 'fontSize': '18px', 'fontWeight': '800', 'color': '#1f5a31', 'textAlign': 'center'}}>Cancel this visit?</p>
        <p style={{'margin': '0', 'fontSize': '13px', 'color': '#6d7d6f', 'textAlign': 'center', 'lineHeight': '1.55'}}>This will cancel your visit to {selData.name} on {selData.date}. You can rebook anytime.</p>
        <div style={{'display': 'flex', 'gap': '12px', 'marginTop': '22px'}}>
          <button onClick={dismiss} style={{'flex': '1', 'height': '52px', 'borderRadius': '15px', 'border': '1.5px solid #e2e8e0', 'background': '#fff', 'color': '#3d4f40', 'fontFamily': 'inherit', 'fontSize': '14.5px', 'fontWeight': '700', 'cursor': 'pointer'}}>Keep Visit</button>
          <button onClick={async () => {
            if (sel?.id && session?.access_token) {
              try {
                await requestJson(`/api/visits/${sel.id}`, { method: 'PUT', body: { status: 'cancelled' } }, session.access_token);
                await refreshVisits();
                showNotice('Visit cancelled successfully.');
              } catch (error) {
                showNotice(error?.message || 'Unable to cancel this visit right now.');
                return;
              }
            }
            dismiss();
            reset('visits');
          }} style={{'flex': '1', 'height': '52px', 'borderRadius': '15px', 'border': 'none', 'background': '#c0392b', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '14.5px', 'fontWeight': '700', 'cursor': 'pointer'}}>Cancel Visit</button>
        </div>
      </div>
    </div>
    )}

  </div>

  

    </>
  );
}
