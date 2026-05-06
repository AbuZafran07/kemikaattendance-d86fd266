import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Clock, X, Pencil, MapPin, Download, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EditLeaveRequestDialog } from "@/components/EditLeaveRequestDialog";
import { EditOvertimeRequestDialog } from "@/components/EditOvertimeRequestDialog";
import { EditBusinessTravelDialog } from "@/components/EditBusinessTravelDialog";
import logger from "@/lib/logger";
import { useTranslation } from "react-i18next";

interface LeaveRequest {
  id: string; leave_type: string; start_date: string; end_date: string;
  total_days: number; reason: string; status: string; created_at: string;
  approval_notes: string | null; rejection_reason: string | null;
}

interface OvertimeRequest {
  id: string; overtime_date: string; hours: number; reason: string;
  status: string; created_at: string; approval_notes: string | null; rejection_reason: string | null;
}

interface BusinessTravelRequest {
  id: string; destination: string; purpose: string; start_date: string;
  end_date: string; total_days: number; notes: string | null; status: string;
  document_url: string | null; created_at: string; rejection_reason: string | null;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const RequestHistory = () => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : idLocale;
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [businessTravelRequests, setBusinessTravelRequests] = useState<BusinessTravelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editLeaveRequest, setEditLeaveRequest] = useState<LeaveRequest | null>(null);
  const [editOvertimeRequest, setEditOvertimeRequest] = useState<OvertimeRequest | null>(null);
  const [editBusinessTravelRequest, setEditBusinessTravelRequest] = useState<BusinessTravelRequest | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => { if (profile?.id) fetchRequests(); }, [profile?.id]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const [leaveRes, overtimeRes, businessTravelRes] = await Promise.all([
        supabase.from("leave_requests").select("*").eq("user_id", profile?.id).order("created_at", { ascending: false }),
        supabase.from("overtime_requests").select("*").eq("user_id", profile?.id).order("created_at", { ascending: false }),
        supabase.from("business_travel_requests").select("*").eq("user_id", profile?.id).order("created_at", { ascending: false }),
      ]);
      if (leaveRes.data) setLeaveRequests(leaveRes.data);
      if (overtimeRes.data) setOvertimeRequests(overtimeRes.data);
      if (businessTravelRes.data) setBusinessTravelRequests(businessTravelRes.data);
    } catch (error) {
      logger.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelLeave = async (id: string) => {
    setCancellingId(id);
    try {
      const { error } = await supabase.from("leave_requests").delete().eq("id", id);
      if (error) throw error;
      setLeaveRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("requestHistory.cancelLeaveOk"));
    } catch (error) {
      logger.error("Error cancelling leave request:", error);
      toast.error(t("requestHistory.cancelFail"));
    } finally { setCancellingId(null); }
  };

  const handleCancelOvertime = async (id: string) => {
    setCancellingId(id);
    try {
      const { error } = await supabase.from("overtime_requests").delete().eq("id", id);
      if (error) throw error;
      setOvertimeRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("requestHistory.cancelOvertimeOk"));
    } catch (error) {
      logger.error("Error cancelling overtime request:", error);
      toast.error(t("requestHistory.cancelFail"));
    } finally { setCancellingId(null); }
  };

  const handleCancelBusinessTravel = async (id: string) => {
    setCancellingId(id);
    try {
      const { error } = await supabase.from("business_travel_requests").delete().eq("id", id);
      if (error) throw error;
      setBusinessTravelRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("requestHistory.cancelTravelOk"));
    } catch (error) {
      logger.error("Error cancelling business travel request:", error);
      toast.error(t("requestHistory.cancelFail"));
    } finally { setCancellingId(null); }
  };

  const handleDownloadDocument = async (request: BusinessTravelRequest) => {
    if (!request.document_url) {
      toast.error(t("requestHistory.docNotAvailable"));
      return;
    }
    setDownloadingId(request.id);
    try {
      const path = request.document_url.includes('business-travel-docs/')
        ? request.document_url.split('business-travel-docs/')[1]
        : request.document_url;
      const { data, error } = await supabase.storage.from("business-travel-docs").download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Surat_Dinas_${request.destination.replace(/\s+/g, '_')}_${format(new Date(request.start_date), 'dd-MM-yyyy')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("requestHistory.docSuccess"));
    } catch (error) {
      logger.error("Error downloading document:", error);
      toast.error(t("requestHistory.docFail"));
    } finally { setDownloadingId(null); }
  };

  const formatLeaveType = (type: string) => {
    const map: Record<string, string> = {
      cuti_tahunan: t("leavePage.leaveType.cuti_tahunan"),
      izin: t("leavePage.leaveType.izin"),
      sakit: t("leavePage.leaveType.sakit"),
      lupa_absen: t("leavePage.leaveType.lupa_absen"),
    };
    return map[type] || type;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">{t("requestHistory.approved")}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{t("requestHistory.rejected")}</Badge>;
      default:
        return <Badge variant="secondary">{t("requestHistory.pending")}</Badge>;
    }
  };

  const filterByStatus = <T extends { status: string }>(items: T[]): T[] => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  };

  const filteredLeaveRequests = filterByStatus(leaveRequests);
  const filteredOvertimeRequests = filterByStatus(overtimeRequests);
  const filteredBusinessTravelRequests = filterByStatus(businessTravelRequests);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/employee")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logo} alt="Kemika" className="h-8 object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("requestHistory.title")}</h1>
            <p className="text-muted-foreground">{t("requestHistory.subtitle")}</p>
          </div>
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("requestHistory.filterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("requestHistory.allStatus")}</SelectItem>
            <SelectItem value="pending">{t("requestHistory.pending")}</SelectItem>
            <SelectItem value="approved">{t("requestHistory.approved")}</SelectItem>
            <SelectItem value="rejected">{t("requestHistory.rejected")}</SelectItem>
          </SelectContent>
        </Select>

        <Tabs defaultValue="leave" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="leave" className="flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" />
              {t("requestHistory.tabLeave")}
            </TabsTrigger>
            <TabsTrigger value="overtime" className="flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" />
              {t("requestHistory.tabOvertime")}
            </TabsTrigger>
            <TabsTrigger value="travel" className="flex items-center gap-1 text-xs">
              <MapPin className="h-3 w-3" />
              {t("requestHistory.tabTravel")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leave" className="mt-4 space-y-3">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{t("requestHistory.loading")}</div>
            ) : filteredLeaveRequests.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {statusFilter === "all" ? t("requestHistory.emptyLeave") : t("requestHistory.emptyFiltered")}
                </CardContent>
              </Card>
            ) : (
              filteredLeaveRequests.map((request) => (
                <Card key={request.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{formatLeaveType(request.leave_type)}</h3>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(request.start_date), "d MMM yyyy", { locale: dateLocale })}
                          {request.start_date !== request.end_date &&
                            ` - ${format(new Date(request.end_date), "d MMM yyyy", { locale: dateLocale })}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {getStatusBadge(request.status)}
                        {request.status === "pending" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditLeaveRequest(request)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={cancellingId === request.id}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("requestHistory.cancelTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>{t("requestHistory.cancelLeaveDesc")}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("requestHistory.cancelNo")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleCancelLeave(request.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    {t("requestHistory.cancelYes")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{request.reason}</p>
                    {request.status === "approved" && request.approval_notes && (
                      <p className="text-sm text-green-600 mb-2 italic">
                        {t("requestHistory.approvalNote", { n: request.approval_notes })}
                      </p>
                    )}
                    {request.status === "rejected" && request.rejection_reason && (
                      <p className="text-sm text-destructive mb-2 italic">
                        {t("requestHistory.rejectionReason", { n: request.rejection_reason })}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("requestHistory.days", { n: request.total_days })}</span>
                      <span>{t("requestHistory.submittedAt", { date: format(new Date(request.created_at), "d MMM yyyy", { locale: dateLocale }) })}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="overtime" className="mt-4 space-y-3">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{t("requestHistory.loading")}</div>
            ) : filteredOvertimeRequests.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {statusFilter === "all" ? t("requestHistory.emptyOvertime") : t("requestHistory.emptyFiltered")}
                </CardContent>
              </Card>
            ) : (
              filteredOvertimeRequests.map((request) => (
                <Card key={request.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">
                          {format(new Date(request.overtime_date), "EEEE, d MMM yyyy", { locale: dateLocale })}
                        </h3>
                        <p className="text-sm text-muted-foreground">{t("requestHistory.overtimeHours", { n: request.hours })}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {getStatusBadge(request.status)}
                        {request.status === "pending" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditOvertimeRequest(request)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={cancellingId === request.id}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("requestHistory.cancelTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>{t("requestHistory.cancelOvertimeDesc")}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("requestHistory.cancelNo")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleCancelOvertime(request.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    {t("requestHistory.cancelYes")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{request.reason}</p>
                    {request.status === "approved" && request.approval_notes && (
                      <p className="text-sm text-green-600 mb-2 italic">{t("requestHistory.approvalNote", { n: request.approval_notes })}</p>
                    )}
                    {request.status === "rejected" && request.rejection_reason && (
                      <p className="text-sm text-destructive mb-2 italic">{t("requestHistory.rejectionReason", { n: request.rejection_reason })}</p>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {t("requestHistory.submittedAt", { date: format(new Date(request.created_at), "d MMM yyyy", { locale: dateLocale }) })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="travel" className="mt-4 space-y-3">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{t("requestHistory.loading")}</div>
            ) : filteredBusinessTravelRequests.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {statusFilter === "all" ? t("requestHistory.emptyTravel") : t("requestHistory.emptyFiltered")}
                </CardContent>
              </Card>
            ) : (
              filteredBusinessTravelRequests.map((request) => (
                <Card key={request.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          <h3 className="font-semibold">{request.destination}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(new Date(request.start_date), "d MMM yyyy", { locale: dateLocale })}
                          {request.start_date !== request.end_date &&
                            ` - ${format(new Date(request.end_date), "d MMM yyyy", { locale: dateLocale })}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {getStatusBadge(request.status)}
                        {request.status === "pending" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditBusinessTravelRequest(request)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={cancellingId === request.id}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("requestHistory.cancelTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>{t("requestHistory.cancelTravelDesc")}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("requestHistory.cancelNo")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleCancelBusinessTravel(request.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    {t("requestHistory.cancelYes")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-sm mb-2">{request.purpose}</p>
                    {request.notes && (
                      <p className="text-sm text-muted-foreground mb-2">{t("requestHistory.notes", { n: request.notes })}</p>
                    )}
                    {request.status === "rejected" && request.rejection_reason && (
                      <p className="text-sm text-destructive mb-2 italic">{t("requestHistory.rejectionReason", { n: request.rejection_reason })}</p>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("requestHistory.days", { n: request.total_days })}</span>
                      <span>{t("requestHistory.submittedAt", { date: format(new Date(request.created_at), "d MMM yyyy", { locale: dateLocale }) })}</span>
                    </div>

                    {request.status === "approved" && request.document_url && (
                      <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => handleDownloadDocument(request)} disabled={downloadingId === request.id}>
                        {downloadingId === request.id ? t("requestHistory.downloading") : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            {t("requestHistory.downloadDoc")}
                          </>
                        )}
                      </Button>
                    )}

                    {request.status === "approved" && !request.document_url && (
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground bg-muted p-2 rounded">
                        <FileText className="h-4 w-4" />
                        <span>{t("requestHistory.docProcessing")}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {editLeaveRequest && (
        <EditLeaveRequestDialog open={!!editLeaveRequest} onOpenChange={(open) => !open && setEditLeaveRequest(null)} request={editLeaveRequest} onUpdated={fetchRequests} />
      )}
      {editOvertimeRequest && (
        <EditOvertimeRequestDialog open={!!editOvertimeRequest} onOpenChange={(open) => !open && setEditOvertimeRequest(null)} request={editOvertimeRequest} onUpdated={fetchRequests} />
      )}
      {editBusinessTravelRequest && (
        <EditBusinessTravelDialog open={!!editBusinessTravelRequest} onOpenChange={(open) => !open && setEditBusinessTravelRequest(null)} request={editBusinessTravelRequest} onUpdated={fetchRequests} />
      )}

      <EmployeeBottomNav />
    </div>
  );
};

export default RequestHistory;
