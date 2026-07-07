import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSession, clearSession, getJson, putJson, saveSession } from '../lib/auth';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const session = loadSession();
  
  useEffect(() => {
    if (!session?.access_token || session.user.role !== 'admin') {
      navigate('/login', { replace: true });
    }
  }, [session, navigate]);

  const user = session?.user || {};

  const [page, setPage] = useState('dashboard');
  const [sideOpen, setSideOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState('All');
  const [perms, setPerms] = useState({ 'User Management': true, 'Agent Management': true, 'Customer Management': true, 'Property Management': true, 'Payment Management': true, 'Reports': true, 'Marketing': false, 'Notifications': true, 'System Settings': true });
  const [notif, setNotif] = useState({ 'New Customer Registration': true, 'New Agent Registration': true, 'Site Visit Bookings': true, 'Payments': true, 'Booking Confirmations': true, 'Support Tickets': false, 'System Alerts': true });

  const nav = (p) => {
    setPage(p);
    setSideOpen(false);
  };
  const av = (i) => {
    const bg = ['#1a5e2e', '#2f6b7a', '#8a5a2e', '#5a3f8a', '#2a6fdb', '#b5772e', '#3f9159', '#a03b5a'];
    return bg[i % bg.length];
  };
  const ini = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const chart = (vals, stroke, fill) => {
    const w = 300, h = 95, pad = 6;
    const max = Math.max(...vals), min = Math.min(...vals), rng = (max - min) || 1;
    const pts = vals.map((v, i) => [pad + i * ((w - 2 * pad) / (vals.length - 1)), h - pad - ((v - min) / rng) * (h - 2 * pad)]);
    const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = 'M' + pts[0][0].toFixed(1) + ' ' + h + ' ' + pts.map((p) => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + h + ' Z';
    return { line, area, stroke, fill };
  };

  const adminName = user.name || user.full_name || 'Admin User';
  const initials = adminName.substring(0, 2).toUpperCase();

  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAudit, setAdminAudit] = useState([]);
  const [adminProperties, setAdminProperties] = useState([]);
  const [adminBookings, setAdminBookings] = useState([]);
  const [adminAgents, setAdminAgents] = useState([]);

  const [profileForm, setProfileForm] = useState({
    name: user.name || user.full_name || '',
    email: user.email || '',
    address: user.address || ''
  });
  const [profileSaving, setProfileSaving] = useState(false);

  const handleProfileChange = (e) => {
    setProfileForm({ ...profileForm, [e.target.name]: e.target.value });
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const res = await putJson('/api/auth/profile', profileForm, session.access_token);
      if (res.success && res.user) {
        saveSession({ ...session, user: res.user });
        alert('Admin profile saved successfully!');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save profile');
    }
    setProfileSaving(false);
  };

  
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!session?.access_token) return;
        
        // Parallel fetching
        const [statsData, usersData, auditData, propsData, bookingsData, agentsData] = await Promise.all([
          getJson('/api/admin/stats', session.access_token).catch(() => null),
          getJson('/api/admin/users', session.access_token).catch(() => []),
          getJson('/api/admin/audit-logs', session.access_token).catch(() => []),
          getJson('/api/admin/properties', session.access_token).catch(() => []),
          getJson('/api/admin/bookings', session.access_token).catch(() => []),
          getJson('/api/admin/agents', session.access_token).catch(() => []),
        ]);
        
        setAdminStats(statsData);
        setAdminUsers(usersData);
        setAdminAudit(auditData);
        setAdminProperties(propsData);
        setAdminBookings(bookingsData);
        setAdminAgents(agentsData);
        
      } catch (err) {
        console.error("Admin fetch error", err);
      }
    };
    fetchData();
  }, [session]);

  const pendingAgents = (adminAgents || []).filter(a => a.approval_status === 'pending');
  const pendingAgentsCount = pendingAgents.length;

  const handleApproveAgent = async (agentId, isApprove) => {
    try {
      const endpoint = isApprove ? `/api/admin/agents/${agentId}/approve` : `/api/admin/agents/${agentId}/status`;
      const payload = isApprove ? {} : { status: 'rejected' };
      const res = await putJson(endpoint, payload, session.access_token);
      
      alert(`Agent ${isApprove ? 'approved' : 'rejected'} successfully`);
      const newData = await getJson('/api/admin/agents', session.access_token);
      setAdminAgents(newData);
    } catch (e) {
      console.error(e);
      alert('Error updating agent status');
    }
  };

  const NAV = [
    ['dashboard', 'Dashboard', 'M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z', 0],
    ['approvals', 'Agent Approvals', 'M9 11l3 3L22 4', pendingAgentsCount],
    ['users', 'Users Management', 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6', 0],
    ['leads', 'Leads Management', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6', 0],
    ['properties', 'Properties', 'M6 21V4h9v17M9 8h3M9 12h3M9 16h3M6 21h13', 0],
    ['bookings', 'Bookings', 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4', 0],
    ['sitevisits', 'Site Visits', 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', 0],
    ['payments', 'Payments', 'M3 7h18v11H3zM3 10.5h18', 0],
    ['commission', 'Commission', 'M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h7', 0],
    ['reports', 'Reports & Analytics', 'M3 3v18h18M7 14l3-3 3 3 5-6', 0],
    ['marketing', 'Marketing & Offers', 'M3 11l18-8-8 18-2-8z', 0],
    ['content', 'Content Management', 'M4 5h16v14H4zM4 9h16M9 9v10', 0],
    ['settings', 'System Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8M4.6 9a1.6 1.6 0 0 0-.3-1.8', 0],
    ['audit', 'Audit Logs', 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4', 0],
    ['support', 'Support Tickets', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 3],
    ['profile', 'Admin Profile', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6s7 2.5 7 6', 0],
  ];
  const navItems = NAV.map(([id, label, icon, badge]) => ({
    label, icon, go: () => nav(id), badge: badge || '',
    style: (page === id)
      ? { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '11px 13px', border: 'none', borderRadius: '11px', background: '#1a5e2e', color: '#fff', fontFamily: 'inherit', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }
      : { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '11px 13px', border: 'none', borderRadius: '11px', background: 'transparent', color: '#9fc0a6', fontFamily: 'inherit', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }
  }));

  const TITLES = {
    dashboard: ['Dashboard Overview', 'Here is what\'s happening with your projects today'],
    approvals: ['Agent Approvals', 'Review and approve new agent applications'],
    users: ['Users Management', 'Agents, sub agents and customers'],
    leads: ['Leads Management', 'All incoming leads across the platform'],
    properties: ['Properties', 'Projects, plots and inventory'],
    bookings: ['Bookings', 'All confirmed bookings'],
    sitevisits: ['Site Visits', 'Scheduled and completed visits'],
    payments: ['Payments', 'Collections, pending and overdue'],
    commission: ['Commission', 'Agent payouts and structures'],
    reports: ['Reports & Analytics', 'Business intelligence and exports'],
    marketing: ['Marketing & Offers', 'Campaigns, offers and broadcasts'],
    content: ['Content Management', 'Website and app content'],
    settings: ['System Settings', 'Platform configuration'],
    audit: ['Audit Logs', 'Every administrative action, logged'],
    support: ['Support Tickets', 'Customer and agent support queue'],
    profile: ['Admin Profile', 'Organization-level account controls']
  };
  const [pageTitle, pageSub] = TITLES[page] || ['Admin', ''];

  const pill = (txt, type) => {
    const m = { success: ['#e6f4ea', '#1a8a4a'], warn: ['#fdf3e8', '#c2711f'], info: ['#eef2fb', '#2a6fdb'], danger: ['#fdeaea', '#c93b3b'] };
    const [bg, c] = m[type] || ['#eef3ec', '#3d4f40'];
    return { fontSize: '10.5px', fontWeight: '800', padding: '5px 11px', borderRadius: '20px', background: bg, color: c, whiteSpace: 'nowrap' };
  };

  const kpis = [
    { label: 'Total Users', value: '2,456', delta: '+8% this month', icon: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', iconBg: '#eef2fb', iconColor: '#2a6fdb' },
    { label: 'Total Leads', value: '5,678', delta: '+12% this month', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', iconBg: '#eef6ea', iconColor: '#1a5e2e' },
    { label: 'Total Bookings', value: '1,234', delta: '+10% this month', icon: 'M6 3h9l4 4v14H6zM14 3v5h5', iconBg: '#fdf3e8', iconColor: '#e2822a' },
    { label: 'Total Sales', value: '₹45.67 Cr', delta: '+15% this month', icon: 'M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h7', iconBg: '#f3eefb', iconColor: '#7a4fce' },
    { label: 'Total Commission', value: '₹5.67 Cr', delta: '+11% this month', icon: 'M6 3h12v18l-6-3-6 3z', iconBg: '#fdf3e8', iconColor: '#e2822a' },
  ];
  const labels = ['1 May', '8 May', '15 May', '22 May', '30 May'];
  const charts = [
    { title: 'Leads Overview', total: '5,678', delta: '▲ 12%', labels, ...chart([1100, 1350, 1220, 1600, 1900], '#1a5e2e', 'rgba(26,94,46,.10)') },
    { title: 'Bookings Overview', total: '1,234', delta: '▲ 10%', labels, ...chart([260, 340, 300, 420, 560], '#e2822a', 'rgba(226,130,42,.10)') },
    { title: 'Sales Overview', total: '₹45.67 Cr', delta: '▲ 15%', labels, ...chart([18, 26, 22, 34, 46], '#7a4fce', 'rgba(122,79,206,.10)') },
  ];
  const topAgents = [
    ['Ananya Sharma', '₹2.45 Cr', '₹24,56,000'], ['Vikram Reddy', '₹1.89 Cr', '₹18,90,000'], ['Rohan K', '₹1.25 Cr', '₹12,50,000'], ['Anita Sharma', '₹1.10 Cr', '₹11,00,000'], ['Karthik R', '₹98 L', '₹9,80,000'],
  ].map((a, i) => ({ rank: '#' + (i + 1), name: a[0], sales: a[1], commission: a[2], initials: ini(a[0]), avatarBg: av(i), border: i === 0 ? 'none' : '1px solid #eef3ec' }));
  const recentBookings = [
    ['Rohan Verma', 'Plot A-120, Emerald Estate', '₹18,00,000', '22 May 2025'], ['Anita Sharma', 'Plot B-45, Green City', '₹12,50,000', '22 May 2025'], ['Neha Patel', 'Plot D-12, Emerald Heights', '₹9,80,000', '21 May 2025'], ['Arjun Mehta', 'Plot F-8, Green Valley', '₹11,00,000', '21 May 2025'], ['Vikram Reddy', 'Plot C-23, Sunrise Valley', '₹8,75,000', '20 May 2025'],
  ].map((b, i) => ({ name: b[0], plot: b[1], amount: b[2], date: b[3], initials: ini(b[0]), avatarBg: av(i), border: i === 0 ? 'none' : '1px solid #eef3ec' }));
  const visitLegend = [{ label: 'Completed', value: '1,256 (51%)', color: '#1a5e2e' }, { label: 'Scheduled', value: '856 (35%)', color: '#2a6fdb' }, { label: 'Cancelled', value: '344 (14%)', color: '#d64545' }];
  const sourceLegend = [{ label: 'Website', value: '2,256 (40%)', color: '#1a5e2e' }, { label: 'Referral', value: '1,356 (24%)', color: '#3f9159' }, { label: 'Social Media', value: '1,034 (18%)', color: '#e2822a' }, { label: 'Walk-in', value: '676 (12%)', color: '#2a6fdb' }, { label: 'Others', value: '456 (8%)', color: '#c2cdc0' }];
  const propStats = [
    { label: 'Total Projects', value: '48', icon: 'M6 21V4h9v17M6 21h13', bg: '#eef6ea', color: '#1a5e2e' },
    { label: 'Total Plots', value: '6,542', icon: 'M4 4h16v16H4zM4 12h16M12 4v16', bg: '#eef2fb', color: '#2a6fdb' },
    { label: 'Available Plots', value: '2,345', icon: 'M5 12l5 5L20 7', bg: '#fdf3e8', color: '#e2822a' },
    { label: 'Sold Plots', value: '4,197', icon: 'M20 6L9 17l-5-5', bg: '#f3eefb', color: '#7a4fce' },
  ];
  const payOverview = [
    { label: 'Total Collected', value: '₹45.67 Cr', delta: '▲ 15%', color: '#1a5e2e', deltaColor: '#1a8a4a', border: 'none' },
    { label: 'Pending Payments', value: '₹12.34 Cr', delta: '▲ 8%', color: '#c2711f', deltaColor: '#c2711f', border: '1px solid #eef3ec' },
    { label: 'Overdue Amount', value: '₹3.21 Cr', delta: '▼ 2%', color: '#c93b3b', deltaColor: '#c93b3b', border: '1px solid #eef3ec' },
  ];
  const recentActivities = [
    ['New Lead Added', 'Rohan Verma', 'Lead for Plot A-120, Emerald Estate', '10 mins ago'], ['Site Visit Scheduled', 'Anita Sharma', 'Visit for Plot B-45, Green City', '25 mins ago'], ['New Booking', 'Neha Patel', 'Booked Plot D-12, Emerald Heights', '1 hour ago'], ['Payment Received', 'Vikram Reddy', 'Payment of ₹8,75,000 received', '2 hours ago'], ['New Agent Registered', 'Karthik R', 'Agent registration completed', '3 hours ago'],
  ].map((a) => ({ activity: a[0], user: a[1], details: a[2], time: a[3] }));
  const alerts = [
    { text: '5 site visits pending approval', icon: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', bg: '#fdf3e8', color: '#e2822a', border: 'none' },
    { text: '12 payments are overdue', icon: 'M12 8v4M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', bg: '#fdeaea', color: '#c93b3b', border: '1px solid #eef3ec' },
    { text: '3 Agents KYC pending', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6s7 2.5 7 6', bg: '#eef2fb', color: '#2a6fdb', border: '1px solid #eef3ec' },
    { text: '2 Projects nearing completion', icon: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', bg: '#eef6ea', color: '#1a5e2e', border: '1px solid #eef3ec' },
  ];

  const adminStatsData = [
    { label: 'Total Users', value: adminStats?.users || 0 }, { label: 'Total Agents', value: adminAgents?.length || 0 }, { label: 'Total Bookings', value: adminStats?.bookings || 0 }, { label: 'Properties', value: adminStats?.properties || 0 }, { label: 'Site Visits', value: adminStats?.visits || 0 },
  ];
  const bd = (arr) => arr.map((x, i) => ({ label: x[0], value: x[1], border: i === arr.length - 1 ? 'none' : '1px solid #eef3ec' }));
  const personalInfo = bd([['Full Name', adminName], ['Employee ID', 'RVN-ADM-001'], ['Designation', 'Super Admin'], ['Email', user.email || 'admin@rivanrealty.com'], ['Mobile', user.phone || '+91 90000 12345'], ['Office Location', 'Head Office, Vizag'], ['Department', 'Administration'], ['Date Joined', '01 Jan 2022']]);
  const companyInfo = bd([['Company Name', 'Rivan Reality Pvt Ltd'], ['Registered Address', 'MVP Colony, Visakhapatnam'], ['GST Number', '37ABCDE1234F1Z5'], ['RERA Number', 'PRM/AP/2021/000842'], ['Website', 'www.rivanrealty.com'], ['Support Email', 'support@rivanrealty.com'], ['Support Phone', '+91 40 4000 1234']]);

  const roles = ['Super Admin', 'Admin', 'Finance Admin', 'Operations Admin', 'Marketing Admin'].map((r, i) => ({
    label: r,
    style: i === 0 ? { fontSize: '12px', fontWeight: '800', padding: '8px 15px', borderRadius: '20px', background: '#1a5e2e', color: '#fff' } : { fontSize: '12px', fontWeight: '700', padding: '8px 15px', borderRadius: '20px', background: '#f4f7f2', color: '#3d4f40', border: '1px solid #e7ede3' }
  }));

  const permKeys = Object.keys(perms);
  const tgl = (on) => ({
    trackStyle: { width: '44px', height: '26px', borderRadius: '16px', border: 'none', cursor: 'pointer', position: 'relative', flex: 'none', background: on ? '#1a5e2e' : '#d5ddd2', transition: 'background .2s' },
    knobStyle: { position: 'absolute', top: '3px', left: on ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 2px 5px rgba(0,0,0,.2)' }
  });
  const permissions = permKeys.map((k) => { const on = perms[k]; const t = tgl(on); return { label: k, trackStyle: t.trackStyle, knobStyle: t.knobStyle, toggle: () => setPerms((st) => ({ ...st, [k]: !st[k] })) }; });

  const security = [
    ['Two-Factor Authentication', 'Adds an extra layer at login', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'Enabled', 'success'],
    ['Change Password', 'Last changed 42 days ago', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M5 20c0-3.5 3-6 7-6s7 2.5 7 6', 'Update', 'info'],
    ['Login Activity', 'Last login 22 May, 09:14 AM', 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'View', 'info'],
    ['Device Management', '4 active devices', 'M4 6h16v10H4zM8 20h8M12 16v4', 'Manage', 'info'],
    ['Session History', '12 sessions this month', 'M3 3v18h18M7 14l3-3 3 3 5-6', 'View', 'info'],
    ['IP Access Logs', 'No suspicious activity', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20', 'Clean', 'success'],
  ].map((x, i) => ({ label: x[0], meta: x[1], icon: x[2], tag: x[3], tagStyle: pill(x[3], x[4]), border: i === 0 ? 'none' : '1px solid #eef3ec' }));

  const usage = [
    { label: 'Storage Used', value: '184 GB / 500 GB', pct: '37%', color: 'linear-gradient(90deg,#1a5e2e,#3f9159)' },
    { label: 'API Usage', value: '62,400 / 100,000', pct: '62%', color: 'linear-gradient(90deg,#2a6fdb,#5a9ae0)' },
    { label: 'Licenses', value: '186 / 250 seats', pct: '74%', color: 'linear-gradient(90deg,#e2822a,#eb9236)' },
  ];

  const notifKeys = Object.keys(notif);
  const notifPrefs = notifKeys.map((k, i) => { const on = notif[k]; const t = tgl(on); return { label: k, trackStyle: t.trackStyle, knobStyle: t.knobStyle, border: i === 0 ? 'none' : '1px solid #eef3ec', toggle: () => setNotif((st) => ({ ...st, [k]: !st[k] })) }; });

  const adminQuick = [
    { label: 'Add New Project', icon: 'M6 21V4h9v17M12 9v6M9 12h6' }, { label: 'Add Agent', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6' },
    { label: 'Add Customer', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20c0-3.5 3-6 7-6M17 17h4M19 15v4' }, { label: 'Create Announcement', icon: 'M3 11l18-8-8 18-2-8z' },
    { label: 'Assign Lead', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' }, { label: 'Upload Documents', icon: 'M12 3v12M8 7l4-4 4 4M5 21h14' },
    { label: 'Generate Reports', icon: 'M3 3v18h18M7 14l3-3 3 3 5-6' }, { label: 'Broadcast Notification', icon: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4' },
  ];

  const auditLogs = [
    ['22 May 2025', '09:42 AM', 'Created Property', adminName, 'Success', 'success'], ['22 May 2025', '09:15 AM', 'Assigned Agent', adminName, 'Success', 'success'], ['21 May 2025', '06:30 PM', 'Approved Booking', 'Finance Admin', 'Success', 'success'], ['21 May 2025', '04:12 PM', 'Modified Settings', adminName, 'Success', 'success'], ['21 May 2025', '11:05 AM', 'Deleted User', 'Super Admin', 'Reverted', 'warn'], ['20 May 2025', '03:48 PM', 'Updated Payment', 'Finance Admin', 'Success', 'success'],
  ].map((l) => ({ date: l[0], time: l[1], action: l[2], user: l[3], status: l[4], statusStyle: pill(l[4], l[5]) }));

  const Gp = ['linear-gradient(150deg,#2f6b3a,#6ba15a)', 'linear-gradient(150deg,#356b52,#5a9a7a)', 'linear-gradient(150deg,#4a6b2f,#84a95a)', 'linear-gradient(150deg,#2f5b6b,#5a8a9a)'];
  const nfmt = (n) => n.toLocaleString('en-IN');
  const PROJ = [
    ['Emerald Estate', 'Madhurawada', 'Visakhapatnam', 'Villa Plots', 420, 312, '₹18.9 Cr', 'Selling', 'success', 0],
    ['Palm Grove', 'Madhurawada', 'Visakhapatnam', 'Plots', 200, 165, '₹8.2 Cr', 'Selling', 'success', 2],
    ['Emerald Springs', 'MVP Colony', 'Visakhapatnam', 'Plots', 150, 95, '₹7.6 Cr', 'Selling', 'success', 1],
    ['Emerald Heights', 'Seethammadhara', 'Visakhapatnam', 'Apartments', 96, 72, '₹6.1 Cr', 'Few Left', 'warn', 3],
    ['Green City Enclave', 'Anakapalle', 'Anakapalle', 'Plots', 680, 520, '₹22.4 Cr', 'Selling', 'success', 1],
    ['Sunrise Valley', 'Yendada', 'Yendada', 'Villas', 240, 180, '₹12.5 Cr', 'Selling', 'success', 2],
    ['Green Valley Farms', 'Bheemili', 'Bheemili', 'Farm Plots', 320, 210, '₹9.8 Cr', 'Selling', 'success', 0],
    ['Riverside Meadows', 'Bheemili', 'Bheemili', 'Plots', 280, 140, '₹7.1 Cr', 'New Launch', 'info', 3],
  ];
  const areaAgg = {};
  PROJ.forEach((p) => { const a = p[2]; if (!areaAgg[a]) areaAgg[a] = { projects: 0, plots: 0, booked: 0 }; areaAgg[a].projects++; areaAgg[a].plots += p[4]; areaAgg[a].booked += p[5]; });
  const areaSummary = Object.entries(areaAgg).map(([name, d]) => ({ name, projects: d.projects, plots: nfmt(d.plots), booked: nfmt(d.booked), available: nfmt(d.plots - d.booked), pct: Math.round(d.booked / d.plots * 100) + '%' }));
  const areaChips = ['All', ...Object.keys(areaAgg)].map((a) => ({
    label: a, pick: () => setAreaFilter(a),
    style: areaFilter === a
      ? { height: '38px', padding: '0 16px', borderRadius: '11px', border: 'none', background: '#1a5e2e', color: '#fff', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }
      : { height: '38px', padding: '0 16px', borderRadius: '11px', border: '1px solid #e2e8e0', background: '#fff', color: '#3d4f40', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }
  }));
  const projects = PROJ.filter((p) => areaFilter === 'All' || p[2] === areaFilter).map((p) => ({
    name: p[0], locality: p[1], area: p[2], type: p[3], total: nfmt(p[4]), booked: nfmt(p[5]), available: nfmt(p[4] - p[5]),
    pct: Math.round(p[5] / p[4] * 100) + '%', revenue: p[6], status: p[7], grad: Gp[p[9]],
    statusStyle: { ...pill(p[7], p[8]), position: 'absolute', top: '12px', left: '12px' }
  }));

  const cC = (v, strong) => ({ v, style: strong ? { fontSize: '13px', fontWeight: '700', color: '#16231a' } : { fontSize: '13px', color: '#3d4f40' } });
  const cM = (v) => ({ v, style: { fontSize: '13px', fontWeight: '800', color: '#1a5e2e' } });
  const cP =  const usersRows = (adminUsers || []).map(u => [
    cC(u.name || u.full_name || 'N/A', 1),
    cC(u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'User'),
    cC(u.email || 'N/A'),
    cC(u.phone ? `+91 ${u.phone.replace('+91', '').trim()}` : 'N/A'),
    cP(u.status === 'active' ? 'Active' : u.status === 'suspended' ? 'Suspended' : 'Pending KYC', u.status === 'active' ? 'success' : 'warn'),
    cC(u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A')
  ]);
  
  const bookingsRows = (adminBookings || []).map(b => [
    cM(b.booking_id || b.id || 'N/A'),
    cC(b.customer_name || 'N/A', 1),
    cC(b.project_name || 'N/A'),
    cC(b.plot_number || b.plot_id || 'N/A'),
    cC(b.amount ? `₹${b.amount}` : 'N/A', 1),
    cP(b.status === 'confirmed' ? 'Confirmed' : b.status === 'pending' ? 'Pending' : 'Cancelled', b.status === 'confirmed' ? 'success' : b.status === 'pending' ? 'warn' : 'danger')
  ]);

  const TABLES = {
    users: { title: 'All Users', cols: ['Name', 'Role', 'Email', 'Phone', 'Status', 'Joined'], rows: usersRows },
    leads: { title: 'All Leads', cols: ['Name', 'Source', 'Project', 'Assigned To', 'Status', 'Date'], rows: [] },
    bookings: { title: 'All Bookings', cols: ['Booking #', 'Customer', 'Project', 'Plot', 'Amount', 'Status'], rows: bookingsRows },
    sitevisits: { title: 'All Site Visits', cols: ['Customer', 'Project', 'Plot', 'Date & Time', 'Agent', 'Status'], rows: [] },
    payments: { title: 'Payments', cols: ['Customer', 'Project', 'Amount', 'Due Date', 'Method', 'Status'], rows: [] },
    commission: { title: 'Agent Commission', cols: ['Agent', 'Bookings', 'Sales', 'Commission', 'Payout', 'Status'], rows: [] },
    reports: { title: 'Generated Reports', cols: ['Report', 'Period', 'Generated By', 'Format', 'Date'], rows: [] },
    marketing: { title: 'Campaigns & Offers', cols: ['Campaign', 'Channel', 'Reach', 'Leads', 'Status', 'Date'], rows: [] },
    content: { title: 'Content Management', cols: ['Title', 'Type', 'Section', 'Updated By', 'Status'], rows: [] },
    audit: { title: 'Audit Logs', cols: ['Date', 'Time', 'Action', 'User', 'Status'], rows: adminAudit.slice(0, 50).map(a => {
      const d = new Date(a.created_at || Date.now());
      return [
        cC(d.toLocaleDateString()),
        cC(d.toLocaleTimeString()),
        cC(a.action || 'Action', 1),
        cC(a.user_id || 'System'),
        cP(a.status || 'Success', 'success')
      ];
    })},
    support: { title: 'Support Tickets', cols: ['Ticket #', 'Customer', 'Subject', 'Priority', 'Status', 'Date'], rows: [
      [cM('TKT-2041'), cC('Rohan Verma', 1), cC('Payment not reflecting'), cP('High', 'danger'), cP('Open', 'warn'), cC('22 May 2025')],
      [cM('TKT-2040'), cC('Anita Sharma', 1), cC('Reschedule site visit'), cP('Medium', 'warn'), cP('In Progress', 'info'), cC('22 May 2025')],
      [cM('TKT-2039'), cC('Neha Patel', 1), cC('Booking document request'), cP('Low', 'success'), cP('Resolved', 'success'), cC('21 May 2025')],
      [cM('TKT-2038'), cC('Vikram Reddy', 1), cC('EMI calculation query'), cP('Medium', 'warn'), cP('Open', 'warn'), cC('20 May 2025')],
    ]},
    settings: { title: 'System Settings', cols: ['Setting', 'Current Value', 'Category'], rows: [
      [cC('Company Currency', 1), cC('INR ₹'), cC('General')],
      [cC('Default Language', 1), cC('English'), cC('General')],
      [cC('Time Zone', 1), cC('IST (GMT +5:30)'), cC('General')],
      [cC('Date Format', 1), cC('DD MMM YYYY'), cC('General')],
      [cC('Auto Lead Assignment', 1), cC('Enabled'), cC('Automation')],
      [cC('Payment Gateway', 1), cC('Razorpay'), cC('Integrations')],
    ]},
  };
  const tableCfg = TABLES[page] || null;

  const GEN = { users: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', leads: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', properties: 'M6 21V4h9v17M6 21h13', bookings: 'M6 3h9l4 4v14H6zM14 3v5h5', sitevisits: 'M4 6h16v14H4zM8 3v4M16 3v4', payments: 'M3 7h18v11H3zM3 10.5h18', commission: 'M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h7', reports: 'M3 3v18h18M7 14l3-3 3 3 5-6', marketing: 'M3 11l18-8-8 18-2-8z', content: 'M4 5h16v14H4zM4 9h16', settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', audit: 'M6 3h9l4 4v14H6zM14 3v5h5', support: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' };

  const sideCls = sideOpen ? 'open' : '';
  const openSide = () => setSideOpen(true);
  const closeSide = () => setSideOpen(false);
  const goDashboard = () => nav('dashboard');
  const goProfile = () => nav('profile');
  const goUsers = () => nav('users');
  const goBookings = () => nav('bookings');
  const goProperties = () => nav('properties');
  const goPayments = () => nav('payments');
  const goAudit = () => nav('audit');
  const goSettings = () => nav('settings');
  const isDashboard = page === 'dashboard';
  const isProfile = page === 'profile';
  const isProperties = page === 'properties';
  const isApprovals = page === 'approvals';
  const isTable = !!tableCfg;
  const isGeneric = page !== 'dashboard' && page !== 'profile' && page !== 'properties' && page !== 'approvals' && !tableCfg;
  const genericIcon = GEN[page] || 'M3 13h8V3H3z';
  const tableTitle = tableCfg ? tableCfg.title : '';
  const tableCols = tableCfg ? tableCfg.cols : [];
  const tableRows = tableCfg ? tableCfg.rows : [];

  return (
    <>
      <div style={{'height': '100vh', 'display': 'flex', 'overflow': 'hidden', 'background': '#eef2ec', 'color': '#16231a'}}>

  {/* ==================== SIDEBAR ==================== */}
  <aside className={`ad-side ${sideCls}`} style={{'flex': 'none', 'width': '252px', 'background': '#0f2e1a', 'display': 'flex', 'flexDirection': 'column'}}>
      <div style={{'padding': '22px 22px 16px', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'borderBottom': '1px solid rgba(255,255,255,.08)'}}>
        <img src="assets/logo-full-white.png" alt="Rivan Realty" style={{'height': '40px', 'width': 'auto', 'objectFit': 'contain'}} />
      </div>

    <nav className="ad-scroll" style={{'flex': '1', 'overflowY': 'auto', 'padding': '10px 12px 18px', 'display': 'flex', 'flexDirection': 'column', 'gap': '2px'}}>
      { navItems.map((n, index) => (
        <button onClick={n.go} style={n.style}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={n.icon}></path></svg>
          <span style={{'flex': '1', 'textAlign': 'left'}}>{n.label}</span>
          {n.badge && (
            <span style={{'minWidth': '20px', 'height': '20px', 'padding': '0 6px', 'borderRadius': '10px', 'background': '#e2822a', 'color': '#fff', 'fontSize': '10px', 'fontWeight': '800', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>{n.badge}</span>
          )}
        </button>
      ))}
    </nav>

    <button onClick={goSettings} style={{'margin': '12px', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'gap': '9px', 'height': '44px', 'border': '1px solid rgba(255,255,255,.16)', 'borderRadius': '12px', 'background': 'rgba(255,255,255,.06)', 'color': '#cfe6d3', 'fontFamily': 'inherit', 'fontSize': '12.5px', 'fontWeight': '700', 'cursor': 'pointer'}}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8M4.6 9a1.6 1.6 0 0 0-.3-1.8"></path></svg>
      System Settings
    </button>
  </aside>

  {sideOpen && (
    <div onClick={closeSide} style={{'position': 'fixed', 'inset': '0', 'background': 'rgba(9,32,16,.4)', 'zIndex': '85'}}></div>
  )}

  {/* ==================== MAIN ==================== */}
  <main style={{'flex': '1', 'minWidth': '0', 'display': 'flex', 'flexDirection': 'column'}}>
    <header style={{'flex': 'none', 'height': '72px', 'background': '#fff', 'borderBottom': '1px solid #e7ede3', 'display': 'flex', 'alignItems': 'center', 'gap': '14px', 'padding': '0 22px'}}>
      <button className="ad-hamb" onClick={openSide} style={{'width': '40px', 'height': '40px', 'border': 'none', 'borderRadius': '11px', 'background': '#eef6ea', 'color': '#1a5e2e', 'alignItems': 'center', 'justifyContent': 'center', 'cursor': 'pointer'}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
      </button>
      <div style={{'flex': '1', 'minWidth': '0'}}>
        <h1 style={{'margin': '0', 'fontSize': '20px', 'fontWeight': '800', 'color': '#12351d'}}>{pageTitle}</h1>
        <p className="ad-hidesm" style={{'margin': '2px 0 0', 'fontSize': '12px', 'color': '#8a9a8c', 'fontWeight': '500'}}>{pageSub}</p>
      </div>
      <div className="ad-hidesm" style={{'display': 'flex', 'alignItems': 'center', 'gap': '9px', 'height': '42px', 'background': '#f4f7f2', 'border': '1px solid #e7ede3', 'borderRadius': '12px', 'padding': '0 14px'}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d7d6f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"></path></svg>
        <span style={{'fontSize': '13px', 'fontWeight': '700', 'color': '#3d4f40'}}>22 May 2025</span>
      </div>
      <button style={{'position': 'relative', 'width': '42px', 'height': '42px', 'border': '1px solid #e7ede3', 'borderRadius': '12px', 'background': '#f4f7f2', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'cursor': 'pointer'}}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#3d4f40" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4"></path></svg>
        <span style={{'position': 'absolute', 'top': '-4px', 'right': '-4px', 'minWidth': '18px', 'height': '18px', 'padding': '0 4px', 'borderRadius': '9px', 'background': '#e2822a', 'color': '#fff', 'fontSize': '10px', 'fontWeight': '800', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'border': '2px solid #fff'}}>1</span>
      </button>
      <button onClick={goProfile} style={{'display': 'flex', 'alignItems': 'center', 'gap': '10px', 'border': '1px solid #e7ede3', 'borderRadius': '12px', 'background': '#fff', 'padding': '5px 12px 5px 5px', 'cursor': 'pointer'}}>
        <span style={{'width': '34px', 'height': '34px', 'borderRadius': '9px', 'background': 'linear-gradient(160deg,#12351d,#0f2e1a)', 'color': '#fff', 'fontSize': '12px', 'fontWeight': '800', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>{initials}</span>
        <span className="ad-hidesm" style={{'display': 'flex', 'flexDirection': 'column', 'lineHeight': '1.15', 'textAlign': 'left'}}>
          <span style={{'fontSize': '13px', 'fontWeight': '800', 'color': '#12351d'}}>{adminName}</span>
          <span style={{'fontSize': '10.5px', 'fontWeight': '600', 'color': '#8a9a8c'}}>Super Admin</span>
        </span>
      </button>
    </header>

    <div className="ad-scroll" style={{'flex': '1', 'overflowY': 'auto', 'padding': '22px'}}>

      {/* ============ DASHBOARD ============ */}
      {isDashboard && (
      <div className="ad-fade" style={{'display': 'flex', 'flexDirection': 'column', 'gap': '18px', 'maxWidth': '1560px'}}>

        {/* KPIs */}
        <div className="ad-kpi">
          { kpis.map((k, index) => (
            <div style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
              <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'flex-start'}}>
                <span style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#8a9a8c'}}>{k.label}</span>
                <span style={{width: '34px', height: '34px', borderRadius: '10px', background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={k.iconColor} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d={k.icon}></path></svg></span>
              </div>
              <p style={{'margin': '12px 0 0', 'fontSize': '23px', 'fontWeight': '800', 'color': '#12351d', 'letterSpacing': '-.5px'}}>{k.value}</p>
              <p style={{'margin': '5px 0 0', 'fontSize': '11.5px', 'fontWeight': '700', 'color': '#1a8a4a'}}>{k.delta}</p>
            </div>
          ))}
        </div>

        {/* line charts */}
        <div className="ad-g3">
          { charts.map((c, index) => (
            <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
              <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center'}}>
                <h3 style={{'margin': '0', 'fontSize': '14px', 'fontWeight': '800', 'color': '#12351d'}}>{c.title}</h3>
                <span style={{'fontSize': '11px', 'fontWeight': '700', 'color': '#8a9a8c', 'background': '#f4f7f2', 'borderRadius': '8px', 'padding': '5px 9px'}}>This Month</span>
              </div>
              <p style={{'margin': '12px 0 0', 'fontSize': '22px', 'fontWeight': '800', 'color': '#12351d'}}>{c.total} <span style={{'fontSize': '12px', 'fontWeight': '700', 'color': '#1a8a4a'}}>{c.delta}</span></p>
              <svg viewBox="0 0 300 100" preserveAspectRatio="none" style={{'width': '100%', 'height': '118px', 'marginTop': '8px', 'display': 'block'}} data-om-raster="true">
                <path d={c.area} fill={c.fill}></path>
                <polyline points={c.line} fill="none" stroke={c.stroke} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></polyline>
              </svg>
              <div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginTop': '6px'}}>
                { c.labels.map((x, index) => (<span style={{'fontSize': '10px', 'fontWeight': '600', 'color': '#a2b0a4'}}>{x}</span>))}
              </div>
            </section>
          ))}
        </div>

        {/* top agents / recent bookings / site visit donut */}
        <div className="ad-g3">
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'marginBottom': '4px'}}><h3 style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Top Performing Agents</h3><a onClick={goUsers} style={{'fontSize': '12px', 'fontWeight': '700', 'color': '#e2822a', 'cursor': 'pointer'}}>View All</a></div>
            <div style={{'display': 'flex', 'flexDirection': 'column'}}>
              { topAgents.map((a, index) => (
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderTop: a.border}}>
                  <span style={{'width': '24px', 'fontSize': '13px', 'fontWeight': '800', 'color': '#a2b0a4'}}>{a.rank}</span>
                  <span style={{width: '38px', height: '38px', borderRadius: '11px', background: a.avatarBg, color: '#fff', fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>{a.initials}</span>
                  <div style={{'flex': '1', 'minWidth': '0'}}><p style={{'margin': '0', 'fontSize': '13.5px', 'fontWeight': '700', 'color': '#16231a'}}>{a.name}</p><p style={{'margin': '2px 0 0', 'fontSize': '11px', 'color': '#8a9a8c', 'fontWeight': '500'}}>Sales: {a.sales}</p></div>
                  <span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#1a5e2e'}}>{a.commission}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'marginBottom': '4px'}}><h3 style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Recent Bookings</h3><a onClick={goBookings} style={{'fontSize': '12px', 'fontWeight': '700', 'color': '#e2822a', 'cursor': 'pointer'}}>View All</a></div>
            <div style={{'display': 'flex', 'flexDirection': 'column'}}>
              { recentBookings.map((b, index) => (
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderTop: b.border}}>
                  <span style={{width: '38px', height: '38px', borderRadius: '11px', background: b.avatarBg, color: '#fff', fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>{b.initials}</span>
                  <div style={{'flex': '1', 'minWidth': '0'}}><p style={{'margin': '0', 'fontSize': '13px', 'fontWeight': '700', 'color': '#16231a'}}>{b.name}</p><p style={{'margin': '2px 0 0', 'fontSize': '11px', 'color': '#8a9a8c', 'fontWeight': '500'}}>{b.plot}</p></div>
                  <div style={{'textAlign': 'right'}}><p style={{'margin': '0', 'fontSize': '12.5px', 'fontWeight': '800', 'color': '#1a5e2e'}}>{b.amount}</p><p style={{'margin': '2px 0 0', 'fontSize': '10.5px', 'color': '#a2b0a4', 'fontWeight': '500'}}>{b.date}</p></div>
                </div>
              ))}
            </div>
          </section>

          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'marginBottom': '14px'}}><h3 style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Site Visit Summary</h3></div>
            <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '16px', 'flexWrap': 'wrap'}}>
              <div style={{'width': '132px', 'height': '132px', 'borderRadius': '50%', 'flex': 'none', 'background': 'conic-gradient(#1a5e2e 0 51%,#2a6fdb 51% 86%,#d64545 86% 100%)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
                <div style={{'width': '90px', 'height': '90px', 'borderRadius': '50%', 'background': '#fff', 'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'justifyContent': 'center'}}><span style={{'fontSize': '19px', 'fontWeight': '800', 'color': '#12351d'}}>2,456</span><span style={{'fontSize': '9.5px', 'fontWeight': '700', 'color': '#8a9a8c'}}>Total Visits</span></div>
              </div>
              <div style={{'flex': '1', 'minWidth': '120px', 'display': 'flex', 'flexDirection': 'column', 'gap': '9px'}}>
                { visitLegend.map((l, index) => (<div style={{'display': 'flex', 'alignItems': 'center', 'gap': '9px'}}><span style={{width: '11px', height: '11px', borderRadius: '3px', background: l.color, flex: 'none'}}></span><span style={{'flex': '1', 'fontSize': '12px', 'fontWeight': '600', 'color': '#3d4f40'}}>{l.label}</span><span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#12351d'}}>{l.value}</span></div>))}
              </div>
            </div>
          </section>
        </div>

        {/* leads by source / properties overview / payment overview */}
        <div className="ad-g3">
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Leads by Source</h3>
            <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '16px', 'flexWrap': 'wrap'}}>
              <div style={{'width': '132px', 'height': '132px', 'borderRadius': '50%', 'flex': 'none', 'background': 'conic-gradient(#1a5e2e 0 40%,#3f9159 40% 64%,#e2822a 64% 82%,#2a6fdb 82% 94%,#c2cdc0 94% 100%)', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}>
                <div style={{'width': '90px', 'height': '90px', 'borderRadius': '50%', 'background': '#fff', 'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'justifyContent': 'center'}}><span style={{'fontSize': '19px', 'fontWeight': '800', 'color': '#12351d'}}>5,678</span><span style={{'fontSize': '9.5px', 'fontWeight': '700', 'color': '#8a9a8c'}}>Total Leads</span></div>
              </div>
              <div style={{'flex': '1', 'minWidth': '120px', 'display': 'flex', 'flexDirection': 'column', 'gap': '8px'}}>
                { sourceLegend.map((l, index) => (<div style={{'display': 'flex', 'alignItems': 'center', 'gap': '9px'}}><span style={{width: '11px', height: '11px', borderRadius: '3px', background: l.color, flex: 'none'}}></span><span style={{'flex': '1', 'fontSize': '11.5px', 'fontWeight': '600', 'color': '#3d4f40'}}>{l.label}</span><span style={{'fontSize': '11.5px', 'fontWeight': '800', 'color': '#12351d'}}>{l.value}</span></div>))}
              </div>
            </div>
          </section>

          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Properties Overview</h3>
            <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '11px'}}>
              { propStats.map((p, index) => (
                <div style={{background: p.bg, borderRadius: '13px', padding: '14px'}}><div style={{'display': 'flex', 'alignItems': 'center', 'gap': '8px'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.color} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d={p.icon}></path></svg><span style={{fontSize: '11px', fontWeight: '700', color: p.color}}>{p.label}</span></div><p style={{'margin': '8px 0 0', 'fontSize': '20px', 'fontWeight': '800', 'color': '#12351d'}}>{p.value}</p></div>
              ))}
            </div>
            <button onClick={goProperties} style={{'marginTop': '14px', 'width': '100%', 'height': '42px', 'border': '1px solid #d3e8cc', 'borderRadius': '12px', 'background': '#fff', 'color': '#1a5e2e', 'fontFamily': 'inherit', 'fontSize': '13px', 'fontWeight': '700', 'cursor': 'pointer'}}>View All Projects</button>
          </section>

          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Payment Overview</h3>
            <div style={{'display': 'flex', 'flexDirection': 'column'}}>
              { payOverview.map((p, index) => (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderTop: p.border}}>
                  <div><p style={{'margin': '0', 'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>{p.label}</p><p style={{margin: '4px 0 0', fontSize: '17px', fontWeight: '800', color: p.color}}>{p.value}</p></div>
                  <span style={{fontSize: '11.5px', fontWeight: '800', color: p.deltaColor}}>{p.delta}</span>
                </div>
              ))}
            </div>
            <button onClick={goPayments} style={{'marginTop': '14px', 'width': '100%', 'height': '42px', 'border': 'none', 'borderRadius': '12px', 'background': 'linear-gradient(180deg,#1a5e2e,#124423)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '13px', 'fontWeight': '700', 'cursor': 'pointer'}}>View All Payments</button>
          </section>
        </div>

        {/* recent activities / system alerts */}
        <div className="ad-g2" style={{'gridTemplateColumns': '1.5fr 1fr'}}>
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'marginBottom': '8px'}}><h3 style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Recent Activities</h3><a onClick={goAudit} style={{'fontSize': '12px', 'fontWeight': '700', 'color': '#e2822a', 'cursor': 'pointer'}}>View All</a></div>
            <div className="ad-tbl-wrap">
              <table style={{'width': '100%', 'borderCollapse': 'collapse', 'minWidth': '520px'}}>
                <thead><tr style={{'textAlign': 'left'}}><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 12px 10px 0'}}>Activity</th><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 12px 10px 0'}}>User</th><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 12px 10px 0'}}>Details</th><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 0 10px 0'}}>Time</th></tr></thead>
                <tbody>
                  { recentActivities.map((a, index) => (
                  <tr style={{'borderTop': '1px solid #eef3ec'}}>
                      <td style={{'padding': '12px 12px 12px 0', 'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a'}}>{a.activity}</td>
                      <td style={{'padding': '12px 12px 12px 0', 'fontSize': '12.5px', 'color': '#3d4f40'}}>{a.user}</td>
                      <td style={{'padding': '12px 12px 12px 0', 'fontSize': '12px', 'color': '#8a9a8c'}}>{a.details}</td>
                      <td style={{'padding': '12px 0', 'fontSize': '11.5px', 'color': '#a2b0a4', 'whiteSpace': 'nowrap'}}>{a.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 8px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>System Alerts</h3>
            <div style={{'display': 'flex', 'flexDirection': 'column'}}>
              { alerts.map((a, index) => (
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderTop: a.border}}>
                  <span style={{width: '36px', height: '36px', borderRadius: '11px', background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a.color} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d={a.icon}></path></svg></span>
                  <p style={{'margin': '0', 'flex': '1', 'fontSize': '12.5px', 'fontWeight': '600', 'color': '#3d4f40', 'lineHeight': '1.4'}}>{a.text}</p>
                </div>
              ))}
            </div>
            <button style={{'marginTop': '12px', 'width': '100%', 'height': '42px', 'border': '1px solid #d3e8cc', 'borderRadius': '12px', 'background': '#fff', 'color': '#1a5e2e', 'fontFamily': 'inherit', 'fontSize': '13px', 'fontWeight': '700', 'cursor': 'pointer'}}>View All Alerts</button>
          </section>
        </div>

      </div>
      )}

      {/* ============ AGENT APPROVALS ============ */}
      {isApprovals && (
        <div className="ad-fade" style={{'display': 'flex', 'flexDirection': 'column', 'gap': '20px'}}>
          <div style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '22px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h2 style={{'margin': '0 0 20px', 'fontSize': '17px', 'fontWeight': '800', 'color': '#12351d'}}>Pending Agent Approvals</h2>
            {pendingAgents.length === 0 ? (
              <p style={{'color': '#8a9a8c', 'fontSize': '14px', 'fontWeight': '600'}}>No pending agents for approval.</p>
            ) : (
              <div style={{'overflowX': 'auto'}}>
                <table style={{'width': '100%', 'borderCollapse': 'collapse', 'minWidth': '700px'}}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Phone', 'Role', 'Status', 'Actions'].map((c, i) => (
                        <th key={c} style={{'padding': '0 0 14px', 'textAlign': 'left', 'fontSize': '11.5px', 'fontWeight': '700', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'letterSpacing': '.5px', 'borderBottom': '1px solid #eef3ec'}}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgents.map((a, i) => (
                      <tr key={a.id} style={{'borderBottom': i === pendingAgents.length - 1 ? 'none' : '1px solid #eef3ec'}}>
                        <td style={{'padding': '14px 0', 'fontSize': '13px', 'fontWeight': '700', 'color': '#16231a'}}>{a.name || a.full_name || 'N/A'}</td>
                        <td style={{'padding': '14px 0', 'fontSize': '13px', 'color': '#3d4f40'}}>{a.email || 'N/A'}</td>
                        <td style={{'padding': '14px 0', 'fontSize': '13px', 'color': '#3d4f40'}}>{a.phone || 'N/A'}</td>
                        <td style={{'padding': '14px 0', 'fontSize': '13px', 'color': '#3d4f40', 'textTransform': 'capitalize'}}>{a.role || 'Agent'}</td>
                        <td style={{'padding': '14px 0'}}>
                           <span style={{'display': 'inline-block', 'padding': '4px 10px', 'borderRadius': '12px', 'fontSize': '11.5px', 'fontWeight': '700', 'background': '#fdf3e8', 'color': '#c2711f'}}>Pending</span>
                        </td>
                        <td style={{'padding': '14px 0'}}>
                          <div style={{display: 'flex', gap: '8px'}}>
                            <button onClick={() => handleApproveAgent(a.id, true)} style={{'padding': '6px 12px', 'background': '#e6f4ea', 'color': '#1a8a4a', 'border': 'none', 'borderRadius': '6px', 'fontWeight': '700', 'cursor': 'pointer', 'fontSize': '12px'}}>Approve</button>
                            <button onClick={() => handleApproveAgent(a.id, false)} style={{'padding': '6px 12px', 'background': '#fdeaea', 'color': '#c93b3b', 'border': 'none', 'borderRadius': '6px', 'fontWeight': '700', 'cursor': 'pointer', 'fontSize': '12px'}}>Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ ADMIN PROFILE ============ */}
      {isProfile && (
      <div className="ad-fade" style={{'display': 'flex', 'flexDirection': 'column', 'gap': '18px', 'maxWidth': '1400px'}}>

        {/* header card */}
        <section style={{'background': 'linear-gradient(120deg,#0f2e1a,#1a5e2e)', 'borderRadius': '20px', 'padding': '26px', 'display': 'flex', 'alignItems': 'center', 'gap': '20px', 'flexWrap': 'wrap', 'boxShadow': '0 20px 44px -30px rgba(18,53,29,.7)'}}>
          <span style={{'width': '82px', 'height': '82px', 'borderRadius': '24px', 'background': 'rgba(255,255,255,.14)', 'color': '#fff', 'fontSize': '28px', 'fontWeight': '800', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'border': '2px solid rgba(255,255,255,.25)'}}>{initials}</span>
          <div style={{'flex': '1', 'minWidth': '200px'}}>
            <p style={{'margin': '0', 'fontSize': '22px', 'fontWeight': '800', 'color': '#fff'}}>{adminName}</p>
            <p style={{'margin': '5px 0 0', 'fontSize': '13px', 'color': '#bcd6bd', 'fontWeight': '500'}}>Super Admin · Head Office, Visakhapatnam · Emp ID RVN-ADM-001</p>
          </div>
          <div style={{'display': 'flex', 'gap': '10px', 'flexWrap': 'wrap'}}>
            <button onClick={() => { clearSession(); window.location.href = '/login'; }} style={{'height': '42px', 'padding': '0 18px', 'border': '1px solid rgba(255,255,255,.3)', 'borderRadius': '12px', 'background': 'transparent', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '12.5px', 'fontWeight': '700', 'cursor': 'pointer'}}>Logout</button>
          </div>
        </section>

        {/* account statistics */}
        <div className="ad-kpi">
          { adminStatsData.map((k, index) => (
            <div style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '16px', 'padding': '16px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}><span style={{'fontSize': '11.5px', 'fontWeight': '700', 'color': '#8a9a8c'}}>{k.label}</span><p style={{'margin': '8px 0 0', 'fontSize': '20px', 'fontWeight': '800', 'color': '#12351d'}}>{k.value}</p></div>
          ))}
        </div>

        <div className="ad-g2">
          {/* personal info */}
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Personal Information</h3>
            <div style={{'display': 'flex', 'flexDirection': 'column', 'gap': '12px'}}>
              <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>Full Name</span>
                <input type="text" name="name" value={profileForm.name} onChange={handleProfileChange} style={{'width': '100%', 'height': '44px', 'padding': '0 14px', 'borderRadius': '10px', 'border': '1px solid #d4ddd0', 'background': '#fff', 'color': '#16231a', 'fontSize': '13px', 'fontWeight': '600'}} />
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>Email Address</span>
                <input type="email" name="email" value={profileForm.email} onChange={handleProfileChange} style={{'width': '100%', 'height': '44px', 'padding': '0 14px', 'borderRadius': '10px', 'border': '1px solid #d4ddd0', 'background': '#fff', 'color': '#16231a', 'fontSize': '13px', 'fontWeight': '600'}} />
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>Address</span>
                <input type="text" name="address" value={profileForm.address} onChange={handleProfileChange} style={{'width': '100%', 'height': '44px', 'padding': '0 14px', 'borderRadius': '10px', 'border': '1px solid #d4ddd0', 'background': '#fff', 'color': '#16231a', 'fontSize': '13px', 'fontWeight': '600'}} />
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid #e7ede3', paddingTop: '10px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>Mobile</span>
                <span style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a', 'textAlign': 'right'}}>{user.phone || '+91 9491348973'}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', gap: '12px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>Employee ID</span>
                <span style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a', 'textAlign': 'right'}}>RVN-ADM-001</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', gap: '12px', paddingBottom: '10px'}}>
                <span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>Designation</span>
                <span style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a', 'textAlign': 'right'}}>Super Admin</span>
              </div>
              <button onClick={saveProfile} disabled={profileSaving} style={{'marginTop': '6px', 'width': '100%', 'height': '46px', 'border': 'none', 'borderRadius': '12px', 'background': 'linear-gradient(180deg,#1a5e2e,#124423)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '14px', 'fontWeight': '700', 'cursor': 'pointer', 'boxShadow': '0 10px 20px -10px rgba(18,68,35,.7)', 'opacity': profileSaving ? 0.7 : 1}}>{profileSaving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </section>
          {/* company info */}
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Company Information</h3>
            <div style={{'display': 'flex', 'flexDirection': 'column', 'gap': '12px'}}>{ companyInfo.map((i, index) => (<div style={{display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottom: i.border, paddingBottom: '10px'}}><span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#8a9a8c'}}>{i.label}</span><span style={{'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a', 'textAlign': 'right'}}>{i.value}</span></div>))}</div>
          </section>
        </div>

        {/* access & permissions */}
        <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
          <h3 style={{'margin': '0 0 6px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Access & Permissions</h3>
          <p style={{'margin': '0 0 14px', 'fontSize': '12px', 'color': '#8a9a8c', 'fontWeight': '500'}}>Role: <b style={{'color': '#1a5e2e'}}>Super Admin</b> — full platform control</p>
          <div style={{'display': 'flex', 'gap': '8px', 'flexWrap': 'wrap', 'marginBottom': '16px'}}>
            { roles.map((r, index) => (<span style={r.style}>{r.label}</span>))}
          </div>
          <div style={{'display': 'grid', 'gridTemplateColumns': 'repeat(auto-fill,minmax(240px,1fr))', 'gap': '10px'}}>
            { permissions.map((p, index) => (
              <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '12px', 'padding': '12px 14px', 'border': '1px solid #eef3ec', 'borderRadius': '13px', 'background': '#fbfdfa'}}>
                <span style={{'flex': '1', 'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a'}}>{p.label}</span>
                <button onClick={p.toggle} style={p.trackStyle}><span style={p.knobStyle}></span></button>
              </div>
            ))}
          </div>
        </section>

        <div className="ad-g2">
          {/* security */}
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Security</h3>
            <div style={{'display': 'flex', 'flexDirection': 'column'}}>
              { security.map((s, index) => (
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 0', borderTop: s.border}}>
                  <span style={{'width': '34px', 'height': '34px', 'borderRadius': '10px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'flex': 'none'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a5e2e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d={s.icon}></path></svg></span>
                  <div style={{'flex': '1', 'minWidth': '0'}}><p style={{'margin': '0', 'fontSize': '13px', 'fontWeight': '700', 'color': '#16231a'}}>{s.label}</p><p style={{'margin': '2px 0 0', 'fontSize': '11px', 'color': '#8a9a8c', 'fontWeight': '500'}}>{s.meta}</p></div>
                  <span style={s.tagStyle}>{s.tag}</span>
                </div>
              ))}
            </div>
          </section>
          {/* subscription */}
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 12px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Subscription & Billing</h3>
            <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between', 'background': 'linear-gradient(120deg,#1a5e2e,#124423)', 'borderRadius': '14px', 'padding': '16px', 'marginBottom': '14px'}}>
              <div><p style={{'margin': '0', 'fontSize': '11px', 'fontWeight': '700', 'color': '#bcd6bd'}}>Current Plan</p><p style={{'margin': '4px 0 0', 'fontSize': '18px', 'fontWeight': '800', 'color': '#fff'}}>Enterprise</p><p style={{'margin': '3px 0 0', 'fontSize': '11px', 'color': '#bcd6bd'}}>Renews 01 Jan 2026 · Annual</p></div>
              <button style={{'height': '38px', 'padding': '0 16px', 'border': 'none', 'borderRadius': '11px', 'background': '#fff', 'color': '#12351d', 'fontFamily': 'inherit', 'fontSize': '12px', 'fontWeight': '700', 'cursor': 'pointer'}}>Upgrade</button>
            </div>
            <div style={{'display': 'flex', 'flexDirection': 'column', 'gap': '14px'}}>
              { usage.map((u, index) => (
                <div><div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginBottom': '6px'}}><span style={{'fontSize': '12px', 'fontWeight': '600', 'color': '#3d4f40'}}>{u.label}</span><span style={{'fontSize': '12px', 'fontWeight': '800', 'color': '#12351d'}}>{u.value}</span></div><div style={{'height': '8px', 'borderRadius': '6px', 'background': '#eef3ec', 'overflow': 'hidden'}}><div style={{width: u.pct, height: '100%', borderRadius: '6px', background: u.color}}></div></div></div>
              ))}
            </div>
            <div style={{'display': 'flex', 'gap': '10px', 'marginTop': '16px'}}><button style={{'flex': '1', 'height': '40px', 'border': '1px solid #d3e8cc', 'borderRadius': '11px', 'background': '#fff', 'color': '#1a5e2e', 'fontFamily': 'inherit', 'fontSize': '12px', 'fontWeight': '700', 'cursor': 'pointer'}}>Billing History</button><button style={{'flex': '1', 'height': '40px', 'border': '1px solid #d3e8cc', 'borderRadius': '11px', 'background': '#fff', 'color': '#1a5e2e', 'fontFamily': 'inherit', 'fontSize': '12px', 'fontWeight': '700', 'cursor': 'pointer'}}>Download Invoices</button></div>
          </section>
        </div>

        {/* notification prefs + quick actions */}
        <div className="ad-g2">
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Notification Preferences</h3>
            <div style={{'display': 'flex', 'flexDirection': 'column'}}>
              { notifPrefs.map((n, index) => (
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderTop: n.border}}><span style={{'flex': '1', 'fontSize': '12.5px', 'fontWeight': '600', 'color': '#16231a'}}>{n.label}</span><button onClick={n.toggle} style={n.trackStyle}><span style={n.knobStyle}></span></button></div>
              ))}
            </div>
          </section>
          <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
            <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Quick Actions</h3>
            <div style={{'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '10px'}}>
              { adminQuick.map((q, index) => (
                <button style={{'display': 'flex', 'alignItems': 'center', 'gap': '9px', 'padding': '12px', 'border': '1px solid #eef3ec', 'borderRadius': '12px', 'background': '#fbfdfa', 'color': '#3d4f40', 'fontFamily': 'inherit', 'fontSize': '12px', 'fontWeight': '700', 'cursor': 'pointer', 'textAlign': 'left'}}><span style={{'width': '30px', 'height': '30px', 'borderRadius': '9px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'flex': 'none'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a5e2e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d={q.icon}></path></svg></span>{q.label}</button>
              ))}
            </div>
          </section>
        </div>

        {/* audit logs */}
        <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '20px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
          <h3 style={{'margin': '0 0 14px', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>Audit & Activity Logs</h3>
          <div className="ad-tbl-wrap">
            <table style={{'width': '100%', 'borderCollapse': 'collapse', 'minWidth': '620px'}}>
              <thead><tr style={{'textAlign': 'left'}}><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 12px 10px 0'}}>Date</th><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 12px 10px 0'}}>Time</th><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 12px 10px 0'}}>Action</th><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 12px 10px 0'}}>User</th><th style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'padding': '0 0 10px 0'}}>Status</th></tr></thead>
              <tbody>
                { auditLogs.map((l, index) => (
                <tr style={{'borderTop': '1px solid #eef3ec'}}><td style={{'padding': '12px 12px 12px 0', 'fontSize': '12.5px', 'color': '#3d4f40'}}>{l.date}</td><td style={{'padding': '12px 12px 12px 0', 'fontSize': '12.5px', 'color': '#3d4f40'}}>{l.time}</td><td style={{'padding': '12px 12px 12px 0', 'fontSize': '12.5px', 'fontWeight': '700', 'color': '#16231a'}}>{l.action}</td><td style={{'padding': '12px 12px 12px 0', 'fontSize': '12.5px', 'color': '#3d4f40'}}>{l.user}</td><td style={{'padding': '12px 0'}}><span style={l.statusStyle}>{l.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
      )}

      {/* ============ PROPERTIES ============ */}
      {isProperties && (
      <div className="ad-fade" style={{'display': 'flex', 'flexDirection': 'column', 'gap': '18px', 'maxWidth': '1560px'}}>
        <div className="ad-kpi" style={{'gridTemplateColumns': 'repeat(4,1fr)'}}>
          { areaSummary.map((a, index) => (
            <div style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
              <div style={{'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between'}}>
                <span style={{'display': 'flex', 'alignItems': 'center', 'gap': '8px', 'fontSize': '14px', 'fontWeight': '800', 'color': '#12351d'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a5e2e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"></path></svg>{a.name}</span>
                <span style={{'fontSize': '10.5px', 'fontWeight': '800', 'color': '#1a5e2e', 'background': '#e9f4e6', 'borderRadius': '20px', 'padding': '4px 9px'}}>{a.projects} Projects</span>
              </div>
              <div style={{'marginTop': '14px', 'display': 'flex', 'gap': '10px'}}>
                <div style={{'flex': '1', 'textAlign': 'center'}}><p style={{'margin': '0', 'fontSize': '17px', 'fontWeight': '800', 'color': '#12351d'}}>{a.plots}</p><p style={{'margin': '2px 0 0', 'fontSize': '10px', 'fontWeight': '700', 'color': '#8a9a8c'}}>Total</p></div>
                <div style={{'flex': '1', 'textAlign': 'center'}}><p style={{'margin': '0', 'fontSize': '17px', 'fontWeight': '800', 'color': '#1a5e2e'}}>{a.booked}</p><p style={{'margin': '2px 0 0', 'fontSize': '10px', 'fontWeight': '700', 'color': '#1a8a4a'}}>Booked</p></div>
                <div style={{'flex': '1', 'textAlign': 'center'}}><p style={{'margin': '0', 'fontSize': '17px', 'fontWeight': '800', 'color': '#c2711f'}}>{a.available}</p><p style={{'margin': '2px 0 0', 'fontSize': '10px', 'fontWeight': '700', 'color': '#c2711f'}}>Available</p></div>
              </div>
              <div style={{'marginTop': '12px'}}><div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginBottom': '5px'}}><span style={{'fontSize': '10.5px', 'fontWeight': '700', 'color': '#8a9a8c'}}>Booked</span><span style={{'fontSize': '10.5px', 'fontWeight': '800', 'color': '#1a5e2e'}}>{a.pct}</span></div><div style={{'height': '7px', 'borderRadius': '5px', 'background': '#eef3ec', 'overflow': 'hidden'}}><div style={{width: a.pct, height: '100%', borderRadius: '5px', background: 'linear-gradient(90deg,#1a5e2e,#3f9159)'}}></div></div></div>
            </div>
          ))}
        </div>

        <div style={{'display': 'flex', 'gap': '9px', 'flexWrap': 'wrap'}}>
          { areaChips.map((t, index) => (<button onClick={t.pick} style={t.style}>{t.label}</button>))}
        </div>

        <div style={{'display': 'grid', 'gridTemplateColumns': 'repeat(auto-fill,minmax(320px,1fr))', 'gap': '16px'}}>
          { projects.map((p, index) => (
            <div style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'overflow': 'hidden', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
              <div style={{height: '118px', background: p.grad, position: 'relative'}}>
                <span style={p.statusStyle}>{p.status}</span>
                <span style={{'position': 'absolute', 'bottom': '12px', 'left': '14px', 'fontSize': '11.5px', 'fontWeight': '700', 'color': '#fff', 'textShadow': '0 1px 4px rgba(0,0,0,.4)'}}>{p.locality}</span>
              </div>
              <div style={{'padding': '16px'}}>
                <p style={{'margin': '0', 'fontSize': '15.5px', 'fontWeight': '800', 'color': '#12351d'}}>{p.name}</p>
                <p style={{'margin': '3px 0 0', 'fontSize': '12px', 'color': '#8a9a8c', 'fontWeight': '600'}}>{p.type} · {p.area}</p>
                <div style={{'marginTop': '14px', 'display': 'flex', 'gap': '8px'}}>
                  <div style={{'flex': '1', 'background': '#f4f7f2', 'borderRadius': '11px', 'padding': '9px', 'textAlign': 'center'}}><p style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>{p.total}</p><p style={{'margin': '1px 0 0', 'fontSize': '9.5px', 'fontWeight': '700', 'color': '#8a9a8c'}}>Total</p></div>
                  <div style={{'flex': '1', 'background': '#e9f4e6', 'borderRadius': '11px', 'padding': '9px', 'textAlign': 'center'}}><p style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#1a5e2e'}}>{p.booked}</p><p style={{'margin': '1px 0 0', 'fontSize': '9.5px', 'fontWeight': '700', 'color': '#1a8a4a'}}>Booked</p></div>
                  <div style={{'flex': '1', 'background': '#fdf3e8', 'borderRadius': '11px', 'padding': '9px', 'textAlign': 'center'}}><p style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#c2711f'}}>{p.available}</p><p style={{'margin': '1px 0 0', 'fontSize': '9.5px', 'fontWeight': '700', 'color': '#c2711f'}}>Left</p></div>
                </div>
                <div style={{'marginTop': '12px'}}><div style={{'display': 'flex', 'justifyContent': 'space-between', 'marginBottom': '5px'}}><span style={{'fontSize': '10.5px', 'fontWeight': '700', 'color': '#8a9a8c'}}>{p.pct} booked</span><span style={{'fontSize': '10.5px', 'fontWeight': '800', 'color': '#1a5e2e'}}>{p.revenue}</span></div><div style={{'height': '7px', 'borderRadius': '5px', 'background': '#eef3ec', 'overflow': 'hidden'}}><div style={{width: p.pct, height: '100%', borderRadius: '5px', background: 'linear-gradient(90deg,#1a5e2e,#3f9159)'}}></div></div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ============ DATA TABLE (generic per-tab) ============ */}
      {isTable && (
      <div className="ad-fade" style={{'maxWidth': '1560px'}}>
        <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '18px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)'}}>
          <div style={{'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'gap': '12px', 'marginBottom': '14px', 'flexWrap': 'wrap'}}>
            <h3 style={{'margin': '0', 'fontSize': '15px', 'fontWeight': '800', 'color': '#12351d'}}>{tableTitle}</h3>
            <div style={{'display': 'flex', 'alignItems': 'center', 'gap': '9px', 'height': '40px', 'background': '#f4f7f2', 'border': '1px solid #e7ede3', 'borderRadius': '11px', 'padding': '0 13px', 'minWidth': '200px'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a9a8c" stroke-width="1.9" stroke-linecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5"></path></svg><input placeholder="Search" style={{'flex': '1', 'border': 'none', 'background': 'transparent', 'fontFamily': 'inherit', 'fontSize': '13px', 'color': '#16231a'}} /></div>
          </div>
          <div className="ad-tbl-wrap">
            <table style={{'width': '100%', 'borderCollapse': 'collapse', 'minWidth': '720px'}}>
              <thead>
                <tr style={{'textAlign': 'left'}}>
                  {tableCols.map((h, index) => (
                    <th key={index} style={{'fontSize': '11px', 'fontWeight': '800', 'color': '#8a9a8c', 'textTransform': 'uppercase', 'letterSpacing': '.4px', 'padding': '0 14px 12px 0'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, rowIndex) => (
                  <tr key={rowIndex} style={{'borderTop': '1px solid #eef3ec'}}>
                    {r.map((c, colIndex) => (
                      <td key={colIndex} style={{'padding': '13px 14px 13px 0'}}>
                        <span style={c.style || {}}>{c.v}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      )}

      {/* ============ GENERIC ============ */}
      {isGeneric && (
      <div className="ad-fade" style={{'maxWidth': '1300px'}}>
        <section style={{'background': '#fff', 'border': '1px solid #e7ede3', 'borderRadius': '18px', 'padding': '44px', 'boxShadow': '0 14px 34px -28px rgba(18,53,29,.55)', 'display': 'flex', 'flexDirection': 'column', 'alignItems': 'center', 'textAlign': 'center', 'gap': '14px'}}>
          <span style={{'width': '64px', 'height': '64px', 'borderRadius': '20px', 'background': '#eef6ea', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center'}}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1a5e2e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={genericIcon}></path></svg></span>
          <div><p style={{'margin': '0', 'fontSize': '19px', 'fontWeight': '800', 'color': '#12351d'}}>{pageTitle}</p><p style={{'margin': '6px 0 0', 'fontSize': '13.5px', 'color': '#8a9a8c', 'fontWeight': '500', 'maxWidth': '440px'}}>{pageSub}</p></div>
          <button onClick={goDashboard} style={{'marginTop': '6px', 'height': '44px', 'padding': '0 20px', 'border': 'none', 'borderRadius': '12px', 'background': 'linear-gradient(180deg,#1a5e2e,#124423)', 'color': '#fff', 'fontFamily': 'inherit', 'fontSize': '13px', 'fontWeight': '700', 'cursor': 'pointer'}}>Back to Dashboard</button>
        </section>
      </div>
      )}

    </div>
  </main>
  </div>
  </>
  );
}
