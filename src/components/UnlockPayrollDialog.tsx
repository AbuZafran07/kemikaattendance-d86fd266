import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";

interface UnlockPayrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  periodLabel: string;
}

export const UnlockPayrollDialog = ({
  open,
  onOpenChange,
  onConfirm,
  periodLabel,
}: UnlockPayrollDialogProps) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError("Alasan revisi wajib diisi minimal 10 karakter");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onConfirm(trimmed);
      setReason("");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setReason("");
      setError("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Buka Kunci Payroll untuk Revisi
          </DialogTitle>
          <DialogDescription>
            Anda akan membuka kunci payroll periode <strong>{periodLabel}</strong>.
            Status periode akan dikembalikan ke <strong>Draft</strong> sehingga
            dapat di-generate ulang. Aksi ini akan tercatat permanen di Audit Log
            Payroll.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">⚠️ Perhatian:</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-destructive/90 space-y-0.5">
            <li>Snapshot data payroll saat ini akan disimpan untuk audit</li>
            <li>Semua perubahan setelah unlock akan terekam (sebelum vs sesudah)</li>
            <li>Setelah revisi, lakukan Finalisasi ulang untuk mengunci kembali</li>
          </ul>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">
            Alasan Revisi <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reason"
            placeholder="Contoh: Koreksi bonus tahunan untuk 3 karyawan karena salah input..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError("");
            }}
            rows={4}
            maxLength={1000}
            disabled={loading}
          />
          <div className="flex justify-between text-xs">
            <span className={error ? "text-destructive" : "text-muted-foreground"}>
              {error || "Minimal 10 karakter, jelaskan alasan revisi dengan detail"}
            </span>
            <span className="text-muted-foreground">{reason.length}/1000</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || reason.trim().length < 10}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ya, Buka Kunci
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
