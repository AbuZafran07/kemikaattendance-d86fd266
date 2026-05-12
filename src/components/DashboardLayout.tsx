import { ReactNode, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { 
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Calendar,
  Clock,
  FileText,
  Bell,
  Settings,
  LogOut,
  Menu,
  Plane,
  ChevronDown,
  UserCircle,
  DollarSign,
  CreditCard,
  BarChart3,
  FileCheck,
  Megaphone,
  ShieldCheck,
  Target,
  Trophy,
  MessageCircleMore,
  ArrowUp,
  Trash2,
  ArrowLeft,
  Settings2,
} from "lucide-react";
import HRDocumentModal from "@/components/HRDocumentModal";
import HRReferenceChips from "@/components/HRReferenceChips";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import MarqueeBanner from "@/components/MarqueeBanner";
import { useHRAssistant } from "@/hooks/useHRAssistant";

interface DashboardLayoutProps {
  children: ReactNode;
}

const buildNavigationGroups = (t: (k: string) => string) => [
  {
    label: t("nav.groups.ringkasan"),
    items: [
      { name: t("nav.items.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: t("nav.groups.manajemen"),
    items: [
      { name: t("nav.items.employees"), href: "/dashboard/employees", icon: Users },
      { name: t("nav.items.attendance"), href: "/dashboard/attendance", icon: ClipboardCheck },
      { name: t("nav.items.leave"), href: "/dashboard/leave", icon: Calendar },
      { name: t("nav.items.overtime"), href: "/dashboard/overtime", icon: Clock },
      { name: t("nav.items.businessTravel"), href: "/dashboard/business-travel", icon: Plane },
    ],
  },
  {
    label: t("nav.groups.keuangan"),
    items: [
      { name: t("nav.items.payroll"), href: "/dashboard/payroll", icon: DollarSign },
      { name: t("nav.items.payrollAnalytics"), href: "/dashboard/payroll-analytics", icon: BarChart3 },
      { name: t("nav.items.deduction"), href: "/dashboard/loans", icon: CreditCard },
      { name: t("nav.items.terManagement"), href: "/dashboard/ter-management", icon: FileText },
      { name: t("nav.items.buktiPotong"), href: "/dashboard/bukti-potong", icon: FileCheck },
      { name: t("nav.items.pph21Report"), href: "/dashboard/reports/pph21", icon: FileText },
    ],
  },
  {
    label: t("nav.groups.kpi"),
    items: [
      { name: t("nav.items.kpiManagement"), href: "/dashboard/kpi", icon: Target },
      { name: t("nav.items.kpiRecap"), href: "/dashboard/kpi-recap", icon: Trophy },
    ],
  },
  {
    label: t("nav.groups.laporan"),
    items: [
      { name: t("nav.items.reports"), href: "/dashboard/reports", icon: FileText },
      { name: t("nav.items.approvalAuditLog"), href: "/dashboard/approval-audit-log", icon: ShieldCheck },
      { name: t("nav.items.payrollAuditLog"), href: "/dashboard/payroll-audit-log", icon: ShieldCheck },
      { name: t("nav.items.notifications"), href: "/dashboard/notifications", icon: Bell },
    ],
  },
  {
    label: t("nav.groups.sistem"),
    items: [
      { name: t("nav.items.announcements"), href: "/dashboard/announcements", icon: Megaphone },
      { name: t("nav.items.settings"), href: "/dashboard/settings", icon: Settings },
    ],
  },
];

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { t } = useTranslation();
  const { signOut, profile, userRole } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isHRPanelOpen, setIsHRPanelOpen] = useState(false);
  const [isHRMobileOpen, setIsHRMobileOpen] = useState(false);
  const [isHRDocsOpen, setIsHRDocsOpen] = useState(false);
  const { hrMessages, hrInput, setHrInput, hrLoading, hrMessagesEndRef, sendHRMessage, clearMessages } = useHRAssistant();
  const navigationGroups = buildNavigationGroups(t);

  // Fetch signed photo URL
  useEffect(() => {
    const fetchPhoto = async () => {
      if (!profile?.photo_url) return;
      let path = profile.photo_url;
      if (path.startsWith("http")) {
        const match = path.match(/employee-photos\/(.+)$/);
        if (match) path = match[1];
        else { setPhotoUrl(path); return; }
      }
      const { data } = await supabase.storage.from("employee-photos").createSignedUrl(path, 3600);
      if (data) setPhotoUrl(data.signedUrl);
    };
    fetchPhoto();
  }, [profile?.photo_url]);

  // Fetch pending requests count for notification badge
  useEffect(() => {
    const fetchPendingCount = async () => {
      const [leaveRes, overtimeRes, travelRes] = await Promise.all([
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("business_travel_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      const total = (leaveRes.count || 0) + (overtimeRes.count || 0) + (travelRes.count || 0);
      setPendingCount(total);
    };
    fetchPendingCount();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("pending-requests-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, fetchPendingCount)
      .on("postgres_changes", { event: "*", schema: "public", table: "overtime_requests" }, fetchPendingCount)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_travel_requests" }, fetchPendingCount)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLogout = () => {
    signOut();
  };

  const UserDropdown = ({ mobile = false }: { mobile?: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {mobile ? (
          <button className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center">
            <EmployeeAvatar
              src={photoUrl}
              name={profile?.full_name}
              size="sm"
              lazy={false}
              className="h-8 w-8"
              fallbackClassName="bg-white/15 text-white"
            />
          </button>
        ) : (
          <button className="flex items-center gap-3 hover:opacity-80 transition-opacity outline-none">
            <div className="relative">
              <EmployeeAvatar
                src={photoUrl}
                name={profile?.full_name}
                size="md"
                lazy={false}
                className="h-10 w-10 border-2 border-primary/20"
              />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-primary border-2 border-card" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold leading-tight">{profile?.full_name}</p>
              <span className="inline-block mt-0.5 text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                {t("common.admin")}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => navigate("/employee/profile")}>
          <UserCircle className="h-4 w-4 mr-2" />
          {t("common.myProfile")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          {t("common.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full bg-[hsl(161,80%,14%)] text-white">
      {/* Navigation - no header */}
      <nav className="flex-1 py-4 px-3 space-y-5 overflow-y-auto">
        {navigationGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-2 text-[10px] font-bold tracking-[0.15em] text-white/35 uppercase select-none">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === "/dashboard"}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/60 hover:bg-white/8 hover:text-white transition-all duration-200 ease-out text-[13px] hover:translate-x-0.5"
                  activeClassName="!bg-primary !text-white font-semibold shadow-lg shadow-primary/20 hover:!bg-primary hover:!text-white hover:!translate-x-0"
                >
                  <item.icon className="h-[18px] w-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  <span className="transition-all duration-200">{item.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/8">
        <p className="text-[9px] text-white/25 text-center tracking-wide">© 2026 PT. Kemika Karya Pratama</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Marquee Banner */}
      <MarqueeBanner />
      {/* Full-width Top Header (desktop) */}
      <div className="hidden lg:block flex-shrink-0">
        <div className="flex items-center justify-between h-16 px-6 bg-card border-b border-border">
          {/* Left: Logo + Company name */}
          <div className="flex items-center gap-3">
            <img src={logo} alt="Kemika" className="h-9 object-contain" />
            <div>
              <h2 className="text-sm font-bold text-foreground leading-tight">{t("common.appName")}</h2>
              <p className="text-[11px] text-muted-foreground">{t("common.appTagline")}</p>
            </div>
          </div>

          {/* Right: HR Assistant + Language + Bell + User dropdown */}
          {profile && (
            <div className="flex items-center gap-3">
              <style>{`
                @keyframes hrDotPulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.4; }
                }
                .hr-dot-pulse { animation: hrDotPulse 2s infinite; }
              `}</style>
              <div className="relative group">
                <button
                  onClick={() => setIsHRPanelOpen(true)}
                  style={{
                    width: 34, height: 34, borderRadius: 9,
                    background: "#0F6E56",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
                  }}
                >
                  <MessageCircleMore style={{ width: 18, height: 18, color: "white" }} />
                  <span
                    className="hr-dot-pulse"
                    style={{
                      position: "absolute", top: -3, right: -3,
                      width: 9, height: 9, borderRadius: "50%",
                      background: "#5DCAA5", border: "2px solid white",
                    }}
                  />
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-foreground text-background text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  HR Assistant
                </div>
              </div>
              <LanguageSwitcher variant="ghost" />
              <NotificationDropdown pendingCount={pendingCount} />
              <UserDropdown />
            </div>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[hsl(161,80%,14%)] flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Kemika" className="h-8 w-8 object-contain rounded bg-white/10 p-0.5" />
          <span className="text-white font-semibold text-sm">KEMIKA</span>
        </div>
        <div className="flex items-center gap-2">
          {/* HR Assistant mobile icon */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setIsHRMobileOpen(true)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: "rgba(255,255,255,0.20)",
                border: "1px solid rgba(255,255,255,0.40)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              <MessageCircleMore style={{ width: 16, height: 16, color: "white" }} />
            </button>
            <span
              className="hr-dot-pulse"
              style={{
                position: "absolute", top: -3, right: -3,
                width: 8, height: 8, borderRadius: "50%",
                background: "#5DCAA5", border: "1.5px solid #0F6E56",
              }}
            />
          </div>
          <LanguageSwitcher variant="ghost" className="text-white hover:bg-white/10" />
          <div className="relative">
            <NotificationDropdown pendingCount={pendingCount} />
          </div>
          <UserDropdown mobile />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[250px] p-0 border-0">
              <Sidebar mobile />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-[250px] flex-shrink-0">
          <Sidebar />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>

      {/* HR Assistant Slide-over Panel */}
      {isHRPanelOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          {/* Backdrop */}
          <div
            style={{ flex: 1, background: "rgba(0,0,0,0.3)" }}
            onClick={() => setIsHRPanelOpen(false)}
          />
          {/* Panel */}
          <div
            style={{
              width: 420,
              height: "100vh",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              animation: "hrPanelSlideIn 250ms ease",
            }}
          >
            <style>{`
              @keyframes hrPanelSlideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>

            {/* Header */}
            <div style={{ height: 56, background: "#0F6E56", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <MessageCircleMore style={{ width: 20, height: 20, color: "white" }} />
                <div>
                  <p style={{ color: "white", fontWeight: 500, fontSize: 15, lineHeight: 1.2, margin: 0 }}>HR Assistant</p>
                  <p style={{ color: "white", fontSize: 11, opacity: 0.8, margin: 0 }}>Asisten virtual perusahaan Kemika</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {userRole === "admin" && (
                  <button
                    onClick={() => setIsHRDocsOpen(true)}
                    title="Knowledge Base"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", opacity: 0.75, borderRadius: 6 }}
                  >
                    <Settings2 style={{ width: 16, height: 16, color: "white" }} />
                  </button>
                )}
                <button
                  onClick={clearMessages}
                  title="Hapus riwayat chat"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", opacity: 0.75, borderRadius: 6 }}
                >
                  <Trash2 style={{ width: 16, height: 16, color: "white" }} />
                </button>
                <button onClick={() => setIsHRPanelOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", opacity: 0.75, borderRadius: 6 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Quick Chips */}
            <div style={{ flexShrink: 0, overflowX: "auto", display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid #e5e7eb", scrollbarWidth: "none" }}>
              {["Prosedur cuti", "Aturan lembur", "SOP absensi", "Pengajuan reimburse", "KPI & penilaian"].map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendHRMessage(chip)}
                  style={{
                    flexShrink: 0, whiteSpace: "nowrap",
                    padding: "5px 12px", borderRadius: 9999,
                    border: "1px solid #d0e8e0", background: "white",
                    color: "#0F6E56", fontSize: 12, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <style>{`
                @keyframes hrDotBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
              `}</style>
              {hrMessages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                  <MessageCircleMore style={{ width: 40, height: 40, color: "#0F6E56", opacity: 0.3 }} />
                  <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
                    Halo! Saya HR Assistant Kemika.<br />Ada yang bisa saya bantu?
                  </p>
                </div>
              )}
              {hrMessages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "user" ? (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{
                        maxWidth: "78%", padding: "10px 14px",
                        borderRadius: "12px 0 12px 12px",
                        background: "#0F6E56", color: "white",
                        fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          <MessageCircleMore style={{ width: 13, height: 13, color: "#0F6E56" }} />
                        </div>
                        <div style={{
                          maxWidth: "78%", padding: "10px 14px",
                          borderRadius: "0 12px 12px 12px",
                          background: "#f3f4f6", color: "#111827",
                          fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
                        }}>
                          {msg.content}
                        </div>
                      </div>
                      <HRReferenceChips references={msg.references} />
                    </div>
                  )}
                </div>
              ))}
              {hrLoading && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                    <MessageCircleMore style={{ width: 13, height: 13, color: "#0F6E56" }} />
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: "0 12px 12px 12px", background: "#f3f4f6", display: "flex", gap: 4, alignItems: "center" }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#0F6E56", display: "inline-block", animation: `hrDotBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={hrMessagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, alignItems: "flex-end", background: "#fff", flexShrink: 0 }}>
              <textarea
                value={hrInput}
                onChange={(e) => {
                  setHrInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendHRMessage(); } }}
                placeholder="Tanya tentang SOP, cuti, KPI..."
                rows={1}
                style={{
                  flex: 1, resize: "none", border: "1px solid #d1d5db", borderRadius: 12,
                  padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit",
                  lineHeight: 1.5, overflowY: "hidden",
                }}
              />
              <button
                onClick={() => sendHRMessage()}
                disabled={!hrInput.trim() || hrLoading}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
                  background: !hrInput.trim() || hrLoading ? "#d1d5db" : "#0F6E56",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  transition: "background 150ms",
                }}
              >
                <ArrowUp style={{ width: 16, height: 16, color: "white" }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HR Assistant Mobile Full-screen Modal */}
      {isHRMobileOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#fff", display: "flex", flexDirection: "column", animation: "hrMobileSlideUp 300ms ease" }}>
          <style>{`@keyframes hrMobileSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

          {/* Mobile Modal Header */}
          <div style={{ height: 56, background: "#0F6E56", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setIsHRMobileOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", marginRight: 4 }}>
                <ArrowLeft style={{ width: 20, height: 20, color: "white" }} />
              </button>
              <MessageCircleMore style={{ width: 20, height: 20, color: "white" }} />
              <div>
                <p style={{ color: "white", fontWeight: 500, fontSize: 15, lineHeight: 1.2, margin: 0 }}>HR Assistant</p>
                <p style={{ color: "white", fontSize: 11, opacity: 0.8, margin: 0 }}>Asisten virtual perusahaan Kemika</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {userRole === "admin" && (
                <button
                  onClick={() => setIsHRDocsOpen(true)}
                  title="Knowledge Base"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", opacity: 0.75 }}
                >
                  <Settings2 style={{ width: 16, height: 16, color: "white" }} />
                </button>
              )}
              <button
                onClick={clearMessages}
                title="Hapus riwayat chat"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", opacity: 0.75 }}
              >
                <Trash2 style={{ width: 16, height: 16, color: "white" }} />
              </button>
            </div>
          </div>

          {/* Quick Chips */}
          <div style={{ flexShrink: 0, overflowX: "auto", display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid #e5e7eb", scrollbarWidth: "none" }}>
            {["Prosedur cuti", "Aturan lembur", "SOP absensi", "Pengajuan reimburse", "KPI & penilaian"].map((chip) => (
              <button
                key={chip}
                onClick={() => sendHRMessage(chip)}
                style={{
                  flexShrink: 0, whiteSpace: "nowrap",
                  padding: "5px 12px", borderRadius: 9999,
                  border: "1px solid #d0e8e0", background: "white",
                  color: "#0F6E56", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {hrMessages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <MessageCircleMore style={{ width: 40, height: 40, color: "#0F6E56", opacity: 0.3 }} />
                <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
                  Halo! Saya HR Assistant Kemika.<br />Ada yang bisa saya bantu?
                </p>
              </div>
            )}
            {hrMessages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: "12px 0 12px 12px", background: "#0F6E56", color: "white", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                        <MessageCircleMore style={{ width: 13, height: 13, color: "#0F6E56" }} />
                      </div>
                      <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: "0 12px 12px 12px", background: "#f3f4f6", color: "#111827", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </div>
                    </div>
                    <div style={{ marginLeft: 32, background: "#E1F5EE", borderLeft: "3px solid #1D9E75", borderRadius: "0 6px 6px 0", padding: "8px 10px" }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#0F6E56" }}>📌 Kembalikan ke Kebijakan Perusahaan</p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#374151" }}>Ketentuan ini mengacu pada kebijakan resmi Kemika.</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {hrLoading && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                  <MessageCircleMore style={{ width: 13, height: 13, color: "#0F6E56" }} />
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "0 12px 12px 12px", background: "#f3f4f6", display: "flex", gap: 4, alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#0F6E56", display: "inline-block", animation: `hrDotBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={hrMessagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, alignItems: "flex-end", background: "#fff", flexShrink: 0 }}>
            <textarea
              value={hrInput}
              onChange={(e) => {
                setHrInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendHRMessage(); } }}
              placeholder="Tanya tentang SOP, cuti, KPI..."
              rows={1}
              style={{ flex: 1, resize: "none", border: "1px solid #d1d5db", borderRadius: 12, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", lineHeight: 1.5, overflowY: "hidden" }}
            />
            <button
              onClick={() => sendHRMessage()}
              disabled={!hrInput.trim() || hrLoading}
              style={{
                width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
                background: !hrInput.trim() || hrLoading ? "#d1d5db" : "#0F6E56",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                transition: "background 150ms",
              }}
            >
              <ArrowUp style={{ width: 16, height: 16, color: "white" }} />
            </button>
          </div>
        </div>
      )}

      <HRDocumentModal isOpen={isHRDocsOpen} onClose={() => setIsHRDocsOpen(false)} />
    </div>
  );
};

export default DashboardLayout;