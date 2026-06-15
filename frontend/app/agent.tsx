import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button } from "@/src/components/Button";
import { PropertyMedia } from "@/src/components/PropertyMedia";
import { mockProperties } from "@/src/mock-data";
import { colors, formatINRFull, radii, shadow, spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";

type AgentDashboardData = {
  profile: any;
  sub_agents: any[];
  assets: any[];
  bookings: any[];
  visits?: any[];
};

type CrmDashboardData = {
  leads: any[];
  opportunities: any[];
  tasks: any[];
  activities: any[];
  metrics?: Record<string, number>;
  stage_counts?: Record<string, number>;
  lost_reasons?: Record<string, number>;
};

type PageKey =
  | "home"
  | "properties"
  | "bookings"
  | "visits"
  | "leads"
  | "pipeline"
  | "tasks"
  | "activities"
  | "agents"
  | "notifications"
  | "profile";

type BookingStep = 1 | 2 | 3 | 4;

const NAV_ITEMS: { key: PageKey; label: string; icon: any }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "properties", label: "Properties", icon: "map" },
  { key: "bookings", label: "Bookings", icon: "file-text" },
  { key: "visits", label: "Site Visits", icon: "calendar" },
  { key: "leads", label: "Leads", icon: "users" },
  { key: "pipeline", label: "Pipeline", icon: "bar-chart-2" },
  { key: "tasks", label: "Tasks", icon: "check-square" },
  { key: "activities", label: "Activities", icon: "clock" },
  { key: "agents", label: "My Agents", icon: "users" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "profile", label: "Profile", icon: "user" },
];

const BOOKING_STEPS = ["Property", "Customer", "Confirmation", "Updated"];
const BOOKING_TABS = ["pending", "approval requested", "approved", "confirmed", "ongoing", "site visit scheduled", "completed", "cancelled", "closed"];
const AGENT_DASHBOARD_CACHE_KEY = "rivan_agent_dashboard_cache";
const CRM_PIPELINE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "site_visit_scheduled",
  "site_visit_completed",
  "negotiation",
  "booking_requested",
  "booked",
  "closed_won",
  "closed_lost",
];

const demoCustomers = [
  { id: "CUST-1021", name: "Ramesh Kumar", phone: "+91 98765 43210", email: "ramesh.kumar@email.com" },
  { id: "CUST-1056", name: "Suresh Reddy", phone: "+91 91234 56789", email: "suresh.reddy@email.com" },
  { id: "CUST-1103", name: "Anita Sharma", phone: "+91 88990 11223", email: "anita.sharma@email.com" },
];

const TEMP_PUBLIC_AGENT_PREVIEW =
  Platform.OS === "web" && typeof window !== "undefined" && ["rivan-auth-live.web.app", "rivan-auth-live.firebaseapp.com"].includes(window.location.hostname);

const previewAgentUser = {
  id: "agent-preview-001",
  name: "Rivan Preview Agent",
  email: "agent-preview@rivanreality.com",
  phone: "9876543210",
  role: "agent",
  approval_status: "approved",
  agent_brand_name: "Rivan Crest Partners",
};

function createPreviewAgentDashboard(): AgentDashboardData {
  const assets = mockProperties.map((property, index) => ({
    id: `asset-preview-${index + 1}`,
    property_id: property.id,
    property_name: property.name,
    property_location: property.location,
    property_image: property.image,
    property_video_url: property.videoUrl,
    plot_number: property.plot_number || `P-${index + 1}`,
    survey_number: property.survey_number,
    facing: property.facing,
    road_width: property.road_width,
    availability: property.availability,
    starting_price: property.starting_price,
    size: property.size,
    category: property.category,
    agent_name: previewAgentUser.name,
  }));

  return {
    profile: previewAgentUser,
    sub_agents: [
      { id: "sub-preview-001", name: "Preview Sub-Agent", phone: "9123456789", email: "subagent@rivanreality.com", status: "active" },
    ],
    assets,
    bookings: [
      {
        id: "booking-preview-001",
        property_id: mockProperties[0]?.id,
        property_name: mockProperties[0]?.name || "Rivan Greens",
        plot_number: mockProperties[0]?.plot_number || "P-005",
        status: "pending",
        name: demoCustomers[0].name,
        mobile: demoCustomers[0].phone,
        created_at: new Date().toISOString(),
        customer_id: demoCustomers[0].id,
      },
    ],
    visits: [
      {
        id: "visit-preview-001",
        property_id: mockProperties[1]?.id,
        property_name: mockProperties[1]?.name || "Rivan Heritage Villas",
        plot_number: mockProperties[1]?.plot_number || "V-03",
        customer_id: demoCustomers[1].id,
        customer_name: demoCustomers[1].name,
        customer_phone: demoCustomers[1].phone,
        visit_date: "2026-06-25",
        visit_time: "10:30 AM",
        status: "scheduled",
        notes: "Hosted preview visit scheduled for demo purposes.",
        created_at: new Date().toISOString(),
      },
    ],
  };
}

