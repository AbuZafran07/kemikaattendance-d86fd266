import { ReactNode, useState, useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
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
  Target
} from "lucide-react";
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

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigationGroups = [
  {
    label: "RINGKASAN",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "MANAJEMEN",
    items: [
      { name: "Karyawan", href: "/dashboard/employees", icon: Users },
      { name: "Absensi", href: "/dashboard/attendance", icon: ClipboardCheck },
      { name: "Cuti", href: "/dashboard/leave", icon: Calendar },
      { name: "Lembur", href: "/dashboard/overtime", icon: Clock },
      { name: "Perjalanan Dinas", href: "/dashboard/business-travel", icon: Plane },
    ],
  },
  {
    label: "KEUANGAN",
    items: [
      { name: "Payroll", href: "/dashboard/payroll", icon: DollarSign },
      { name: "Payroll Analytics", href: "/dashboard/payroll-analytics", icon: BarChart3 },
      { name: "Pinjaman", href: "/dashboard/loans", icon: CreditCard },
      { name: "Tarif TER PPh21", href: "/dashboard/ter-management", icon: FileText },
      { name: "Bukti Potong 1721-A1", href: "/dashboard/bukti-potong", icon: FileCheck },
      { name: "Laporan PPh 21", href: "/dashboard/reports/pph21", icon: FileText },
    ],
  },
  {
    label: "KPI",
    items: [
      { name: "KPI Management", href: "/dashboard/kpi", icon: Target },
      { name: "Daftar KPI Karyawan", href: "/dashboard/kpi-recap", icon: Trophy },
    ],
  },
  {
    label: "LAPORAN",
    items: [
      { name: "Laporan", href: "/dashboard/reports", icon: FileText },
      { name: "Audit Log Persetujuan", href: "/dashboard/approval-audit-log", icon: ShieldCheck },
      { name: "Audit Log Payroll", href: "/dashboard/payroll-audit-log", icon: ShieldCheck },
      { name: "Notifikasi", href: "/dashboard/notifications", icon: Bell },
    ],
  },
  {
    label: "SISTEM",
    items: [
      { name: "Pengumuman", href: "/dashboard/announcements", icon: Megaphone },
      { name: "Pengaturan", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

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
                Admin
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => navigate("/employee/profile")}>
          <UserCircle className="h-4 w-4 mr-2" />
          My Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          Keluar
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
              <h2 className="text-sm font-bold text-foreground leading-tight">PT. KEMIKA KARYA PRATAMA</h2>
              <p className="text-[11px] text-muted-foreground">Attendance & HR Management System</p>
            </div>
          </div>

          {/* Right: Bell + User dropdown */}
          {profile && (
            <div className="flex items-center gap-4">
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
    </div>
  );
};

export default DashboardLayout;