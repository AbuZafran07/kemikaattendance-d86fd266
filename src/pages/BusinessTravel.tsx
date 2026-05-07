import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle2, XCircle, Clock, Upload, Download, FileText, Eye, Plus, Trash2 } from "lucide-react";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyEmployee, NotificationTemplates, formatDateForNotification } from "@/lib/notifications";
import logger from "@/lib/logger";
import { logApprovalAction } from "@/lib/approvalAuditLog";
import AdminCreateBusinessTravelDialog from "@/components/AdminCreateBusinessTravelDialog";

interface BusinessTravelRequest {
  id: string;
  user_id: string;
  destination: string;
  purpose: string;
  start_date: string;
  end_date: string;
  total_days: number;
  notes: string | null;
  status: string;
  document_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    nik: string;
    departemen: string;
  } | null;
}

const BusinessTravel = () => {
  const [requests, setRequests] = useState<BusinessTravelRequest[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { userRole } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : id;
  const isAdmin = userRole === "admin";
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BusinessTravelRequest | null>(null);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailRequest, setDetailRequest] = useState<BusinessTravelRequest | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Pagination
  const totalPages = Math.ceil(requests.length / itemsPerPage);
  const paginatedRequests = requests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    fetchRequests();

    // Real-time listener
    const channel = supabase
      .channel("realtime:business_travel_requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_travel_requests" },
        (payload) => {
          logger.debug("Business travel request change:", payload);
          fetchRequests();

          if (payload.eventType === "INSERT") {
            toast({
              title: t("travelAdmin.toastNewTitle"),
              description: t("travelAdmin.toastNewDesc"),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRequests = async () => {
    logger.debug("Fetching business travel requests...");

    const { data: requestsData, error: requestsError } = await supabase
      .from("business_travel_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (requestsError) {
      logger.error("Error fetching requests:", requestsError);
      toast({
        title: t("travelAdmin.toastLoadFail"),
        description: requestsError.message,
        variant: "destructive",
      });
      return;
    }

    if (!requestsData || requestsData.length === 0) {
      setRequests([]);
      return;
    }

    // Get unique user IDs
    const userIds = [...new Set(requestsData.map((r) => r.user_id))];

    // Fetch profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, nik, departemen")
      .in("id", userIds);

    if (profilesError) {
      logger.error("Error fetching profiles:", profilesError);
    }

    // Create profiles map
    const profilesMap = new Map((profilesData || []).map((p) => [p.id, p]));

    // Combine data
    const combinedData = requestsData.map((request) => ({
      ...request,
      profiles: profilesMap.get(request.user_id) || null,
    }));

    logger.debug("Business travel requests fetched:", combinedData);
    setRequests(combinedData);
  };

  const handleApproveClick = (request: BusinessTravelRequest) => {
    setSelectedRequest(request);
    setUploadingFile(null);
    setUploadDialogOpen(true);
  };

  const handleRejectClick = (request: BusinessTravelRequest) => {
    setSelectedRequest(request);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: t("travelAdmin.toastFormatTitle"),
          description: t("travelAdmin.toastFormatDesc"),
          variant: "destructive",
        });
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: t("travelAdmin.toastSizeTitle"),
          description: t("travelAdmin.toastSizeDesc"),
          variant: "destructive",
        });
        return;
      }
      setUploadingFile(file);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setIsProcessing(true);

    try {
      let documentUrl = null;

      // Upload document if provided
      if (uploadingFile) {
        const fileExt = uploadingFile.name.split('.').pop();
        const fileName = `${selectedRequest.user_id}/${selectedRequest.id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("business-travel-docs")
          .upload(fileName, uploadingFile);

        if (uploadError) throw uploadError;

        documentUrl = fileName;
      }

      // Use secure RPC function instead of direct update
      const { error } = await supabase.rpc('approve_business_travel_request', {
        request_id: selectedRequest.id,
        document_url_param: documentUrl,
      });

      if (error) throw error;

      toast({
        title: t("travelAdmin.toastOk"),
        description: documentUrl 
          ? t("travelAdmin.toastApproveOkDoc")
          : t("travelAdmin.toastApproveOk"),
      });

      const currentUser = (await supabase.auth.getUser()).data.user;
      if (currentUser) {
        await logApprovalAction({
          request_type: "business_travel",
          request_id: selectedRequest.id,
          action_type: "approved",
          performed_by: currentUser.id,
          target_user_id: selectedRequest.user_id,
          notes: null,
          details: { destination: selectedRequest.destination, start_date: selectedRequest.start_date },
        });
      }

      // Send notification to employee
      const startDate = formatDateForNotification(selectedRequest.start_date);
      const notification = NotificationTemplates.businessTravelApproved(selectedRequest.destination, startDate);
      notifyEmployee(selectedRequest.user_id, notification.title, notification.body, { type: 'business_travel_approved' });

      setUploadDialogOpen(false);
      setSelectedRequest(null);
      setUploadingFile(null);
      fetchRequests();
    } catch (error: any) {
      logger.error("Error approving request:", error);
      toast({
        title: t("travelAdmin.toastApproveFail"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    setIsProcessing(true);

    try {
      // Use secure RPC function instead of direct update
      const { error } = await supabase.rpc('reject_business_travel_request', {
        request_id: selectedRequest.id,
        reason: rejectionReason || "Ditolak oleh admin",
      });

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Perjalanan dinas ditolak",
      });

      const currentUser = (await supabase.auth.getUser()).data.user;
      if (currentUser) {
        await logApprovalAction({
          request_type: "business_travel",
          request_id: selectedRequest.id,
          action_type: "rejected",
          performed_by: currentUser.id,
          target_user_id: selectedRequest.user_id,
          notes: rejectionReason || "Ditolak oleh admin",
          details: { destination: selectedRequest.destination },
        });
      }

      // Send notification to employee
      const notification = NotificationTemplates.businessTravelRejected(
        selectedRequest.destination, 
        rejectionReason || "Ditolak oleh admin"
      );
      notifyEmployee(selectedRequest.user_id, notification.title, notification.body, { type: 'business_travel_rejected' });

      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason("");
      fetchRequests();
    } catch (error: any) {
      logger.error("Error rejecting request:", error);
      toast({
        title: "Gagal Menolak",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadDocument = async (request: BusinessTravelRequest) => {
    setSelectedRequest(request);
    setUploadingFile(null);
    setUploadDialogOpen(true);
  };

  const handleUploadOnly = async () => {
    if (!selectedRequest || !uploadingFile) return;

    setIsProcessing(true);

    try {
      const fileExt = uploadingFile.name.split('.').pop();
      const fileName = `${selectedRequest.user_id}/${selectedRequest.id}_${Date.now()}.${fileExt}`;

      // Delete old file if exists
      if (selectedRequest.document_url) {
        await supabase.storage
          .from("business-travel-docs")
          .remove([selectedRequest.document_url]);
      }

      const { error: uploadError } = await supabase.storage
        .from("business-travel-docs")
        .upload(fileName, uploadingFile);

      if (uploadError) throw uploadError;

      const { error } = await supabase
        .from("business_travel_requests")
        .update({ document_url: fileName })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Dokumen berhasil diunggah",
      });

      setUploadDialogOpen(false);
      setSelectedRequest(null);
      setUploadingFile(null);
      fetchRequests();
    } catch (error: any) {
      logger.error("Error uploading document:", error);
      toast({
        title: "Gagal Mengunggah",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-primary">Disetujui</Badge>;
      case "rejected":
        return <Badge variant="destructive">Ditolak</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleDeleteTravel = async () => {
    if (!deleteTargetId) return;
    try {
      const { error } = await supabase.from("business_travel_requests").delete().eq("id", deleteTargetId);
      if (error) throw error;
      toast({ title: "Berhasil", description: "Permintaan perjalanan dinas berhasil dihapus" });
      fetchRequests();
    } catch (err) {
      logger.error("Failed to delete business travel request:", err);
      toast({ title: "Gagal", description: "Gagal menghapus permintaan perjalanan dinas", variant: "destructive" });
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manajemen Perjalanan Dinas</h1>
            <p className="text-muted-foreground mt-1">Kelola permintaan perjalanan dinas karyawan</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Buat Dinas
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Permintaan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">{requests.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-secondary" />
                <span className="text-3xl font-bold">{requests.filter((r) => r.status === "pending").length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Disetujui</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">{requests.filter((r) => r.status === "approved").length}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Permintaan Perjalanan Dinas</CardTitle>
            <CardDescription>Semua permintaan perjalanan dinas karyawan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[calc(100vh-400px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>NIK</TableHead>
                    <TableHead>Departemen</TableHead>
                    <TableHead>Tujuan</TableHead>
                    <TableHead>Keperluan</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dokumen</TableHead>
                    {isAdmin && <TableHead>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRequests.length > 0 ? (
                    paginatedRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.profiles?.full_name}</TableCell>
                        <TableCell>{request.profiles?.nik}</TableCell>
                        <TableCell>{request.profiles?.departemen}</TableCell>
                        <TableCell>{request.destination}</TableCell>
                        <TableCell className="max-w-xs truncate">{request.purpose}</TableCell>
                        <TableCell>
                          {format(new Date(request.start_date), "d MMM yyyy", { locale: id })} -
                          {format(new Date(request.end_date), "d MMM yyyy", { locale: id })}
                        </TableCell>
                        <TableCell>{request.total_days} hari</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell>
                          {request.document_url ? (
                            <Badge variant="outline" className="gap-1">
                              <FileText className="h-3 w-3" />
                              Ada
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Belum Ada</Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setDetailRequest(request)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {request.status === "pending" && (
                                <>
                                  <Button size="sm" onClick={() => handleApproveClick(request)}>
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleRejectClick(request)}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {request.status === "approved" && (
                                <Button size="sm" variant="outline" onClick={() => handleUploadDocument(request)}>
                                  <Upload className="h-4 w-4" />
                                </Button>
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
                      <TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-8 text-muted-foreground">
                        Belum ada permintaan perjalanan dinas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={currentPage}
              totalItems={requests.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          </CardContent>
        </Card>
      </div>

      {/* Approve & Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedRequest?.status === "approved" ? "Upload Surat Dinas" : "Setujui Perjalanan Dinas"}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.status === "approved"
                ? "Upload dokumen surat dinas untuk karyawan"
                : "Anda dapat mengupload surat dinas sekarang atau nanti setelah disetujui"}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><strong>Nama:</strong> {selectedRequest.profiles?.full_name}</p>
                <p><strong>Tujuan:</strong> {selectedRequest.destination}</p>
                <p><strong>Tanggal:</strong> {format(new Date(selectedRequest.start_date), "d MMM yyyy", { locale: id })} - {format(new Date(selectedRequest.end_date), "d MMM yyyy", { locale: id })}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="document">Upload Surat Dinas (Opsional)</Label>
                <Input
                  id="document"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
                {uploadingFile && (
                  <p className="text-xs text-muted-foreground">
                    File dipilih: {uploadingFile.name}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Format: PDF, DOC, DOCX, JPG, PNG (Maks. 10MB)
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Batal
            </Button>
            {selectedRequest?.status === "approved" ? (
              <Button onClick={handleUploadOnly} disabled={!uploadingFile || isProcessing}>
                {isProcessing ? "Mengupload..." : "Upload Dokumen"}
              </Button>
            ) : (
              <Button onClick={handleApprove} disabled={isProcessing}>
                {isProcessing ? "Memproses..." : uploadingFile ? "Setujui & Upload" : "Setujui Tanpa Dokumen"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Perjalanan Dinas</DialogTitle>
            <DialogDescription>
              Berikan alasan penolakan untuk perjalanan dinas ini
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><strong>Nama:</strong> {selectedRequest.profiles?.full_name}</p>
                <p><strong>Tujuan:</strong> {selectedRequest.destination}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Alasan Penolakan</Label>
                <Textarea
                  id="reason"
                  placeholder="Tuliskan alasan penolakan..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isProcessing}>
              {isProcessing ? "Memproses..." : "Tolak Perjalanan Dinas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequest(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Perjalanan Dinas</DialogTitle>
            <DialogDescription>Informasi lengkap permohonan perjalanan dinas karyawan</DialogDescription>
          </DialogHeader>
          {detailRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nama</p>
                  <p className="font-medium">{detailRequest.profiles?.full_name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">NIK</p>
                  <p className="font-medium">{detailRequest.profiles?.nik || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Departemen</p>
                  <p className="font-medium">{detailRequest.profiles?.departemen || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tujuan</p>
                  <p className="font-medium">{detailRequest.destination}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Mulai</p>
                  <p className="font-medium">{format(new Date(detailRequest.start_date), "d MMMM yyyy", { locale: id })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Selesai</p>
                  <p className="font-medium">{format(new Date(detailRequest.end_date), "d MMMM yyyy", { locale: id })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Durasi</p>
                  <p className="font-medium">{detailRequest.total_days} hari</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(detailRequest.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dokumen</p>
                  <p className="font-medium">{detailRequest.document_url ? "Ada" : "Belum Ada"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Keperluan</p>
                <p className="font-medium whitespace-pre-wrap">{detailRequest.purpose}</p>
              </div>
              {detailRequest.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Catatan</p>
                  <p className="font-medium whitespace-pre-wrap">{detailRequest.notes}</p>
                </div>
              )}
              {detailRequest.rejection_reason && (
                <div>
                  <p className="text-sm text-muted-foreground">Alasan Penolakan</p>
                  <p className="font-medium whitespace-pre-wrap text-destructive">{detailRequest.rejection_reason}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Tanggal Pengajuan</p>
                <p className="font-medium">{format(new Date(detailRequest.created_at), "d MMMM yyyy, HH:mm", { locale: id })}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AdminCreateBusinessTravelDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={fetchRequests}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Permintaan Perjalanan Dinas</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus permintaan perjalanan dinas ini? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTravel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default BusinessTravel;