function createPreviewCrmDashboard(): CrmDashboardData {
  return {
    leads: [
      {
        id: "lead-preview-001",
        name: demoCustomers[0].name,
        phone: demoCustomers[0].phone,
        email: demoCustomers[0].email,
        source: "website",
        status: "qualified",
        assigned_agent_id: previewAgentUser.id,
        tags: ["High Intent", "Villa"],
        customer_preferences: { budget: "1.2Cr - 1.5Cr", location: "Kokapet", unit_type: "Villa" },
        notes_summary: "Requested walkthrough and brochure.",
        next_follow_up_at: "2026-06-18T10:30:00.000Z",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    opportunities: [
      {
        id: "opp-preview-001",
        lead_id: "lead-preview-001",
        property_id: mockProperties[1]?.id,
        property_name: mockProperties[1]?.name || "Rivan Heritage Villas",
        assigned_agent_id: previewAgentUser.id,
        stage: "site_visit_scheduled",
        expected_value: mockProperties[1]?.starting_price || 14500000,
        priority: "high",
        visit_ids: ["visit-preview-001"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    tasks: [
      {
        id: "task-preview-001",
        lead_id: "lead-preview-001",
        assigned_to_user_id: previewAgentUser.id,
        task_type: "follow_up",
        title: "Call customer after brochure share",
        description: "Confirm site visit attendance and answer pricing questions.",
        due_at: "2026-06-17T09:00:00.000Z",
        priority: "high",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    activities: [
      {
        id: "activity-preview-001",
        lead_id: "lead-preview-001",
        opportunity_id: "opp-preview-001",
        actor_user_id: previewAgentUser.id,
        activity_type: "note",
        message: "Customer asked for villa-facing options and clubhouse details.",
        created_at: new Date().toISOString(),
      },
    ],
    metrics: {
      leads: 1,
      opportunities: 1,
      overdue_tasks: 0,
      due_today: 1,
    },
    stage_counts: {
      site_visit_scheduled: 1,
    },
    lost_reasons: {},
  };
}

const emptyAgentForm = {
  name: "",
  phone: "",
  email: "",
  age: "",
  aadhaar_number: "",
  bank_details: "",
  status: "active",
};

const pageTitles: Record<PageKey, { title: string; subtitle: string }> = {
  home: { title: "Agent Command Center", subtitle: "Pipeline, inventory, bookings, visits, and customer activity at a glance." },
  properties: { title: "Properties", subtitle: "Search inventory, manage plots, and work from a visual layout." },
  bookings: { title: "Bookings", subtitle: "Track customer bookings from request to closure." },
  visits: { title: "Site Visits", subtitle: "Plan, reschedule, route, and review visit outcomes." },
  leads: { title: "CRM Leads", subtitle: "All prospects, owners, follow-up dates, and sales ownership in one place." },
  pipeline: { title: "Pipeline", subtitle: "Track every opportunity from first contact to booking or loss." },
  tasks: { title: "CRM Tasks", subtitle: "Follow-ups due today, overdue reminders, and deal actions." },
  activities: { title: "CRM Activity", subtitle: "A chronological timeline of updates across leads and opportunities." },
  agents: { title: "My Agents", subtitle: "Manage sub-agents, portfolio coverage, activity, and account status." },
  notifications: { title: "Notifications", subtitle: "Operational updates from bookings, visits, inventory, and agents." },
  profile: { title: "Profile", subtitle: "Agent identity, manager approval, bank, Aadhaar, and account details." },
};

export default function AgentDashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string; assetId?: string; propertyId?: string; step?: string }>();
  const { user, signOut } = useAuth();
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const isDark = scheme === "dark";
  const isDesktop = width >= 1100;
  const isTablet = width >= 760;
  const isMobile = width < 760;
  const theme = useMemo(() => createTheme(isDark), [isDark]);
  const previewMode = TEMP_PUBLIC_AGENT_PREVIEW && !user;
  const effectiveUser = (previewMode ? previewAgentUser : user) as any;

  const [data, setData] = useState<AgentDashboardData | null>(null);
  const [crmData, setCrmData] = useState<CrmDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [bookingTab, setBookingTab] = useState("pending");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [drawerMode, setDrawerMode] = useState<"property" | "plot" | "agent" | null>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>(1);
  const [selectedCustomer, setSelectedCustomer] = useState(demoCustomers[0]);
  const [savingBooking, setSavingBooking] = useState(false);
  const [agentEditorOpen, setAgentEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [agentForm, setAgentForm] = useState<any>(emptyAgentForm);
  const [savingAgent, setSavingAgent] = useState(false);
  const [visitDraft, setVisitDraft] = useState({
    visit_date: "2026-06-25",
    visit_time: "10:30 AM",
    notes: "Share layout details and preferred booking options with the customer.",
  });
  const [savingVisit, setSavingVisit] = useState(false);
  const [reschedulingVisitId, setReschedulingVisitId] = useState<string | null>(null);
  const [bookingFlowOpen, setBookingFlowOpen] = useState(false);
  const [bookingFlowLoading, setBookingFlowLoading] = useState(false);
  const [bookingFlowLoadingText, setBookingFlowLoadingText] = useState("Preparing booking journey...");
  const [maxBookingStepUnlocked, setMaxBookingStepUnlocked] = useState<BookingStep>(1);
  const [actionPulse, setActionPulse] = useState<string | null>(null);
  const handledRouteActionRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (previewMode) {
      setData(createPreviewAgentDashboard());
      setCrmData(createPreviewCrmDashboard());
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [response, visitResponse, crmResponse] = await Promise.all([
        api.agentDashboard(),
        api.agentSiteVisits().catch(() => []),
        api.crmAgentDashboard().catch(() => null),
      ]);
      const nextData = { ...(response as AgentDashboardData), visits: Array.isArray(visitResponse) ? visitResponse : [] };
      setData(nextData);
      setCrmData((crmResponse as CrmDashboardData | null) || null);
      await storage.setItem(AGENT_DASHBOARD_CACHE_KEY, JSON.stringify({ dashboard: nextData, crm: crmResponse || null }));
    } catch (error: any) {
      Alert.alert("Agent dashboard", error.message || "Unable to load agent data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [previewMode]);

  useEffect(() => {
    storage.getItem(AGENT_DASHBOARD_CACHE_KEY, "").then((raw) => {
      if (!raw || typeof raw !== "string") return;
      try {
        const parsed = JSON.parse(raw) as any;
        setData((parsed.dashboard || parsed) as AgentDashboardData);
        setCrmData((parsed.crm || null) as CrmDashboardData | null);
        setLoading(false);
      } catch {
        // ignore malformed cache
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!actionPulse) return;
    const timeout = setTimeout(() => setActionPulse(null), 2200);
    return () => clearTimeout(timeout);
  }, [actionPulse]);

  function pulse(message: string) {
    setActionPulse(message);
  }

  function refreshInBackground() {
    void load();
  }

  async function runBookingTransition(targetStep: BookingStep, message: string) {
    setBookingFlowLoadingText(message);
    setBookingFlowLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 320));
    setBookingStep(targetStep);
    setMaxBookingStepUnlocked((current) => (targetStep > current ? targetStep : current));
    setBookingFlowLoading(false);
  }

  async function closeBooking(bookingId: string) {
    setData((current) => current ? {
      ...current,
      bookings: (current.bookings || []).map((booking: any) => booking.id === bookingId ? { ...booking, status: "closed", closed_at: new Date().toISOString() } : booking),
    } : current);
    pulse("Booking closed");
    try {
      await api.agentCloseBooking(bookingId);
      refreshInBackground();
    } catch (error: any) {
      refreshInBackground();
      Alert.alert("Unable to update", error.message || "Could not close this booking.");
    }
  }

  async function updateBookingStatus(bookingId: string, status: string) {
    setData((current) => current ? {
      ...current,
      bookings: (current.bookings || []).map((booking: any) => booking.id === bookingId ? { ...booking, status } : booking),
    } : current);
    pulse(`Booking moved to ${titleCase(status)}`);
    try {
      await api.agentUpdateBookingStatus(bookingId, status);
      refreshInBackground();
    } catch (error: any) {
      refreshInBackground();
      Alert.alert("Unable to update booking", error.message || "Please try again.");
    }
  }

  async function updateVisitStatus(visitId: string, status: string) {
    setData((current) => current ? {
      ...current,
      visits: (current.visits || []).map((visit: any) => visit.id === visitId ? { ...visit, status } : visit),
    } : current);
    pulse(`Visit ${titleCase(status)}`);
    try {
      await api.agentUpdateSiteVisit(visitId, { status });
      refreshInBackground();
    } catch (error: any) {
      refreshInBackground();
      Alert.alert("Unable to update visit", error.message || "Please try again.");
    }
  }

  async function updateCrmOpportunityStage(opportunityId: string, stage: string, lostReason?: string) {
    setCrmData((current) => current ? {
      ...current,
      opportunities: (current.opportunities || []).map((opportunity: any) => (
        opportunity.id === opportunityId
          ? {
              ...opportunity,
              stage,
              lost_reason: lostReason || opportunity.lost_reason,
              closed_at: stage === "closed_lost" || stage === "closed_won" || stage === "booked" ? new Date().toISOString() : opportunity.closed_at,
              updated_at: new Date().toISOString(),
            }
          : opportunity
      )),
      activities: [
        {
          id: `optimistic-stage-${Date.now()}`,
          activity_type: "opportunity_updated",
          message: `Opportunity moved to ${titleCase(stage.replace(/_/g, " "))}.`,
          created_at: new Date().toISOString(),
        },
        ...(current.activities || []),
      ].slice(0, 50),
    } : current);
    pulse(`Pipeline updated: ${titleCase(stage.replace(/_/g, " "))}`);
    try {
      await api.updateOpportunityStage(opportunityId, {
        stage,
        lost_reason: lostReason,
      });
      refreshInBackground();
    } catch (error: any) {
      refreshInBackground();
      Alert.alert("Unable to update opportunity", error.message || "Please try again.");
    }
  }

  async function completeCrmTask(taskId: string) {
    setCrmData((current) => current ? {
      ...current,
      tasks: (current.tasks || []).map((task: any) => task.id === taskId ? { ...task, status: "completed", completed_at: new Date().toISOString() } : task),
      activities: [
        {
          id: `optimistic-task-${Date.now()}`,
          activity_type: "task_completed",
          message: "Task completed.",
          created_at: new Date().toISOString(),
        },
        ...(current.activities || []),
      ].slice(0, 50),
    } : current);
    pulse("Task completed");
    try {
      await api.completeTask(taskId, {});
      refreshInBackground();
    } catch (error: any) {
      refreshInBackground();
      Alert.alert("Unable to complete task", error.message || "Please try again.");
    }
  }

  async function updateAgentStatus(agentId: string, status: string) {
    try {
      await api.agentUpdateSubAgentStatus(agentId, status);
      await load();
      Alert.alert("Updated", `Agent status changed to ${titleCase(status)}.`);
    } catch (error: any) {
      Alert.alert("Unable to update agent", error.message || "Please try again.");
    }
  }

  function openAgentEditor(agent?: any) {
    setEditingAgent(agent || null);
    setAgentForm(agent ? {
      name: agent.name || "",
      phone: agent.phone || "",
      email: agent.email || "",
      age: agent.age ? String(agent.age) : "",
      aadhaar_number: agent.aadhaar_number || "",
      bank_details: agent.bank_details || "",
      status: agent.status || "active",
    } : emptyAgentForm);
    setAgentEditorOpen(true);
  }

  async function saveAgent() {
    if (!agentForm.name.trim()) {
      Alert.alert("Agent management", "Agent name is required.");
      return;
    }
    if (!agentForm.phone.trim() && !agentForm.email.trim()) {
      Alert.alert("Agent management", "Add either phone number or email.");
      return;
    }
    setSavingAgent(true);
    try {
      const payload = {
        ...agentForm,
        name: agentForm.name.trim(),
        phone: agentForm.phone.trim() || undefined,
        email: agentForm.email.trim() || undefined,
        age: agentForm.age ? Number(agentForm.age) : undefined,
      };
      if (editingAgent?.id) {
        await api.agentUpdateSubAgent(editingAgent.id, payload);
      } else {
        await api.agentCreateSubAgent(payload);
      }
      await load();
      setAgentEditorOpen(false);
      Alert.alert("Agent management", editingAgent?.id ? "Agent updated." : "Agent added.");
    } catch (error: any) {
      Alert.alert("Unable to save agent", error.message || "Please check the details and try again.");
    } finally {
      setSavingAgent(false);
    }
  }

  async function submitAgentBooking() {
    if (!selectedAsset?.id) {
      Alert.alert("Booking", "Select a property asset before confirming the booking.");
      return;
    }
    if (!isBookableAsset(selectedAsset)) {
      Alert.alert("Booking", "Select a bookable property asset before confirming the booking.");
      return;
    }
    if (!selectedCustomer?.name?.trim() || !selectedCustomer?.phone?.trim()) {
      Alert.alert("Booking", "Customer name and phone number are required.");
      return;
    }
    setSavingBooking(true);
    setBookingFlowLoadingText("Confirming booking...");
    setBookingFlowLoading(true);
    try {
      const optimisticId = `booking-${Date.now()}`;
      const optimisticBooking = {
        id: optimisticId,
        plot_id: selectedAsset.id,
        property_id: selectedAsset.property_id,
        property_name: selectedAsset.property_name,
        agent_id: profile?.id,
        agent_name: profile?.name,
        name: selectedCustomer.name.trim(),
        mobile: selectedCustomer.phone.trim(),
        customer_email: selectedCustomer.email?.trim() || undefined,
        status: "approval requested",
        created_at: new Date().toISOString(),
        customer: {
          id: selectedCustomer.id,
          name: selectedCustomer.name.trim(),
          phone: selectedCustomer.phone.trim(),
          email: selectedCustomer.email?.trim() || undefined,
        },
      };
      setData((current) => current ? {
        ...current,
        bookings: [optimisticBooking, ...(current.bookings || [])],
      } : current);
      pulse("Booking created");
      await api.agentCreateBooking({
        plot_id: selectedAsset.id,
        customer_name: selectedCustomer.name.trim(),
        customer_phone: selectedCustomer.phone.trim(),
        customer_email: selectedCustomer.email?.trim() || undefined,
        notes: "Created from Agent Dashboard booking workflow.",
      });
      refreshInBackground();
      await new Promise((resolve) => setTimeout(resolve, 380));
      setMaxBookingStepUnlocked(4);
      setBookingStep(4);
    } catch (error: any) {
      refreshInBackground();
      Alert.alert("Unable to create booking", error.message || "Please check the details and try again.");
    } finally {
      setBookingFlowLoading(false);
      setSavingBooking(false);
    }
  }

  async function submitSiteVisit() {
    if (!selectedAsset?.id) {
      Alert.alert("Site visit", "Select a property asset before scheduling the site visit.");
      return;
    }
    if (!selectedCustomer?.name?.trim() || !selectedCustomer?.phone?.trim()) {
      Alert.alert("Site visit", "Customer name and phone number are required.");
      return;
    }
    setSavingVisit(true);
    try {
      const optimisticVisit = {
        id: reschedulingVisitId || `visit-${Date.now()}`,
        property_id: selectedAsset?.property_id,
        plot_id: selectedAsset?.id,
        property_name: selectedAsset?.property_name,
        customer_id: selectedCustomer?.id?.trim() || undefined,
        customer_name: selectedCustomer?.name?.trim(),
        customer_phone: selectedCustomer?.phone?.trim(),
        customer_email: selectedCustomer?.email?.trim() || undefined,
        visit_date: visitDraft.visit_date,
        visit_time: visitDraft.visit_time,
        notes: visitDraft.notes?.trim() || undefined,
        status: reschedulingVisitId ? "rescheduled" : "scheduled",
        assigned_agent_name: profile?.name,
        created_at: new Date().toISOString(),
      };
      setData((current) => {
        if (!current) return current;
        const existing = current.visits || [];
        const nextVisits = reschedulingVisitId
          ? existing.map((visit: any) => visit.id === reschedulingVisitId ? { ...visit, ...optimisticVisit } : visit)
          : [optimisticVisit, ...existing];
        return { ...current, visits: nextVisits };
      });
      pulse(reschedulingVisitId ? "Visit rescheduled" : "Visit scheduled");
      if (reschedulingVisitId) {
        await api.agentUpdateSiteVisit(reschedulingVisitId, {
          customer_id: selectedCustomer?.id?.trim() || undefined,
          customer_name: selectedCustomer?.name?.trim(),
          customer_phone: selectedCustomer?.phone?.trim(),
          customer_email: selectedCustomer?.email?.trim() || undefined,
          visit_date: visitDraft.visit_date,
          visit_time: visitDraft.visit_time,
          notes: visitDraft.notes?.trim() || undefined,
          status: "rescheduled",
        });
      } else {
        await api.agentCreateSiteVisit({
          property_id: selectedAsset.property_id,
          plot_id: selectedAsset.id,
          customer_id: selectedCustomer.id?.trim() || undefined,
          customer_name: selectedCustomer.name.trim(),
          customer_phone: selectedCustomer.phone.trim(),
          customer_email: selectedCustomer.email?.trim() || undefined,
          visit_date: visitDraft.visit_date,
          visit_time: visitDraft.visit_time,
          notes: visitDraft.notes?.trim() || undefined,
        });
      }
      refreshInBackground();
      setReschedulingVisitId(null);
    } catch (error: any) {
      refreshInBackground();
      Alert.alert("Unable to schedule visit", error.message || "Please review the visit details and try again.");
    } finally {
      setSavingVisit(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.replace("/agent-login");
  }

  function openDrawer(mode: "property" | "plot" | "agent", asset?: any) {
    setDrawerMode(mode);
    if (asset) {
      setSelectedAsset(asset);
      setSelectedPropertyId(asset.property_id);
    }
  }

  function closeDrawer() {
    setDrawerMode(null);
  }

  function goToPage(page: PageKey) {
    setActivePage(page);
    setMobileMenuOpen(false);
  }

  function startBooking(asset: any, step: BookingStep = 1) {
    const propertyAssets = assets.filter((item) => item.property_id === asset?.property_id);
    const nextAsset = isBookableAsset(asset) ? asset : propertyAssets.find(isBookableAsset) || asset;
    setSelectedAsset(nextAsset);
    setSelectedPropertyId(nextAsset?.property_id || asset?.property_id || null);
    setBookingStep(step);
    setMaxBookingStepUnlocked(step);
    setBookingFlowLoadingText("Preparing booking journey...");
    setBookingFlowLoading(true);
    setBookingFlowOpen(true);
    setDrawerMode(null);
    setTimeout(() => setBookingFlowLoading(false), 360);
  }

  function closeBookingFlow() {
    setBookingFlowOpen(false);
    setBookingFlowLoading(false);
  }

  async function continueBookingFlow() {
    if (bookingStep === 1) {
      if (!selectedAsset?.id || !isBookableAsset(selectedAsset)) {
        Alert.alert("Booking", "Choose a bookable property asset to continue.");
        return;
      }
      await runBookingTransition(2, "Loading customer details...");
      return;
    }
    if (bookingStep === 2) {
      if (!selectedCustomer?.id?.trim() || !selectedCustomer?.name?.trim() || !selectedCustomer?.phone?.trim()) {
        Alert.alert("Booking", "Customer ID, name, and phone number are required to continue.");
        return;
      }
      await runBookingTransition(3, "Preparing confirmation...");
      return;
    }
    if (bookingStep === 3) {
      await submitAgentBooking();
    }
  }

  async function goBackBookingFlow() {
    if (bookingStep <= 1) return;
    const targetStep = Math.max(1, bookingStep - 1) as BookingStep;
    await runBookingTransition(targetStep, "Going back...");
  }

  function startVisit(asset: any) {
    setSelectedAsset(asset);
    setActivePage("visits");
    setDrawerMode(null);
    setReschedulingVisitId(null);
    setVisitDraft({
      visit_date: "2026-06-25",
      visit_time: "10:30 AM",
      notes: `Visit requested for ${asset?.plot_number || asset?.id || "selected asset"}.`,
    });
  }

  function startVisitReschedule(visit: any) {
    const matchedAsset =
      assets.find((asset) => asset.id === visit.plotId) ||
      assets.find((asset) => asset.id === visit.plot) ||
      assets.find((asset) => asset.property_id === visit.propertyId) ||
      selectedAsset;
    setSelectedAsset(matchedAsset || null);
    setSelectedCustomer(visit.customer);
    setActivePage("visits");
    setDrawerMode(null);
    setReschedulingVisitId(visit.id);
    setVisitDraft({
      visit_date: visit.date || "2026-06-25",
      visit_time: visit.time || "10:30 AM",
      notes: visit.notes || `Reschedule requested for ${visit.plot || visit.id}.`,
    });
  }

  const isAgent = effectiveUser?.role === "agent" || effectiveUser?.role === "sub_agent";
  const profile = data?.profile || effectiveUser;
  const assets = data?.assets || [];
  const subAgents = data?.sub_agents || [];
  const bookings = data?.bookings || [];

  const propertyGroups = useMemo(() => {
    const grouped = new Map<string, any>();
    for (const asset of assets) {
      const propertyId = asset.property_id || "unlinked";
      const existing = grouped.get(propertyId);
      if (existing) {
        existing.assets.push(asset);
        existing.startingPrice = Math.min(existing.startingPrice, Number(asset.price || existing.startingPrice || 0));
      } else {
        grouped.set(propertyId, {
          id: propertyId,
          name: asset.property_name || "Portfolio Property",
          location: asset.location || asset.property_location || "Hyderabad",
          image: asset.property_image,
          videoUrl: asset.property_video_url,
          startingPrice: Number(asset.price || 0),
          views: 1200 + grouped.size * 340,
          totalBookings: 8 + grouped.size * 3,
          assets: [asset],
        });
      }
    }
    return Array.from(grouped.values());
  }, [assets]);

  const selectedProperty = useMemo(() => {
    return propertyGroups.find((property) => property.id === selectedPropertyId) || null;
  }, [propertyGroups, selectedPropertyId]);

  const filteredProperties = useMemo(() => {
    const query = search.trim().toLowerCase();
    return propertyGroups.filter((property) => {
      return !query || `${property.name} ${property.location}`.toLowerCase().includes(query);
    });
  }, [propertyGroups, search]);

  const enrichedBookings = useMemo(() => {
    return bookings.map((booking, index) => {
      const asset = assets.find((item) => item.id === booking.plot_id || item.id === booking.asset_id || item.property_id === booking.property_id);
      const status = String(booking.status || (index % 3 === 0 ? "confirmed" : "pending")).toLowerCase();
      return {
        ...booking,
        asset,
        status,
        agent_name: booking.agent_name || asset?.agent_name || profile?.name || "Agent",
        customer: {
          id: booking.customer?.id || booking.customer_id || booking.user_id || `CUST-${1021 + index}`,
          name: booking.customer?.name || booking.name || demoCustomers[index % demoCustomers.length].name,
          phone: booking.customer?.phone || booking.mobile || demoCustomers[index % demoCustomers.length].phone,
          email: booking.customer?.email || demoCustomers[index % demoCustomers.length].email,
        },
      };
    });
  }, [assets, bookings, profile?.name]);

  const filteredBookings = useMemo(() => {
    return enrichedBookings.filter((booking) => booking.status === bookingTab);
  }, [bookingTab, enrichedBookings]);

  const visits = useMemo(() => {
    if (data?.visits?.length) {
      return data.visits.map((visit, index) => ({
        id: visit.id,
        propertyId: visit.property_id,
        plotId: visit.plot_id,
        property: propertyGroups.find((property) => property.id === visit.property_id)?.name || visit.property_name || visit.property_id,
        plot: visit.plot_id || "-",
        customer: {
          id: visit.customer_id || `CUST-${1300 + index}`,
          name: visit.customer_name || "Customer",
          phone: visit.customer_phone || "-",
          email: visit.customer_email || "-",
        },
        agent: visit.assigned_agent_name || profile?.name || "Agent",
        date: visit.visit_date,
        time: visit.visit_time,
        statusRaw: String(visit.status || "upcoming").toLowerCase(),
        status: titleCase(visit.status || "upcoming"),
        notes: visit.notes || "No notes added.",
      }));
    }
    const source = assets.slice(0, 6);
    return source.map((asset, index) => ({
      id: `VIS-${3400 + index}`,
      propertyId: asset.property_id,
      plotId: asset.id,
      property: asset.property_name || "Property",
      plot: asset.plot_number || asset.id,
      customer: demoCustomers[index % demoCustomers.length],
      agent: asset.agent_name || profile?.name || "Agent",
      date: index < 3 ? `2026-06-${12 + index}` : `2026-05-${20 + index}`,
      time: index % 2 === 0 ? "10:30 AM" : "04:00 PM",
      statusRaw: index < 3 ? "upcoming" : index === 3 ? "cancelled" : "completed",
      status: index < 3 ? "Upcoming" : index === 3 ? "Cancelled" : "Completed",
      notes: index % 2 === 0 ? "Customer requested compound wall estimate." : "Prefers weekend follow-up.",
    }));
  }, [assets, data?.visits, profile?.name, propertyGroups]);

  const notifications = useMemo(() => {
    return [
      { id: "N-01", type: "New Booking", text: "Booking request received for a premium plot.", time: "12 min ago", icon: "file-plus" },
      { id: "N-02", type: "Site Visit Request", text: "Customer asked to reschedule tomorrow morning.", time: "45 min ago", icon: "calendar" },
      { id: "N-03", type: "Property Update", text: "Inventory coverage changed for two customer-facing assets.", time: "2 hr ago", icon: "map-pin" },
      { id: "N-04", type: "Agent Activity", text: "Sub-agent updated lead notes on Green Valley.", time: "Today", icon: "users" },
    ];
  }, []);

  const crmLeads = crmData?.leads || [];
  const crmOpportunities = crmData?.opportunities || [];
  const crmTasks = crmData?.tasks || [];
  const crmActivities = crmData?.activities || [];

  const metrics = useMemo(() => {
    const pending = enrichedBookings.filter((booking) => booking.status === "pending").length;
    const upcomingVisits = visits.filter((visit) => getVisitBucket(visit.statusRaw || visit.status) === "upcoming").length;

    return {
      totalProperties: propertyGroups.length,
      active: assets.length,
      pending,
      upcomingVisits,
      conversion: assets.length ? Math.round((enrichedBookings.length / assets.length) * 100) : 0,
      visitConversion: visits.length ? Math.round((visits.filter((visit) => getVisitBucket(visit.statusRaw || visit.status) === "completed").length / visits.length) * 100) : 0,
    };
  }, [assets, enrichedBookings, propertyGroups.length, visits]);

  useEffect(() => {
    if (!data) return;
    const routeKey = JSON.stringify({
      action: params.action || "",
      assetId: params.assetId || "",
      propertyId: params.propertyId || "",
      step: params.step || "",
    });
    if (!params.action || handledRouteActionRef.current === routeKey) return;

    const matchedAsset =
      assets.find((item) => item.id === params.assetId) ||
      assets.find((item) => item.property_id === params.propertyId) ||
      null;

    if (!matchedAsset) return;

    handledRouteActionRef.current = routeKey;
    if (params.action === "booking") {
      startBooking(matchedAsset, 1);
      return;
    }
    if (params.action === "visit") {
      startVisit(matchedAsset);
      return;
    }
    if (params.action === "details") {
      setSelectedAsset(matchedAsset);
      setSelectedPropertyId(matchedAsset.property_id);
      openDrawer("property", matchedAsset);
    }
  }, [assets, data, params.action, params.assetId, params.propertyId, params.step]);

  if (!isAgent) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.emptyState}>
          <Feather name="lock" size={42} color={theme.muted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Agent access required</Text>
          <Text style={[styles.emptyText, { color: theme.subtle }]}>Only authenticated agent accounts can open this dashboard.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.brand} />
        <Text style={[styles.loadingText, { color: theme.subtle }]}>Loading agent workspace...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <View style={styles.shell}>
        {isDesktop ? (
          <Sidebar
            theme={theme}
            activePage={activePage}
            profile={profile}
            onNavigate={goToPage}
            onLogout={handleLogout}
          />
        ) : null}

        <View style={styles.workspace}>
          <TopBar
            theme={theme}
            title={pageTitles[activePage].title}
            subtitle={pageTitles[activePage].subtitle}
            profile={profile}
            isDesktop={isDesktop}
            onMenu={() => setMobileMenuOpen(true)}
            onLogout={handleLogout}
          />

          {actionPulse ? (
            <View style={[styles.liveBanner, { backgroundColor: theme.brandSoft, borderColor: theme.border }]}>
              <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.liveBannerText, { color: theme.brand }]}>{actionPulse}</Text>
              <Text style={[styles.liveBannerSubtle, { color: theme.subtle }]}>Syncing in background</Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={[
              styles.content,
              isDesktop ? styles.contentDesktop : null,
              isMobile ? styles.contentMobile : null,
              { paddingBottom: isMobile ? 96 : spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {activePage === "home" ? (
              <HomePage
                theme={theme}
                isTablet={isTablet}
                metrics={metrics}
                properties={propertyGroups}
                bookings={enrichedBookings}
                visits={visits}
                onProperty={(property: any) => {
                  setSelectedPropertyId(property.id);
                  openDrawer("property", property.assets[0]);
                }}
                onLayout={(property: any) => router.push(`/layout/${property.id}`)}
                onBook={(asset: any) => startBooking(asset)}
                onVisit={(asset: any) => startVisit(asset)}
              />
            ) : null}

            {activePage === "properties" ? (
              <PropertiesPage
                theme={theme}
                isTablet={isTablet}
                properties={filteredProperties}
                search={search}
                viewMode={viewMode}
                onSearch={setSearch}
                onViewMode={setViewMode}
                onOpenProperty={(property: any) => {
                  setSelectedPropertyId(property.id);
                  openDrawer("property", property.assets[0]);
                }}
                onLayout={(property: any) => router.push(`/layout/${property.id}`)}
                onBook={(asset: any) => startBooking(asset)}
                onVisit={(asset: any) => startVisit(asset)}
              />
            ) : null}

            {activePage === "bookings" ? (
              <BookingsPage
                theme={theme}
                bookings={filteredBookings}
                bookingTab={bookingTab}
                onTab={setBookingTab}
                onUpdateBookingStatus={updateBookingStatus}
                onCloseBooking={closeBooking}
              />
            ) : null}

            {activePage === "visits" ? (
              <VisitsPage
                theme={theme}
                isTablet={isTablet}
                visits={visits}
                subAgents={subAgents}
                selectedAsset={selectedAsset}
                selectedCustomer={selectedCustomer}
                visitDraft={visitDraft}
                onVisitDraft={setVisitDraft}
                onCustomer={setSelectedCustomer}
                onScheduleVisit={submitSiteVisit}
                savingVisit={savingVisit}
                onUpdateVisitStatus={updateVisitStatus}
                onPrepareReschedule={startVisitReschedule}
                reschedulingVisitId={reschedulingVisitId}
              />
            ) : null}

            {activePage === "leads" ? (
              <CrmLeadsPage theme={theme} leads={crmLeads} />
            ) : null}

            {activePage === "pipeline" ? (
              <CrmPipelinePage
                theme={theme}
                leads={crmLeads}
                opportunities={crmOpportunities}
                onStageChange={updateCrmOpportunityStage}
              />
            ) : null}

            {activePage === "tasks" ? (
              <CrmTasksPage
                theme={theme}
                tasks={crmTasks}
                onComplete={completeCrmTask}
              />
            ) : null}

            {activePage === "activities" ? (
              <CrmActivitiesPage theme={theme} activities={crmActivities} />
            ) : null}

            {activePage === "agents" ? (
              <AgentsPage
                theme={theme}
                isTablet={isTablet}
                subAgents={subAgents}
                assets={assets}
                bookings={enrichedBookings}
                onUpdateAgentStatus={updateAgentStatus}
                onEditAgent={openAgentEditor}
                onAgent={(agent: any) => {
                  setSelectedAsset({ agent });
                  openDrawer("agent");
                }}
              />
            ) : null}

            {activePage === "notifications" ? (
              <NotificationsPage theme={theme} notifications={notifications} />
            ) : null}

            {activePage === "profile" ? (
              <ProfilePage theme={theme} profile={profile} metrics={metrics} onLogout={handleLogout} />
            ) : null}
          </ScrollView>
        </View>
      </View>

      {!isDesktop ? (
        <>
          <BottomNav theme={theme} activePage={activePage} onNavigate={goToPage} />
          <MobileMenu
            theme={theme}
            open={mobileMenuOpen}
            activePage={activePage}
            profile={profile}
            onClose={() => setMobileMenuOpen(false)}
            onNavigate={goToPage}
            onLogout={handleLogout}
          />
        </>
      ) : null}

      <InfoDrawer
        theme={theme}
        open={!!drawerMode}
        mode={drawerMode}
        asset={selectedAsset}
        property={selectedProperty}
        profile={profile}
        onClose={closeDrawer}
        onBook={(asset: any) => {
          startBooking(asset);
        }}
        onCustomer={() => startBooking(selectedAsset, 2)}
      />

      <AgentEditorModal
        theme={theme}
        open={agentEditorOpen}
        form={agentForm}
        editing={!!editingAgent}
        saving={savingAgent}
        onChange={(patch: any) => setAgentForm((current: any) => ({ ...current, ...patch }))}
        onClose={() => setAgentEditorOpen(false)}
        onSave={saveAgent}
      />

      <BookingFlowModal
        theme={theme}
        open={bookingFlowOpen}
        isTablet={isTablet}
        selectedAsset={selectedAsset || assets.find(isBookableAsset) || assets[0]}
        selectedProperty={selectedProperty}
        selectedCustomer={selectedCustomer}
        bookingStep={bookingStep}
        maxBookingStepUnlocked={maxBookingStepUnlocked}
        loading={bookingFlowLoading || savingBooking}
        loadingText={savingBooking ? "Confirming booking..." : bookingFlowLoadingText}
        onClose={closeBookingFlow}
        onStep={setBookingStep}
        onCustomer={setSelectedCustomer}
        onSelectAsset={setSelectedAsset}
        onContinue={continueBookingFlow}
        onBack={goBackBookingFlow}
        onOpenBookings={() => {
          closeBookingFlow();
          goToPage("bookings");
        }}
      />
    </SafeAreaView>
  );
}

function CrmLeadsPage({ theme, leads }: any) {
  return (
    <SectionShell theme={theme} title={`Lead Registry (${leads.length})`}>
      <View style={styles.listStack}>
        {leads.length === 0 ? (
          <EmptyPanel theme={theme} title="No CRM leads yet" text="Leads will appear here from bookings, visits, and manual CRM creation." />
        ) : leads.map((lead: any) => (
          <View key={lead.id} style={[styles.visitCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{lead.name}</Text>
                <Text style={[styles.cardMeta, { color: theme.subtle }]}>{lead.phone || lead.email || "No contact"}</Text>
                <Text style={[styles.cardMeta, { color: theme.subtle }]}>Source: {titleCase(String(lead.source || "manual"))}</Text>
              </View>
              <StatusPill theme={theme} status={lead.status || "new"} />
            </View>
            <View style={styles.actionRow}>
              <InfoTag theme={theme} label={`Owner: ${lead.assigned_agent_id || "Unassigned"}`} />
              <InfoTag theme={theme} label={`Follow-up: ${lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : "Not set"}`} />
              <InfoTag theme={theme} label={`Tags: ${(lead.tags || []).join(", ") || "None"}`} />
            </View>
            <ContactActions theme={theme} phone={lead.phone} email={lead.email} />
            {lead.notes_summary ? <Text style={[styles.cardMeta, { color: theme.subtle }]}>{lead.notes_summary}</Text> : null}
          </View>
        ))}
      </View>
    </SectionShell>
  );
}

function CrmPipelinePage({ theme, leads, opportunities, onStageChange }: any) {
  const { width } = useWindowDimensions();
  const isDesktopBoard = width >= 1100;
  const leadMap = new Map<string, any>((leads || []).map((lead: any) => [lead.id, lead]));
  const grouped = CRM_PIPELINE_STAGES.map((stage) => ({
    stage,
    items: opportunities.filter((opportunity: any) => opportunity.stage === stage),
  }));

  const renderOpportunityCard = (opportunity: any) => (
    <View key={opportunity.id} style={[styles.visitCard, styles.pipelineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {(() => {
        const lead = leadMap.get(opportunity.lead_id);
        return (
          <>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{lead?.name || opportunity.property_id}</Text>
                <Text style={[styles.cardMeta, { color: theme.subtle }]}>Property: {opportunity.property_id}</Text>
                <Text style={[styles.cardMeta, { color: theme.subtle }]}>Lead ID: {opportunity.lead_id}</Text>
                <Text style={[styles.cardMeta, { color: theme.subtle }]}>Owner: {opportunity.assigned_agent_id || "Unassigned"}</Text>
              </View>
              <StatusPill theme={theme} status={opportunity.stage} />
            </View>
            <View style={styles.actionRow}>
              <InfoTag theme={theme} label={`Value: ${opportunity.expected_value ? formatINRFull(opportunity.expected_value) : "TBD"}`} />
              <InfoTag theme={theme} label={`Visits: ${(opportunity.visit_ids || []).length}`} />
            </View>
            <ContactActions theme={theme} phone={lead?.phone} email={lead?.email} />
            <View style={styles.actionRow}>
              {nextPipelineActions(opportunity.stage).map((nextStage) => (
                <Button
                  key={nextStage}
                  title={titleCase(nextStage.replace(/_/g, " "))}
                  variant="secondary"
                  onPress={() => onStageChange(opportunity.id, nextStage, nextStage === "closed_lost" ? "other" : undefined)}
                />
              ))}
            </View>
          </>
        );
      })()}
    </View>
  );

  return (
    <View style={styles.pageGap}>
      {isDesktopBoard ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineBoard}>
          {grouped.map((group) => (
            <View key={group.stage} style={[styles.pipelineColumn, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <View style={[styles.pipelineColumnHeader, { borderColor: theme.border }]}>
                <Text style={[styles.pipelineColumnTitle, { color: theme.text }]}>{titleCase(group.stage.replace(/_/g, " "))}</Text>
                <View style={[styles.pipelineStageCount, { backgroundColor: theme.brandSoft }]}>
                  <Text style={[styles.pipelineStageCountText, { color: theme.brand }]}>{group.items.length}</Text>
                </View>
              </View>
              <View style={styles.pipelineColumnBody}>
                {group.items.length === 0 ? (
                  <Text style={[styles.cardMeta, { color: theme.subtle }]}>No opportunities in this stage.</Text>
                ) : group.items.map(renderOpportunityCard)}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        grouped.map((group) => (
          <SectionShell key={group.stage} theme={theme} title={`${titleCase(group.stage.replace(/_/g, " "))} (${group.items.length})`}>
            <View style={styles.listStack}>
              {group.items.length === 0 ? (
                <Text style={[styles.cardMeta, { color: theme.subtle }]}>No opportunities in this stage.</Text>
              ) : group.items.map(renderOpportunityCard)}
            </View>
          </SectionShell>
        ))
      )}
    </View>
  );
}

function CrmTasksPage({ theme, tasks, onComplete }: any) {
  const openTasks = tasks.filter((task: any) => task.status !== "completed");
  const completedTasks = tasks.filter((task: any) => task.status === "completed");
  return (
    <View style={styles.pageGap}>
      <SectionShell theme={theme} title={`Open Tasks (${openTasks.length})`}>
        <View style={styles.listStack}>
          {openTasks.length === 0 ? (
            <EmptyPanel theme={theme} title="No open follow-ups" text="Upcoming CRM reminders will show up here." />
          ) : openTasks.map((task: any) => {
            const overdue = isDueDateOverdue(task.due_at);
            return (
              <View key={task.id} style={[styles.visitCard, { backgroundColor: theme.card, borderColor: overdue ? theme.danger : theme.border }]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{task.title}</Text>
                    <Text style={[styles.cardMeta, { color: theme.subtle }]}>{task.task_type} · {task.assigned_to_user_id}</Text>
                  </View>
                  <StatusPill theme={theme} status={overdue ? "overdue" : task.priority || "medium"} />
                </View>
                <Text style={[styles.cardMeta, { color: theme.subtle }]}>Due: {task.due_at ? formatDate(task.due_at) : "No due date"}</Text>
                {task.description ? <Text style={[styles.cardMeta, { color: theme.subtle }]}>{task.description}</Text> : null}
                <Button title="Mark Complete" onPress={() => onComplete(task.id)} />
              </View>
            );
          })}
        </View>
      </SectionShell>
      <SectionShell theme={theme} title={`Completed (${completedTasks.length})`}>
        <View style={styles.listStack}>
          {completedTasks.slice(0, 10).map((task: any) => (
            <View key={task.id} style={[styles.visitCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{task.title}</Text>
              <Text style={[styles.cardMeta, { color: theme.subtle }]}>Completed: {task.completed_at ? formatDate(task.completed_at) : "Done"}</Text>
            </View>
          ))}
        </View>
      </SectionShell>
    </View>
  );
}

function CrmActivitiesPage({ theme, activities }: any) {
  return (
    <SectionShell theme={theme} title={`Recent CRM Activity (${activities.length})`}>
      <View style={styles.activityList}>
        {activities.length === 0 ? (
          <EmptyPanel theme={theme} title="No CRM activity yet" text="Activity starts appearing as leads, tasks, visits, and deals move." />
        ) : activities.map((activity: any) => (
          <ActivityRow
            key={activity.id}
            theme={theme}
            icon="clock"
            title={activity.message}
            meta={`${activity.activity_type} · ${formatDate(activity.created_at)}`}
          />
        ))}
      </View>
    </SectionShell>
  );
}

function InfoTag({ theme, label }: any) {
  return (
    <View style={[styles.filterPill, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}>
      <Text style={[styles.filterText, { color: theme.subtle }]}>{label}</Text>
    </View>
  );
}

function EmptyPanel({ theme, title, text }: any) {
  return (
    <View style={[styles.emptyPanel, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}>
      <Text style={[styles.emptyTitleSmall, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: theme.subtle }]}>{text}</Text>
    </View>
  );
}

function Sidebar({ theme, activePage, profile, onNavigate, onLogout }: any) {
  const primaryItems = NAV_ITEMS.slice(0, 5);
  const crmItems = NAV_ITEMS.slice(5);

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.sidebar, borderColor: theme.border }]}>
      <View style={[styles.brandPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.brandBlock}>
          <Image source={require("../assets/images/rivan-logo.png")} style={styles.brandLogo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.brandName, { color: theme.text }]}>Rivan</Text>
            <Text style={[styles.brandSub, { color: theme.subtle }]}>Agent OS</Text>
          </View>
        </View>
        <View style={[styles.desktopBadge, { backgroundColor: theme.brandSoft }]}>
          <Feather name="zap" size={12} color={theme.brand} />
          <Text style={[styles.desktopBadgeText, { color: theme.brand }]}>Premium Web Workspace</Text>
        </View>
      </View>

      <View style={[styles.agentMiniCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <Avatar name={profile?.name || "Agent"} theme={theme} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.agentMiniName, { color: theme.text }]} numberOfLines={1}>{profile?.name || "Agent"}</Text>
          <Text style={[styles.agentMiniRole, { color: theme.subtle }]}>Verified workspace</Text>
          <Text style={[styles.agentMiniMeta, { color: theme.muted }]} numberOfLines={1}>
            {profile?.agent_brand_name || "Sales pipeline and customer operations"}
          </Text>
        </View>
      </View>

      <View style={styles.navStack}>
        <View style={styles.navGroup}>
          <Text style={[styles.navGroupLabel, { color: theme.muted }]}>Core Workspace</Text>
          {primaryItems.map((item) => (
            <NavButton key={item.key} item={item} active={activePage === item.key} theme={theme} onPress={() => onNavigate(item.key)} />
          ))}
        </View>
        <View style={styles.navGroup}>
          <Text style={[styles.navGroupLabel, { color: theme.muted }]}>CRM Control</Text>
          {crmItems.map((item) => (
            <NavButton key={item.key} item={item} active={activePage === item.key} theme={theme} onPress={() => onNavigate(item.key)} />
          ))}
        </View>
      </View>

      <TouchableOpacity style={[styles.logoutButton, { borderColor: theme.border }]} onPress={onLogout}>
        <Feather name="log-out" size={17} color={theme.subtle} />
        <Text style={[styles.logoutText, { color: theme.subtle }]}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

function TopBar({ theme, title, subtitle, profile, isDesktop, onMenu, onLogout }: any) {
  return (
    <View style={[styles.topBar, { backgroundColor: theme.panel, borderColor: theme.border }]}>
      <View style={styles.topLeft}>
        {!isDesktop ? (
          <TouchableOpacity style={[styles.iconButton, { borderColor: theme.border }]} onPress={onMenu}>
            <Feather name="menu" size={20} color={theme.text} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.pageCopy}>
          {isDesktop ? <Text style={[styles.pageEyebrow, { color: theme.brand }]}>Agent workspace</Text> : null}
          <Text style={[styles.pageTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.pageSubtitle, { color: theme.subtle }]} numberOfLines={2}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.topActions}>
        {isDesktop ? (
          <View style={[styles.desktopStatusChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
            <Text style={[styles.desktopStatusChipText, { color: theme.text }]}>Live workspace</Text>
          </View>
        ) : null}
        <TouchableOpacity style={[styles.iconButton, { borderColor: theme.border }]}>
          <Feather name="bell" size={18} color={theme.text} />
        </TouchableOpacity>
        {isDesktop ? (
          <TouchableOpacity style={[styles.profileChip, { backgroundColor: theme.cardAlt, borderColor: theme.border }]} onPress={onLogout}>
            <Avatar name={profile?.name || "Agent"} theme={theme} small />
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={[styles.profileChipText, { color: theme.text }]} numberOfLines={1}>{profile?.name || "Agent"}</Text>
              <Text style={[styles.profileChipSubtext, { color: theme.subtle }]} numberOfLines={1}>Profile and logout</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function HomePage({ theme, isTablet, metrics, properties, bookings, visits, onProperty, onLayout, onBook, onVisit }: any) {
  const cards = [
    { label: "Total Properties", value: metrics.totalProperties, icon: "briefcase", color: theme.brand },
    { label: "Portfolio Assets", value: metrics.active, icon: "activity", color: theme.success },
    { label: "Customer Leads", value: metrics.conversion, icon: "users", color: theme.brandAlt },
    { label: "Pending Bookings", value: metrics.pending, icon: "clock", color: theme.warning },
    { label: "Upcoming Site Visits", value: metrics.upcomingVisits, icon: "calendar", color: theme.info },
  ];

  return (
    <View style={styles.pageGap}>
      <SpotlightHero theme={theme} metrics={metrics} />
      <View style={[styles.kpiGrid, isTablet ? styles.kpiGridTablet : null]}>
        {cards.map((card) => <MetricCard key={card.label} theme={theme} {...card} />)}
      </View>

      <View style={[styles.twoColumn, isTablet ? styles.twoColumnWide : null]}>
        <SectionShell theme={theme} title="Featured Inventory" action="View all">
          <View style={[styles.propertyGrid, isTablet ? styles.propertyGridWide : null]}>
            {properties.slice(0, 4).map((property: any) => (
              <PropertyCard key={property.id} theme={theme} property={property} onView={() => onProperty(property)} onLayout={() => onLayout(property)} onBook={() => onBook(property.assets[0])} onVisit={() => onVisit(property.assets[0])} />
            ))}
          </View>
        </SectionShell>

        <SectionShell theme={theme} title="Recent Activities">
          <View style={styles.activityList}>
            {[...bookings.slice(0, 3), ...visits.slice(0, 2)].map((item: any, index: number) => (
              <ActivityRow
                key={`${item.id}-${index}`}
                theme={theme}
                icon={item.customer ? "calendar" : "file-text"}
                title={item.customer ? `${item.customer.name} visit` : `${item.customer?.name || item.name || "Customer"} booking`}
                detail={item.property || item.property_name || item.property_id || "CRM inventory"}
                time={item.date || "Today"}
              />
            ))}
          </View>
        </SectionShell>
      </View>
    </View>
  );
}

function SpotlightHero({ theme, metrics }: any) {
  return (
    <View style={[styles.spotlightHero, { backgroundColor: theme.panel, borderColor: theme.border }]}>
      <View style={styles.spotlightCopy}>
        <Text style={[styles.spotlightEyebrow, { color: theme.brandAlt }]}>Premium Sales Command</Text>
        <Text style={[styles.spotlightTitle, { color: theme.text }]}>Run inventory, follow-ups, and closures from one live workspace.</Text>
        <Text style={[styles.spotlightSubtitle, { color: theme.subtle }]}>
          Designed for fast-moving site sales teams with clearer ownership, faster customer actions, and a cleaner premium experience.
        </Text>
      </View>
      <View style={styles.spotlightStats}>
        <View style={[styles.spotlightStatCard, { backgroundColor: theme.brandSoft }]}>
          <Text style={[styles.spotlightStatValue, { color: theme.brand }]}>{metrics.pending}</Text>
          <Text style={[styles.spotlightStatLabel, { color: theme.subtle }]}>Active booking requests</Text>
        </View>
        <View style={[styles.spotlightStatCard, { backgroundColor: theme.cardAlt }]}>
          <Text style={[styles.spotlightStatValue, { color: theme.text }]}>{metrics.upcomingVisits}</Text>
          <Text style={[styles.spotlightStatLabel, { color: theme.subtle }]}>Upcoming visits</Text>
        </View>
      </View>
    </View>
  );
}

function PropertiesPage({
  theme,
  isTablet,
  properties,
  search,
  viewMode,
  onSearch,
  onViewMode,
  onOpenProperty,
  onLayout,
  onBook,
  onVisit,
}: any) {
  return (
    <View style={styles.pageGap}>
      <Toolbar theme={theme}>
        <SearchBox theme={theme} value={search} onChangeText={onSearch} placeholder="Search properties or location" />
        <View style={styles.toolbarActions}>
          <TouchableOpacity style={[styles.segmentButton, viewMode === "grid" && { backgroundColor: theme.brandSoft }]} onPress={() => onViewMode("grid")}>
            <Feather name="grid" size={16} color={viewMode === "grid" ? theme.brand : theme.subtle} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentButton, viewMode === "list" && { backgroundColor: theme.brandSoft }]} onPress={() => onViewMode("list")}>
            <Feather name="list" size={16} color={viewMode === "list" ? theme.brand : theme.subtle} />
          </TouchableOpacity>
        </View>
      </Toolbar>

      <SectionShell theme={theme} title="Property Portfolio">
        <View style={viewMode === "grid" && isTablet ? styles.propertyGridWide : styles.listStack}>
          {properties.map((property: any) => (
            <PropertyCard
              key={property.id}
              theme={theme}
              property={property}
              compact={viewMode === "list"}
              onView={() => onOpenProperty(property)}
              onLayout={() => onLayout(property)}
              onBook={() => onBook(property.assets[0])}
              onVisit={() => onVisit(property.assets[0])}
            />
          ))}
        </View>
      </SectionShell>
    </View>
  );
}

function BookingsPage({ theme, bookings, bookingTab, onTab, onUpdateBookingStatus, onCloseBooking }: any) {
  return (
    <SectionShell theme={theme} title="Bookings">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {BOOKING_TABS.map((tab) => (
          <FilterPill key={tab} theme={theme} label={titleCase(tab)} active={bookingTab === tab} onPress={() => onTab(tab)} />
        ))}
      </ScrollView>
      <ResponsiveTable
        theme={theme}
        headers={["Booking ID", "Customer", "Property", "Agent", "Date", "Status"]}
        rows={bookings.map((booking: any) => ({
          id: booking.id,
          cells: [
            booking.id || "BK-2024",
            booking.customer?.name || booking.name || "-",
            booking.property_name || booking.asset?.property_name || booking.property_id || "-",
            booking.agent_name || "-",
            formatDate(booking.created_at),
            titleCase(booking.status || "pending"),
          ],
          action: getNextBookingAction(booking.status)?.next ? () => onUpdateBookingStatus(booking.id, getNextBookingAction(booking.status)!.next) : undefined,
          actionLabel: getNextBookingAction(booking.status)?.label,
        }))}
      />
    </SectionShell>
  );
}

function BookingFlowModal({
  theme,
  open,
  isTablet,
  selectedAsset,
  selectedProperty,
  selectedCustomer,
  bookingStep,
  maxBookingStepUnlocked,
  loading,
  loadingText,
  onClose,
  onStep,
  onCustomer,
  onSelectAsset,
  onContinue,
  onBack,
  onOpenBookings,
}: any) {
  const bookableAssets = (selectedProperty?.assets || []).filter(isBookableAsset);
  const bookingProperty = selectedProperty || (selectedAsset ? {
    id: selectedAsset.property_id,
    name: selectedAsset.property_name,
    location: selectedAsset.location || selectedAsset.property_location || "Hyderabad",
    image: selectedAsset.property_image,
    videoUrl: selectedAsset.property_video_url,
    startingPrice: Number(selectedAsset.price || 0),
    assets: selectedAsset ? [selectedAsset] : [],
  } : null);
  const layoutProperty = bookingProperty ? {
    ...bookingProperty,
    assets: bookableAssets.length ? bookableAssets : bookingProperty.assets,
  } : null;
  const visibleSteps = BOOKING_STEPS.slice(0, maxBookingStepUnlocked);
  const canContinue =
    bookingStep === 1
      ? !!selectedAsset?.id && isBookableAsset(selectedAsset)
      : bookingStep === 2
        ? !!selectedCustomer?.id?.trim() && !!selectedCustomer?.name?.trim() && !!selectedCustomer?.phone?.trim()
        : bookingStep === 3;

  return (
    <Modal visible={open} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.bookingModalSafe, { backgroundColor: theme.bg }]} edges={["top"]}>
        <View style={[styles.bookingModalHeader, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bookingModalTitle, { color: theme.text }]}>Booking Journey</Text>
            <Text style={[styles.cardMeta, { color: theme.subtle }]}>Choose asset, add customer, confirm, and finish without leaving the current dashboard flow.</Text>
          </View>
          <TouchableOpacity style={[styles.iconButton, { borderColor: theme.border }]} onPress={onClose}>
            <Feather name="x" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.contentScroll} contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]}>
          <SectionShell theme={theme} title="Property Layout">
            <View style={styles.pageGapSm}>
              <Text style={[styles.cardMeta, { color: theme.subtle }]}>
                Review the layout, select a bookable unit, and then continue through the guided booking flow below.
              </Text>
              <PlotLayout
                theme={theme}
                property={layoutProperty}
                selectedAsset={selectedAsset}
                onSelect={onSelectAsset}
              />
              <View style={[styles.reviewPanel, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Selected Asset</Text>
                <InfoLine theme={theme} label="Property" value={selectedAsset?.property_name || bookingProperty?.name || "Select a property asset from the layout"} />
                <InfoLine theme={theme} label="Plot / Unit" value={selectedAsset?.plot_number || selectedAsset?.id || "-"} />
                <InfoLine theme={theme} label="Size" value={selectedAsset?.size || "-"} />
                <InfoLine theme={theme} label="Investment Range" value={selectedAsset ? `Starting from ${formatINRFull(selectedAsset.price || 0)} onwards` : "-"} />
                <InfoLine theme={theme} label="Booking Readiness" value={isBookableAsset(selectedAsset) ? "Ready to continue" : "Choose a bookable unit from the layout"} />
              </View>
            </View>
          </SectionShell>

          <SectionShell theme={theme} title="Make Booking">
            <View style={styles.workflowSteps}>
              {visibleSteps.map((label, index) => {
                const step = (index + 1) as BookingStep;
                const active = bookingStep === step;
                const complete = bookingStep > step;
                return (
                  <TouchableOpacity key={label} style={styles.workflowStep} onPress={() => onStep(step)}>
                    <View style={[styles.stepDot, { backgroundColor: active || complete ? theme.brand : theme.cardAlt }]}>
                      {complete ? (
                        <Feather name="check" size={14} color={colors.white} />
                      ) : (
                        <Text style={[styles.stepDotText, { color: active ? colors.white : theme.subtle }]}>{step}</Text>
                      )}
                    </View>
                    <Text style={[styles.stepText, { color: active ? theme.text : theme.subtle }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.bookingWorkflow, isTablet ? styles.bookingWorkflowWide : null]}>
              <BookingStepPanel
                theme={theme}
                step={bookingStep}
                selectedAsset={selectedAsset}
                selectedCustomer={selectedCustomer}
                onCustomer={onCustomer}
                onStep={onStep}
              />
              <View style={[styles.reviewPanel, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Booking Summary</Text>
                <InfoLine theme={theme} label="Property" value={selectedAsset?.property_name || "Select property"} />
                <InfoLine theme={theme} label="Plot" value={selectedAsset?.plot_number || selectedAsset?.id || "-"} />
                <InfoLine theme={theme} label="Customer" value={selectedCustomer?.name ? `${selectedCustomer.name} (${selectedCustomer.id || "ID pending"})` : "-"} />
                <InfoLine theme={theme} label="Status" value={bookingStep === 4 ? "Booking updated" : bookingStep === 3 ? "Ready for confirmation" : "Step in progress"} />
                {bookingStep === 4 ? (
                  <View style={styles.actionRow}>
                    <Button title="Close Journey" fullWidth={false} onPress={onClose} />
                    <Button title="View Bookings" variant="secondary" fullWidth={false} onPress={onOpenBookings} />
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <Button
                      title={bookingStep >= 3 ? "Confirm Booking" : "Continue"}
                      fullWidth={false}
                      loading={loading}
                      disabled={!canContinue}
                      onPress={onContinue}
                    />
                    <Button
                      title="Back"
                      variant="secondary"
                      fullWidth={false}
                      disabled={bookingStep === 1 || loading}
                      onPress={onBack}
                    />
                  </View>
                )}
              </View>
            </View>
          </SectionShell>
        </ScrollView>

        {loading ? (
          <View style={styles.bookingFlowLoader}>
            <View style={[styles.bookingFlowLoaderCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <ActivityIndicator size="large" color={theme.brand} />
              <Text style={[styles.loadingText, { color: theme.text }]}>{loadingText}</Text>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function VisitsPage({ theme, isTablet, visits, subAgents, selectedAsset, selectedCustomer, visitDraft, onVisitDraft, onCustomer, onScheduleVisit, savingVisit, onUpdateVisitStatus, onPrepareReschedule, reschedulingVisitId }: any) {
  const groups = [
    { key: "upcoming", label: "Upcoming Visits" },
    { key: "completed", label: "Completed Visits" },
    { key: "cancelled", label: "Cancelled Visits" },
  ];
  return (
    <View style={styles.pageGap}>
      <View style={[styles.kpiGrid, isTablet ? styles.kpiGridTablet : null]}>
        {groups.map((group) => (
          <MetricCard
            key={group.key}
            theme={theme}
            label={group.label}
            value={visits.filter((visit: any) => getVisitBucket(visit.statusRaw || visit.status) === group.key).length}
            icon="calendar"
            color={group.key === "cancelled" ? theme.danger : group.key === "completed" ? theme.success : theme.info}
          />
        ))}
      </View>
      <SectionShell theme={theme} title={reschedulingVisitId ? "Reschedule Site Visit" : "Schedule Site Visit"}>
        <View style={[styles.bookingWorkflow, isTablet ? styles.bookingWorkflowWide : null]}>
          <View style={[styles.workflowPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Visit Workflow</Text>
            <InfoLine theme={theme} label="Property" value={selectedAsset?.property_name || "Choose a property from Home, Properties, or Layout"} />
            <InfoLine theme={theme} label="Asset" value={selectedAsset?.plot_number || selectedAsset?.id || "-"} />
            <View style={styles.formGrid}>
              <FormField
                theme={theme}
                label="Customer ID"
                value={selectedCustomer?.id || ""}
                onChangeText={(value: string) => onCustomer({ ...selectedCustomer, id: value })}
                placeholder="CUST-1001"
              />
              <FormField
                theme={theme}
                label="Customer Name"
                value={selectedCustomer?.name || ""}
                onChangeText={(value: string) => onCustomer({ ...selectedCustomer, name: value })}
                placeholder="Rajesh Kumar"
              />
              <FormField
                theme={theme}
                label="Phone Number"
                value={selectedCustomer?.phone || ""}
                onChangeText={(value: string) => onCustomer({ ...selectedCustomer, phone: value })}
                placeholder="+91 9876543210"
              />
              <FormField
                theme={theme}
                label="Email Address"
                value={selectedCustomer?.email || ""}
                onChangeText={(value: string) => onCustomer({ ...selectedCustomer, email: value })}
                placeholder="rajesh@example.com"
              />
              <FormField
                theme={theme}
                label="Visit Date"
                value={visitDraft.visit_date}
                onChangeText={(value: string) => onVisitDraft((current: any) => ({ ...current, visit_date: value }))}
                placeholder="2026-06-25"
              />
              <FormField
                theme={theme}
                label="Visit Time"
                value={visitDraft.visit_time}
                onChangeText={(value: string) => onVisitDraft((current: any) => ({ ...current, visit_time: value }))}
                placeholder="10:30 AM"
              />
              <FormField
                theme={theme}
                label="Visit Notes"
                value={visitDraft.notes}
                onChangeText={(value: string) => onVisitDraft((current: any) => ({ ...current, notes: value }))}
                placeholder="Share layout details, access road, and next step notes."
              />
            </View>
          </View>
          <View style={[styles.reviewPanel, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Schedule Summary</Text>
            <InfoLine theme={theme} label="Assigned Owner" value={selectedAsset?.agent_name || subAgents[0]?.name || "Primary team"} />
            <InfoLine theme={theme} label="Customer" value={selectedCustomer?.name || "-"} />
            <InfoLine theme={theme} label="Customer ID" value={selectedCustomer?.id || "ID pending"} />
            <InfoLine theme={theme} label="Visit Date" value={visitDraft.visit_date || "-"} />
            <InfoLine theme={theme} label="Visit Time" value={visitDraft.visit_time || "-"} />
            <InfoLine theme={theme} label="Next Action" value={reschedulingVisitId ? "Update visit plan and notify customer" : "Create visit and track follow-up from CRM"} />
            <Button title={reschedulingVisitId ? "Confirm Reschedule" : "Schedule Visit"} loading={savingVisit} onPress={onScheduleVisit} />
          </View>
        </View>
      </SectionShell>
      <SectionShell theme={theme} title="Visit Schedule" action="Schedule Visit">
        <View style={styles.listStack}>
          {visits.map((visit: any) => (
            <View key={visit.id} style={[styles.visitCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{visit.customer.name}</Text>
                  <Text style={[styles.cardMeta, { color: theme.subtle }]}>{visit.property} - {visit.plot}</Text>
                </View>
                <StatusPill theme={theme} status={visit.status} />
              </View>
              <View style={styles.infoGrid}>
                <InfoLine theme={theme} label="Schedule" value={`${visit.date}, ${visit.time}`} />
                <InfoLine theme={theme} label="CRM Owner" value={visit.agent || subAgents[0]?.name || "Primary team"} />
                <InfoLine theme={theme} label="Customer ID" value={visit.customer?.id || "ID pending"} />
                <InfoLine theme={theme} label="Customer Notes" value={visit.notes} />
                <InfoLine theme={theme} label="Feedback" value={visit.status === "Completed" ? "High-intent customer, schedule next sales call." : "Pending visit feedback."} />
              </View>
              <ContactActions theme={theme} phone={visit.customer?.phone} email={visit.customer?.email} />
              <Timeline theme={theme} steps={["Requested", "Owner selected", "Visit scheduled", visit.status]} />
              <View style={styles.actionRow}>
                <Button title="Reschedule" size="sm" variant="secondary" fullWidth={false} onPress={() => onPrepareReschedule(visit)} />
                {String(visit.status).toLowerCase() !== "completed" ? (
                  <Button title="Mark Completed" size="sm" variant="ghost" fullWidth={false} onPress={() => onUpdateVisitStatus(visit.id, "completed")} />
                ) : null}
                {String(visit.status).toLowerCase() !== "cancelled" ? (
                  <Button title="Cancel" size="sm" variant="danger" fullWidth={false} onPress={() => onUpdateVisitStatus(visit.id, "cancelled")} />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </SectionShell>
    </View>
  );
}

function AgentsPage({ theme, isTablet, subAgents, assets, bookings, onUpdateAgentStatus, onEditAgent, onAgent }: any) {
  const agents = subAgents.length ? subAgents : [{ id: "agent-demo", name: "No sub-agent linked", phone: "-", email: "-", status: "Pending" }];
  return (
    <View style={styles.pageGap}>
      <Toolbar theme={theme}>
        <SearchBox theme={theme} value="" onChangeText={() => undefined} placeholder="Search agents" />
      </Toolbar>
      <View style={[styles.agentGrid, isTablet ? styles.agentGridWide : null]}>
        {agents.map((agent: any, index: number) => {
          const coveredAssets = assets.filter((asset: any) => asset.agent_id === agent.id || index === 0).slice(0, 4);
          return (
            <TouchableOpacity key={agent.id || agent.email || index} style={[styles.agentCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onAgent(agent)}>
              <View style={styles.cardHeader}>
                <View style={styles.agentIdentity}>
                  <Avatar name={agent.name || "Agent"} theme={theme} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{agent.name || "Agent"}</Text>
                    <Text style={[styles.cardMeta, { color: theme.subtle }]}>ID: {agent.id || `AG-${100 + index}`}</Text>
                  </View>
                </View>
                <StatusPill theme={theme} status={agent.status || "Active"} />
              </View>
              <InfoLine theme={theme} label="Phone" value={agent.phone || "-"} />
              <InfoLine theme={theme} label="Email" value={agent.email || "-"} />
              <ContactActions theme={theme} phone={agent.phone} email={agent.email} />
              <View style={styles.agentStats}>
                <MiniStat theme={theme} label="Properties" value={coveredAssets.length} />
                <MiniStat theme={theme} label="Leads" value={6 + index} />
                <MiniStat theme={theme} label="Bookings" value={bookings.length} />
              </View>
              <Rating theme={theme} value={4.2 + Math.min(index, 3) * 0.2} />
              <View style={styles.actionRow}>
                <Button title="View" size="sm" variant="secondary" fullWidth={false} onPress={() => onAgent(agent)} />
                <Button title="Edit" size="sm" variant="secondary" fullWidth={false} onPress={() => onEditAgent(agent)} />
                <Button
                  title={String(agent.status || "active").toLowerCase() === "suspended" ? "Set Active" : "Suspend"}
                  size="sm"
                  variant="ghost"
                  fullWidth={false}
                  onPress={() => onUpdateAgentStatus(agent.id, String(agent.status || "active").toLowerCase() === "suspended" ? "active" : "suspended")}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function NotificationsPage({ theme, notifications }: any) {
  return (
    <SectionShell theme={theme} title="Notification Center" action="Mark all read">
      <View style={styles.listStack}>
        {notifications.map((item: any) => (
          <View key={item.id} style={[styles.notificationRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.notificationIcon, { backgroundColor: theme.brandSoft }]}>
              <Feather name={item.icon} size={18} color={theme.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{item.type}</Text>
              <Text style={[styles.cardMeta, { color: theme.subtle }]}>{item.text}</Text>
            </View>
            <Text style={[styles.cardMeta, { color: theme.muted }]}>{item.time}</Text>
          </View>
        ))}
      </View>
    </SectionShell>
  );
}

function ProfilePage({ theme, profile, metrics, onLogout }: any) {
  return (
    <View style={styles.pageGap}>
      <SectionShell theme={theme} title="Agent Profile">
        <View style={[styles.profileHero, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
          <Avatar name={profile?.name || "Agent"} theme={theme} large />
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: theme.text }]}>{profile?.agent_brand_name || profile?.name || "Rivan Agent"}</Text>
            <Text style={[styles.cardMeta, { color: theme.subtle }]}>Manager-approved real estate sales workspace</Text>
          </View>
          <StatusPill theme={theme} status={profile?.approval_status || "Approved"} />
        </View>
        <View style={styles.profileDetails}>
          <InfoLine theme={theme} label="Full Name" value={profile?.name || "-"} />
          <InfoLine theme={theme} label="Age" value={String(profile?.age || "-")} />
          <InfoLine theme={theme} label="Phone Number" value={profile?.phone || "-"} />
          <InfoLine theme={theme} label="Aadhaar" value={profile?.aadhaar_number || "-"} />
          <InfoLine theme={theme} label="Bank Details" value={profile?.bank_details || "-"} />
          <InfoLine theme={theme} label="Reporting Manager" value={profile?.manager_name || "-"} />
        </View>
      </SectionShell>
      <View style={[styles.kpiGrid, styles.kpiGridTablet]}>
        <MetricCard theme={theme} label="Active Properties" value={metrics.active} icon="map" color={theme.success} />
        <MetricCard theme={theme} label="Pending Bookings" value={metrics.pending} icon="clock" color={theme.warning} />
        <MetricCard theme={theme} label="Upcoming Visits" value={metrics.upcomingVisits} icon="calendar" color={theme.info} />
      </View>
      <Button title="Logout" variant="danger" onPress={onLogout} fullWidth={false} icon={<Feather name="log-out" size={16} color={colors.white} />} />
    </View>
  );
}

function PropertyCard({ theme, property, compact, active, onView, onLayout, onBook, onVisit }: any) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onView}
      style={[
        styles.propertyCard,
        compact ? styles.propertyCardCompact : null,
        { backgroundColor: theme.card, borderColor: active ? theme.brand : theme.border },
      ]}
    >
      <PropertyMedia image={property.image} videoUrl={property.videoUrl} style={[styles.propertyImage, compact ? styles.propertyImageCompact : null]} />
      <View style={styles.propertyBody}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>{property.name}</Text>
            <Text style={[styles.cardMeta, { color: theme.subtle }]} numberOfLines={1}>{property.location}</Text>
          </View>
        </View>
        <Text style={[styles.priceText, { color: theme.brand }]}>Starting from {formatINRFull(property.startingPrice || 0)} onwards</Text>
        <View style={styles.cardStats}>
          <MiniStat theme={theme} label="Views" value={property.views} />
          <MiniStat theme={theme} label="Bookings" value={property.totalBookings} />
          <MiniStat theme={theme} label="Assets" value={property.assets.length} />
        </View>
        <View style={styles.actionRow}>
          <Button title="Details" size="sm" variant="secondary" fullWidth={false} onPress={onView} />
          <Button title="Layout" size="sm" variant="secondary" fullWidth={false} onPress={onLayout} />
          <Button title="Make Booking" size="sm" fullWidth={false} onPress={onBook} />
          <Button title="Site Visit" size="sm" variant="ghost" fullWidth={false} onPress={onVisit} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PlotLayout({ theme, property, selectedAsset, onSelect }: any) {
  const assets = property?.assets || [];
  if (!property || assets.length === 0) {
    return (
      <View style={[styles.emptyPanel, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <Text style={[styles.emptyText, { color: theme.subtle }]}>No layout assets found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.layoutPanel, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.plotBoard}>
          <View style={[styles.road, { backgroundColor: theme.road }]}>
            <Text style={[styles.roadText, { color: theme.roadText }]}>MAIN ACCESS ROAD</Text>
          </View>
          <View style={styles.plotGrid}>
            {assets.map((asset: any, index: number) => {
              const active = selectedAsset?.id === asset.id;
              const bookable = isBookableAsset(asset);
              return (
                <TouchableOpacity
                  key={asset.id || index}
                  disabled={!bookable}
                  style={[
                    styles.plotCell,
                    {
                      backgroundColor: active ? theme.brandSoft : theme.card,
                      borderColor: active ? theme.brand : theme.border,
                      opacity: bookable ? 1 : 0.45,
                    },
                  ]}
                  onPress={() => onSelect(asset)}
                >
                  <Text style={[styles.plotNo, { color: theme.text }]}>{asset.plot_number || String(index + 101)}</Text>
                  <Text style={[styles.plotSize, { color: theme.subtle }]}>{asset.size || "240 Sqyd"}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function BookingStepPanel({ theme, step, selectedAsset, selectedCustomer, onCustomer, onStep }: any) {
  if (step === 1) {
    return (
      <View style={[styles.workflowPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Property Selection</Text>
        <InfoLine theme={theme} label="Project" value={selectedAsset?.property_name || "Select a property from Properties"} />
        <InfoLine theme={theme} label="Plot Number" value={selectedAsset?.plot_number || "-"} />
        <InfoLine theme={theme} label="Plot Size" value={selectedAsset?.size || "-"} />
        <InfoLine theme={theme} label="Investment Range" value={`Starting from ${formatINRFull(selectedAsset?.price || 0)} onwards`} />
        <InfoLine theme={theme} label="CRM Readiness" value={selectedAsset?.id ? "Property linked and ready for booking workflow" : "Choose an asset to continue"} />
      </View>
    );
  }

  if (step === 2) {
    return (
      <View style={[styles.workflowPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Customer Details</Text>
        <View style={styles.formGrid}>
          <FormField
            theme={theme}
            label="Customer ID"
            value={selectedCustomer?.id || ""}
            onChangeText={(value: string) => onCustomer({ ...selectedCustomer, id: value })}
            placeholder="CUST-1021"
          />
          <FormField
            theme={theme}
            label="Customer Name"
            value={selectedCustomer?.name || ""}
            onChangeText={(value: string) => onCustomer({ ...selectedCustomer, name: value })}
            placeholder="Enter customer name"
          />
          <FormField
            theme={theme}
            label="Phone Number"
            value={selectedCustomer?.phone || ""}
            onChangeText={(value: string) => onCustomer({ ...selectedCustomer, phone: value })}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
          />
          <FormField
            theme={theme}
            label="Email"
            value={selectedCustomer?.email || ""}
            onChangeText={(value: string) => onCustomer({ ...selectedCustomer, email: value })}
            placeholder="customer@email.com"
            keyboardType="email-address"
          />
        </View>
        <Text style={[styles.cardMeta, { color: theme.subtle }]}>Quick select existing customer</Text>
        {demoCustomers.map((customer) => (
          <TouchableOpacity key={customer.id} style={[styles.customerRow, { borderColor: theme.border }]} onPress={() => onCustomer(customer)}>
            <View style={[styles.radio, { borderColor: selectedCustomer?.id === customer.id ? theme.brand : theme.border }]}>
              {selectedCustomer?.id === customer.id ? <View style={[styles.radioDot, { backgroundColor: theme.brand }]} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{customer.name}</Text>
              <Text style={[styles.cardMeta, { color: theme.subtle }]}>{customer.id} - {customer.phone}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (step === 3) {
    return (
      <View style={[styles.workflowPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Booking Confirmation</Text>
        <View style={styles.infoCardWithAction}>
          <InfoLine theme={theme} label="Customer ID" value={selectedCustomer?.id || "-"} />
          <Button title="Edit" size="sm" variant="secondary" fullWidth={false} onPress={() => onStep(2)} />
        </View>
        <View style={styles.infoCardWithAction}>
          <InfoLine theme={theme} label="Customer Name" value={selectedCustomer?.name || "-"} />
          <Button title="Edit" size="sm" variant="secondary" fullWidth={false} onPress={() => onStep(2)} />
        </View>
        <InfoLine theme={theme} label="Phone Number" value={selectedCustomer?.phone || "-"} />
        <InfoLine theme={theme} label="Property" value={selectedAsset?.property_name || "-"} />
        <InfoLine theme={theme} label="Plot / Unit" value={selectedAsset?.plot_number || selectedAsset?.id || "-"} />
        <InfoLine theme={theme} label="Booking Status" value="Ready for final confirmation" />
        <Timeline theme={theme} steps={["Property selected", "Customer linked", "Confirmation pending"]} />
      </View>
    );
  }

  return (
    <View style={[styles.workflowPanel, styles.confirmPanel, { backgroundColor: theme.card, borderColor: theme.success }]}>
      <View style={[styles.confirmIcon, { backgroundColor: theme.success }]}>
        <Feather name="check" size={34} color={colors.white} />
      </View>
      <Text style={[styles.confirmTitle, { color: theme.text }]}>Booking Updated</Text>
      <Text style={[styles.cardMeta, { color: theme.subtle, textAlign: "center" }]}>The property and customer have been linked successfully. Share the confirmation details or continue to booking management.</Text>
      <View style={[styles.qrPlaceholder, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <View style={[styles.qrGrid, { borderColor: theme.subtle }]}>
          <View style={[styles.qrCorner, styles.qrCornerTopLeft, { borderColor: theme.brand }]} />
          <View style={[styles.qrCorner, styles.qrCornerTopRight, { borderColor: theme.brand }]} />
          <View style={[styles.qrCorner, styles.qrCornerBottomLeft, { borderColor: theme.brand }]} />
          <View style={[styles.qrCorner, styles.qrCornerBottomRight, { borderColor: theme.brand }]} />
          <Text style={[styles.qrLabel, { color: theme.subtle }]}>QR Placeholder</Text>
        </View>
      </View>
      <Timeline theme={theme} steps={["Property selected", "Customer linked", "Confirmed", "Successfully updated"]} />
    </View>
  );
}

function FormField({ theme, label, value, onChangeText, placeholder, keyboardType }: any) {
  return (
    <View style={styles.formField}>
      <Text style={[styles.infoLabel, { color: theme.subtle }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        keyboardType={keyboardType}
        style={[styles.formInput, { color: theme.text, backgroundColor: theme.cardAlt, borderColor: theme.border }]}
      />
    </View>
  );
}

function InfoDrawer({ theme, open, mode, asset, property, profile, onClose, onBook, onCustomer }: any) {
  const isAgentMode = mode === "agent";
  const agent = asset?.agent;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.drawer, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.drawerHeader}>
            <View>
              <Text style={[styles.drawerTitle, { color: theme.text }]}>
                {isAgentMode ? agent?.name || "Agent Details" : mode === "plot" ? asset?.plot_number || "Plot Details" : property?.name || "Property Details"}
              </Text>
              <Text style={[styles.cardMeta, { color: theme.subtle }]}>
                {isAgentMode ? "Sub-agent profile, coverage, and activity" : "Customer, CRM owner, documents, and activity timeline"}
              </Text>
            </View>
            <TouchableOpacity style={[styles.iconButton, { borderColor: theme.border }]} onPress={onClose}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.drawerBody}>
            {isAgentMode ? (
              <>
                <Avatar name={agent?.name || "Agent"} theme={theme} large />
                <InfoLine theme={theme} label="Agent ID" value={agent?.id || "AG-101"} />
                <InfoLine theme={theme} label="Phone" value={agent?.phone || "-"} />
                <InfoLine theme={theme} label="Email" value={agent?.email || "-"} />
                <InfoLine theme={theme} label="Portfolio Coverage" value="4 properties" />
                <Timeline theme={theme} steps={["Lead captured", "Visit scheduled", "Booking created", "Customer follow-up"]} />
              </>
            ) : (
              <>
                <PropertyMedia image={property?.image || asset?.property_image} videoUrl={property?.videoUrl || asset?.property_video_url} style={styles.drawerMedia} />
                <SectionMini theme={theme} title="Property Information">
                  <InfoLine theme={theme} label="Project" value={property?.name || asset?.property_name || "-"} />
                  <InfoLine theme={theme} label="Location" value={property?.location || "Hyderabad"} />
                  <InfoLine theme={theme} label="Investment Range" value={`Starting from ${formatINRFull(asset?.price || property?.startingPrice || 0)} onwards`} />
                </SectionMini>
                <SectionMini theme={theme} title="Customer Information">
                  <InfoLine theme={theme} label="Customer ID" value="CUST-1021" />
                  <InfoLine theme={theme} label="Name" value="Ramesh Kumar" />
                  <InfoLine theme={theme} label="Phone" value="+91 98765 43210" />
                  <InfoLine theme={theme} label="Email" value="ramesh.kumar@email.com" />
                </SectionMini>
                <SectionMini theme={theme} title="CRM Owner">
                  <InfoLine theme={theme} label="Agent" value={asset?.agent_name || profile?.name || "-"} />
                  <InfoLine theme={theme} label="Manager" value={profile?.manager_name || "-"} />
                </SectionMini>
                <SectionMini theme={theme} title="Documents">
                  <InfoLine theme={theme} label="Sale Brochure" value="Ready" />
                  <InfoLine theme={theme} label="Layout Plan" value="Ready" />
                  <InfoLine theme={theme} label="Booking Form" value="Pending" />
                </SectionMini>
                <SectionMini theme={theme} title="Activity Timeline">
                  <Timeline theme={theme} steps={["Viewed property", "Customer contacted", "Site visit scheduled", "Booking pending"]} />
                </SectionMini>
              </>
            )}
          </ScrollView>
          {!isAgentMode ? (
            <View style={styles.drawerActions}>
              <Button title="Make Booking" onPress={() => onBook(asset)} />
              <Button title="View Customer" variant="secondary" onPress={onCustomer} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function BottomNav({ theme, activePage, onNavigate }: any) {
  const items = NAV_ITEMS.slice(0, 5);
  return (
    <View style={[styles.bottomNav, { backgroundColor: theme.panel, borderColor: theme.border }]}>
      {items.map((item) => (
        <TouchableOpacity key={item.key} style={styles.bottomNavItem} onPress={() => onNavigate(item.key)}>
          <Feather name={item.icon} size={19} color={activePage === item.key ? theme.brand : theme.subtle} />
          <Text style={[styles.bottomNavText, { color: activePage === item.key ? theme.brand : theme.subtle }]} numberOfLines={1}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MobileMenu({ theme, open, activePage, profile, onClose, onNavigate, onLogout }: any) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.mobileSheet, { backgroundColor: theme.panel }]}>
          <View style={styles.drawerHeader}>
            <View style={[styles.agentMiniCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              <Avatar name={profile?.name || "Agent"} theme={theme} />
              <View>
                <Text style={[styles.agentMiniName, { color: theme.text }]}>{profile?.name || "Agent"}</Text>
                <Text style={[styles.agentMiniRole, { color: theme.subtle }]}>Rivan Agent OS</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.iconButton, { borderColor: theme.border }]} onPress={onClose}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.navStack}>
            {NAV_ITEMS.map((item) => (
              <NavButton key={item.key} item={item} active={activePage === item.key} theme={theme} onPress={() => onNavigate(item.key)} />
            ))}
          </View>
          <Button title="Logout" variant="danger" onPress={onLogout} />
        </View>
      </View>
    </Modal>
  );
}

function AgentEditorModal({ theme, open, form, editing, saving, onChange, onClose, onSave }: any) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.drawer, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.drawerHeader}>
            <View>
              <Text style={[styles.drawerTitle, { color: theme.text }]}>Edit Agent</Text>
              <Text style={[styles.cardMeta, { color: theme.subtle }]}>Manage profile details, status, and manager-linked access.</Text>
            </View>
            <TouchableOpacity style={[styles.iconButton, { borderColor: theme.border }]} onPress={onClose}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.drawerBody}>
            <FormField theme={theme} label="Full Name" value={form.name} onChangeText={(value: string) => onChange({ name: value })} placeholder="Agent name" />
            <FormField theme={theme} label="Phone" value={form.phone} onChangeText={(value: string) => onChange({ phone: value })} placeholder="+91 98765 43210" keyboardType="phone-pad" />
            <FormField theme={theme} label="Email" value={form.email} onChangeText={(value: string) => onChange({ email: value })} placeholder="agent@email.com" keyboardType="email-address" />
            <FormField theme={theme} label="Age" value={form.age} onChangeText={(value: string) => onChange({ age: value.replace(/\D/g, "") })} placeholder="32" keyboardType="number-pad" />
            <FormField theme={theme} label="Aadhaar Number" value={form.aadhaar_number} onChangeText={(value: string) => onChange({ aadhaar_number: value })} placeholder="XXXX XXXX XXXX" />
            <FormField theme={theme} label="Bank Details" value={form.bank_details} onChangeText={(value: string) => onChange({ bank_details: value })} placeholder="Bank / account reference" />
            <View style={styles.statusSelector}>
              {["active", "pending", "suspended"].map((status) => (
                <FilterPill key={status} theme={theme} label={titleCase(status)} active={form.status === status} onPress={() => onChange({ status })} />
              ))}
            </View>
          </ScrollView>
          <View style={styles.drawerActions}>
            <Button title="Save Agent" onPress={onSave} loading={saving} />
            <Button title="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NavButton({ item, active, theme, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.navButton, active && [styles.navButtonActive, { backgroundColor: theme.brandSoft, borderColor: theme.brand }]]} onPress={onPress}>
      <Feather name={item.icon} size={18} color={active ? theme.brand : theme.subtle} />
      <Text style={[styles.navButtonText, { color: active ? theme.brand : theme.subtle }]}>{item.label}</Text>
    </TouchableOpacity>
  );
}

function MetricCard({ theme, label, value, icon, color }: any) {
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}22` }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.metricValue, { color: theme.text }]}>{String(value)}</Text>
      <Text style={[styles.metricLabel, { color: theme.subtle }]}>{label}</Text>
    </View>
  );
}

function SectionShell({ theme, title, action, children }: any) {
  return (
    <View style={[styles.sectionShell, { backgroundColor: theme.panel, borderColor: theme.border }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {action ? <Text style={[styles.sectionAction, { color: theme.brand }]}>{action}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function SectionMini({ theme, title, children }: any) {
  return (
    <View style={[styles.sectionMini, { borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Toolbar({ theme, children }: any) {
  return (
    <View style={[styles.toolbar, { backgroundColor: theme.panel, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

function SearchBox({ theme, value, onChangeText, placeholder }: any) {
  return (
    <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Feather name="search" size={16} color={theme.subtle} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        style={[styles.searchInput, { color: theme.text }]}
      />
    </View>
  );
}

function FilterPill({ theme, label, active, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.filterPill, { backgroundColor: active ? theme.brand : theme.card, borderColor: active ? theme.brand : theme.border }]} onPress={onPress}>
      <Text style={[styles.filterText, { color: active ? colors.white : theme.subtle }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResponsiveTable({ theme, headers, rows }: any) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.table, { borderColor: theme.border }]}>
        <View style={[styles.tableRow, styles.tableHeaderRow, { backgroundColor: theme.cardAlt }]}>
          {headers.map((header: string) => <Text key={header} style={[styles.tableHeaderCell, { color: theme.subtle }]}>{header}</Text>)}
          <Text style={[styles.tableHeaderCell, { color: theme.subtle }]}>Action</Text>
        </View>
        {rows.map((row: any) => (
          <View key={row.id} style={[styles.tableRow, { borderColor: theme.border }]}>
            {row.cells.map((cell: string, index: number) => <Text key={`${row.id}-${index}`} style={[styles.tableCell, { color: theme.text }]} numberOfLines={1}>{cell}</Text>)}
            <View style={styles.tableActionCell}>
              {row.action ? <Button title={row.actionLabel || "Update"} size="sm" variant="secondary" fullWidth={false} onPress={row.action} /> : <StatusPill theme={theme} status="Closed" />}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ActivityRow({ theme, icon, title, detail, time }: any) {
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: theme.brandSoft }]}>
        <Feather name={icon} size={16} color={theme.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.activityTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardMeta, { color: theme.subtle }]}>{detail}</Text>
      </View>
      <Text style={[styles.cardMeta, { color: theme.muted }]}>{time}</Text>
    </View>
  );
}

function ContactActions({ theme, phone, email }: any) {
  const actions = [
    phone ? { key: "call", icon: "phone-call" as const, label: "Call", onPress: () => openDialer(phone) } : null,
    phone ? { key: "whatsapp", icon: "message-circle" as const, label: "WhatsApp", onPress: () => openWhatsApp(phone) } : null,
    email ? { key: "mail", icon: "mail" as const, label: "Email", onPress: () => openEmail(email) } : null,
  ].filter(Boolean) as Array<{ key: string; icon: any; label: string; onPress: () => void }>;

  if (!actions.length) return null;
  return (
    <View style={styles.telecomRow}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.key}
          style={[styles.telecomButton, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
          onPress={action.onPress}
        >
          <Feather name={action.icon} size={14} color={theme.brand} />
          <Text style={[styles.telecomButtonText, { color: theme.brand }]}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function InfoLine({ theme, label, value }: any) {
  return (
    <View style={styles.infoLine}>
      <Text style={[styles.infoLabel, { color: theme.subtle }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={2}>{String(value || "-")}</Text>
    </View>
  );
}

function MiniStat({ theme, label, value }: any) {
  return (
    <View style={[styles.miniStat, { backgroundColor: theme.cardAlt }]}>
      <Text style={[styles.miniStatValue, { color: theme.text }]}>{String(value)}</Text>
      <Text style={[styles.miniStatLabel, { color: theme.subtle }]}>{label}</Text>
    </View>
  );
}

function StatusPill({ theme, status }: any) {
  const raw = String(status || "pending").toLowerCase();
  const color = raw.includes("cancel") ? theme.danger : raw.includes("active") || raw.includes("complete") || raw.includes("approved") ? theme.success : raw.includes("confirm") ? theme.info : theme.warning;
  return (
    <View style={[styles.statusPill, { backgroundColor: `${color}20` }]}>
      <Text style={[styles.statusText, { color }]}>{titleCase(raw)}</Text>
    </View>
  );
}

function Timeline({ theme, steps }: any) {
  return (
    <View style={styles.timeline}>
      {steps.map((step: string, index: number) => (
        <View key={`${step}-${index}`} style={styles.timelineItem}>
          <View style={[styles.timelineDot, { backgroundColor: index === steps.length - 1 ? theme.brand : theme.success }]} />
          <Text style={[styles.timelineText, { color: theme.subtle }]}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

function Rating({ theme, value }: any) {
  return (
    <View style={styles.ratingRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Feather key={star} name="star" size={14} color={star <= Math.round(value) ? theme.warning : theme.border} />
      ))}
      <Text style={[styles.cardMeta, { color: theme.subtle }]}>{value.toFixed(1)}</Text>
    </View>
  );
}

function Avatar({ theme, name, small, large }: any) {
  const size = large ? 72 : small ? 30 : 42;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.brandSoft }]}>
      <Text style={[styles.avatarText, { color: theme.brand, fontSize: large ? 24 : 14 }]}>{initials(name)}</Text>
    </View>
  );
}

function createTheme(isDark: boolean) {
  return {
    bg: isDark ? "#0B1110" : "#F5F7F4",
    panel: isDark ? "#121A18" : "#FFFFFF",
    card: isDark ? "#17211E" : "#FFFFFF",
    cardAlt: isDark ? "#1D2824" : "#F0F4EF",
    sidebar: isDark ? "#0F1815" : "#FFFFFF",
    text: isDark ? "#F3F7F1" : "#102018",
    subtle: isDark ? "#AAB8B0" : "#5E6B63",
    muted: isDark ? "#728077" : "#96A098",
    border: isDark ? "#27352F" : "#DDE5DD",
    brand: "#0B6B35",
    brandAlt: "#C66A2E",
    brandSoft: isDark ? "#113A28" : "#E5F5EB",
    success: "#159A5B",
    warning: "#D99B20",
    danger: "#D94D45",
    info: "#3478D6",
    road: isDark ? "#26342F" : "#D9DED6",
    roadText: isDark ? "#AAB8B0" : "#6B756E",
  };
}

function getVisitBucket(status?: string) {
  const raw = String(status || "upcoming").toLowerCase();
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("complete")) return "completed";
  return "upcoming";
}

function isBookableAsset(asset?: any) {
  const raw = String(asset?.status || "available").toLowerCase();
  return raw === "available" || raw === "reserved";
}

function getNextBookingAction(status?: string) {
  const raw = String(status || "pending").toLowerCase();
  if (raw === "pending") return { label: "Request Approval", next: "approval requested" };
  if (raw === "approval requested") return { label: "Approve", next: "approved" };
  if (raw === "approved") return { label: "Confirm", next: "confirmed" };
  if (raw === "confirmed" || raw === "ongoing" || raw === "site visit scheduled") return { label: "Complete", next: "completed" };
  if (raw === "completed") return { label: "Close", next: "closed" };
  return null;
}

function nextPipelineActions(stage?: string) {
  const orderedStages = CRM_PIPELINE_STAGES;
  const currentIndex = orderedStages.indexOf(String(stage || "new"));
  if (currentIndex === -1) return [];
  if (stage === "closed_won" || stage === "booked" || stage === "closed_lost") return [];
  const next = orderedStages[currentIndex + 1];
  const actions = next ? [next] : [];
  if (stage !== "closed_lost") {
    actions.push("closed_lost");
  }
  return actions.slice(0, 2);
}

function isDueDateOverdue(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function initials(name: string) {
  return String(name || "A")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function titleCase(value: string) {
  return String(value || "")
    .split(" ")
    .map((word) => word ? word[0].toUpperCase() + word.slice(1) : "")
    .join(" ");
}

function formatDate(value?: string) {
  if (!value) return "Today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sanitizePhone(phone?: string) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

async function openDialer(phone?: string) {
  const target = sanitizePhone(phone);
  if (!target) return;
  await Linking.openURL(`tel:${target}`);
}

async function openWhatsApp(phone?: string) {
  const digits = sanitizePhone(phone).replace(/[^\d]/g, "");
  if (!digits) return;
  await Linking.openURL(`https://wa.me/${digits}`);
}

async function openEmail(email?: string) {
  if (!email) return;
  await Linking.openURL(`mailto:${email}`);
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  shell: { flex: 1, flexDirection: "row", backgroundColor: "#0C120F" },
  workspace: { flex: 1, minWidth: 0 },
  pageGapSm: { gap: spacing.md },
  bookingModalSafe: { flex: 1 },
  bookingModalHeader: { borderBottomWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  bookingModalTitle: { fontSize: 22, lineHeight: 28, fontWeight: "900", letterSpacing: 0 },
  liveBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveDot: { width: 9, height: 9, borderRadius: 999 },
  liveBannerText: { fontSize: 13, lineHeight: 18, fontWeight: "800", flex: 1 },
  liveBannerSubtle: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  sidebar: {
    width: 300,
    borderRightWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  brandPanel: { borderWidth: 1, borderRadius: 20, padding: spacing.md, gap: spacing.md, ...shadow.sm },
  brandBlock: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandLogo: { width: 52, height: 52, borderRadius: 16 },
  brandName: { fontSize: 24, lineHeight: 28, fontWeight: "900", letterSpacing: 0 },
  brandSub: { fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0 },
  desktopBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  desktopBadgeText: { fontSize: 11, lineHeight: 14, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  agentMiniCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 20, padding: spacing.md },
  agentMiniName: { fontSize: 14, lineHeight: 18, fontWeight: "700", letterSpacing: 0 },
  agentMiniRole: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  agentMiniMeta: { fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 3 },
  navStack: { gap: spacing.md, flex: 1 },
  navGroup: { gap: 8 },
  navGroupLabel: { fontSize: 11, lineHeight: 14, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: 12 },
  navButton: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "transparent" },
  navButtonActive: { ...shadow.sm },
  navButtonText: { fontSize: 14, lineHeight: 18, fontWeight: "700", letterSpacing: 0 },
  logoutButton: { flexDirection: "row", gap: 10, alignItems: "center", borderTopWidth: 1, paddingTop: spacing.md },
  logoutText: { fontSize: 14, lineHeight: 18, fontWeight: "700", letterSpacing: 0 },
  topBar: {
    minHeight: 94,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  topLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, minWidth: 0 },
  pageCopy: { flex: 1, gap: 4, minWidth: 0 },
  pageEyebrow: { fontSize: 11, lineHeight: 14, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  topActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  desktopStatusChip: { minHeight: 40, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  desktopStatusChipText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontSize: 32, lineHeight: 38, fontWeight: "900", letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  profileChip: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 240, minHeight: 48, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1 },
  profileChipText: { fontSize: 13, lineHeight: 18, fontWeight: "700", letterSpacing: 0 },
  profileChipSubtext: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  contentScroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  contentDesktop: { width: "100%", maxWidth: 1560, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  contentMobile: { padding: spacing.md },
  pageGap: { gap: spacing.lg },
  spotlightHero: {
    borderWidth: 1,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.sm,
  },
  spotlightCopy: { gap: spacing.sm },
  spotlightEyebrow: { fontSize: 11, lineHeight: 15, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1 },
  spotlightTitle: { fontSize: 28, lineHeight: 34, fontWeight: "900", maxWidth: 680 },
  spotlightSubtitle: { fontSize: 14, lineHeight: 22, maxWidth: 680 },
  spotlightStats: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  spotlightStatCard: { minWidth: 180, borderRadius: 18, padding: spacing.md, gap: 6 },
  spotlightStatValue: { fontSize: 28, lineHeight: 34, fontWeight: "900" },
  spotlightStatLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  kpiGrid: { gap: spacing.md },
  kpiGridTablet: { flexDirection: "row", flexWrap: "wrap" },
  metricCard: { flexGrow: 1, flexBasis: 180, minWidth: 160, borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: 10, ...shadow.sm },
  metricIcon: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  metricValue: { fontSize: 23, lineHeight: 28, fontWeight: "800", letterSpacing: 0 },
  metricLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0 },
  twoColumn: { gap: spacing.lg },
  twoColumnWide: { flexDirection: "row", alignItems: "flex-start" },
  sectionShell: { flex: 1, borderWidth: 1, borderRadius: 22, padding: spacing.lg, gap: spacing.md, ...shadow.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingBottom: spacing.sm, marginBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: "900", letterSpacing: -0.2 },
  sectionAction: { fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 0 },
  propertyGrid: { gap: spacing.md },
  propertyGridWide: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  propertyCard: { flexBasis: 260, flexGrow: 1, borderWidth: 1, borderRadius: 8, overflow: "hidden", ...shadow.sm },
  propertyCardCompact: { flexDirection: "row", minHeight: 150 },
  propertyImage: { height: 150, width: "100%" },
  propertyImageCompact: { width: 150, height: "100%" },
  propertyBody: { padding: spacing.md, gap: spacing.sm, flex: 1 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800", letterSpacing: 0 },
  cardMeta: { fontSize: 12, lineHeight: 17, letterSpacing: 0 },
  priceText: { fontSize: 18, lineHeight: 24, fontWeight: "800", letterSpacing: 0 },
  cardStats: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  miniStat: { flex: 1, minWidth: 76, borderRadius: 8, padding: spacing.sm },
  miniStatValue: { fontSize: 15, lineHeight: 19, fontWeight: "800", letterSpacing: 0 },
  miniStatLabel: { fontSize: 10, lineHeight: 14, fontWeight: "700", letterSpacing: 0 },
  actionRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", alignItems: "center" },
  pipelineBoard: { gap: spacing.lg, alignItems: "flex-start", paddingBottom: spacing.sm },
  pipelineColumn: { width: 360, minHeight: 480, borderWidth: 1, borderRadius: 22, padding: spacing.md, gap: spacing.md, ...shadow.sm },
  pipelineColumnHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1 },
  pipelineColumnTitle: { fontSize: 16, lineHeight: 21, fontWeight: "900" },
  pipelineStageCount: { minWidth: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  pipelineStageCountText: { fontSize: 13, lineHeight: 16, fontWeight: "900" },
  pipelineColumnBody: { gap: spacing.md },
  pipelineCard: { borderRadius: 18 },
  activityList: { gap: spacing.sm },
  activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  activityIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  activityTitle: { fontSize: 13, lineHeight: 17, fontWeight: "800", letterSpacing: 0 },
  telecomRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  telecomButton: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 34,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  telecomButtonText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  toolbar: { borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: spacing.md, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  searchBox: { flex: 1, minWidth: 220, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing.md, minHeight: 44 },
  searchInput: { flex: 1, fontSize: 14, lineHeight: 18, letterSpacing: 0 },
  segmentButton: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  filterRow: { gap: spacing.sm, alignItems: "center" },
  filterPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 9 },
  filterText: { fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 0 },
  listStack: { gap: spacing.md },
  layoutPanel: { borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: spacing.md, minHeight: 430 },
  plotBoard: { width: 600, padding: spacing.md, gap: spacing.md },
  road: { height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  roadText: { fontSize: 11, lineHeight: 14, fontWeight: "800", letterSpacing: 0 },
  plotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  plotCell: { width: 86, height: 72, borderWidth: 1.5, borderRadius: 6, padding: 7, justifyContent: "space-between" },
  plotNo: { fontSize: 13, lineHeight: 17, fontWeight: "900", letterSpacing: 0 },
  plotSize: { fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0 },
  emptyPanel: { borderWidth: 1, borderRadius: 8, padding: spacing.lg, alignItems: "center" },
  workflowSteps: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  workflowStep: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: spacing.sm },
  stepDot: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  stepDotText: { fontSize: 12, lineHeight: 16, fontWeight: "900", letterSpacing: 0 },
  stepText: { fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 0 },
  bookingWorkflow: { gap: spacing.md },
  bookingWorkflowWide: { flexDirection: "row", alignItems: "stretch" },
  workflowPanel: { flex: 1.4, borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: spacing.md },
  reviewPanel: { flex: 1, borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: spacing.md },
  customerRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", borderWidth: 1, borderRadius: 8, padding: spacing.sm },
  formGrid: { gap: spacing.sm },
  formField: { gap: 6 },
  formInput: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing.md, fontSize: 14, lineHeight: 18, letterSpacing: 0 },
  statusSelector: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  radio: { width: 18, height: 18, borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 9, height: 9, borderRadius: 999 },
  confirmPanel: { alignItems: "center", justifyContent: "center", minHeight: 260 },
  confirmIcon: { width: 78, height: 78, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  confirmTitle: { fontSize: 20, lineHeight: 26, fontWeight: "900", textAlign: "center", letterSpacing: 0 },
  qrPlaceholder: { width: "100%", borderWidth: 1, borderRadius: 16, padding: spacing.md, alignItems: "center", justifyContent: "center" },
  qrGrid: { width: 160, height: 160, borderWidth: 1, borderStyle: "dashed", borderRadius: 12, position: "relative", alignItems: "center", justifyContent: "center" },
  qrCorner: { position: "absolute", width: 26, height: 26, borderWidth: 3 },
  qrCornerTopLeft: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0 },
  qrCornerTopRight: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0 },
  qrCornerBottomLeft: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0 },
  qrCornerBottomRight: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0 },
  qrLabel: { fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  bookingFlowLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 12, 10, 0.36)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  bookingFlowLoaderCard: {
    minWidth: 240,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    ...shadow.lg,
  },
  table: { minWidth: 920, borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  tableRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, minHeight: 54 },
  tableHeaderRow: { minHeight: 42 },
  tableHeaderCell: { width: 128, paddingHorizontal: spacing.sm, fontSize: 11, lineHeight: 14, fontWeight: "900", letterSpacing: 0 },
  tableCell: { width: 128, paddingHorizontal: spacing.sm, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0 },
  tableActionCell: { width: 128, paddingHorizontal: spacing.sm },
  visitCard: { borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: spacing.md },
  infoGrid: { gap: spacing.sm },
  infoCardWithAction: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm },
  infoLine: { gap: 2 },
  infoLabel: { fontSize: 10, lineHeight: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0 },
  infoValue: { fontSize: 13, lineHeight: 18, fontWeight: "700", letterSpacing: 0 },
  timeline: { gap: spacing.sm },
  timelineItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timelineDot: { width: 9, height: 9, borderRadius: 999 },
  timelineText: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0 },
  agentGrid: { gap: spacing.md },
  agentGridWide: { flexDirection: "row", flexWrap: "wrap" },
  agentCard: { flexBasis: 300, flexGrow: 1, borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: spacing.md, ...shadow.sm },
  agentIdentity: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  agentStats: { flexDirection: "row", gap: spacing.sm },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  notificationRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: 8, padding: spacing.md },
  notificationIcon: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  profileHero: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: 8, padding: spacing.md, flexWrap: "wrap" },
  profileName: { fontSize: 24, lineHeight: 30, fontWeight: "900", letterSpacing: 0 },
  profileDetails: { gap: spacing.md },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 10, lineHeight: 13, fontWeight: "900", letterSpacing: 0 },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "900", letterSpacing: 0 },
  modalBackdrop: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  drawer: { width: "100%", maxWidth: 440, borderLeftWidth: 1, padding: spacing.lg, gap: spacing.md },
  drawerHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  drawerTitle: { fontSize: 21, lineHeight: 27, fontWeight: "900", letterSpacing: 0 },
  drawerBody: { gap: spacing.md, paddingBottom: spacing.lg },
  drawerMedia: { width: "100%", height: 180, borderRadius: 8, overflow: "hidden" },
  drawerActions: { gap: spacing.sm },
  sectionMini: { borderTopWidth: 1, paddingTop: spacing.md, gap: spacing.sm },
  mobileSheet: { width: "86%", maxWidth: 360, padding: spacing.lg, gap: spacing.lg },
  bottomNav: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
    ...shadow.lg,
  },
  bottomNavItem: { alignItems: "center", justifyContent: "center", gap: 4, flex: 1, minWidth: 0 },
  bottomNavText: { fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 0 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  loadingText: { fontSize: 13, lineHeight: 17, fontWeight: "700", letterSpacing: 0 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.sm },
  emptyTitle: { fontSize: 20, lineHeight: 26, fontWeight: "900", letterSpacing: 0 },
  emptyTitleSmall: { fontSize: 15, lineHeight: 20, fontWeight: "900", letterSpacing: 0, textAlign: "center" },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: "center", letterSpacing: 0 },
});
