import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import logo from "@/assets/logo.png";
import kemikaIcon from "@/assets/kemika-icon.png";
import {
  LogIn,
  Clock,
  CalendarDays,
  Wallet,
  MapPin,
  Fingerprint,
  BarChart3,
  Megaphone,
  Info,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { APP_VERSION } from "@/config/appVersion";
import MarqueeBanner from "@/components/MarqueeBanner";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import DOMPurify from "dompurify";

const quickLinks = [
  { icon: Fingerprint, label: "Absensi", desc: "Check-in & Check-out harian" },
  { icon: CalendarDays, label: "Cuti & Izin", desc: "Pengajuan & riwayat cuti" },
  { icon: Clock, label: "Lembur", desc: "Pengajuan lembur kerja" },
  { icon: Wallet, label: "Payroll", desc: "Slip gaji & riwayat" },
  { icon: MapPin, label: "Perjalanan Dinas", desc: "Pengajuan & tracking" },
  { icon: BarChart3, label: "Laporan", desc: "Kehadiran & kinerja" },
];

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  created_at: string;
  expire_at: string | null;
}

const LandingPage = () => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("company_announcements" as any)
        .select("id, title, content, type, created_at, expire_at")
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6);
      if (data) {
        const now = new Date().toISOString();
        setAnnouncements((data as any[]).filter((a: any) => !a.expire_at || a.expire_at > now));
      }
    };
    fetchData();
  }, []);

  const getIcon = (type: string) => {
    if (type === "warning") return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (type === "success") return <CheckCircle2 className="h-4 w-4 text-primary" />;
    return <Info className="h-4 w-4 text-primary" />;
  };

  const getIconBg = (type: string) => {
    if (type === "warning") return "bg-destructive/10";
    return "bg-primary/10";
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Fixed Header with Marquee */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <MarqueeBanner />
        <header className="border-b border-border/50 bg-background/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Kemika Logo" className="h-10 object-contain" />
              <div>
                <p className="text-sm font-bold leading-tight text-foreground">PT KEMIKA KARYA PRATAMA</p>
                <p className="text-xs text-muted-foreground">Spreading Solutions</p>
              </div>
            </div>
            <Button onClick={() => navigate("/login")} size="sm" className="gap-2">
              <LogIn className="h-4 w-4" /> Masuk
            </Button>
          </div>
        </header>
      </div>

      {/* Spacer for fixed header + marquee */}
      <div className="h-20" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/20" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl tracking-tight animate-[fadeInUp_0.8s_ease-out_0.2s_both]">
              PT KEMIKA KARYA PRATAMA
            </h1>
            <p className="mt-1 text-lg font-medium text-muted-foreground sm:text-xl animate-[fadeInUp_0.8s_ease-out_0.4s_both]">
              Attendance & HR Management System
            </p>
            <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-lg mx-auto animate-[fadeInUp_0.8s_ease-out_0.6s_both]">
              Kelola absensi, cuti, lembur, dan payroll Anda dalam satu platform terpadu.
            </p>
            <div className="mt-6 animate-[fadeInUp_0.8s_ease-out_0.8s_both]">
              <Button size="lg" onClick={() => navigate("/login")} className="gap-2 px-8">
                <LogIn className="h-4 w-4" /> Masuk ke Sistem
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Main */}
      <main className="flex-1 px-4 pb-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {/* Quick Access */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-1 w-1 rounded-full bg-primary" />
              <h2 className="text-lg font-semibold text-foreground">Akses Cepat</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
              {quickLinks.map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate("/login")}
                  className="group flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card p-5 text-center transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="rounded-xl bg-primary/10 p-3 transition-colors group-hover:bg-primary/20">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Announcements from DB */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Megaphone className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Pengumuman & Informasi</h2>
            </div>
            {announcements.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="p-6 text-center text-muted-foreground text-sm">
                  Tidak ada pengumuman saat ini.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {announcements.map((item) => (
                  <Card key={item.id} className="border-border/60 hover:border-primary/30 transition-colors cursor-pointer overflow-hidden" onClick={() => setSelectedAnnouncement(item)}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-lg p-2 ${getIconBg(item.type)}`}>{getIcon(item.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2 break-words">{stripHtml(item.content)}</p>
                          <p className="text-[11px] text-muted-foreground/70 mt-2">
                            {format(new Date(item.created_at), "dd MMM yyyy")}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-1 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 py-5">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center space-y-1">
          <p className="text-xs text-muted-foreground font-medium">PT Kemika Karya Pratama</p>
          <p className="text-[11px] text-muted-foreground/70">© {new Date().getFullYear()} — App Version {APP_VERSION}</p>
        </div>
      </footer>

      {/* Announcement Detail Dialog */}
      <Dialog open={!!selectedAnnouncement} onOpenChange={() => setSelectedAnnouncement(null)}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAnnouncement && getIcon(selectedAnnouncement.type)}
              {selectedAnnouncement?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedAnnouncement && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground leading-relaxed prose prose-sm max-w-none break-words overflow-hidden [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_div]:break-words [&_p]:break-words" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedAnnouncement.content) }} />
              <p className="text-xs text-muted-foreground/70">
                Dipublikasikan: {format(new Date(selectedAnnouncement.created_at), "dd MMM yyyy, HH:mm")}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PWAInstallPrompt />
    </div>
  );
};

export default LandingPage;
