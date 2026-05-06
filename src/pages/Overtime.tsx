import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, Eye, Plus, Trash2 } from "lucide-react";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { notifyEmployee, NotificationTemplates, formatDateForNotification } from "@/lib/notifications";
import ApprovalReasonDialog from "@/components/ApprovalReasonDialog";
import AdminCreateOvertimeDialog from "@/components/AdminCreateOvertimeDialog";
import { logApprovalAction } from "@/lib/approvalAuditLog";
import logger from "@/lib/logger";

const Overtime = () => {
  const { t, i18n } = useTranslation();
  const dateLocaleStr = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "id-ID";
  const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin';
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"approve" | "reject">("approve");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<any | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Pagination
  const totalPages = Math.ceil(overtimeRequests.length / itemsPerPage);
  const paginatedRequests = overtimeRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    fetchOvertimeRequests();

    // Real-time listener for overtime requests
    const channel = supabase
      .channel("realtime:overtime_requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overtime_requests" },
        (payload) => {
          logger.debug("Overtime request change:", payload);
          fetchOvertimeRequests();
          
          if (payload.eventType === "INSERT") {
            toast({
              title: t("overtimePage.toast.new"),
              description: t("overtimePage.toast.newDesc"),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOvertimeRequests = async () => {
    logger.debug("Fetching overtime requests...");
    
    // Fetch overtime requests first
    const { data: overtimeData, error: overtimeError } = await supabase
      .from('overtime_requests')
      .select("*")
      .order('created_at', { ascending: false });

    if (overtimeError) {
      logger.error("Error fetching overtime requests:", overtimeError);
      toast({
        title: t("common.loadFailed"),
        description: overtimeError.message,
        variant: "destructive",
      });
      return;
    }

    if (!overtimeData || overtimeData.length === 0) {
      setOvertimeRequests([]);
      return;
    }

    // Get unique user IDs
    const userIds = [...new Set(overtimeData.map(r => r.user_id))];
    
    // Fetch profiles for those users
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, nik, departemen")
      .in("id", userIds);

    if (profilesError) {
      logger.error("Error fetching profiles:", profilesError);
    }

    // Create a map of profiles
    const profilesMap = new Map(
      (profilesData || []).map(p => [p.id, p])
    );

    // Combine overtime requests with profiles
    const combinedData = overtimeData.map(request => ({
      ...request,
      profiles: profilesMap.get(request.user_id) || null
    }));

    logger.debug("Overtime requests fetched:", combinedData);
    setOvertimeRequests(combinedData);
  };

  const openApprovalDialog = (requestId: string, action: "approve" | "reject") => {
    setSelectedRequestId(requestId);
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleApprove = async (reason: string) => {
    if (!selectedRequestId) return;
    
    const request = overtimeRequests.find(r => r.id === selectedRequestId);
    
    // Use secure RPC function instead of direct update
    const { error } = await supabase.rpc('approve_overtime_request', {
      request_id: selectedRequestId,
      notes: reason || null,
    });

    if (error) {
      toast({
        title: t("overtimePage.toast.approveFail"),
        description: error.message,
        variant: "destructive",
      });
      throw error;
    } else {
      toast({
        title: t("common.success"),
        description: t("overtimePage.toast.approveOk"),
      });
      
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (request && currentUser) {
        await logApprovalAction({
          request_type: "overtime",
          request_id: selectedRequestId,
          action_type: "approved",
          performed_by: currentUser.id,
          target_user_id: request.user_id,
          notes: reason || null,
          details: { overtime_date: request.overtime_date, hours: request.hours },
        });

        const date = formatDateForNotification(request.overtime_date);
        const notification = NotificationTemplates.overtimeRequestApproved(date, request.hours);
        notifyEmployee(request.user_id, notification.title, notification.body, { type: 'overtime_approved' });
      }
      
      fetchOvertimeRequests();
    }
  };

  const handleReject = async (reason: string) => {
    if (!selectedRequestId) return;
    
    const request = overtimeRequests.find(r => r.id === selectedRequestId);
    
    // Use secure RPC function instead of direct update
    const { error } = await supabase.rpc('reject_overtime_request', {
      request_id: selectedRequestId,
      reason: reason,
    });

    if (error) {
      toast({
        title: t("overtimePage.toast.rejectFail"),
        description: error.message,
        variant: "destructive",
      });
      throw error;
    } else {
      toast({
        title: t("common.success"),
        description: t("overtimePage.toast.rejectOk"),
      });
      
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (request && currentUser) {
        await logApprovalAction({
          request_type: "overtime",
          request_id: selectedRequestId,
          action_type: "rejected",
          performed_by: currentUser.id,
          target_user_id: request.user_id,
          notes: reason,
          details: { overtime_date: request.overtime_date, hours: request.hours },
        });

        const date = formatDateForNotification(request.overtime_date);
        const notification = NotificationTemplates.overtimeRequestRejected(date);
        notifyEmployee(request.user_id, notification.title, notification.body, { type: 'overtime_rejected' });
      }
      
      fetchOvertimeRequests();
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const { error } = await supabase.from("overtime_requests").delete().eq("id", deleteTargetId);
      if (error) throw error;
      toast({ title: t("common.success"), description: t("overtimePage.toast.deleteOk") });
      fetchOvertimeRequests();
    } catch (err) {
      logger.error("Failed to delete overtime request:", err);
      toast({ title: t("common.error"), description: t("overtimePage.toast.deleteFail"), variant: "destructive" });
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };
  

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-primary">{t("common.approved")}</Badge>;
      case 'rejected':
        return <Badge variant="destructive">{t("common.rejected")}</Badge>;
      case 'pending':
        return <Badge variant="secondary">{t("common.pending")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("overtimePage.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("overtimePage.subtitle")}</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t("overtimePage.createBtn")}
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("overtimePage.stats.total")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">{overtimeRequests.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("common.pending")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-secondary" />
                <span className="text-3xl font-bold">
                  {overtimeRequests.filter(r => r.status === 'pending').length}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("common.approved")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">
                  {overtimeRequests.filter(r => r.status === 'approved').length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("overtimePage.tableTitle")}</CardTitle>
            <CardDescription>
              {t("overtimePage.tableDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[calc(100vh-400px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("overtimePage.cols.name")}</TableHead>
                    <TableHead>{t("overtimePage.cols.nik")}</TableHead>
                    <TableHead>{t("overtimePage.cols.department")}</TableHead>
                    <TableHead>{t("overtimePage.cols.date")}</TableHead>
                    <TableHead>{t("overtimePage.cols.hours")}</TableHead>
                    <TableHead>{t("overtimePage.cols.reason")}</TableHead>
                    <TableHead>{t("overtimePage.cols.status")}</TableHead>
                    {isAdmin && <TableHead>{t("overtimePage.cols.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRequests.length > 0 ? (
                    paginatedRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                          {request.profiles?.full_name}
                        </TableCell>
                        <TableCell>{request.profiles?.nik}</TableCell>
                        <TableCell>{request.profiles?.departemen}</TableCell>
                        <TableCell>
                          {new Date(request.overtime_date).toLocaleDateString('id-ID')}
                        </TableCell>
                        <TableCell>{request.hours} {t("common.hours")}</TableCell>
                        <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setDetailRequest(request)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {request.status === 'pending' && (
                                <>
                                  <Button 
                                    size="sm" 
                                    onClick={() => openApprovalDialog(request.id, "approve")}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => openApprovalDialog(request.id, "reject")}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {request.status !== "pending" && (
                                <Button size="sm" variant="destructive" onClick={() => { setDeleteTargetId(request.id); setDeleteConfirmOpen(true); }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                        {t("overtimePage.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={currentPage}
              totalItems={overtimeRequests.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          </CardContent>
        </Card>
      </div>
      
      <ApprovalReasonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        action={dialogAction}
        onConfirm={dialogAction === "approve" ? handleApprove : handleReject}
        title={t("overtimePage.approvalTitle")}
      />

      <AdminCreateOvertimeDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={fetchOvertimeRequests}
      />

      {/* Detail Dialog */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequest(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("overtimePage.detail.title")}</DialogTitle>
            <DialogDescription>{t("overtimePage.detail.desc")}</DialogDescription>
          </DialogHeader>
          {detailRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.name")}</p>
                  <p className="font-medium">{detailRequest.profiles?.full_name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.nik")}</p>
                  <p className="font-medium">{detailRequest.profiles?.nik || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.department")}</p>
                  <p className="font-medium">{detailRequest.profiles?.departemen || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("overtimePage.detail.date")}</p>
                  <p className="font-medium">{new Date(detailRequest.overtime_date).toLocaleDateString(dateLocaleStr, { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("overtimePage.detail.hours")}</p>
                  <p className="font-medium">{detailRequest.hours} {t("common.hours")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                  {getStatusBadge(detailRequest.status)}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("common.reason")}</p>
                <p className="font-medium whitespace-pre-wrap">{detailRequest.reason}</p>
              </div>
              {detailRequest.approval_notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.approvalNotes")}</p>
                  <p className="font-medium whitespace-pre-wrap">{detailRequest.approval_notes}</p>
                </div>
              )}
              {detailRequest.rejection_reason && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.rejectionReason")}</p>
                  <p className="font-medium whitespace-pre-wrap text-destructive">{detailRequest.rejection_reason}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">{t("common.createdAt")}</p>
                <p className="font-medium">{new Date(detailRequest.created_at).toLocaleDateString(dateLocaleStr, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("overtimePage.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("overtimePage.deleteDialog.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Overtime;
