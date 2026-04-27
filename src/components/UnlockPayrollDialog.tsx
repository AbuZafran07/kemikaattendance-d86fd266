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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle } from "lucide-react";

interface UnlockPayrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  periodLabel: string;
}

const CONFIRM_PHRASE = "BUKA KUNCI";

export const UnlockPayrollDialog = ({
  open,
  onOpenChange,
  onConfirm,
  periodLabel,
}: UnlockPayrollDialogProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setStep(1);
    setReason("");
    setAcknowledged(false);
    setConfirmText("");
    setError("");
  };

  const handleProceed = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError("Alasan revisi wajib diisi minimal 10 karakter");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!acknowledged || confirmText.trim().toUpperCase() !== CONFIRM_PHRASE) {
      return;
    }
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      reset();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset();
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

        {step === 1 ? (
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
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1">Alasan Revisi</p>
              <p className="text-sm whitespace-pre-wrap">{reason.trim()}</p>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="ack"
                checked={acknowledged}
                onCheckedChange={(c) => setAcknowledged(c === true)}
                disabled={loading}
              />
              <Label htmlFor="ack" className="text-sm leading-snug cursor-pointer">
                Saya mengerti bahwa periode payroll yang sudah difinalisasi akan
                dibuka kembali, dan seluruh aksi saya tercatat di Audit Log.
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-text" className="text-sm">
                Ketik <span className="font-mono font-bold text-destructive">{CONFIRM_PHRASE}</span> untuk konfirmasi
              </Label>
              <Input
                id="confirm-text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                disabled={loading}
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={loading}
              className="mr-auto"
            >
              Kembali
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Batal
          </Button>
          {step === 1 ? (
            <Button
              variant="destructive"
              onClick={handleProceed}
              disabled={reason.trim().length < 10}
            >
              Lanjutkan
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={
                loading ||
                !acknowledged ||
                confirmText.trim().toUpperCase() !== CONFIRM_PHRASE
              }
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Buka Kunci Sekarang
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
