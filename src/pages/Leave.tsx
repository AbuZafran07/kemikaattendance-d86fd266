import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, XCircle, Clock, Eye, Plus, Trash2 } from "lucide-react";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { notifyEmployee, NotificationTemplates, formatLeaveTypeForNotification, formatDateForNotification } from "@/lib/notifications";
import ApprovalReasonDialog from "@/components/ApprovalReasonDialog";
import AdminCreateLeaveDialog from "@/components/AdminCreateLeaveDialog";
import { logApprovalAction } from "@/lib/approvalAuditLog";
import logger from "@/lib/logger";

const Leave = () => {
  const { t, i18n } = useTranslation();
  const dateLocaleStr = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "id-ID";
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"approve" | "reject">("approve");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<any | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Pagination
  const totalPages = Math.ceil(leaveRequests.length / itemsPerPage);
  const paginatedRequests = leaveRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    fetchLeaveRequests();

    // Real-time listener for leave requests
    const channel = supabase
      .channel("realtime:leave_requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests" },
        (payload) => {
          logger.debug("Leave request change:", payload);
          fetchLeaveRequests();
          
          if (payload.eventType === "INSERT") {
            toast({
              title: t("leavePage.toast.new"),
              description: t("leavePage.toast.newDesc"),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchLeaveRequests = async () => {
    logger.debug("Fetching leave requests...");
    
    // Fetch leave requests first
    const { data: leaveData, error: leaveError } = await supabase
      .from("leave_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (leaveError) {
      logger.error("Error fetching leave requests:", leaveError);
      toast({
        title: t("common.loadFailed"),
        description: leaveError.message,
        variant: "destructive",
      });
      return;
    }

    if (!leaveData || leaveData.length === 0) {
      setLeaveRequests([]);
      return;
    }

    // Get unique user IDs (employee + delegated)
    const userIds = [
      ...new Set([
        ...leaveData.map((r) => r.user_id),
        ...leaveData.map((r: any) => r.delegated_to).filter(Boolean),
      ]),
    ];

    // Fetch profiles for those users
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, nik, departemen, jabatan, remaining_leave")
      .in("id", userIds);

    if (profilesError) {
      logger.error("Error fetching profiles:", profilesError);
    }

    // Create a map of profiles
    const profilesMap = new Map(
      (profilesData || []).map(p => [p.id, p])
    );

    // Combine leave requests with profiles + delegate info
    const combinedData = leaveData.map((request: any) => ({
      ...request,
      profiles: profilesMap.get(request.user_id) || null,
      delegate_profile: request.delegated_to ? profilesMap.get(request.delegated_to) || null : null,
    }));

    logger.debug("Leave requests fetched:", combinedData);
    setLeaveRequests(combinedData);
  };

  const openApprovalDialog = (requestId: string, action: "approve" | "reject") => {
    setSelectedRequestId(requestId);
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleApprove = async (reason: string) => {
    if (!selectedRequestId) return;
    
    const request = leaveRequests.find(r => r.id === selectedRequestId);
    
    // Use secure RPC function instead of direct update
    const { error } = await supabase.rpc('approve_leave_request', {
      request_id: selectedRequestId,
      notes: reason || null,
    });

    if (error) {
      toast({
        title: t("leavePage.toast.approveFail"),
        description: error.message,
        variant: "destructive",
      });
      throw error;
    } else {
      toast({
        title: t("common.success"),
        description: t("leavePage.toast.approveOk"),
      });
      
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (request && currentUser) {
        await logApprovalAction({
          request_type: "leave",
          request_id: selectedRequestId,
          action_type: "approved",
          performed_by: currentUser.id,
          target_user_id: request.user_id,
          notes: reason || null,
          details: { leave_type: request.leave_type, start_date: request.start_date, end_date: request.end_date },
        });

        const leaveType = formatLeaveTypeForNotification(request.leave_type);
        const startDate = formatDateForNotification(request.start_date);
        const endDate = formatDateForNotification(request.end_date);
        const notification = NotificationTemplates.leaveRequestApproved(leaveType, startDate, endDate);
        notifyEmployee(request.user_id, notification.title, notification.body, { type: 'leave_approved' });

        // Notify the delegated employee (replacement) if assigned
        if (request.delegated_to) {
          const { data: requesterProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', request.user_id)
            .single();
          const requesterName = requesterProfile?.full_name || 'Rekan Anda';
          const delegationNotif = NotificationTemplates.leaveDelegationAssigned(
            requesterName,
            startDate,
            endDate,
            request.delegation_notes || 'Lihat detail di aplikasi'
          );
          notifyEmployee(
            request.delegated_to,
            delegationNotif.title,
            delegationNotif.body,
            { type: 'leave_delegation_assigned', leave_request_id: selectedRequestId }
          );
        }
      }
      
      fetchLeaveRequests();
    }
  };

  const handleReject = async (reason: string) => {
    if (!selectedRequestId) return;
    
    const request = leaveRequests.find(r => r.id === selectedRequestId);
    
    // Use secure RPC function instead of direct update
    const { error } = await supabase.rpc('reject_leave_request', {
      request_id: selectedRequestId,
      reason: reason,
    });

    if (error) {
      toast({
        title: t("leavePage.toast.rejectFail"),
        description: error.message,
        variant: "destructive",
      });
      throw error;
    } else {
      toast({
        title: t("common.success"),
        description: t("leavePage.toast.rejectOk"),
      });
      
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (request && currentUser) {
        await logApprovalAction({
          request_type: "leave",
          request_id: selectedRequestId,
          action_type: "rejected",
          performed_by: currentUser.id,
          target_user_id: request.user_id,
          notes: reason,
          details: { leave_type: request.leave_type },
        });

        const leaveType = formatLeaveTypeForNotification(request.leave_type);
        const notification = NotificationTemplates.leaveRequestRejected(leaveType, reason);
        notifyEmployee(request.user_id, notification.title, notification.body, { type: 'leave_rejected' });
      }
      
      fetchLeaveRequests();
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const request = leaveRequests.find((r) => r.id === deleteTargetId);
      
      // Restore leave quota if it was an approved cuti_tahunan
      if (request && request.status === "approved" && request.leave_type === "cuti_tahunan") {
        const { error: restoreError } = await supabase
          .from("profiles")
          .update({ remaining_leave: (request.profiles?.remaining_leave || 0) + request.total_days })
          .eq("id", request.user_id);
        if (restoreError) {
          logger.error("Failed to restore leave quota:", restoreError);
        }
      }

      const { error } = await supabase.from("leave_requests").delete().eq("id", deleteTargetId);
      if (error) throw error;

      toast({ title: t("common.success"), description: t("leavePage.toast.deleteOk") });
      fetchLeaveRequests();
    } catch (err) {
      logger.error("Failed to delete leave request:", err);
      toast({ title: t("common.error"), description: t("leavePage.toast.deleteFail"), variant: "destructive" });
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-primary">{t("common.approved")}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{t("common.rejected")}</Badge>;
      case "pending":
        return <Badge variant="secondary">{t("common.pending")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatLeaveType = (type: string) => {
    const key = `leavePage.leaveType.${type}`;
    const v = t(key);
    return v === key ? type : v;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("leavePage.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("leavePage.subtitle")}</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t("leavePage.createBtn")}
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("leavePage.stats.total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">{leaveRequests.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("common.pending")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-secondary" />
                <span className="text-3xl font-bold">{leaveRequests.filter((r) => r.status === "pending").length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("common.approved")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">
                  {leaveRequests.filter((r) => r.status === "approved").length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("leavePage.tableTitle")}</CardTitle>
            <CardDescription>{t("leavePage.tableDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[calc(100vh-400px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leavePage.cols.name")}</TableHead>
                    <TableHead>{t("leavePage.cols.nik")}</TableHead>
                    <TableHead>{t("leavePage.cols.department")}</TableHead>
                    <TableHead>{t("leavePage.cols.type")}</TableHead>
                    <TableHead>{t("leavePage.cols.date")}</TableHead>
                    <TableHead>{t("leavePage.cols.duration")}</TableHead>
                    <TableHead>{t("leavePage.cols.reason")}</TableHead>
                    <TableHead>{t("leavePage.cols.status")}</TableHead>
                    {isAdmin && <TableHead>{t("leavePage.cols.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRequests.length > 0 ? (
                    paginatedRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.profiles?.full_name}</TableCell>
                        <TableCell>{request.profiles?.nik}</TableCell>
                        <TableCell>{request.profiles?.departemen}</TableCell>
                        <TableCell>{formatLeaveType(request.leave_type)}</TableCell>
                        <TableCell>
                          {new Date(request.start_date).toLocaleDateString(dateLocaleStr)} -
                          {new Date(request.end_date).toLocaleDateString(dateLocaleStr)}
                        </TableCell>
                        <TableCell>{request.total_days} {t("common.days")}</TableCell>
                        <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setDetailRequest(request)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {request.status === "pending" && (
                                <>
                                  <Button size="sm" onClick={() => openApprovalDialog(request.id, "approve")}>
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => openApprovalDialog(request.id, "reject")}>
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
                      <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                        {t("leavePage.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={currentPage}
              totalItems={leaveRequests.length}
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
        title={t("leavePage.approvalTitle")}
      />

      <AdminCreateLeaveDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={fetchLeaveRequests}
      />

      {/* Detail Dialog */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequest(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("leavePage.detail.title")}</DialogTitle>
            <DialogDescription>{t("leavePage.detail.desc")}</DialogDescription>
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
                  <p className="text-sm text-muted-foreground">{t("leavePage.detail.leaveType")}</p>
                  <p className="font-medium">{formatLeaveType(detailRequest.leave_type)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("leavePage.detail.startDate")}</p>
                  <p className="font-medium">{new Date(detailRequest.start_date).toLocaleDateString(dateLocaleStr, { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("leavePage.detail.endDate")}</p>
                  <p className="font-medium">{new Date(detailRequest.end_date).toLocaleDateString(dateLocaleStr, { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.duration")}</p>
                  <p className="font-medium">{detailRequest.total_days} {t("common.days")}</p>
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
              {(detailRequest.delegated_to || detailRequest.delegation_notes) && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-sm font-semibold">{t("leavePage.detail.delegationTitle")}</p>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("leavePage.detail.substitute")}</p>
                    <p className="text-sm font-medium">
                      {detailRequest.delegate_profile?.full_name || "-"}
                      {detailRequest.delegate_profile?.jabatan ? ` - ${detailRequest.delegate_profile.jabatan}` : ""}
                    </p>
                  </div>
                  {detailRequest.delegation_notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("leavePage.detail.taskDetail")}</p>
                      <p className="text-sm whitespace-pre-wrap">{detailRequest.delegation_notes}</p>
                    </div>
                  )}
                </div>
              )}
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
            <AlertDialogTitle>{t("leavePage.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("leavePage.deleteDialog.desc")}
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

export default Leave;
