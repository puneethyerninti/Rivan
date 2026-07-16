import React, { useState, useEffect } from 'react';
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

const G = [
  'linear-gradient(150deg,#2f6b3a 0%,#6ba15a 55%,#c7dc9c 100%)',
  'linear-gradient(150deg,#356b52 0%,#5a9a7a 55%,#b6d7bf 100%)',
  'linear-gradient(150deg,#4a6b2f 0%,#84a95a 55%,#d3dfa0 100%)',
];
const DEFAULT_PROPERTY_IMAGE = '/Property Image 1.jpeg';

function initialsFromName(name) {
  return String(name || 'CU')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'CU';
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function formatShortAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '₹0';
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function hasRatePrice(value) {
  return String(value || '').trim().startsWith('₹');
}

function formatDateOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatRelativeTime(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  return rtf.format(Math.round(diffHours / 24), 'day');
}

function propertyGradient(index) {
  return G[index % G.length];
}

function propertyTag(property) {
  const raw = String(property?.location || property?.address || '').split(',')[0].trim();
  return raw || 'Project';
}

function propertyType(property, land) {
  const haystack = `${property?.property_type || ''} ${property?.category || ''} ${land?.plot_number || ''}`.toLowerCase();
  if (haystack.includes('villa')) return 'Villas';
  if (haystack.includes('apartment') || haystack.includes('flat')) return 'Apartments';
  return 'Plots';
}

function amenityList(property) {
  if (Array.isArray(property?.amenities) && property.amenities.length) {
    return property.amenities.slice(0, 6);
  }
  return ['Gated Security', 'Clubhouse', 'Landscaped Parks', 'Wide Roads', 'Water Supply', 'Power Backup'];
}

function propertyPrimaryImage(property) {
  if (!property) return '';
  if (Array.isArray(property.images) && property.images.length) return property.images[0];
  return property.image || '';
}

function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http') || raw.startsWith('/') || raw.startsWith('data:')) return raw;
  return `/${raw.replace(/^\.?\//, '')}`;
}

