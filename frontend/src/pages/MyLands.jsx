import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson, loadSession, postJson } from '../lib/auth';

const G = [
  'linear-gradient(150deg,#2f6b3a 0%,#6ba15a 55%,#c7dc9c 100%)',
  'linear-gradient(150deg,#356b52 0%,#5a9a7a 55%,#b6d7bf 100%)',
  'linear-gradient(150deg,#4a6b2f 0%,#84a95a 55%,#d3dfa0 100%)',
];

const LANDS_DATA = [
  {
    id: 1, name: 'Emerald Estate', code: 'Plot A-120', spec: '200 Sq.Yd • East Facing',
    reg: 'RERA/AP/PRJ/2021/000023', status: 'Active', typeShort: 'Plot', grad: G[0],
    progress: '60%', progressW: 60, paid: '₹10,80,000', remaining: '₹7,20,000',
    date: '15 Jan 2025', infoLabel: 'Plot Info',
    aboutRows: [
      { k: 'Location', v: 'Visakhapatnam' },
      { k: 'Plot Size', v: '200 Sq.Yd' },
      { k: 'Facing', v: 'East' },
      { k: 'Total Value', v: '₹18,00,000' },
    ],
  },
  {
    id: 2, name: 'Emerald Green City', code: 'Villa B-08', spec: '350 Sq.Yd • North Facing',
    reg: 'RERA/AP/PRJ/2022/000045', status: 'Active', typeShort: 'Villa', grad: G[1],
    progress: '35%', progressW: 35, paid: '₹8,75,000', remaining: '₹16,25,000',
    date: '03 Mar 2025', infoLabel: 'Villa Info',
    aboutRows: [
      { k: 'Location', v: 'Anakapalle' },
      { k: 'Plot Size', v: '350 Sq.Yd' },
      { k: 'Facing', v: 'North' },
      { k: 'Total Value', v: '₹25,00,000' },
    ],
  },
];

const FILTER_CHIPS = ['All', 'Plots', 'Villas', 'Apartments', 'Farmlands'];

const SVC_PREVIEW_ICONS = [
  'M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6z',
  'M4 20V8l4-2 4 2 4-2 4 2v12',
  'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
];

const SPEC_ROWS = [
  { k: 'Survey Number', v: '112/2A', color: '#16231a', arrow: '' },
  { k: 'Plot Area', v: '200 Sq.Yd', color: '#16231a', arrow: '' },
  { k: 'Facing', v: 'East', color: '#16231a', arrow: '' },
  { k: 'Registration Date', v: '15 Jan 2025', color: '#16231a', arrow: '' },
  { k: 'RERA Number', v: 'RERA/AP/000023', color: '#5fa772', arrow: '↗' },
  { k: 'Guideline Value', v: '₹3,200/Sq.Yd', color: '#16231a', arrow: '' },
  { k: 'Market Value', v: '₹4,500/Sq.Yd', color: '#e2822a', arrow: '↑' },
];

const MAP_PLOTS = [
  { label: 'A-118', style: { fontSize: '9px', fontWeight: '700', padding: '5px 8px', borderRadius: '7px', background: '#cfe6c6', color: '#5fa772', border: '1px solid #b5d9a8' } },
  { label: 'A-119', style: { fontSize: '9px', fontWeight: '700', padding: '5px 8px', borderRadius: '7px', background: '#cfe6c6', color: '#5fa772', border: '1px solid #b5d9a8' } },
  { label: 'A-120', style: { fontSize: '9px', fontWeight: '700', padding: '5px 8px', borderRadius: '7px', background: '#5fa772', color: '#fff', border: '1px solid #5fa772' } },
  { label: 'A-121', style: { fontSize: '9px', fontWeight: '700', padding: '5px 8px', borderRadius: '7px', background: '#cfe6c6', color: '#5fa772', border: '1px solid #b5d9a8' } },
  { label: 'A-122', style: { fontSize: '9px', fontWeight: '700', padding: '5px 8px', borderRadius: '7px', background: '#cfe6c6', color: '#5fa772', border: '1px solid #b5d9a8' } },
];

