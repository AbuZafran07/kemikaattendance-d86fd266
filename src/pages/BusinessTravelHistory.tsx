import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, X, Pencil, Download, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
import { EditBusinessTravelDialog } from "@/components/EditBusinessTravelDialog";
import { useTranslation } from "react-i18next";

interface BusinessTravelRequest {
  id: string;
  destination: string;
  purpose: string;
  start_date: string;
  end_date: string;
  total_days: number;
  notes: string | null;
  status: string;
  document_url: string | null;
  created_at: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const BusinessTravelHistory = () => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : idLocale;
  const [requests, setRequests] = useState<BusinessTravelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<BusinessTravelRequest | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) fetchRequests();
  }, [profile?.id]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("business_travel_requests")
        .select("*")
        .eq("user_id", profile?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      const { error } = await supabase
        .from("business_travel_requests")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("travelHistory.cancelOk"));
    } catch (error) {
      console.error("Error cancelling request:", error);
      toast.error(t("travelHistory.cancelFail"));
    } finally {
      setCancellingId(null);
    }
  };

  const handleDownloadDocument = async (request: BusinessTravelRequest) => {
    if (!request.document_url) {
      toast.error(t("travelHistory.docNotAvailable"));
      return;
    }

    setDownloadingId(request.id);
    try {
      const path = request.document_url.includes('business-travel-docs/')
        ? request.document_url.split('business-travel-docs/')[1]
        : request.document_url;

      const { data, error } = await supabase.storage
        .from("business-travel-docs")
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Surat_Dinas_${request.destination.replace(/\s+/g, '_')}_${format(new Date(request.start_date), 'dd-MM-yyyy')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t("travelHistory.docSuccess"));
    } catch (error) {
      console.error("Error downloading document:", error);
      toast.error(t("travelHistory.docFail"));
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">{t("travelHistory.approved")}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{t("travelHistory.rejected")}</Badge>;
      default:
        return <Badge variant="secondary">{t("travelHistory.pending")}</Badge>;
    }
  };

  const filterByStatus = (items: BusinessTravelRequest[]): BusinessTravelRequest[] => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  };

  const filteredRequests = filterByStatus(requests);

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
            <h1 className="text-2xl font-bold">{t("travelHistory.title")}</h1>
            <p className="text-muted-foreground">{t("travelHistory.subtitle")}</p>
          </div>
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("travelHistory.filterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("travelHistory.allStatus")}</SelectItem>
            <SelectItem value="pending">{t("travelHistory.pending")}</SelectItem>
            <SelectItem value="approved">{t("travelHistory.approved")}</SelectItem>
            <SelectItem value="rejected">{t("travelHistory.rejected")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">{t("travelHistory.loading")}</div>
          ) : filteredRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {statusFilter === "all" ? t("travelHistory.empty") : t("travelHistory.emptyFiltered")}
              </CardContent>
            </Card>
          ) : (
            filteredRequests.map((request) => (
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditRequest(request)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                disabled={cancellingId === request.id}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("travelHistory.cancelTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("travelHistory.cancelDesc")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("travelHistory.cancelNo")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleCancel(request.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t("travelHistory.cancelYes")}
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
                    <p className="text-sm text-muted-foreground mb-2">{t("travelHistory.notes", { n: request.notes })}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("travelHistory.days", { n: request.total_days })}</span>
                    <span>{t("travelHistory.submittedAt", { date: format(new Date(request.created_at), "d MMM yyyy", { locale: dateLocale }) })}</span>
                  </div>

                  {request.status === "approved" && request.document_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => handleDownloadDocument(request)}
                      disabled={downloadingId === request.id}
                    >
                      {downloadingId === request.id ? (
                        t("travelHistory.downloading")
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          {t("travelHistory.downloadDoc")}
                        </>
                      )}
                    </Button>
                  )}

                  {request.status === "approved" && !request.document_url && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground bg-muted p-2 rounded">
                      <FileText className="h-4 w-4" />
                      <span>{t("travelHistory.docProcessing")}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {editRequest && (
        <EditBusinessTravelDialog
          open={!!editRequest}
          onOpenChange={(open) => !open && setEditRequest(null)}
          request={editRequest}
          onUpdated={fetchRequests}
        />
      )}

      <EmployeeBottomNav />
    </div>
  );
};

export default BusinessTravelHistory;