function PropertyImage({ src, alt, eager = false, fallback = G[0], style = {}, children, ...props }) {
  const imageUrl = normalizeImageUrl(src);
  const fallbackLayer = {
    backgroundImage: `linear-gradient(180deg, rgba(9,32,16,.12), rgba(9,32,16,.34)), url("${DEFAULT_PROPERTY_IMAGE}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
  return (
    <div {...props} style={{ position: 'relative', overflow: 'hidden', background: fallback, ...fallbackLayer, ...style }}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={alt || 'Property'}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'auto'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {children}
    </div>
  );
}

function loadGuestSession() {
  try {
    const raw = localStorage.getItem('rivan_guest_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function defaultVisitDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default function AppDashboard() {
  const navigate = useNavigate();

  const [session, setSession] = useState(() => loadSession());
  const [guestSession, setGuestSession] = useState(() => loadGuestSession());
  const [stack, setStack] = useState(['home']);
  const [chip, setChip] = useState('All');
  const [myTab, setMyTab] = useState('Active');
  const [sel, setSel] = useState(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [liked, setLiked] = useState({});
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('Request Submitted');
  const [modalMessage, setModalMessage] = useState('Your latest request has been recorded successfully.');
  const [amount, setAmount] = useState(2000000);
  const [rate, setRate] = useState(9);
  const [years, setYears] = useState(10);
  const [toggles, setToggles] = useState({ push: true, biometric: true, promo: false, dark: false });
  const [liveStatus, setLiveStatus] = useState('connecting');
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [featuredRows, setFeaturedRows] = useState([]);
  const [propertyRows, setPropertyRows] = useState([]);
  const [landRows, setLandRows] = useState([]);
  const [notificationRows, setNotificationRows] = useState([]);
  const [documentRows, setDocumentRows] = useState([]);
  const [serviceRows, setServiceRows] = useState([]);
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    address: '',
    date_of_birth: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [homeSearch, setHomeSearch] = useState('');
  const [exploreSearch, setExploreSearch] = useState('');
  const [actionFormMode, setActionFormMode] = useState(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionPlots, setActionPlots] = useState([]);
  const [actionForm, setActionForm] = useState({
    visit_date: defaultVisitDate(),
    visit_time: '11:00 AM',
    name: session?.user?.name || '',
    mobile: session?.user?.phone || '',
    whatsapp: session?.user?.phone || '',
    plot_id: '',
    message: '',
  });

  const cur = stack[stack.length - 1];

  const go = (s) => {
    setStack((st) => [...st, s]);
    setTimeout(scrollTop, 10);
  };
  const tab = (s) => {
    setStack([s]);
    setTimeout(scrollTop, 10);
  };
  const back = () => {
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
    setTimeout(scrollTop, 10);
  };
  const scrollTop = () => {
    const el = document.querySelector('.rv-scroll');
    if (el) el.scrollTop = 0;
  };
  const openProject = (p) => {
    setSel(p);
    setStack((st) => [...st, 'propDetail']);
    setTimeout(scrollTop, 10);
  };
  const openFirstProject = () => {
    openProject(featured[0] || { name: 'Sirpuram Gardens', loc: 'Achutapuram, Visakhapatnam', tag: 'Achutapuram', price: '₹0', grad: 'linear-gradient(150deg,#2f6b3a 0%,#6ba15a 55%,#c7dc9c 100%)' });
  };

  useEffect(() => {
    const h = (window.location.hash || '').replace('#', '');
    if (['home', 'explore', 'props', 'payments', 'profile'].includes(h)) {
      setStack([h]);
    }
  }, []);

  useEffect(() => {
    const isGuest = !!guestSession?.guest;
    if (!isGuest && (!session?.access_token || session?.user?.role !== 'customer')) {
      navigate('/login', { replace: true });
    }
  }, [guestSession, navigate, session]);

  useEffect(() => {
    const isGuest = !!guestSession?.guest;
    if (!isGuest && (!session?.access_token || session?.user?.role !== 'customer')) return;
    let active = true;

    const loadData = async () => {
      try {
        setPageLoading(true);
        setPageError('');
        const token = session?.access_token;
        const requests = isGuest
          ? [
              Promise.resolve({ name: 'Guest', email: '', address: '' }),
              getJson('/api/properties/featured').catch(() => []),
              getJson('/api/properties').catch(() => []),
              Promise.resolve([]),
              Promise.resolve([]),
              Promise.resolve([]),
              Promise.resolve([]),
            ]
          : [
              getJson('/api/auth/me', token),
              getJson('/api/properties/featured', token).catch(() => []),
              getJson('/api/properties', token).catch(() => []),
              getJson('/api/myland', token).catch(() => []),
              getJson('/api/notifications', token).catch(() => []),
              getJson('/api/documents', token).catch(() => []),
              getJson('/api/services/mine', token).catch(() => []),
            ];
        const [me, featuredApi, propertiesApi, myLandApi, notificationsApi, documentsApi, servicesApi] = await Promise.all(requests);
        if (!active) return;

        if (!isGuest) {
          const nextSession = {
            ...session,
            user: {
              ...session.user,
              ...me,
            },
          };
          setSession(nextSession);
          saveSession(nextSession);
        }
        setProfileForm({
          name: me?.name || '',
          email: me?.email || '',
          address: me?.address || me?.city || '',
          date_of_birth: me?.date_of_birth || '',
        });
        setToggles({
          push: me?.notification_preferences?.push_notifications ?? true,
          biometric: me?.biometric_login_enabled ?? false,
          promo: me?.communication_preferences?.promotional_emails ?? false,
          dark: me?.dark_mode_enabled ?? false,
        });
        setFeaturedRows(Array.isArray(featuredApi) ? featuredApi : []);
        setPropertyRows(Array.isArray(propertiesApi) ? propertiesApi : []);
        setLandRows(Array.isArray(myLandApi) ? myLandApi : []);
        setNotificationRows(Array.isArray(notificationsApi) ? notificationsApi : []);
        setDocumentRows(Array.isArray(documentsApi) ? documentsApi : []);
        setServiceRows(Array.isArray(servicesApi) ? servicesApi : []);
      } catch (error) {
        if (!active) return;
        setPageError(error?.message || 'Unable to load customer dashboard.');
      } finally {
        if (active) setPageLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [guestSession, session?.access_token, session?.user?.role]);

  useEffect(() => {
    if (!session?.access_token || guestSession?.guest) return undefined;
    let socket = null;
    let closed = false;
    let poller = null;

    const syncDashboard = async () => {
      const [notificationsApi, myLandApi] = await Promise.all([
        getJson('/api/notifications', session.access_token).catch(() => []),
        getJson('/api/myland', session.access_token).catch(() => []),
      ]);
      if (closed) return;
      setNotificationRows(Array.isArray(notificationsApi) ? notificationsApi : []);
      setLandRows(Array.isArray(myLandApi) ? myLandApi : []);
    };

    const beginPolling = () => {
      if (closed) return;
      setLiveStatus('offline');
      if (!poller) {
        poller = window.setInterval(() => {
          syncDashboard();
        }, 15000);
      }
    };

    supportsLiveUpdates().then((enabled) => {
      if (closed) return;
      if (!enabled) {
        beginPolling();
        return;
      }

      socket = new WebSocket(getWebSocketUrl(session.access_token));
      socket.addEventListener('open', () => setLiveStatus('live'));
      socket.addEventListener('close', () => beginPolling());
      socket.addEventListener('error', () => beginPolling());
      socket.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (['notification.created', 'notification.read', 'visit.updated', 'booking.updated', 'service_request.updated'].includes(data?.event)) {
            await syncDashboard();
          }
        } catch {
          beginPolling();
        }
      });
    });

    return () => {
      closed = true;
      if (poller) window.clearInterval(poller);
      socket?.close();
    };
  }, [guestSession, session?.access_token]);

  useEffect(() => {
    const imagesToWarm = [...featuredRows, ...propertyRows]
      .map((property) => normalizeImageUrl(propertyPrimaryImage(property)))
      .filter(Boolean)
      .slice(0, 4);
    imagesToWarm.forEach((src, index) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      if (index === 0) link.fetchPriority = 'high';
      document.head.appendChild(link);
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      window.setTimeout(() => {
        try {
          document.head.removeChild(link);
        } catch {}
      }, 15000);
    });
  }, [featuredRows, propertyRows]);

  const fmtL = (n) => {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
    return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  };
  const fmtEMI = (n) => {
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };

  const normalizeSearch = (value) => String(value || '').toLowerCase().trim();
  const matchesSearch = (value, query) => String(value || '').toLowerCase().includes(query);
  const propertyMatches = (item, query) => {
    if (!query) return true;
    return [
      item?.name,
      item?.loc,
      item?.tag,
      item?.price,
      item?.type,
      item?.property?.name,
      item?.property?.location,
      item?.property?.address,
      item?.property?.property_type,
      item?.property?.category,
      item?.property?.plot_number,
      item?.plot,
      item?.spec,
    ].some((value) => matchesSearch(value, query));
  };

  const featured = [
    { name: 'Emerald Estate', loc: 'Visakhapatnam', tag: 'Vizag', price: '₹4,500', grad: G[0] },
    { name: 'Emerald Green City', loc: 'Anakapalle', tag: 'Anakapalle', price: '₹3,200', grad: G[1] },
  ].map((f) => ({ ...f, open: () => openProject(f) }));

  const nearbyAll = [
    { name: 'Emerald Estate', loc: 'Visakhapatnam', price: '₹4,500', type: 'Villas', grad: G[0] },
    { name: 'Emerald Green City', loc: 'Anakapalle', price: '₹3,200', type: 'Plots', grad: G[1] },
    { name: 'Emerald Springs', loc: 'Yendada', price: '₹5,200', type: 'Apartments', grad: G[2] },
  ];
  const homeQuery = normalizeSearch(homeSearch);
  const exploreQuery = normalizeSearch(exploreSearch);

  featured.splice(0, featured.length, {
    name: 'Sirpuram Gardens',
    loc: 'Achutapuram, Visakhapatnam',
    tag: 'Achutapuram',
    price: 'Price on request',
    grad: G[0],
    open: () => openProject({
      name: 'Sirpuram Gardens',
      loc: 'Achutapuram, Visakhapatnam',
      tag: 'Achutapuram',
      price: 'Price on request',
      grad: G[0],
    }),
  });
  nearbyAll.splice(0, nearbyAll.length, {
    name: 'Sirpuram Gardens',
    loc: 'Achutapuram, Visakhapatnam',
    price: 'Price on request',
    type: 'Plots',
    grad: G[0],
  });

  if (featured[0]?.name === 'Sirpuram Gardens') {
    featured[0].price = 'Price on request';
    featured[0].open = () => openProject({ ...featured[0], price: 'Price on request' });
  }
  if (nearbyAll[0]?.name === 'Sirpuram Gardens') {
    nearbyAll[0].price = 'Price on request';
  }

  const getChip = (l) => ({
    label: l,
    pick: () => setChip(l),
    style:
      chip === l
        ? { flex: 'none', padding: '9px 18px', borderRadius: '12px', border: 'none', background: '#2b6d3d', color: '#fff', fontFamily: 'inherit', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }
        : { flex: 'none', padding: '9px 18px', borderRadius: '12px', border: '1px solid #e2e8e0', background: '#fff', color: '#3d4f40', fontFamily: 'inherit', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  });
  const chips = ['All', 'Plots', 'Villas', 'Apartments'].map(getChip);

  const filterIcons = [
    { label: 'Filter', icon: 'M4 6h16M7 12h10M10 18h4', go: () => openNotice('Filter by search', 'Use the search box to filter live properties by project, location, or plot.') },
    { label: 'Location', icon: 'M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5', go: () => setExploreSearch('Achutapuram') },
    { label: 'Budget', icon: 'M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h7', go: () => openNotice('Budget filter', 'Budget filtering will be available after more live properties are added.') },
    { label: 'Size', icon: 'M4 20L20 4M4 9V4h5M20 15v5h-5', go: () => openNotice('Plot size filter', 'Plot size filtering will be available after more live plots are added.') },
    { label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01', go: () => openNotice('More filters', 'More filters will appear here as new property options go live.') },
  ];

  const getMyTab = (l) => ({
    label: l,
    pick: () => setMyTab(l),
    style:
      myTab === l
        ? { flex: 1, height: '40px', borderRadius: '11px', border: 'none', background: '#2b6d3d', color: '#fff', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer' }
        : { flex: 1, height: '40px', borderRadius: '11px', border: 'none', background: 'transparent', color: '#7c8c7e', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' },
  });
  const myTabs = ['All', 'Active', 'Completed'].map(getMyTab);

  const propsAll = [
    { name: 'Emerald Estate', plot: 'Plot No. A-120', spec: '200 Sq.Yd  |  East Facing', date: '12 Jan 2025', pct: 60, status: 'Active', grad: G[0] },
    { name: 'Emerald Green City', plot: 'Plot No. B-45', spec: '150 Sq.Yd  |  West Facing', date: '02 Mar 2025', pct: 40, status: 'Active', grad: G[1] },
  ];
  propsAll.splice(0, propsAll.length);
  const shownProps = myTab === 'Completed' ? propsAll.filter((p) => p.status === 'Completed') : myTab === 'Active' ? propsAll.filter((p) => p.status === 'Active') : propsAll;
  const myProps = shownProps.map((m) => ({
    ...m,
    width: m.pct + '%',
    pct: m.pct + '%',
    open: () => openProject({ name: m.name, loc: 'Visakhapatnam', price: '₹4,500', grad: m.grad }),
  }));

  if (featuredRows.length || propertyRows.length) {
    const liveFeatured = (featuredRows.length ? featuredRows : propertyRows.slice(0, 2)).map((property, index) => ({
      id: property.id || `featured-${index}`,
      name: property.name || 'Sirpuram Gardens',
      loc: property.location || property.address || 'Achutapuram, Visakhapatnam',
      tag: propertyTag(property),
      price: formatCurrency(property.starting_price || property.base_price || property.market_value || 0),
      grad: propertyGradient(index),
      property,
      open: () => openProject({
        id: property.id || `featured-${index}`,
        name: property.name || 'Sirpuram Gardens',
        loc: property.location || property.address || 'Achutapuram, Visakhapatnam',
        tag: propertyTag(property),
        price: formatCurrency(property.starting_price || property.base_price || property.market_value || 0),
        grad: propertyGradient(index),
        property,
      }),
    }));
    featured.splice(0, featured.length, ...liveFeatured);
  }

  if (propertyRows.length) {
    nearbyAll.splice(0, nearbyAll.length, ...propertyRows.map((property, index) => ({
      id: property.id || `property-${index}`,
      name: property.name || 'Sirpuram Gardens',
      loc: property.location || property.address || 'Achutapuram, Visakhapatnam',
      price: formatCurrency(property.starting_price || property.base_price || property.market_value || 0),
      type: propertyType(property),
      grad: propertyGradient(index),
      property,
    })));
  }

  if (landRows.length) {
    propsAll.splice(0, propsAll.length, ...landRows.map((land, index) => ({
      id: land.id || `land-${index}`,
      name: land.property?.name || land.property_name || 'Sirpuram Gardens',
      plot: `Plot No. ${land.plot_number || land.unit_number || 'Allocated'}`,
      spec: `${land.area || land.plot_area || '—'}  |  ${land.facing || '—'} Facing`,
      date: formatDateOnly(land.created_at),
      pct: Math.round((Number(land.payment_progress || 0)) * 100),
      status: land.purchase_complete ? 'Completed' : 'Active',
      grad: propertyGradient(index),
      loc: land.property?.location || land.location || 'Achutapuram, Visakhapatnam',
      price: formatCurrency(land.property?.starting_price || land.market_value || land.total_amount || 0),
    })));
  }

  const filteredFeatured = featured.filter((item) => propertyMatches(item, homeQuery));
  const nearby = nearbyAll
    .filter((n) => chip === 'All' || n.type === chip)
    .filter((n) => propertyMatches(n, exploreQuery || homeQuery))
    .map((n) => {
      const isLiked = !!liked[n.name];
      return {
        ...n,
        open: () => openProject(n),
        like: (e) => {
          e.stopPropagation();
          setLiked((st) => ({ ...st, [n.name]: !st[n.name] }));
        },
        heartFill: isLiked ? '#e2822a' : 'none',
        heartStroke: isLiked ? '#e2822a' : '#c2cdc0',
      };
    });

  const iconBg = '#eef6ea';
  const pm = (icon, label, goName, extra = {}) => ({
    icon,
    label,
    iconBg: extra.iconBg || iconBg,
    iconColor: extra.iconColor || '#2b6d3d',
    textColor: extra.textColor || '#16231a',
    badge: !!extra.badge,
    badgeText: extra.badge || '',
    go: goName ? () => go(goName) : () => {},
  });
  const profileMenuRaw = [
    pm('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6s7 2.5 7 6', 'Personal Details', 'personal'),
    pm('M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0', 'Notifications', 'notif'),
    pm('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.5 9a2.5 2.5 0 0 1 4 2c0 1.5-2 2-2 3.5M12 17h.01', 'Help Center', null),
    pm('M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z', 'Service Requests', null),
    pm('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 3v2M12 19v2M4 12H2M22 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4', 'Settings', 'settings'),
    pm('M15 4h4v16h-4M10 8l-4 4 4 4M6 12h9', 'Logout', null, { iconBg: '#fdecec', iconColor: '#c0392b', textColor: '#c0392b' }),
  ];
  const profileMenu = profileMenuRaw.map((i, idx) => ({ ...i, border: idx === 0 ? 'none' : '1px solid #f0f4ee' }));
  if (profileMenu.length) {
    profileMenu[profileMenu.length - 1].go = async () => {
      await logoutSession();
      localStorage.removeItem('rivan_guest_session');
      navigate('/login', { replace: true });
    };
  }

  const payLinks = [
    { icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4', label: 'Payment History', go: () => payNow() },
    { icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', label: 'Upcoming Payments', go: () => payNow() },
    { icon: 'M12 3v12M8 11l4 4 4-4M5 21h14', label: 'Download Receipts', go: () => payNow() },
    { icon: 'M6 3h12v18H6zM9 7h6M8 11h.01M12 11h.01M16 11v6M8 15h.01M12 15h.01', label: 'EMI Calculator', go: () => go('emi') },
  ].map((p, idx) => ({ ...p, border: idx === 0 ? 'none' : '1px solid #f0f4ee' }));

  const selData = sel || { name: 'Sirpuram Gardens', loc: 'Achutapuram, Visakhapatnam', price: formatCurrency(0), grad: G[0] };
  const specGrid = [
    { k: 'Plot Size', v: '200 Sq.Yd' },
    { k: 'Facing', v: 'East' },
    { k: 'Type', v: 'Villa Plot' },
    { k: 'Status', v: 'Available' },
  ];
  const skeletons = [1, 2, 3];
  const exploreReady = !exploreLoading;
  const myEmpty = shownProps.length === 0;
  const myHasList = shownProps.length > 0;
  const amountLabel = fmtL(amount);
  const amenities = ['Gated Security', 'Clubhouse', 'Landscaped Parks', 'Wide Roads', 'Water Supply', 'Power Backup'];
  const selectedProperty = selData.property
    || propertyRows.find((item) => item.id === selData.id)
    || featuredRows.find((item) => item.id === selData.id)
    || propertyRows[0]
    || featuredRows[0]
    || null;
  const selectedImage = propertyPrimaryImage(selectedProperty);
  const selectedGallery = Array.isArray(selectedProperty?.images) && selectedProperty.images.length
    ? selectedProperty.images
    : selectedImage
    ? [selectedImage]
    : [];
  if (selectedProperty) {
    selData.name = selectedProperty.name || selData.name;
    selData.loc = selectedProperty.location || selectedProperty.address || selData.loc;
    selData.price = formatCurrency(selectedProperty.starting_price || selectedProperty.base_price || selectedProperty.market_value || 0);
    selData.property = selectedProperty;
  }
  specGrid.splice(0, specGrid.length,
    { k: 'Plot Size', v: selectedProperty?.plot_size || selectedProperty?.area_range || selectedProperty?.plot_area || 'Available in live records' },
    { k: 'Facing', v: selectedProperty?.facing || 'Multiple options' },
    { k: 'Type', v: selectedProperty?.property_type || selectedProperty?.category || 'Plot / Land' },
    { k: 'Status', v: selectedProperty?.availability_label || 'Live inventory' },
  );
  amenities.splice(0, amenities.length, ...amenityList(selectedProperty));

  const history = [
    { title: 'Installment #6', date: '12 May 2025', mode: 'UPI', amt: '₹1,00,000' },
    { title: 'Installment #5', date: '12 Apr 2025', mode: 'Net Banking', amt: '₹1,00,000' },
    { title: 'Installment #4', date: '12 Mar 2025', mode: 'UPI', amt: '₹1,00,000' },
    { title: 'Booking Amount', date: '12 Jan 2025', mode: 'Cheque', amt: '₹2,00,000' },
    { title: 'Token Advance', date: '02 Jan 2025', mode: 'UPI', amt: '₹50,000' },
  ];

  history.splice(0, history.length);

  const P = amount,
    r = rate / 1200,
    n = years * 12;
  const emiVal = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const total = emiVal * n,
    interest = total - P;
  const emi = fmtEMI(emiVal);
  const emiTotal = fmtL(total);
  const emiInterest = fmtL(interest);

  const notifs = [
    { title: 'Payment Due Reminder', body: 'Your next installment of ₹1,00,000 is due on 12 Jun 2025.', time: '2 hours ago', unread: true, icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', iconColor: '#e2822a', iconBg: '#fdefe0' },
    { title: 'New Project Launched', body: 'Emerald Springs at Yendada is now open for bookings.', time: 'Yesterday', unread: true, icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5', iconColor: '#2b6d3d', iconBg: '#eef6ea' },
    { title: 'Payment Received', body: 'We received your installment #6 of ₹1,00,000. Thank you!', time: '2 days ago', unread: false, icon: 'M5 12l4 4 10-10', iconColor: '#2b6d3d', iconBg: '#eef6ea' },
  ].map((n) => ({ ...n, bg: n.unread ? '#f4faf1' : '#fff' }));

  notifs.splice(0, notifs.length);

  const tg = (key, label, icon, idx) => {
    const on = toggles[key];
    return {
      label,
      icon,
      border: idx === 0 ? 'none' : '1px solid #f0f4ee',
      track: on ? '#2b6d3d' : '#d4ddd0',
      knob: on ? '23px' : '3px',
      toggle: () => updatePreferenceToggle(key),
    };
  };
  const togglesArr = [
    tg('push', 'Push Notifications', 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0', 0),
    tg('biometric', 'Biometric Login', 'M12 11a4 4 0 0 0-4 4M7 8a7 7 0 0 1 10 0M12 11v6', 1),
    tg('promo', 'Promotional Emails', 'M4 6h16v12H4zM4 7l8 6 8-6', 2),
    tg('dark', 'Dark Mode', 'M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z', 3),
  ];
  const settingLinks = [
    { icon: 'M3 5h18M8 12h13M8 19h13M4 12h.01M4 19h.01', label: 'Language', value: 'English' },
    { icon: 'M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h7', label: 'Currency', value: 'INR ₹' },
    { icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.5 9a2.5 2.5 0 0 1 4 2c0 1.5-2 2-2 3.5M12 17h.01', label: 'Privacy Policy', value: '' },
    { icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8v5M12 16h.01', label: 'About Rivan', value: 'v1.0.0' },
  ].map((x, idx) => ({ ...x, border: idx === 0 ? 'none' : '1px solid #f0f4ee' }));

  settingLinks.forEach((item) => {
    item.go = () => openNotice(item.label, `${item.label} is connected to your live account settings and will continue expanding with future releases.`);
  });

  const personalFields = [
    { label: 'Full Name', value: 'Sravani K' },
    { label: 'Phone Number', value: '+91 98765 43210' },
    { label: 'Email Address', value: 'sravani@gmail.com' },
    { label: 'City', value: 'Visakhapatnam' },
    { label: 'Date of Birth', value: '14 Aug 1996' },
  ];
  if (landRows.length) {
    history.splice(0, history.length, ...landRows.map((land, index) => ({
      title: land.purchase_complete ? 'Registration Complete' : 'Purchase Progress',
      date: formatDateOnly(land.created_at),
      mode: land.purchase_complete ? 'Completed' : 'In Progress',
      amt: formatCurrency(land.paid_amount || 0),
      id: land.id || `history-${index}`,
    })));
  }

  if (notificationRows.length) {
    notifs.splice(0, notifs.length, ...notificationRows.map((item) => {
      const type = String(item.type || '').toLowerCase();
      const iconMap = {
        booking: ['M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', '#e2822a', '#fdefe0'],
        service: ['M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z', '#2b6d3d', '#eef6ea'],
        visit: ['M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 14l2 2 4-4', '#2b6d3d', '#eef6ea'],
      };
      const [icon, iconColor, iconBg] = iconMap[type] || ['M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6z', '#2b6d3d', '#eef6ea'];
      return {
        ...item,
        time: formatRelativeTime(item.updated_at || item.created_at),
        unread: !item.read,
        icon,
        iconColor,
        iconBg,
        bg: !item.read ? '#f4faf1' : '#fff',
      };
    }));
  }

  const unreadCustomerNotifications = notifs.filter((item) => item.unread).length;

  personalFields.splice(0, personalFields.length, ...[
    { label: 'Full Name', value: profileForm.name || session?.user?.name || '' },
    { label: 'Phone Number', value: session?.user?.phone ? `+${String(session.user.phone).replace(/^\+/, '')}` : '' },
    { label: 'Email Address', value: profileForm.email || '' },
    { label: 'City', value: profileForm.address || '' },
    { label: 'Date of Birth', value: profileForm.date_of_birth || '' },
  ]);

  const tabOf = {
    home: 'home',
    explore: 'explore',
    props: 'props',
    payments: 'payments',
    profile: 'profile',
    propDetail: 'explore',
    payhistory: 'payments',
    emi: 'payments',
    notif: 'profile',
    settings: 'profile',
    personal: 'profile',
  };
  const active = tabOf[cur];
  const navColor = (t) => (active === t ? '#ffffff' : 'rgba(255,255,255,.5)');

  const mainTabs = ['home', 'explore', 'props', 'payments', 'profile'];

  const navClass = (t) => (active === t ? 'active' : '');
  const navClassHome = navClass('home');
  const navClassExplore = navClass('explore');
  const navClassProps = navClass('props');
  const navClassPayments = navClass('payments');
  const navClassProfile = navClass('profile');

  const showNav = mainTabs.includes(cur);
  const greenHeader = ['home', 'explore', 'props', 'payments', 'profile', 'payhistory', 'emi', 'notif', 'settings', 'personal'].includes(cur);

  const SW = [
    ['home', 'Home'],
    ['explore', 'Explore'],
    ['props', 'My Properties'],
    ['payments', 'Payments'],
    ['profile', 'Profile'],
    ['propDetail', 'Property'],
    ['payhistory', 'Pay History'],
    ['emi', 'EMI'],
    ['notif', 'Notifications'],
    ['settings', 'Settings'],
    ['personal', 'Personal'],
  ];
  const switcher = SW.map(([id, label]) => ({
    label,
    go: () => (id === 'propDetail' ? openProject(selData) : mainTabs.includes(id) ? tab(id) : go(id)),
    style:
      cur === id
        ? { padding: '6px 11px', borderRadius: '9px', border: 'none', background: '#1f5a31', color: '#fff', fontFamily: 'inherit', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }
        : { padding: '6px 11px', borderRadius: '9px', border: 'none', background: 'rgba(18,53,29,.06)', color: '#3d4f40', fontFamily: 'inherit', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  }));

  const quickActions = [
    { icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5', label: 'Explore', go: () => tab('explore') },
    { icon: 'M4 20L20 4M4 9V4h5M20 15v5h-5', label: 'Interactive Layout', go: () => openFirstProject() },
    { icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', label: 'Schedule Visit', go: () => scheduleSelectedPropertyVisit() },
    { icon: 'M6 3h12v18H6zM9 7h6M8 11h.01M12 11h.01M16 11v6M8 15h.01M12 15h.01', label: 'EMI Calculator', go: () => go('emi') },
    { icon: 'M6 4h12v16l-6-3-6 3z', label: 'Contact Sales', go: () => go('contact') },
  ];

  const userName = String(session?.user?.name || profileForm.name || 'Customer').trim();
  const initials = initialsFromName(userName);
  const statusColor = greenHeader && cur !== 'propDetail' ? '#ffffff' : cur === 'propDetail' ? '#ffffff' : '#1f5a31';
  const scrollPad = showNav ? '86px' : '0px';

  const isHome = cur === 'home';
  const isExplore = cur === 'explore';
  const isProps = cur === 'props';
  const isPayments = cur === 'payments';
  const isProfile = cur === 'profile';
  const isPropDetail = cur === 'propDetail';
  const isPayHistory = cur === 'payhistory';
  const isEMI = cur === 'emi';
  const isNotif = cur === 'notif';
  const isSettings = cur === 'settings';
  const isContact = cur === 'contact';
  const isPersonal = cur === 'personal';
  const goHome = () => tab('home');
  const goExplore = () => tab('explore');
  const goProps = () => navigate('/my-lands');
  const goPayments = () => go('payments');
  const goProfile = () => tab('profile');
  const goNotif = () => go('notif');
  const goVisitsPage = () => navigate('/visits');
  const goContact = () => go('contact');

  const refreshExplore = () => {
    setExploreLoading(true);
    setTimeout(() => setExploreLoading(false), 1300);
  };
  const payNow = () => openNotice('Payments Unavailable', 'Payments are intentionally excluded from this release. Use live booking requests, visits, documents, notifications, and service workflows for production testing.');
  const propertyIdForAction = () => selectedProperty?.id || selData?.property?.id || featuredRows[0]?.id || propertyRows[0]?.id;
  const loadActionPlots = async (propertyId) => {
    if (!session?.access_token || !propertyId) return [];
    const plots = await getJson(`/api/properties/${propertyId}/plots`, session.access_token).catch(() => []);
    const availablePlots = Array.isArray(plots)
      ? plots.filter((item) => ['available', 'reserved'].includes(String(item.status || '').toLowerCase()))
      : [];
    setActionPlots(availablePlots);
    return availablePlots;
  };
  const openPropertyActionForm = async (mode) => {
    if (!session?.access_token) return;
    const propertyId = propertyIdForAction();
    if (!propertyId) {
      openNotice('Property Unavailable', 'No live property is available for this request right now.');
      return;
    }
    const plots = mode === 'booking' ? await loadActionPlots(propertyId) : [];
    if (mode === 'booking' && !plots.length) {
      openNotice('Booking Unavailable', 'No available live plots are attached to this property right now.');
      return;
    }
    setActionForm({
      visit_date: defaultVisitDate(),
      visit_time: '11:00 AM',
      name: session.user?.name || userName || '',
      mobile: session.user?.phone || '',
      whatsapp: session.user?.phone || '',
      plot_id: plots[0]?.id || '',
      message: mode === 'booking'
        ? `I want to book ${selectedProperty?.name || selData?.name || 'this property'}.`
        : `I want to visit ${selectedProperty?.name || selData?.name || 'this property'}.`,
    });
    setActionFormMode(mode);
  };
  const requestBooking = () => openPropertyActionForm('booking');
  const updatePreferenceToggle = async (key) => {
    if (!session?.access_token) return;
    const previousToggles = toggles;
    const nextToggles = { ...toggles, [key]: !toggles[key] };
    setToggles(nextToggles);
    try {
      const updated = await putJson('/api/auth/profile', {
        notification_preferences: {
          push_notifications: nextToggles.push,
          booking_updates: nextToggles.push,
          service_updates: nextToggles.push,
        },
        communication_preferences: {
          promotional_emails: nextToggles.promo,
          whatsapp_updates: true,
        },
        biometric_login_enabled: nextToggles.biometric,
        dark_mode_enabled: nextToggles.dark,
      }, session.access_token);
      const nextSession = { ...session, user: { ...session.user, ...updated } };
      setSession(nextSession);
      saveSession(nextSession);
    } catch (error) {
      setToggles(previousToggles);
      openNotice('Settings Update Failed', error?.message || 'We could not save your preferences right now.');
    }
  };
  const saveProfile = async () => {
    if (!session?.access_token) return;
    try {
      setSavingProfile(true);
      const updated = await putJson('/api/auth/profile', {
        name: profileForm.name,
        email: profileForm.email || null,
        address: profileForm.address || null,
        date_of_birth: profileForm.date_of_birth || null,
      }, session.access_token);
      const nextSession = { ...session, user: { ...session.user, ...updated } };
      setSession(nextSession);
      saveSession(nextSession);
    } finally {
      setSavingProfile(false);
    }
  };
  const submitPropertyActionForm = async () => {
    if (!session?.access_token) return;
    const propertyId = propertyIdForAction();
    if (!propertyId) {
      openNotice('Property Unavailable', 'No live property is available for this request right now.');
      return;
    }
    if (!actionForm.name.trim() || !actionForm.mobile.trim()) {
      openNotice('Details Required', 'Add your name and mobile number before submitting.');
      return;
    }
    if (actionFormMode === 'booking' && !actionForm.plot_id) {
      openNotice('Select Plot', 'Choose an available plot before submitting the booking request.');
      return;
    }
    setActionSubmitting(true);
    try {
      if (actionFormMode === 'booking') {
        await postJson('/api/bookings', {
          plot_id: actionForm.plot_id,
          name: actionForm.name.trim(),
          mobile: actionForm.mobile.trim(),
          whatsapp: actionForm.whatsapp || actionForm.mobile,
          message: actionForm.message || `Booking request for ${selectedProperty?.name || selData?.name || 'this property'}`,
        }, session.access_token);
      } else {
        await postJson('/api/visits/site', {
          property_id: propertyId,
          visit_date: actionForm.visit_date,
          visit_time: actionForm.visit_time,
          name: actionForm.name.trim(),
          mobile: actionForm.mobile.trim(),
        }, session.access_token);
      }
      const [nextLands, nextNotifications] = await Promise.all([
        getJson('/api/myland', session.access_token).catch(() => []),
        getJson('/api/notifications', session.access_token).catch(() => []),
      ]);
      setLandRows(Array.isArray(nextLands) ? nextLands : []);
      setNotificationRows(Array.isArray(nextNotifications) ? nextNotifications : []);
      setActionFormMode(null);
      openNotice(
        actionFormMode === 'booking' ? 'Booking Submitted' : 'Visit Scheduled',
        actionFormMode === 'booking'
          ? 'Your booking request has been submitted with the selected details.'
          : 'Your visit request has been submitted with the selected date and time.',
      );
    } catch (error) {
      openNotice('Request Failed', error?.message || 'We could not submit this request right now.');
    } finally {
      setActionSubmitting(false);
    }
  };
  const scheduleSelectedPropertyVisit = () => openPropertyActionForm('visit');
  const openNotice = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowPaidModal(true);
  };
  const submitContactSales = async (requestChannel = 'contact_sales', overrideMessage = '') => {
    if (!session?.access_token) return;
    const message = String(overrideMessage || contactMessage || '').trim();
    if (!message) {
      openNotice('Add a Message', 'Enter a short note so the sales team knows what you need.');
      return;
    }
    try {
      await postJson('/api/contact-sales', {
        property_id: selectedProperty?.id || null,
        subject: requestChannel === 'callback' ? 'Request Callback' : requestChannel === 'booking_interest' ? 'Booking Interest' : 'Sales Inquiry',
        message,
        contact: session.user?.phone || '',
        preferred_date: new Date().toISOString().slice(0, 10),
        request_channel: requestChannel,
      }, session.access_token);
      const [nextNotifications, nextServices] = await Promise.all([
        getJson('/api/notifications', session.access_token).catch(() => []),
        getJson('/api/services/mine', session.access_token).catch(() => []),
      ]);
      setNotificationRows(Array.isArray(nextNotifications) ? nextNotifications : []);
      setServiceRows(Array.isArray(nextServices) ? nextServices : []);
      setContactMessage('');
      openNotice('Request Submitted', 'Your sales request was submitted successfully.');
    } catch (error) {
      openNotice('Request Failed', error?.message || 'We could not submit the request right now.');
    }
  };
  const closeModal = () => setShowPaidModal(false);
  const contactActions = [
    {
      label: 'Request Callback',
      sub: session?.user?.phone ? `Use ${String(session.user.phone).replace(/^\+/, '+')}` : 'Create a live callback request',
      color: '#2b6d3d',
      bg: '#eef6ea',
      icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.07 3.18 2 2 0 0 1 3.05 1h3a2 2 0 0 1 2 1.72c.13 1.01.36 2 .71 2.96a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.96.35 1.95.58 2.96.71A2 2 0 0 1 21 16z',
      action: () => submitContactSales('callback', `Please call me back regarding ${selectedProperty?.name || 'the property'} .`),
    },
    {
      label: 'Sales Inquiry',
      sub: 'Send a sales inquiry',
      color: '#e2822a',
      bg: '#fdefe0',
      icon: 'M4 6h16v12H4zM4 7l8 6 8-6',
      action: () => submitContactSales('email', contactMessage || `I need more details about ${selectedProperty?.name || 'this property'}.`),
    },
    {
      label: 'WhatsApp Request',
      sub: 'Submit a live follow-up request',
      color: '#25D366',
      bg: '#edfbf1',
      icon: 'M4 5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
      action: () => submitContactSales('whatsapp', contactMessage || `Please continue the conversation on WhatsApp for ${selectedProperty?.name || 'this property'}.`),
    },
  ];

  return (


  <div className="rv-phone">

    <div className="rv-scroll with-nav" style={{'position': 'absolute', 'inset': '0', 'overflowY': 'auto'}}>

      {/* ===================== HOME ===================== */}
      {isHome && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '58px 22px 22px', 'borderRadius': '0 0 26px 26px'}}>
          <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between'}}>
            <div>
              <p style={{'margin': '0', 'fontSize': '19px', 'fontWeight': '800', 'color': '#fff'}}>Hello, {userName}</p>
              <p style={{'margin': '4px 0 0', 'fontSize': '13px', 'color': '#bcd6bd', 'fontWeight': '500'}}>Let's find your dream property</p>
            </div>
            <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '10px'}}>
              <button onClick={goNotif} aria-label="Notifications" style={{'position': 'relative', 'width': '42px', 'height': '42px', 'borderRadius': '14px', 'border': '1px solid rgba(255,255,255,.2)', 'background': 'rgba(255,255,255,.14)', 'display': 'grid', 'placeItems': 'center', 'cursor': 'pointer'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {unreadCustomerNotifications > 0 && (
                  <span style={{'position': 'absolute', 'top': '-6px', 'right': '-6px', 'minWidth': '20px', 'height': '20px', 'borderRadius': '999px', 'background': '#e2822a', 'color': '#fff', 'fontSize': '10px', 'fontWeight': '900', 'display': 'grid', 'placeItems': 'center', 'padding': '0 5px'}}>
                    {unreadCustomerNotifications}
                  </span>
                )}
              </button>
              <img src="/RivanRealtyLogo.png" alt="Rivan Realty" style={{'height': '34px', 'width': '54px', 'objectFit': 'contain', 'borderRadius': '9px', 'opacity': '.95'}} />
            </div>
          </div>
          <div style={{'marginTop': '18px', 'display': 'flex', 'alignItems': 'center', 'gap': '10px', 'height': '50px', 'background': '#fff', 'borderRadius': '15px', 'padding': '0 14px'}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#7c8c7e" stroke-width="1.8" stroke-linecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5"/></svg>
            <input value={homeSearch} onChange={(event) => setHomeSearch(event.target.value)} placeholder="Search by location, project or plot no." style={{'flex': '1', 'border': 'none', 'background': 'transparent', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'fontWeight': '500', 'color': '#16231a'}}/>
            <div style={{'width': '34px', 'height': '34px', 'borderRadius': '10px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
            </div>
          </div>
        </div>

        <div style={{'padding': '20px 22px 0'}}>
          {/* hero banner */}
          <PropertyImage src={selectedImage} alt={selectedProperty?.name || 'Featured property'} eager onClick={openFirstProject} fallback="linear-gradient(150deg,#2f6b3a 0%,#6ba15a 52%,#c7dc9c 100%)" style={{'height': '172px', 'borderRadius': '22px', 'cursor': 'pointer', 'boxShadow': '0 16px 34px -18px rgba(18,53,29,.6)'}}>
            <div style={{'position': 'absolute', 'inset': '0', 'background': 'radial-gradient(80% 60% at 78% 22%,rgba(255,247,214,.35),transparent 60%),linear-gradient(180deg,rgba(9,32,16,.12),rgba(9,32,16,.62))'}}></div>
            <div style={{'position': 'absolute', 'inset': '0', 'padding': '20px', 'display': 'flex', 'flexDirection': 'column', 'justifyContent': 'space-between'}}>
              <div>
                <p style={{'margin': '0', 'fontSize': '19px', 'fontWeight': '800', 'color': '#fff'}}>{selectedProperty?.name || 'Sirpuram Gardens'}</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '12.5px', 'color': '#eaf3e4', 'fontWeight': '500'}}>{selectedProperty?.property_type || selectedProperty?.category || 'Live property details'}</p>
              </div>
              <span style={{'alignSelf': 'flex-start', 'background': '#fff', 'color': '#1f5a31', 'fontSize': '12.5px', 'fontWeight': '700', 'padding': '9px 16px', 'borderRadius': '11px'}}>Explore Now -&gt;</span>
            </div>
          </PropertyImage>

          {/* featured */}
          <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between', 'margin': '24px 0 12px'}}>
            <span style={{'fontSize': '16px', 'fontWeight': '800', 'color': '#1f5a31'}}>Featured Projects</span>
            <a onClick={goExplore} style={{'fontSize': '13px', 'fontWeight': '700', 'color': '#e2822a', 'cursor': 'pointer'}}>View All</a>
          </div>
          <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '13px'}}>
            { filteredFeatured.map((f, index) => (
              <div onClick={f.open} style={{'background': '#fff', 'borderRadius': '18px', 'overflow': 'hidden', 'border': '1px solid #eef3ec', 'boxShadow': '0 10px 28px -20px rgba(18,53,29,.5)', 'cursor': 'pointer'}}>
                <PropertyImage src={propertyPrimaryImage(f.property)} alt={f.name} eager={index === 0} fallback={f.grad} style={{height: '96px'}}>
                  <span style={{'position': 'absolute', 'top': '8px', 'left': '8px', 'background': 'rgba(9,32,16,.55)', 'color': '#fff', 'fontSize': '10px', 'fontWeight': '700', 'padding': '3px 8px', 'borderRadius': '20px', 'backdropFilter': 'blur(4px)'}}>Location: {f.tag}</span>
                </PropertyImage>
                <div style={{'padding': '11px 12px 13px'}}>
                  <p style={{'margin': '0', 'fontSize': '13.5px', 'fontWeight': '700', 'color': '#16231a'}}>{f.name}</p>
                  <p style={{'margin': '3px 0 8px', 'fontSize': '11.5px', 'color': '#8a988c', 'fontWeight': '500'}}>{f.loc}</p>
                  <p style={{'margin': '0', 'fontSize': '14px', 'fontWeight': '800', 'color': '#2b6d3d'}}>{f.price}{hasRatePrice(f.price) && <span style={{'fontSize': '10.5px', 'color': '#9aa89c', 'fontWeight': '600'}}> /sq.yd</span>}</p>
                </div>
              </div>
            ))}
          </div>
          {!filteredFeatured.length && (
            <div style={{'marginTop': '12px', 'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '16px', 'padding': '18px', 'fontSize': '13px', 'fontWeight': '600', 'color': '#6d7d6f'}}>No properties match your search right now.</div>
          )}

          {/* quick actions */}
          <p style={{'fontSize': '16px', 'fontWeight': '800', 'color': '#1f5a31', 'margin': '24px 0 13px'}}>Quick Actions</p>
          <div style={{'display': 'grid', 'gridTemplateColumns': 'repeat(5,minmax(0,1fr))', 'gap': '6px'}}>
            { quickActions.map((q, index) => (
              <button onClick={q.go} style={{'border': 'none', 'background': 'transparent', 'cursor': 'pointer', 'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'gap': '7px', 'fontFamily': 'inherit', 'minWidth': 0, 'padding': 0}}>
                <span style={{'width': '46px', 'height': '46px', 'borderRadius': '15px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={q.icon}/></svg>
                </span>
                <span style={{'fontSize': '9.5px', 'fontWeight': '600', 'color': '#4a5c4d', 'textAlign': 'center', 'lineHeight': '1.15', 'maxWidth': '100%', 'overflowWrap': 'anywhere'}}>{q.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* ===================== EXPLORE ===================== */}
      {isExplore && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '58px 22px 20px', 'borderRadius': '0 0 26px 26px'}}>
          <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
            <button onClick={goHome} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
            <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Explore Properties</span>
          </div>
          <div style={{'marginTop': '16px', 'display': 'flex', 'alignItems': 'center', 'gap': '10px', 'height': '48px', 'background': '#fff', 'borderRadius': '15px', 'padding': '0 14px'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c8c7e" stroke-width="1.8" stroke-linecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5"/></svg>
            <input value={exploreSearch} onChange={(event) => setExploreSearch(event.target.value)} placeholder="Search location or project" style={{'flex': '1', 'border': 'none', 'background': 'transparent', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'fontWeight': '500', 'color': '#16231a'}}/>
          </div>
        </div>

        <div style={{'padding': '18px 22px 0'}}>
          <div style={{'display': 'flex', 'gap': '9px', 'overflowX': 'auto'}} className="rv-scroll with-nav">
            { chips.map((c, index) => (
              <button onClick={c.pick} style={c.style}>{c.label}</button>
            ))}
          </div>

          <div style={{'display': 'flex', 'justifyContent': 'space-between', 'margin': '18px 2px 6px'}}>
            { filterIcons.map((fi, index) => (
              <button onClick={fi.go} style={{'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'gap': '6px', 'border': 'none', 'background': 'transparent', 'padding': '0', 'cursor': 'pointer', 'fontFamily': 'inherit'}}>
                <span style={{'width': '44px', 'height': '44px', 'borderRadius': '14px', 'border': '1px solid #e6ede2', 'background': '#fff', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={fi.icon}/></svg>
                </span>
                <span style={{'fontSize': '10.5px', 'fontWeight': '600', 'color': '#6d7d6f'}}>{fi.label}</span>
              </button>
            ))}
          </div>

          <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between', 'margin': '18px 0 12px'}}>
            <span style={{'fontSize': '15px', 'fontWeight': '800', 'color': '#1f5a31'}}>Projects Near You</span>
            <a onClick={refreshExplore} style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#e2822a', 'cursor': 'pointer'}}>↻ Refresh</a>
          </div>

          {/* loading skeletons */}
          {exploreLoading && (
          <div style={{'display': 'flex', 'flexDirection': 'column', 'gap': '12px'}}>
            { skeletons.map((s, index) => (
              <div style={{'display': 'flex', 'gap': '12px', 'background': '#fff', 'borderRadius': '16px', 'padding': '12px', 'border': '1px solid #eef3ec'}}>
                <div className="rv-skel" style={{'width': '78px', 'height': '78px', 'borderRadius': '12px'}}></div>
                <div style={{'flex': '1', 'display': 'flex', 'flexDirection': 'column', 'gap': '8px', 'justifyContent': 'center'}}>
                  <div className="rv-skel" style={{'height': '13px', 'width': '65%', 'borderRadius': '6px'}}></div>
                  <div className="rv-skel" style={{'height': '11px', 'width': '45%', 'borderRadius': '6px'}}></div>
                  <div className="rv-skel" style={{'height': '13px', 'width': '35%', 'borderRadius': '6px'}}></div>
                </div>
              </div>
            ))}
          </div>
          )}

          {/* list */}
          {exploreReady && (
          <div style={{'display': 'flex', 'flexDirection': 'column', 'gap': '12px'}}>
            { nearby.map((n, index) => (
              <div onClick={n.open} style={{'display': 'flex', 'gap': '13px', 'background': '#fff', 'borderRadius': '16px', 'padding': '12px', 'border': '1px solid #eef3ec', 'boxShadow': '0 10px 28px -22px rgba(18,53,29,.5)', 'cursor': 'pointer'}}>
                <PropertyImage src={propertyPrimaryImage(n.property)} alt={n.name} fallback={n.grad} style={{width: '82px', height: '82px', borderRadius: '13px', flex: 'none'}} />
                <div style={{'flex': '1', 'display': 'flex', 'flexDirection': 'column', 'justifyContent': 'center'}}>
                  <p style={{'margin': '0', 'fontSize': '14.5px', 'fontWeight': '700', 'color': '#16231a'}}>{n.name}</p>
                  <p style={{'margin': '3px 0 8px', 'fontSize': '12px', 'color': '#8a988c', 'fontWeight': '500'}}>{n.loc}</p>
                  <p style={{'margin': '0', 'fontSize': '14.5px', 'fontWeight': '800', 'color': '#2b6d3d'}}>{n.price}{hasRatePrice(n.price) && <span style={{'fontSize': '11px', 'color': '#9aa89c', 'fontWeight': '600'}}> /sq.yd</span>}</p>
                </div>
                <button onClick={n.like} style={{'alignSelf': 'flex-start', 'border': 'none', 'background': 'transparent', 'cursor': 'pointer', 'padding': '2px'}}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill={n.heartFill} stroke={n.heartStroke} stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5-7 9.5-7 9.5z"/></svg>
                </button>
              </div>
            ))}
            {!nearby.length && (
              <div style={{'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '16px', 'padding': '18px', 'fontSize': '13px', 'fontWeight': '600', 'color': '#6d7d6f'}}>No live properties matched this search.</div>
            )}
          </div>
          )}
        </div>
      </div>
      )}

      {/* ===================== MY PROPERTIES ===================== */}
      {isProps && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '58px 22px 22px', 'borderRadius': '0 0 26px 26px'}}>
          <p style={{'margin': '0 0 16px', 'fontSize': '19px', 'fontWeight': '800', 'color': '#fff'}}>My Properties</p>
          <div style={{'display': 'flex', 'gap': '12px'}}>
            <div style={{'flex': '1', 'background': 'rgba(255,255,255,.1)', 'border': '1px solid rgba(255,255,255,.16)', 'borderRadius': '16px', 'padding': '14px'}}>
              <p style={{'margin': '0', 'fontSize': '11.5px', 'color': '#bcd6bd', 'fontWeight': '600'}}>Total Properties</p>
              <p style={{'margin': '6px 0 0', 'fontSize': '22px', 'fontWeight': '800', 'color': '#fff'}}>{propsAll.length}</p>
            </div>
            <div style={{'flex': '1', 'background': 'rgba(255,255,255,.1)', 'border': '1px solid rgba(255,255,255,.16)', 'borderRadius': '16px', 'padding': '14px'}}>
              <p style={{'margin': '0', 'fontSize': '11.5px', 'color': '#bcd6bd', 'fontWeight': '600'}}>Total Investment</p>
              <p style={{'margin': '6px 0 0', 'fontSize': '22px', 'fontWeight': '800', 'color': '#fff'}}>{formatShortAmount(landRows.reduce((sum, land) => sum + Number(land.total_amount || 0), 0))}</p>
            </div>
          </div>
        </div>

        <div style={{'padding': '18px 22px 0'}}>
          <div style={{'display': 'flex', 'background': '#eef3ec', 'borderRadius': '14px', 'padding': '5px', 'gap': '5px'}}>
            { myTabs.map((t, index) => (
              <button onClick={t.pick} style={t.style}>{t.label}</button>
            ))}
          </div>

          {myEmpty && (
          <div style={{'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'textAlign': 'center', 'padding': '56px 20px'}}>
            <div style={{'width': '82px', 'height': '82px', 'borderRadius': '26px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8fae8c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4h9v17M9 8h3M9 12h3M9 16h3M6 21h13"/></svg>
            </div>
            <p style={{'margin': '20px 0 6px', 'fontSize': '16px', 'fontWeight': '800', 'color': '#1f5a31'}}>No completed properties yet</p>
            <p style={{'margin': '0', 'fontSize': '13px', 'color': '#8a988c', 'maxWidth': '220px', 'lineHeight': '1.5'}}>Your fully-paid properties will appear here once the payments are complete.</p>
          </div>
          )}

          {myHasList && (
          <div style={{'display': 'flex', 'flexDirection': 'column', 'gap': '14px', 'marginTop': '16px'}}>
            { myProps.map((m, index) => (
              <div onClick={m.open} style={{'background': '#fff', 'borderRadius': '20px', 'padding': '14px', 'border': '1px solid #eef3ec', 'boxShadow': '0 12px 30px -22px rgba(18,53,29,.5)', 'cursor': 'pointer'}}>
                <div style={{'display': 'flex', 'gap': '13px'}}>
                  <div style={{width: '88px', height: '88px', borderRadius: '14px', background: m.grad, flex: 'none'}}></div>
                  <div style={{'flex': '1'}}>
                    <p style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#16231a'}}>{m.name}</p>
                    <p style={{'margin': '3px 0 6px', 'fontSize': '13px', 'fontWeight': '700', 'color': '#3d4f40'}}>{m.plot}</p>
                    <p style={{'margin': '0', 'fontSize': '11.5px', 'color': '#8a988c', 'fontWeight': '500'}}>{m.spec}</p>
                    <p style={{'margin': '3px 0 0', 'fontSize': '11.5px', 'color': '#8a988c', 'fontWeight': '500'}}>Purchased on {m.date}</p>
                  </div>
                </div>
                <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between', 'margin': '14px 0 7px'}}>
                  <span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#6d7d6f'}}>Payment Progress</span>
                  <span style={{'fontSize': '11px', 'fontWeight': '700', 'color': '#2b6d3d', 'background': '#e8f3e3', 'padding': '4px 11px', 'borderRadius': '20px'}}>{m.status}</span>
                </div>
                <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '10px'}}>
                  <div style={{'flex': '1', 'height': '8px', 'borderRadius': '5px', 'background': '#eef3ec', 'overflow': 'hidden'}}>
                    <div style={{height: '100%', borderRadius: '5px', background: 'linear-gradient(90deg,#2b6d3d,#3f8a54)', width: m.width}}></div>
                  </div>
                  <span style={{'fontSize': '14px', 'fontWeight': '800', 'color': '#2b6d3d'}}>{m.pct}</span>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
      )}


      {/* ===================== PAYMENTS ===================== */}
      {isPayments && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '58px 22px 24px', 'borderRadius': '0 0 26px 26px'}}>
          <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between'}}>
            <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
              <button onClick={goHome} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
              <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Payments Overview</span>
            </div>
            <button onClick={goNotif} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'cursor': 'pointer'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"/></svg>
            </button>
          </div>
          {/* Summary: 3 percentage stat boxes */}
          <div style={{'marginTop': '18px', 'display': 'grid', 'gridTemplateColumns': '1fr 1fr 1fr', 'gap': '10px'}}>
            <div style={{'background': 'rgba(255,255,255,.1)', 'border': '1px solid rgba(255,255,255,.16)', 'borderRadius': '16px', 'padding': '14px', 'textAlign': 'center'}}>
              <p style={{'margin': '0', 'fontSize': '10px', 'color': '#bcd6bd', 'fontWeight': '600', 'textTransform': 'uppercase', 'letterSpacing': '.4px'}}>Paid</p>
              <p style={{'margin': '8px 0 0', 'fontSize': '24px', 'fontWeight': '800', 'color': '#fff'}}>Live</p>
              <p style={{'margin': '4px 0 0', 'fontSize': '10px', 'color': '#8db991', 'fontWeight': '500'}}>customer workflows</p>
            </div>
            <div style={{'background': 'rgba(255,255,255,.1)', 'border': '1px solid rgba(255,255,255,.16)', 'borderRadius': '16px', 'padding': '14px', 'textAlign': 'center'}}>
              <p style={{'margin': '0', 'fontSize': '10px', 'color': '#bcd6bd', 'fontWeight': '600', 'textTransform': 'uppercase', 'letterSpacing': '.4px'}}>Remaining</p>
              <p style={{'margin': '8px 0 0', 'fontSize': '24px', 'fontWeight': '800', 'color': '#eb9236'}}>Off</p>
              <p style={{'margin': '4px 0 0', 'fontSize': '10px', 'color': '#8db991', 'fontWeight': '500'}}>payments disabled</p>
            </div>
            <div style={{'background': 'rgba(255,255,255,.1)', 'border': '1px solid rgba(255,255,255,.16)', 'borderRadius': '16px', 'padding': '14px', 'textAlign': 'center'}}>
              <p style={{'margin': '0', 'fontSize': '10px', 'color': '#bcd6bd', 'fontWeight': '600', 'textTransform': 'uppercase', 'letterSpacing': '.4px'}}>Properties</p>
              <p style={{'margin': '8px 0 0', 'fontSize': '24px', 'fontWeight': '800', 'color': '#fff'}}>{landRows.length || propertyRows.length || 1}</p>
              <p style={{'margin': '4px 0 0', 'fontSize': '10px', 'color': '#8db991', 'fontWeight': '500'}}>live records</p>
            </div>
          </div>
        </div>

        <div style={{'padding': '20px 22px 0'}}>
          {/* Payment progress card: percentage only */}
          <div style={{'background': '#fff', 'borderRadius': '20px', 'padding': '18px', 'border': '1px solid #eef3ec', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'marginBottom': '14px'}}>
              <div>
                <p style={{'margin': '0', 'fontSize': '12px', 'color': '#8a988c', 'fontWeight': '600'}}>Paid So Far</p>
                <p style={{'margin': '6px 0 0', 'fontSize': '28px', 'fontWeight': '800', 'color': '#2b6d3d'}}>Unavailable</p>
              </div>
              <div style={{'textAlign': 'right'}}>
                <p style={{'margin': '0', 'fontSize': '12px', 'color': '#8a988c', 'fontWeight': '600'}}>Balance Due</p>
                <p style={{'margin': '6px 0 0', 'fontSize': '28px', 'fontWeight': '800', 'color': '#e2822a'}}>Unavailable</p>
              </div>
            </div>
            {/* Segmented progress bar */}
            <div style={{'height': '10px', 'borderRadius': '6px', 'background': '#eef3ec', 'overflow': 'hidden', 'display': 'flex'}}>
              <div style={{'height': '100%', 'width': '100%', 'background': 'linear-gradient(90deg,#2b6d3d,#3f8a54)', 'borderRadius': '6px'}}></div>
            </div>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginTop': '10px'}}>
              <span style={{'fontSize': '11px', 'color': '#2b6d3d', 'fontWeight': '700'}}>● Bookings, visits, and updates sync automatically</span>
              <span style={{'fontSize': '11px', 'color': '#e2822a', 'fontWeight': '700'}}>● Payment collection is excluded from this release</span>
            </div>
            {/* Milestone markers */}
            <div style={{'marginTop': '14px', 'display': 'grid', 'gridTemplateColumns': 'repeat(4,1fr)', 'gap': '8px'}}>
              <div style={{'textAlign': 'center', 'padding': '10px 6px', 'borderRadius': '12px', 'background': '#e8f3e3', 'border': '1px solid #cfe6c6'}}>
                <p style={{'margin': '0', 'fontSize': '13px', 'fontWeight': '800', 'color': '#2b6d3d'}}>10%</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9.5px', 'color': '#4a6b4a', 'fontWeight': '600'}}>Token</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9px', 'color': '#2b6d3d', 'fontWeight': '700'}}>✓ Done</p>
              </div>
              <div style={{'textAlign': 'center', 'padding': '10px 6px', 'borderRadius': '12px', 'background': '#e8f3e3', 'border': '1px solid #cfe6c6'}}>
                <p style={{'margin': '0', 'fontSize': '13px', 'fontWeight': '800', 'color': '#2b6d3d'}}>20%</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9.5px', 'color': '#4a6b4a', 'fontWeight': '600'}}>Booking</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9px', 'color': '#2b6d3d', 'fontWeight': '700'}}>✓ Done</p>
              </div>
              <div style={{'textAlign': 'center', 'padding': '10px 6px', 'borderRadius': '12px', 'background': '#e8f3e3', 'border': '1px solid #cfe6c6'}}>
                <p style={{'margin': '0', 'fontSize': '13px', 'fontWeight': '800', 'color': '#2b6d3d'}}>40%</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9.5px', 'color': '#4a6b4a', 'fontWeight': '600'}}>Milestone 1</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9px', 'color': '#2b6d3d', 'fontWeight': '700'}}>✓ Done</p>
              </div>
              <div style={{'textAlign': 'center', 'padding': '10px 6px', 'borderRadius': '12px', 'background': '#fff8f0', 'border': '1px solid #f5d9b4'}}>
                <p style={{'margin': '0', 'fontSize': '13px', 'fontWeight': '800', 'color': '#e2822a'}}>70%</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9.5px', 'color': '#a06020', 'fontWeight': '600'}}>Milestone 2</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '9px', 'color': '#e2822a', 'fontWeight': '700'}}>Upcoming</p>
              </div>
            </div>
          </div>

          {/* Next instalment: percentage-based */}
          <div style={{'marginTop': '14px', 'background': '#fff', 'borderRadius': '20px', 'padding': '18px', 'border': '1px solid #eef3ec', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between'}}>
            <div>
              <p style={{'margin': '0', 'fontSize': '12px', 'color': '#8a988c', 'fontWeight': '600'}}>Payment Status</p>
              <div style={{'display': 'flex', 'alignItems': 'baseline', 'gap': '6px', 'marginTop': '6px'}}>
                <span style={{'fontSize': '26px', 'fontWeight': '800', 'color': '#16231a'}}>Not Live</span>
                <span style={{'fontSize': '12px', 'color': '#9aa89c', 'fontWeight': '600'}}>payments are disabled in this phase</span>
              </div>
              <p style={{'margin': '5px 0 0', 'fontSize': '11.5px', 'color': '#e2822a', 'fontWeight': '700'}}>Use live booking, visit scheduling, documents, and service requests for production testing</p>
            </div>
            <button onClick={payNow} style={{'border': 'none', 'borderRadius': '14px', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '14px', 'fontWeight': '700', 'padding': '13px 22px', 'cursor': 'pointer', 'boxShadow': '0 12px 22px -10px rgba(18,68,35,.7)'}}>Why Unavailable?</button>
          </div>

          <div style={{'marginTop': '14px', 'background': '#fff', 'borderRadius': '20px', 'border': '1px solid #eef3ec', 'overflow': 'hidden', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            { payLinks.map((p, index) => (
              <button onClick={p.go} style={{width: '100%', display: 'flex', alignItems: 'center', gap: '13px', padding: '16px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', borderTop: p.border}}>
                <span style={{'width': '38px', 'height': '38px', 'borderRadius': '11px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'flex': 'none'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={p.icon}/></svg>
                </span>
                <span style={{'flex': '1', 'textAlign': 'left', 'fontSize': '14px', 'fontWeight': '600', 'color': '#16231a'}}>{p.label}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2cdc0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
              </button>
            ))}
          </div>
        </div>
      </div>
      )}


      {/* ===================== PROFILE ===================== */}
      {isProfile && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 24px', 'borderRadius': '0 0 26px 26px'}}>
          <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between'}}>
            <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Profile</span>
            <img src="/RivanRealtyLogo.png" alt="Rivan Realty" style={{'height': '30px', 'width': '48px', 'objectFit': 'contain', 'borderRadius': '8px', 'opacity': '.9'}} />
          </div>
          <div style={{'marginTop': '18px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
            <div style={{'width': '62px', 'height': '62px', 'borderRadius': '20px', 'background': 'rgba(255,255,255,.16)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'fontSize': '24px', 'fontWeight': '800', 'color': '#fff'}}>{initials}</div>
            <div>
              <p style={{'margin': '0', 'fontSize': '17px', 'fontWeight': '800', 'color': '#fff'}}>{userName}</p>
              <p style={{'margin': '4px 0 0', 'fontSize': '12.5px', 'color': '#bcd6bd', 'fontWeight': '500'}}>{session?.user?.phone ? `+${String(session.user.phone).replace(/^\+/, '')}` : 'Phone not available'}</p>
              <p style={{'margin': '2px 0 0', 'fontSize': '12.5px', 'color': '#bcd6bd', 'fontWeight': '500'}}>{profileForm.email || 'Email not added'}</p>
            </div>
          </div>
        </div>

        <div style={{'padding': '16px 22px 0'}}>
          <div style={{'background': '#fff', 'borderRadius': '20px', 'border': '1px solid #eef3ec', 'overflow': 'hidden', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            { profileMenu.map((i, index) => (
              <button onClick={i.go} style={{width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '15px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', borderTop: i.border}}>
                <span style={{width: '38px', height: '38px', borderRadius: '11px', background: i.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={i.iconColor} stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={i.icon}/></svg>
                </span>
                <span style={{flex: '1', textAlign: 'left', fontSize: '14.5px', fontWeight: '600', color: i.textColor}}>{i.label}</span>
                {i.badge && (<span style={{'fontSize': '11px', 'fontWeight': '700', 'color': '#2b6d3d', 'background': '#e8f3e3', 'padding': '4px 10px', 'borderRadius': '20px', 'marginRight': '6px'}}>✓ {i.badgeText}</span>)}
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c2cdc0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
              </button>
            ))}
          </div>
          <p style={{'textAlign': 'center', 'margin': '18px 0 0', 'fontSize': '11.5px', 'color': '#9aa89c', 'fontWeight': '600'}}>Rivan Reality • v1.0.0</p>
        </div>
      </div>
      )}

      {/* ===================== PROPERTY DETAILS ===================== */}
      {isPropDetail && (
      <div className="rv-screen">
        <PropertyImage src={selectedImage} alt={sel.name || 'Property'} eager fallback={sel.grad} style={{position: 'relative', height: '300px'}}>
          <div style={{'position': 'absolute', 'inset': '0', 'background': 'linear-gradient(180deg,rgba(9,32,16,.28),transparent 30%,rgba(9,32,16,.5))'}}></div>
          <div style={{'position': 'absolute', 'top': '52px', 'left': '20px', 'right': '20px', 'display': 'flex', 'justifyContent': 'space-between'}}>
            <button onClick={back} style={{'width': '40px', 'height': '40px', 'borderRadius': '13px', 'border': 'none', 'background': 'rgba(255,255,255,.9)', 'color': '#1f5a31', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
            <button style={{'width': '40px', 'height': '40px', 'borderRadius': '13px', 'border': 'none', 'background': 'rgba(255,255,255,.9)', 'cursor': 'pointer', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1f5a31" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5-7 9.5-7 9.5z"/></svg>
            </button>
          </div>
          <div style={{'position': 'absolute', 'bottom': '18px', 'left': '20px'}}>
            <span style={{'background': '#e2822a', 'color': '#fff', 'fontSize': '11px', 'fontWeight': '700', 'padding': '5px 11px', 'borderRadius': '20px'}}>{selectedProperty?.rera_number ? 'RERA Approved' : 'Live Property'}</span>
          </div>
        </PropertyImage>

        <div style={{'padding': '20px 22px 0', 'marginTop': '-22px', 'background': '#f8fbf6', 'borderRadius': '24px 24px 0 0', 'position': 'relative'}}>
          <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'flex-start'}}>
            <div>
              <p style={{'margin': '0', 'fontSize': '21px', 'fontWeight': '800', 'color': '#1f5a31'}}>{sel.name}</p>
              <p style={{'margin': '5px 0 0', 'fontSize': '13px', 'color': '#8a988c', 'fontWeight': '500'}}>Location: {sel.loc}</p>
              <p style={{'margin': '6px 0 0', 'fontSize': '11.5px', 'color': '#2b6d3d', 'fontWeight': '700'}}>{selectedProperty?.property_code || 'Property Code Pending'}</p>
            </div>
            <div style={{'textAlign': 'right'}}><p style={{'margin': '0', 'fontSize': '20px', 'fontWeight': '800', 'color': '#2b6d3d'}}>{sel.price}</p>{hasRatePrice(sel.price) && <p style={{'margin': '2px 0 0', 'fontSize': '11px', 'color': '#9aa89c', 'fontWeight': '600'}}>per sq.yd</p>}</div>
          </div>

          <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '11px', 'marginTop': '18px'}}>
            { specGrid.map((s, index) => (
              <div style={{'background': '#fff', 'border': '1px solid #eef3ec', 'borderRadius': '14px', 'padding': '13px 14px'}}>
                <p style={{'margin': '0', 'fontSize': '11px', 'color': '#8a988c', 'fontWeight': '600'}}>{s.k}</p>
                <p style={{'margin': '5px 0 0', 'fontSize': '14px', 'fontWeight': '700', 'color': '#16231a'}}>{s.v}</p>
              </div>
            ))}
          </div>

          <p style={{'fontSize': '15px', 'fontWeight': '800', 'color': '#1f5a31', 'margin': '22px 0 8px'}}>About this project</p>
          <p style={{'margin': '0', 'fontSize': '13px', 'lineHeight': '1.65', 'color': '#5c6c5e'}}>A premium gated community of villa plots surrounded by landscaped greenery, wide internal roads and modern amenities — designed for families who value space, privacy and long-term appreciation.</p>

          <p style={{'fontSize': '15px', 'fontWeight': '800', 'color': '#1f5a31', 'margin': '22px 0 10px'}}>Amenities</p>
          <div style={{'display': 'flex', 'flexWrap': 'wrap', 'gap': '8px'}}>
            { amenities.map((a, index) => (
              <span style={{'fontSize': '12.5px', 'fontWeight': '600', 'color': '#3d4f40', 'background': '#fff', 'border': '1px solid #e6ede2', 'padding': '9px 14px', 'borderRadius': '12px'}}>{a}</span>
            ))}
          </div>

          {selectedGallery.length > 0 && (
            <>
              <p style={{'fontSize': '15px', 'fontWeight': '800', 'color': '#1f5a31', 'margin': '22px 0 10px'}}>Project Gallery</p>
              <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '10px'}}>
                {selectedGallery.map((image, index) => (
                  <PropertyImage key={image + index} src={image} alt={`${sel.name || 'Property'} gallery ${index + 1}`} fallback={sel.grad} style={{'height': '96px', 'borderRadius': '16px', 'border': '1px solid #eef3ec'}} />
                ))}
              </div>
            </>
          )}
          <div style={{'height': '20px'}}></div>
        </div>

        <div style={{'position': 'sticky', 'bottom': '0', 'background': '#fff', 'borderTop': '1px solid #eef3ec', 'padding': '14px 22px', 'display': 'flex', 'gap': '12px'}}>
          <button onClick={scheduleSelectedPropertyVisit} style={{'flex': '1', 'height': '54px', 'borderRadius': '16px', 'border': '1.5px solid #2b6d3d', 'background': '#fff', 'color': '#2b6d3d', 'fontFamily': 'inherit', 'fontSize': '14.5px', 'fontWeight': '700', 'cursor': 'pointer'}}>Schedule Visit</button>
          <button onClick={requestBooking} style={{'flex': '1.3', 'height': '54px', 'borderRadius': '16px', 'border': 'none', 'background': 'linear-gradient(180deg,#eb9236,#e2822a)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '14.5px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 12px 22px -10px rgba(226,130,42,.6)'}}>Book Now</button>
        </div>
      </div>
      )}

      {/* ===================== PAYMENT HISTORY ===================== */}
      {isPayHistory && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 22px', 'borderRadius': '0 0 26px 26px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
          <button onClick={back} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
          <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Payment History</span>
        </div>
        <div style={{'padding': '18px 22px 0', 'display': 'flex', 'flexDirection': 'column', 'gap': '12px'}}>
          { history.map((h, index) => (
            <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '13px', 'background': '#fff', 'borderRadius': '16px', 'padding': '15px', 'border': '1px solid #eef3ec', 'boxShadow': '0 10px 26px -22px rgba(18,53,29,.5)'}}>
              <span style={{'width': '42px', 'height': '42px', 'borderRadius': '12px', 'background': '#e8f3e3', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'flex': 'none'}}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4 10-10"/></svg>
              </span>
              <div style={{'flex': '1'}}>
                <p style={{'margin': '0', 'fontSize': '14px', 'fontWeight': '700', 'color': '#16231a'}}>{h.title}</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '11.5px', 'color': '#8a988c', 'fontWeight': '500'}}>{h.date} • {h.mode}</p>
              </div>
              <div style={{'textAlign': 'right'}}>
                <p style={{'margin': '0', 'fontSize': '14.5px', 'fontWeight': '800', 'color': '#16231a'}}>{h.amt}</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '10.5px', 'color': '#2b6d3d', 'fontWeight': '700'}}>Paid</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ===================== EMI CALCULATOR ===================== */}
      {isEMI && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 22px', 'borderRadius': '0 0 26px 26px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
          <button onClick={back} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
          <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>EMI Calculator</span>
        </div>
        <div style={{'padding': '22px'}}>
          <div style={{'background': 'linear-gradient(160deg,#2b6d3d,#3f8a54)', 'borderRadius': '22px', 'padding': '22px', 'textAlign': 'center', 'boxShadow': '0 16px 34px -20px rgba(18,68,35,.8)'}}>
            <p style={{'margin': '0', 'fontSize': '12.5px', 'color': '#bcd6bd', 'fontWeight': '600'}}>Monthly EMI</p>
            <p style={{'margin': '10px 0 0', 'fontSize': '34px', 'fontWeight': '800', 'color': '#fff'}}>{emi}</p>
            <div style={{'display': 'flex', 'justifyContent': 'center', 'gap': '26px', 'marginTop': '16px'}}>
              <div><p style={{'margin': '0', 'fontSize': '11px', 'color': '#9cc39d', 'fontWeight': '600'}}>Total Interest</p><p style={{'margin': '5px 0 0', 'fontSize': '14px', 'fontWeight': '700', 'color': '#fff'}}>{emiInterest}</p></div>
              <div style={{'width': '1px', 'background': 'rgba(255,255,255,.16)'}}></div>
              <div><p style={{'margin': '0', 'fontSize': '11px', 'color': '#9cc39d', 'fontWeight': '600'}}>Total Payable</p><p style={{'margin': '5px 0 0', 'fontSize': '14px', 'fontWeight': '700', 'color': '#fff'}}>{emiTotal}</p></div>
            </div>
          </div>

          <div style={{'marginTop': '22px', 'display': 'flex', 'flexDirection': 'column', 'gap': '24px'}}>
            <div>
              <div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginBottom': '12px'}}><span style={{'fontSize': '13.5px', 'fontWeight': '700', 'color': '#3d4f40'}}>Loan Amount</span><span style={{'fontSize': '14px', 'fontWeight': '800', 'color': '#2b6d3d'}}>{amountLabel}</span></div>
              <input type="range" min="500000" max="10000000" step="100000" value={amount} onInput={setAmount} style={{'width': '100%'}}/>
            </div>
            <div>
              <div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginBottom': '12px'}}><span style={{'fontSize': '13.5px', 'fontWeight': '700', 'color': '#3d4f40'}}>Interest Rate</span><span style={{'fontSize': '14px', 'fontWeight': '800', 'color': '#2b6d3d'}}>{rate}%</span></div>
              <input type="range" min="6" max="15" step="0.25" value={rate} onInput={setRate} style={{'width': '100%'}}/>
            </div>
            <div>
              <div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginBottom': '12px'}}><span style={{'fontSize': '13.5px', 'fontWeight': '700', 'color': '#3d4f40'}}>Tenure</span><span style={{'fontSize': '14px', 'fontWeight': '800', 'color': '#2b6d3d'}}>{years} yrs</span></div>
              <input type="range" min="1" max="30" step="1" value={years} onInput={setYears} style={{'width': '100%'}}/>
            </div>
          </div>
          <button style={{'marginTop': '28px', 'width': '100%', 'height': '56px', 'border': 'none', 'borderRadius': '16px', 'background': 'linear-gradient(180deg,#eb9236,#e2822a)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 14px 26px -12px rgba(226,130,42,.6)'}}>Apply for Loan</button>
        </div>
      </div>
      )}

      {/* ===================== NOTIFICATIONS ===================== */}
      {isNotif && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 22px', 'borderRadius': '0 0 26px 26px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
          <button onClick={back} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
          <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Notifications</span>
        </div>
        <div style={{'padding': '18px 22px 0', 'display': 'flex', 'flexDirection': 'column', 'gap': '11px'}}>
          { notifs.map((n, index) => (
            <div style={{display: 'flex', gap: '13px', background: n.bg, borderRadius: '16px', padding: '15px', border: '1px solid #eef3ec'}}>
              <span style={{width: '40px', height: '40px', borderRadius: '12px', background: n.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={n.iconColor} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={n.icon}/></svg>
              </span>
              <div style={{'flex': '1'}}>
                <p style={{'margin': '0', 'fontSize': '13.5px', 'fontWeight': '700', 'color': '#16231a'}}>{n.title}</p>
                <p style={{'margin': '4px 0 0', 'fontSize': '12px', 'color': '#6d7d6f', 'fontWeight': '500', 'lineHeight': '1.5'}}>{n.body}</p>
                <p style={{'margin': '6px 0 0', 'fontSize': '10.5px', 'color': '#a3b0a4', 'fontWeight': '600'}}>{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ===================== SETTINGS ===================== */}
      {isSettings && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 22px', 'borderRadius': '0 0 26px 26px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
          <button onClick={back} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
          <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Settings</span>
        </div>
        <div style={{'padding': '18px 22px 0'}}>
          <p style={{'fontSize': '12px', 'fontWeight': '700', 'color': '#8a988c', 'textTransform': 'uppercase', 'letterSpacing': '.5px', 'margin': '6px 0 10px'}}>Preferences</p>
          <div style={{'background': '#fff', 'borderRadius': '18px', 'border': '1px solid #eef3ec', 'overflow': 'hidden', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            { togglesArr.map((t, index) => (
              <div key={index} style={{display: 'flex', alignItems: 'center', gap: '13px', padding: '15px 18px', borderTop: t.border}}>
                <span style={{'width': '36px', 'height': '36px', 'borderRadius': '11px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'flex': 'none'}}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                </span>
                <span style={{'flex': '1', 'fontSize': '14px', 'fontWeight': '600', 'color': '#16231a'}}>{t.label}</span>
                <button onClick={t.toggle} style={{width: '48px', height: '28px', borderRadius: '16px', border: 'none', cursor: 'pointer', position: 'relative', background: t.track, transition: 'background .2s'}}>
                  <span style={{position: 'absolute', top: '3px', left: t.knob, width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 2px 5px rgba(0,0,0,.2)'}}></span>
                </button>
              </div>
            ))}
          </div>

          <p style={{'fontSize': '12px', 'fontWeight': '700', 'color': '#8a988c', 'textTransform': 'uppercase', 'letterSpacing': '.5px', 'margin': '22px 0 10px'}}>General</p>
          <div style={{'background': '#fff', 'borderRadius': '18px', 'border': '1px solid #eef3ec', 'overflow': 'hidden', 'boxShadow': '0 12px 30px -24px rgba(18,53,29,.5)'}}>
            { settingLinks.map((s, index) => (
              <button onClick={s.go} style={{width: '100%', display: 'flex', alignItems: 'center', gap: '13px', padding: '15px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', borderTop: s.border}}>
                <span style={{'width': '36px', 'height': '36px', 'borderRadius': '11px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'flex': 'none'}}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b6d3d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={s.icon}/></svg>
                </span>
                <span style={{'flex': '1', 'textAlign': 'left', 'fontSize': '14px', 'fontWeight': '600', 'color': '#16231a'}}>{s.label}</span>
                <span style={{'fontSize': '12.5px', 'color': '#a3b0a4', 'fontWeight': '600', 'marginRight': '6px'}}>{s.value}</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c2cdc0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* ===================== PERSONAL DETAILS ===================== */}
      {isPersonal && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 22px', 'borderRadius': '0 0 26px 26px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
          <button onClick={back} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
          <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Personal Details</span>
        </div>
        <div style={{'padding': '22px'}}>
          <div style={{'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'marginBottom': '8px'}}>
            <div style={{'width': '78px', 'height': '78px', 'borderRadius': '24px', 'background': 'linear-gradient(160deg,#2b6d3d,#3f8a54)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'fontSize': '28px', 'fontWeight': '800', 'color': '#fff'}}>{initials}</div>
            <button onClick={() => openNotice('Profile Photo', 'Profile photo upload will be available in an upcoming update.')} style={{'marginTop': '12px', 'border': '1px solid #e2e8e0', 'background': '#fff', 'borderRadius': '20px', 'padding': '7px 16px', 'fontFamily': 'inherit', 'fontSize': '12.5px', 'fontWeight': '700', 'color': '#2b6d3d', 'cursor': 'pointer'}}>Change Photo</button>
          </div>
          { personalFields.map((p, index) => (
            <div style={{'marginTop': '15px'}}>
              <label style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#3d4f40'}}>{p.label}</label>
              <div style={{'marginTop': '8px', 'display': 'flex', 'alignItems': 'center', 'height': '54px', 'border': '1.5px solid #e2e8e0', 'borderRadius': '15px', 'padding': '0 15px', 'background': '#fbfdfa'}}>
                <input value={p.value} onChange={(e) => {
                  if (p.label === 'Full Name') setProfileForm((state) => ({ ...state, name: e.target.value }));
                  if (p.label === 'Email Address') setProfileForm((state) => ({ ...state, email: e.target.value }));
                  if (p.label === 'City') setProfileForm((state) => ({ ...state, address: e.target.value }));
                  if (p.label === 'Date of Birth') setProfileForm((state) => ({ ...state, date_of_birth: e.target.value }));
                }} readOnly={p.label === 'Phone Number'} style={{'flex': '1', 'border': 'none', 'background': 'transparent', 'fontFamily': 'inherit', 'fontSize': '14.5px', 'fontWeight': '600', 'color': '#16231a'}}/>
              </div>
            </div>
          ))}
          <button onClick={saveProfile} style={{'marginTop': '26px', 'width': '100%', 'height': '56px', 'border': 'none', 'borderRadius': '16px', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 14px 26px -12px rgba(18,68,35,.7)'}}>{savingProfile ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
      )}

      {/* ===================== CONTACT SALES ===================== */}
      {isContact && (
      <div className="rv-screen">
        <div style={{'background': 'linear-gradient(160deg,#2b6d3d 0%,#377e4b 100%)', 'padding': '56px 22px 22px', 'borderRadius': '0 0 26px 26px', 'display': 'flex', 'alignItems': 'center', 'gap': '14px'}}>
          <button onClick={back} style={{'width': '38px', 'height': '38px', 'borderRadius': '12px', 'border': 'none', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '18px', 'cursor': 'pointer'}}>←</button>
          <span style={{'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Contact Sales</span>
        </div>
        <div style={{'padding': '22px'}}>
          <div style={{'background': '#e8f3e3', 'border': '1px solid #cfe6c6', 'borderRadius': '20px', 'padding': '22px', 'textAlign': 'center', 'marginBottom': '22px'}}>
            <div style={{'width': '64px', 'height': '64px', 'borderRadius': '20px', 'background': '#2b6d3d', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'margin': '0 auto'}}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>
            </div>
            <p style={{'margin': '14px 0 4px', 'fontSize': '17px', 'fontWeight': '800', 'color': '#1f5a31'}}>Talk to Our Sales Team</p>
            <p style={{'margin': '0', 'fontSize': '12.5px', 'color': '#4a6b4a', 'fontWeight': '500'}}>Available Mon-Sat, 9 AM - 7 PM</p>
          </div>
          {contactActions.map((c, i) => (
            <div key={i} onClick={c.action} style={{'display': 'flex', 'alignItems': 'center', 'gap': '14px', 'background': '#fff', 'borderRadius': '18px', 'padding': '16px', 'border': '1px solid #eef3ec', 'boxShadow': '0 10px 26px -22px rgba(18,53,29,.5)', 'marginBottom': '12px', 'cursor': 'pointer'}}>
              <span style={{'width': '48px', 'height': '48px', 'borderRadius': '14px', 'background': c.bg, 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'flexShrink': '0'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon}/></svg>
              </span>
              <div style={{'flex': '1'}}>
                <p style={{'margin': '0', 'fontSize': '14.5px', 'fontWeight': '700', 'color': '#16231a'}}>{c.label}</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '12px', 'color': '#8a988c', 'fontWeight': '500'}}>{c.sub}</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2cdc0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </div>
          ))}
          <div style={{'marginTop': '10px', 'background': '#f8fbf6', 'border': '1px solid #e6ede2', 'borderRadius': '18px', 'padding': '18px'}}>
            <p style={{'margin': '0 0 14px', 'fontSize': '14px', 'fontWeight': '800', 'color': '#1f5a31'}}>Send a Message</p>
            <textarea value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} placeholder="Tell us what you're looking for..." style={{'width': '100%', 'height': '100px', 'border': '1.5px solid #e2e8e0', 'borderRadius': '14px', 'padding': '12px 14px', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'color': '#16231a', 'resize': 'none', 'background': '#fff', 'boxSizing': 'border-box'}}/>
            <button onClick={() => submitContactSales('contact_sales')} style={{'marginTop': '12px', 'width': '100%', 'height': '52px', 'border': 'none', 'borderRadius': '15px', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 14px 26px -12px rgba(18,68,35,.7)'}}>Send Message</button>
          </div>
        </div>
      </div>
      )}

    </div>

    


    {/* ===================== MAIN NAV ===================== */}
    <nav className="rv-nav">
      <button className={`rv-nav-btn ${cur === 'home' ? 'active' : ''}`} onClick={goHome}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5"/></svg>
        <span className="nav-label">Home</span>
      </button>
      <button className="rv-nav-btn" onClick={goVisitsPage}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 14l2 2 4-4"/></svg>
        <span className="nav-label">Site Visits</span>
      </button>
      <button className={`rv-nav-btn ${cur === 'props' ? 'active' : ''}`} onClick={goProps}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4h9v17M9 8h3M9 12h3M9 16h3M6 21h13"/></svg>
        <span className="nav-label">My Lands</span>
      </button>
      <button className={`rv-nav-btn ${cur === 'payments' ? 'active' : ''}`} onClick={goPayments}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v11H3zM3 10.5h18"/></svg>
        <span className="nav-label">Payments</span>
      </button>
      <button className={`rv-nav-btn ${cur === 'profile' ? 'active' : ''}`} onClick={goProfile}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>
        <span className="nav-label">Profile</span>
      </button>
    </nav>




    {/* ===================== PROPERTY ACTION FORM ===================== */}
    {actionFormMode && (
    <div onClick={() => !actionSubmitting && setActionFormMode(null)} style={{'position': 'absolute', 'inset': '0', 'background': 'rgba(9,32,16,.5)', 'backdropFilter': 'blur(3px)', 'display': 'flex', 'alignItems': 'flex-end', 'justifyContent': 'center', 'zIndex': '68', 'padding': '18px'}}>
      <div onClick={(event) => event.stopPropagation()} style={{'background': '#fff', 'borderRadius': '22px', 'padding': '20px', 'width': '100%', 'maxHeight': '86vh', 'overflowY': 'auto', 'boxShadow': '0 24px 60px -30px rgba(9,32,16,.7)'}}>
        <div style={{'display': 'flex', 'justifyContent': 'space-between', 'gap': '14px', 'alignItems': 'flex-start'}}>
          <div>
            <p style={{'margin': '0', 'fontSize': '18px', 'fontWeight': '800', 'color': '#1f5a31'}}>{actionFormMode === 'booking' ? 'Book This Property' : 'Schedule Site Visit'}</p>
            <p style={{'margin': '5px 0 0', 'fontSize': '12.5px', 'color': '#6d7d6f', 'lineHeight': '1.45'}}>{selectedProperty?.name || selData?.name || 'Selected property'}</p>
          </div>
          <button onClick={() => setActionFormMode(null)} disabled={actionSubmitting} style={{'width': '36px', 'height': '36px', 'borderRadius': '12px', 'border': '1px solid #e6ede2', 'background': '#fff', 'color': '#1f5a31', 'fontSize': '18px', 'cursor': 'pointer'}}>x</button>
        </div>

        <div style={{'display': 'grid', 'gap': '12px', 'marginTop': '18px'}}>
          <label style={{'display': 'grid', 'gap': '7px'}}>
            <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#3d4f40'}}>Full Name</span>
            <input value={actionForm.name} onChange={(event) => setActionForm((current) => ({ ...current, name: event.target.value }))} placeholder="Enter your name" style={{'height': '48px', 'borderRadius': '13px', 'border': '1.5px solid #e2e8e0', 'padding': '0 13px', 'fontFamily': 'inherit', 'fontSize': '13.5px'}} />
          </label>
          <label style={{'display': 'grid', 'gap': '7px'}}>
            <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#3d4f40'}}>Mobile Number</span>
            <input value={actionForm.mobile} onChange={(event) => setActionForm((current) => ({ ...current, mobile: event.target.value }))} placeholder="+91 mobile number" inputMode="tel" style={{'height': '48px', 'borderRadius': '13px', 'border': '1.5px solid #e2e8e0', 'padding': '0 13px', 'fontFamily': 'inherit', 'fontSize': '13.5px'}} />
          </label>

          {actionFormMode === 'visit' && (
            <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '12px'}}>
              <label style={{'display': 'grid', 'gap': '7px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#3d4f40'}}>Visit Date</span>
                <input type="date" min={new Date().toISOString().slice(0, 10)} value={actionForm.visit_date} onChange={(event) => setActionForm((current) => ({ ...current, visit_date: event.target.value }))} style={{'height': '48px', 'borderRadius': '13px', 'border': '1.5px solid #e2e8e0', 'padding': '0 13px', 'fontFamily': 'inherit', 'fontSize': '13.5px'}} />
              </label>
              <label style={{'display': 'grid', 'gap': '7px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#3d4f40'}}>Visit Time</span>
                <select value={actionForm.visit_time} onChange={(event) => setActionForm((current) => ({ ...current, visit_time: event.target.value }))} style={{'height': '48px', 'borderRadius': '13px', 'border': '1.5px solid #e2e8e0', 'padding': '0 13px', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'background': '#fff'}}>
                  {['10:00 AM', '11:00 AM', '12:30 PM', '03:00 PM', '04:30 PM', '06:00 PM'].map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {actionFormMode === 'booking' && (
            <>
              <label style={{'display': 'grid', 'gap': '7px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#3d4f40'}}>Select Plot</span>
                <select value={actionForm.plot_id} onChange={(event) => setActionForm((current) => ({ ...current, plot_id: event.target.value }))} style={{'height': '48px', 'borderRadius': '13px', 'border': '1.5px solid #e2e8e0', 'padding': '0 13px', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'background': '#fff'}}>
                  {actionPlots.map((plot) => (
                    <option key={plot.id} value={plot.id}>{plot.plot_number || plot.id} • {plot.size || plot.area || plot.status || 'Available'}</option>
                  ))}
                </select>
              </label>
              <label style={{'display': 'grid', 'gap': '7px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#3d4f40'}}>WhatsApp Number</span>
                <input value={actionForm.whatsapp} onChange={(event) => setActionForm((current) => ({ ...current, whatsapp: event.target.value }))} placeholder="WhatsApp number" inputMode="tel" style={{'height': '48px', 'borderRadius': '13px', 'border': '1.5px solid #e2e8e0', 'padding': '0 13px', 'fontFamily': 'inherit', 'fontSize': '13.5px'}} />
              </label>
            </>
          )}

          <label style={{'display': 'grid', 'gap': '7px'}}>
            <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#3d4f40'}}>{actionFormMode === 'booking' ? 'Booking Notes' : 'Visit Notes'}</span>
            <textarea value={actionForm.message} onChange={(event) => setActionForm((current) => ({ ...current, message: event.target.value }))} rows={3} placeholder="Add any preference or question..." style={{'borderRadius': '13px', 'border': '1.5px solid #e2e8e0', 'padding': '12px 13px', 'fontFamily': 'inherit', 'fontSize': '13.5px', 'resize': 'vertical'}} />
          </label>
        </div>

        <button onClick={submitPropertyActionForm} disabled={actionSubmitting} style={{'marginTop': '16px', 'width': '100%', 'height': '52px', 'border': 'none', 'borderRadius': '15px', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '800', 'cursor': 'pointer', 'opacity': actionSubmitting ? '.72' : '1'}}>
          {actionSubmitting ? 'Submitting...' : actionFormMode === 'booking' ? 'Submit Booking Request' : 'Confirm Visit'}
        </button>
      </div>
    </div>
    )}



    {/* ===================== SUCCESS MODAL ===================== */}
    {showPaidModal && (
    <div onClick={closeModal} style={{'position': 'absolute', 'inset': '0', 'background': 'rgba(9,32,16,.5)', 'backdropFilter': 'blur(3px)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'zIndex': '70', 'padding': '30px'}}>
      <div style={{'background': '#fff', 'borderRadius': '26px', 'padding': '30px 26px', 'textAlign': 'center', 'width': '100%', 'animation': 'rvPop .3s cubic-bezier(.22,1.2,.5,1) both'}}>
        <div style={{'width': '84px', 'height': '84px', 'borderRadius': '28px', 'background': 'linear-gradient(180deg,#2b6d3d,#3f8a54)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'margin': '0 auto'}}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4 10-10"/></svg>
        </div>
        <p style={{'margin': '18px 0 6px', 'fontSize': '20px', 'fontWeight': '800', 'color': '#1f5a31'}}>{modalTitle}</p>
        <p style={{'margin': '0', 'fontSize': '13.5px', 'color': '#6d7d6f', 'lineHeight': '1.55'}}>{modalMessage}</p>
        <button onClick={closeModal} style={{'marginTop': '22px', 'width': '100%', 'height': '52px', 'border': 'none', 'borderRadius': '15px', 'background': 'linear-gradient(180deg,#eb9236,#e2822a)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '15px', 'fontWeight': '700', 'cursor': 'pointer'}}>Done</button>
      </div>
    </div>
    )}

  </div>

  

  );
}