const CATEGORIES_PLOT = [
  { name: 'Security & Fencing', desc: 'Compound walls, fencing & gates', icon: 'M4 20V8l4-2 4 2 4-2 4 2v12M4 20h16M8 8v12M12 8v12M16 8v12', chips: ['Compound Wall', 'Iron Fencing', 'Entry Gate', 'CCTV'] },
  { name: 'Land Development', desc: 'Leveling, soil & plot prep', icon: 'M6 21V4h9v17M9 8h3M9 12h3M9 16h3M6 21h13', chips: ['Leveling & Grading', 'Soil Testing', 'Boundary Survey', 'Drainage'] },
  { name: 'Utilities', desc: 'Water, power & connectivity', icon: 'M13 3 5 14h6l-1 7 8-11h-6z', chips: ['Borewell', 'Electricity Connection', 'Water Tank', 'Internet Duct'] },
  { name: 'Maintenance', desc: 'Regular upkeep & care', icon: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z', chips: ['Grass Cutting', 'Pest Control', 'Cleaning', 'Gardening'] },
];

const ADDON_PREVIEW = [
  { name: 'Security & Fencing', count: 4, icon: 'M4 20V8l4-2 4 2 4-2 4 2v12M4 20h16' },
  { name: 'Land Development', count: 4, icon: 'M6 21V4h9v17M9 8h3M9 12h3M9 16h3M6 21h13' },
  { name: 'Utilities', count: 4, icon: 'M13 3 5 14h6l-1 7 8-11h-6z' },
  { name: 'Maintenance', count: 4, icon: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z' },
];

const QUICK_ACTIONS_DETAIL = [
  { icon: 'M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5', label: 'View Map' },
  { icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4', label: 'Documents' },
  { icon: 'M3 7h18v11H3zM3 10.5h18', label: 'Payments' },
  { icon: 'M4 5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', label: 'Contact' },
];

export default function MyLands() {
  const navigate = useNavigate();
  const [session] = useState(() => loadSession());
  const [stack, setStack] = useState(['lands']);
  const [filter, setFilter] = useState('All');
  const [sel, setSel] = useState(null);
  const [cat, setCat] = useState(null);
  const [landRows, setLandRows] = useState([]);
  const [documentRows, setDocumentRows] = useState([]);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const cur = stack[stack.length - 1];

  const scrollTop = () => {
    const el = document.querySelector('.ml-scroll');
    if (el) el.scrollTop = 0;
  };
  const go = (s) => { setStack(st => [...st, s]); setTimeout(scrollTop, 10); };
  const back = () => { setStack(st => st.length > 1 ? st.slice(0, -1) : st); setTimeout(scrollTop, 10); };
  const openProp = (p) => { setSel(p); setStack(st => [...st, 'detail']); setTimeout(scrollTop, 10); };
  const openAddons = () => { setStack(st => [...st, 'addons']); setTimeout(scrollTop, 10); };
  const openCat = (c) => { setCat(c); setStack(st => [...st, 'choose']); setTimeout(scrollTop, 10); };

  useEffect(() => {
    if (!session?.access_token || session?.user?.role !== 'customer') {
      navigate('/login', { replace: true });
      return;
    }
    let active = true;
    Promise.all([
      getJson('/api/myland', session.access_token).catch(() => []),
      getJson('/api/documents', session.access_token).catch(() => []),
      getJson('/api/services/catalog', session.access_token).catch(() => []),
    ]).then(([lands, documents, services]) => {
      if (!active) return;
      setLandRows(Array.isArray(lands) ? lands : []);
      setDocumentRows(Array.isArray(documents) ? documents : []);
      setServiceCatalog(Array.isArray(services) ? services : []);
    });
    return () => { active = false; };
  }, [navigate, session?.access_token, session?.user?.role]);

  const liveLands = landRows.map((land, index) => ({
    id: land.id || `land-${index}`,
    name: land.property?.name || land.property_name || 'Sirpuram Gardens',
    code: land.plot_number ? `Plot ${land.plot_number}` : 'Allocated Plot',
    spec: `${land.area || land.plot_area || '—'} • ${land.facing || '—'} Facing`,
    reg: land.property?.rera_number || land.rera_number || 'RERA available on request',
    status: land.purchase_complete ? 'Completed' : 'Active',
    typeShort: String(land.property?.property_type || '').toLowerCase().includes('villa') ? 'Villa' : 'Plot',
    grad: G[index % G.length],
    progress: `${Math.round((Number(land.payment_progress || 0)) * 100)}%`,
    progressW: Math.round((Number(land.payment_progress || 0)) * 100),
    paid: `₹${Math.round(Number(land.paid_amount || 0)).toLocaleString('en-IN')}`,
    remaining: `₹${Math.round(Number(land.balance_amount || 0)).toLocaleString('en-IN')}`,
    date: land.created_at ? new Date(land.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    infoLabel: String(land.property?.property_type || '').toLowerCase().includes('villa') ? 'Villa Info' : 'Plot Info',
    aboutRows: [
      { k: 'Location', v: land.property?.location || land.location || 'Achutapuram, Visakhapatnam' },
      { k: 'Plot Size', v: land.area || land.plot_area || '—' },
      { k: 'Facing', v: land.facing || '—' },
      { k: 'Total Value', v: `₹${Math.round(Number(land.total_amount || 0)).toLocaleString('en-IN')}` },
    ],
  }));

  const sourceLands = liveLands;

  const query = String(search || '').toLowerCase().trim();
  const filteredLands = sourceLands.filter((l) => {
    const matchesType =
      filter === 'All' ||
      (filter === 'Plots' && l.typeShort === 'Plot') ||
      (filter === 'Villas' && l.typeShort === 'Villa');
    const matchesText = !query || [
      l.name,
      l.code,
      l.spec,
      l.reg,
      l.status,
      ...(Array.isArray(l.aboutRows) ? l.aboutRows.flatMap((row) => [row.k, row.v]) : []),
    ].some((value) => String(value || '').toLowerCase().includes(query));
    return matchesType && matchesText;
  });

  const isLands = cur === 'lands';
  const isDetail = cur === 'detail';
  const isPlotInfo = cur === 'plotInfo';
  const isAddons = cur === 'addons';
  const isChoose = cur === 'choose';

  const goHome = () => navigate('/app');
  const goVisitsPage = () => navigate('/visits');
  const goPayments = () => showNotice('Payments Unavailable', 'Payments are not part of this release yet.');
  const goProfile = () => navigate('/app#profile');

  const chipStyle = (c) => filter === c
    ? { padding: '8px 17px', borderRadius: '20px', border: 'none', background: '#5fa772', color: '#fff', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }
    : { padding: '8px 17px', borderRadius: '20px', border: '1px solid #e0ebe4', background: '#fff', color: '#4a5c4d', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 };

  const selD = sel || sourceLands[0] || null;
  const selectedLandRecord = landRows.find((item) => item.id === selD?.id) || landRows[0] || null;
  const selectedDocument = documentRows.find((item) => item.property_id === selectedLandRecord?.property?.id) || documentRows[0] || null;

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const quickActionHandlers = {
    'View Map': () => {
      if (selectedDocument?.url) {
        window.open(selectedDocument.url, '_blank', 'noopener,noreferrer');
        return;
      }
      showNotice('No live map file is attached to this property yet.');
    },
    Documents: () => {
      if (selectedDocument?.url) {
        window.open(selectedDocument.url, '_blank', 'noopener,noreferrer');
        return;
      }
      showNotice('No live document is available for this property yet.');
    },
    Payments: () => showNotice('Payments Unavailable', 'Payments are not part of this release yet.'),
    Contact: () => navigate('/app#contact'),
  };

  return (
    <div className="rv-phone">

      <div className="ml-scroll rv-scroll with-nav" style={{ position: 'absolute', inset: '0', overflowY: 'auto' }}>
        {notice && (
          <div style={{ position: 'sticky', top: '12px', zIndex: 20, margin: '12px 22px 0', background: '#4f8f61', color: '#fff', borderRadius: '14px', padding: '12px 14px', fontSize: '12.5px', fontWeight: 600, boxShadow: '0 12px 24px -18px rgba(18,53,29,.75)' }}>
            {notice}
          </div>
        )}

        {/* ===================== MY LANDS LIST ===================== */}
        {isLands && (
          <div className="rv-screen">
            <div style={{ background: 'linear-gradient(160deg,#5fa772 0%,#6fb581 100%)', padding: '56px 22px 22px', borderRadius: '0 0 26px 26px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '19px', fontWeight: '800', color: '#fff' }}>My Lands</span>
                </div>
                <button style={{ width: '40px', height: '40px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" /></svg>
                  <span style={{ position: 'absolute', top: '9px', right: '10px', width: '7px', height: '7px', borderRadius: '50%', background: '#eb9236', border: '1.5px solid #6fb581' }}></span>
                </button>
              </div>
              <div style={{ marginTop: '16px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.16)', borderRadius: '18px', padding: '16px', display: 'flex' }}>
                <div style={{ flex: '1' }}><p style={{ margin: '0', fontSize: '11.5px', color: '#bcd6bd', fontWeight: '600' }}>Total Lands</p><p style={{ margin: '7px 0 0', fontSize: '24px', fontWeight: '800', color: '#fff' }}>{sourceLands.length}</p></div>
                <div style={{ width: '1px', background: 'rgba(255,255,255,.16)' }}></div>
                <div style={{ flex: '1.4', paddingLeft: '16px' }}><p style={{ margin: '0', fontSize: '11.5px', color: '#bcd6bd', fontWeight: '600' }}>Total Investment</p><p style={{ margin: '7px 0 0', fontSize: '24px', fontWeight: '800', color: '#fff' }}>{`₹${Math.round(landRows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)).toLocaleString('en-IN')}`}</p></div>
              </div>
            </div>

            <div style={{ padding: '18px 22px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '48px', border: '1px solid #e6ede2', borderRadius: '15px', padding: '0 14px', background: '#fbfdfa' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c8c7e" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5" /></svg>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by project, plot no. or location" style={{ flex: '1', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '13px', fontWeight: '500', color: '#16231a' }} />
              </div>

              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginTop: '14px' }} className="rv-scroll">
                {FILTER_CHIPS.map(c => (
                  <button key={c} onClick={() => setFilter(c)} style={chipStyle(c)}>{c}</button>
                ))}
              </div>

              {filteredLands.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 24px' }}>
                  <div style={{ width: '96px', height: '96px', borderRadius: '30px', background: '#eef6ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#8fae8c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6" /></svg>
                  </div>
                  <p style={{ margin: '22px 0 6px', fontSize: '17px', fontWeight: '800', color: '#4f8f61' }}>No properties yet</p>
                  <p style={{ margin: '0 0 22px', fontSize: '13.5px', color: '#8a988c', maxWidth: '250px', lineHeight: '1.55' }}>Start your investment journey with Rivan Reality — explore premium plots, villas and farmlands.</p>
                  <button onClick={() => navigate('/app')} style={{ height: '52px', padding: '0 32px', border: 'none', borderRadius: '15px', background: 'linear-gradient(180deg,#eb9236,#e2822a)', color: '#fff', fontFamily: 'inherit', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 12px 24px -10px rgba(226,130,42,.6)' }}>Explore Properties</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '16px' }}>
                  {filteredLands.map((p) => (
                    <div key={p.id} style={{ background: '#fff', borderRadius: '20px', border: '1px solid #eef3ec', overflow: 'hidden', boxShadow: '0 12px 30px -22px rgba(18,53,29,.5)' }}>
                      <div onClick={() => openProp(p)} style={{ padding: '14px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', gap: '13px' }}>
                          <div style={{ width: '78px', height: '78px', borderRadius: '14px', background: p.grad, flex: 'none', position: 'relative' }}>
                            <span style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(9,32,16,.6)', color: '#fff', fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '20px' }}>{p.typeShort}</span>
                          </div>
                          <div style={{ flex: '1', minWidth: '0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <p style={{ margin: '0', fontSize: '15px', fontWeight: '800', color: '#16231a' }}>{p.name}</p>
                              <span style={{ fontSize: '10.5px', fontWeight: '700', color: '#5fa772', background: '#e8f3e3', padding: '3px 9px', borderRadius: '20px', flexShrink: 0 }}>{p.status}</span>
                            </div>
                            <p style={{ margin: '4px 0 5px', fontSize: '13px', fontWeight: '700', color: '#3d4f40' }}>{p.code}</p>
                            <p style={{ margin: '0', fontSize: '11.5px', color: '#8a988c', fontWeight: '500' }}>{p.spec}</p>
                            <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#8a988c', fontWeight: '500' }}>Purchased on {p.date}</p>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 14px', borderTop: '1px dashed #e6ede2', background: '#fbfdf9' }}>
                        <div style={{ display: 'flex', gap: '6px', flex: '1' }}>
                          {SVC_PREVIEW_ICONS.map((icon, i) => (
                            <span key={i} style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#eef6ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5fa772" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                            </span>
                          ))}
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#6d7d6f', alignSelf: 'center' }}>{serviceCatalog.length ? `${serviceCatalog.length} live services` : 'Live services'}</span>
                        </div>
                        <button onClick={() => { setSel(p); openAddons(); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid #cfe6c6', background: '#fff', color: '#5fa772', borderRadius: '11px', padding: '8px 13px', fontFamily: 'inherit', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>＋ Add Services</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ height: '24px' }}></div>
            </div>
          </div>
        )}

        {/* ===================== PROPERTY DETAIL ===================== */}
        {isDetail && selD && (
          <div className="rv-screen">
            <div style={{ position: 'relative', height: '210px', background: selD.grad }}>
              <div style={{ position: 'absolute', inset: '0', background: 'linear-gradient(180deg,rgba(9,32,16,.25),transparent 40%,rgba(9,32,16,.35))' }}></div>
              <div style={{ position: 'absolute', top: '52px', left: '20px', right: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={back} style={{ width: '40px', height: '40px', borderRadius: '13px', border: 'none', background: 'rgba(255,255,255,.92)', color: '#4f8f61', fontSize: '18px', cursor: 'pointer' }}>←</button>
                <span style={{ fontSize: '16px', fontWeight: '800', color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.4)' }}>{selD.name}</span>
                <button style={{ width: '40px', height: '40px', borderRadius: '13px', border: 'none', background: 'rgba(255,255,255,.92)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f8f61" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
                </button>
              </div>
            </div>

            <div style={{ padding: '20px 22px 0', marginTop: '-24px', background: '#f8fbf6', borderRadius: '24px 24px 0 0', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: '0', fontSize: '20px', fontWeight: '800', color: '#4f8f61' }}>{selD.code}</p>
                  <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#6d7d6f', fontWeight: '500' }}>{selD.spec}</p>
                  <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#8a988c', fontWeight: '500' }}>Reg. No. {selD.reg}</p>
                </div>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#5fa772', background: '#e8f3e3', padding: '5px 12px', borderRadius: '20px' }}>{selD.status}</span>
              </div>

              <div style={{ marginTop: '18px', background: '#fff', border: '1px solid #eef3ec', borderRadius: '18px', padding: '16px', boxShadow: '0 12px 30px -24px rgba(18,53,29,.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#3d4f40' }}>Progress Overview</span>
                  <span style={{ fontSize: '20px', fontWeight: '800', color: '#5fa772' }}>{selD.progress}</span>
                </div>
                <div style={{ height: '9px', borderRadius: '6px', background: '#eef3ec', overflow: 'hidden', margin: '12px 0 14px' }}>
                  <div style={{ height: '100%', borderRadius: '6px', background: 'linear-gradient(90deg,#5fa772,#74b986)', width: selD.progress }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><p style={{ margin: '0', fontSize: '11px', color: '#8a988c', fontWeight: '600' }}>Paid Amount</p><p style={{ margin: '5px 0 0', fontSize: '15px', fontWeight: '800', color: '#16231a' }}>{selD.paid}</p></div>
                  <div style={{ textAlign: 'right' }}><p style={{ margin: '0', fontSize: '11px', color: '#8a988c', fontWeight: '600' }}>Remaining</p><p style={{ margin: '5px 0 0', fontSize: '15px', fontWeight: '800', color: '#e2822a' }}>{selD.remaining}</p></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '9px', marginTop: '16px' }}>
                {QUICK_ACTIONS_DETAIL.map((q, i) => (
                  <button key={i} onClick={() => quickActionHandlers[q.label]?.()} style={{ background: '#fff', border: '1px solid #eef3ec', borderRadius: '15px', padding: '13px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontFamily: 'inherit', cursor: 'pointer' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5fa772" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={q.icon} /></svg>
                    <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#4a5c4d', textAlign: 'center' }}>{q.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #eef3ec', borderRadius: '18px', padding: '16px', boxShadow: '0 12px 30px -24px rgba(18,53,29,.5)' }}>
                <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '800', color: '#4f8f61' }}>About this Property</p>
                {selD.aboutRows.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
                    <span style={{ fontSize: '12.5px', color: '#8a988c', fontWeight: '500' }}>{a.k}</span>
                    <span style={{ fontSize: '12.5px', color: '#16231a', fontWeight: '700' }}>{a.v}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => go('plotInfo')} style={{ margin: '18px 0', width: '100%', height: '56px', border: 'none', borderRadius: '16px', background: 'linear-gradient(180deg,#5fa772,#74b986)', color: '#fff', fontFamily: 'inherit', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 14px 26px -12px rgba(18,68,35,.7)' }}>View {selD.infoLabel}</button>
            </div>
          </div>
        )}

        {/* ===================== PLOT INFO ===================== */}
        {isPlotInfo && selD && (
          <div className="rv-screen">
            <div style={{ background: 'linear-gradient(160deg,#5fa772 0%,#6fb581 100%)', padding: '56px 22px 22px', borderRadius: '0 0 26px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button onClick={back} style={{ width: '38px', height: '38px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>←</button>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{selD.infoLabel}</span>
              </div>
              <button style={{ width: '38px', height: '38px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4" /></svg>
              </button>
            </div>

            <div style={{ padding: '18px 22px 0' }}>
              {/* Stylized map */}
              <div style={{ height: '170px', borderRadius: '18px', overflow: 'hidden', position: 'relative', background: 'linear-gradient(160deg,#eef6ea,#dce9d4)', border: '1px solid #dbe7d4' }}>
                <div style={{ position: 'absolute', inset: '0', backgroundImage: 'linear-gradient(#c9dcc0 1px,transparent 1px),linear-gradient(90deg,#c9dcc0 1px,transparent 1px)', backgroundSize: '26px 26px', opacity: '.5' }}></div>
                <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {MAP_PLOTS.map((mp, i) => (
                    <span key={i} style={mp.style}>{mp.label}</span>
                  ))}
                </div>
                <span style={{ position: 'absolute', bottom: '12px', right: '14px', background: '#5fa772', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px' }}>📍 Your Plot</span>
              </div>

              <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #eef3ec', borderRadius: '20px', padding: '6px 16px', boxShadow: '0 12px 30px -24px rgba(18,53,29,.5)' }}>
                <div style={{ padding: '12px 0 4px' }}><p style={{ margin: '0', fontSize: '16px', fontWeight: '800', color: '#16231a' }}>{selD.code}</p><p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#8a988c', fontWeight: '500' }}>{selD.spec}</p></div>
                {SPEC_ROWS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderTop: '1px solid #f0f4ee' }}>
                    <span style={{ fontSize: '13px', color: '#6d7d6f', fontWeight: '500' }}>{s.k}</span>
                    <span style={{ fontSize: '13px', color: s.color, fontWeight: '700' }}>{s.v} {s.arrow}</span>
                  </div>
                ))}
              </div>

              {/* Add-on features preview */}
              <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #eef3ec', borderRadius: '20px', padding: '18px', boxShadow: '0 12px 30px -24px rgba(18,53,29,.5)' }}>
                <p style={{ margin: '0', fontSize: '15px', fontWeight: '800', color: '#4f8f61' }}>Add-on Features</p>
                <p style={{ margin: '6px 0 14px', fontSize: '12.5px', color: '#8a988c', fontWeight: '500', lineHeight: '1.5' }}>Add services to secure, improve and maintain your property.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {ADDON_PREVIEW.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px', border: '1px solid #f0f4ee', borderRadius: '13px' }}>
                      <span style={{ width: '38px', height: '38px', borderRadius: '11px', background: '#eef6ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5fa772" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
                      </span>
                      <div style={{ flex: '1' }}><p style={{ margin: '0', fontSize: '13.5px', fontWeight: '700', color: '#16231a' }}>{c.name}</p><p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9aa89c', fontWeight: '500' }}>{c.count} services</p></div>
                    </div>
                  ))}
                </div>
                <button onClick={openAddons} style={{ marginTop: '16px', width: '100%', height: '52px', border: 'none', borderRadius: '15px', background: 'linear-gradient(180deg,#eb9236,#e2822a)', color: '#fff', fontFamily: 'inherit', fontSize: '14.5px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 12px 24px -12px rgba(226,130,42,.55)' }}>＋ Add Services</button>
              </div>
              <div style={{ height: '20px' }}></div>
            </div>
          </div>
        )}

        {/* ===================== ADD-ON FEATURES ===================== */}
        {isAddons && (
          <div className="rv-screen">
            <div style={{ background: 'linear-gradient(160deg,#5fa772 0%,#6fb581 100%)', padding: '56px 22px 20px', borderRadius: '0 0 26px 26px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button onClick={back} style={{ width: '38px', height: '38px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>←</button>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>Add-on Features</span>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '12.5px', color: '#bcd6bd', fontWeight: '500' }}>Select services for your {selD?.typeShort || 'Plot'}</p>
            </div>

            <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {CATEGORIES_PLOT.map((c, i) => (
                <div key={i} onClick={() => openCat(c)} style={{ background: '#fff', border: '1px solid #eef3ec', borderRadius: '20px', padding: '18px', boxShadow: '0 12px 30px -24px rgba(18,53,29,.5)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ width: '44px', height: '44px', borderRadius: '13px', background: '#eef6ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#5fa772" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
                    </span>
                    <div style={{ flex: '1' }}><p style={{ margin: '0', fontSize: '15px', fontWeight: '800', color: '#16231a' }}>{c.name}</p><p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#8a988c', fontWeight: '500' }}>{c.desc}</p></div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2cdc0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '14px' }}>
                    {c.chips.map((ch, j) => (
                      <span key={j} style={{ fontSize: '11.5px', fontWeight: '600', color: '#3d4f40', background: '#f2f7ef', border: '1px solid #e6ede2', padding: '6px 11px', borderRadius: '20px' }}>{ch}</span>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#f2f7ef', border: '1px solid #e0ebd9', borderRadius: '16px', padding: '14px 16px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5fa772" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16v-4M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" /></svg>
                <p style={{ margin: '0', fontSize: '12px', color: '#4a5c4d', fontWeight: '600' }}>Services shown are based on <strong style={{ color: '#5fa772' }}>{selD?.typeShort || 'Plot'}</strong> type</p>
              </div>
              <div style={{ height: '12px' }}></div>
            </div>
          </div>
        )}

        {/* ===================== CHOOSE SERVICE (Category Detail) ===================== */}
        {isChoose && cat && (
          <div className="rv-screen">
            <div style={{ background: 'linear-gradient(160deg,#5fa772 0%,#6fb581 100%)', padding: '56px 22px 20px', borderRadius: '0 0 26px 26px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button onClick={back} style={{ width: '38px', height: '38px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>←</button>
              <span style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{cat.name}</span>
            </div>

            <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: '13px' }}>
              {cat.chips.map((sName, i) => (
                <div key={i} onClick={async () => {
                  if (!session?.access_token || !selD?.id) return;
                  try {
                    await postJson('/api/services/request', {
                      service_type: sName,
                      property_id: selectedLandRecord?.property?.id || 'prop-1',
                      preferred_date: new Date().toISOString().slice(0, 10),
                      description: `${sName} requested from My Lands`,
                      contact: session.user?.phone || '',
                    }, session.access_token);
                    showNotice(`${sName} request submitted successfully.`);
                  } catch (error) {
                    showNotice(error?.message || 'Unable to submit the service request right now.');
                  }
                }} style={{ display: 'flex', gap: '14px', background: '#fff', border: '1px solid #eef3ec', borderRadius: '18px', padding: '14px', boxShadow: '0 12px 30px -24px rgba(18,53,29,.5)', cursor: 'pointer' }}>
                  <div style={{ width: '76px', height: '76px', borderRadius: '14px', background: G[i % G.length], flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={cat.icon} /></svg>
                  </div>
                  <div style={{ flex: '1', minWidth: '0' }}>
                    <p style={{ margin: '0', fontSize: '15px', fontWeight: '800', color: '#16231a' }}>{sName}</p>
                    <p style={{ margin: '4px 0 8px', fontSize: '11.5px', color: '#8a988c', fontWeight: '500', lineHeight: '1.45' }}>Professional {sName.toLowerCase()} service</p>
                    <p style={{ margin: '0', fontSize: '11px', color: '#6d7d6f', fontWeight: '600' }}>Starts from <span style={{ fontSize: '14px', fontWeight: '800', color: '#5fa772' }}>₹{(3 + i) * 1000}</span></p>
                  </div>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#eef6ea', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5fa772" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', border: '1px solid #eef3ec', borderRadius: '18px', padding: '16px 10px', marginTop: '4px' }}>
                {[
                  { icon: 'M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6z M9 12l2 2 4-4', label: 'Verified Vendors' },
                  { icon: 'M12 8v5M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', label: 'Best Prices' },
                  { icon: 'M4 5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', label: '24/7 Support' },
                  { icon: 'M4 20V8l4-2 4 2 4-2 4 2v12M4 20h16', label: 'Warranty' },
                ].map((t, i) => (
                  <div key={i} style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', textAlign: 'center' }}>
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#5fa772" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
                    <span style={{ fontSize: '9.5px', fontWeight: '600', color: '#6d7d6f', lineHeight: '1.25' }}>{t.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ height: '12px' }}></div>
            </div>
          </div>
        )}

      </div>

      {/* ===================== MAIN NAV ===================== */}
      <nav className="rv-nav">
        <button className="rv-nav-btn" onClick={goHome}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" /></svg>
          <span className="nav-label">Home</span>
        </button>
        <button className="rv-nav-btn" onClick={goVisitsPage}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 14l2 2 4-4" /></svg>
          <span className="nav-label">Site Visits</span>
        </button>
        <button className="rv-nav-btn active">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 21V4h9v17M9 8h3M9 12h3M9 16h3M6 21h13" /></svg>
          <span className="nav-label">My Lands</span>
        </button>
        <button className="rv-nav-btn" onClick={goPayments}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18v11H3zM3 10.5h18" /></svg>
          <span className="nav-label">Payments</span>
        </button>
        <button className="rv-nav-btn" onClick={goProfile}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>
          <span className="nav-label">Profile</span>
        </button>
      </nav>
    </div>
  );
}
