import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Paperclip, Upload, Trash2, FileText, Download } from "lucide-react";

interface AttachmentRow {
  id: string;
  user_id: string;
  year: number;
  month: number;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

interface Props {
  ownerUserId: string;       // pemilik (karyawan)
  year: number;
  month: number;
  monthLabel: string;
  readOnly?: boolean;        // admin/HR mode untuk view-only download
  onCountChange?: (count: number) => void;
}

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const ALLOWED_EXT = /\.(pdf|xls|xlsx)$/i;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const formatSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

export default function KPIMonthlyAttachments({ ownerUserId, year, month, monthLabel, readOnly, onCountChange }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kpi_monthly_attachments")
      .select("*")
      .eq("user_id", ownerUserId)
      .eq("year", year)
      .eq("month", month)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Gagal memuat lampiran", description: error.message, variant: "destructive" });
    } else {
      const rows = (data || []) as AttachmentRow[];
      setItems(rows);
      onCountChange?.(rows.length);
    }
    setLoading(false);
  }, [ownerUserId, year, month, toast, onCountChange]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!(ALLOWED_MIME.includes(file.type) || ALLOWED_EXT.test(file.name))) {
      toast({ title: "Format tidak didukung", description: "Hanya PDF dan Excel (.xls/.xlsx) yang diperbolehkan.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Ukuran terlalu besar", description: "Maksimum 10 MB per file.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${ownerUserId}/${year}/${String(month).padStart(2, "0")}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage.from("kpi-attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("kpi_monthly_attachments").insert({
        user_id: ownerUserId,
        year,
        month,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || "",
        uploaded_by: user?.id,
      });
      if (insErr) {
        await supabase.storage.from("kpi-attachments").remove([path]);
        throw insErr;
      }
      toast({ title: "Lampiran terupload", description: `${file.name} • ${monthLabel}` });
      await fetchItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload gagal";
      toast({ title: "Upload gagal", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (row: AttachmentRow) => {
    const { data, error } = await supabase.storage.from("kpi-attachments").createSignedUrl(row.file_path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Gagal membuka file", description: error?.message || "Unknown", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (row: AttachmentRow) => {
    if (!confirm(`Hapus "${row.file_name}"?`)) return;
    const { error: stErr } = await supabase.storage.from("kpi-attachments").remove([row.file_path]);
    if (stErr) {
      toast({ title: "Gagal hapus file", description: stErr.message, variant: "destructive" });
      return;
    }
    const { error: dbErr } = await supabase.from("kpi_monthly_attachments").delete().eq("id", row.id);
    if (dbErr) {
      toast({ title: "Gagal hapus record", description: dbErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lampiran dihapus" });
    await fetchItems();
  };

  return (
    <div className="border rounded-md p-3 bg-muted/20 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Lampiran Laporan {monthLabel}</span>
          <Badge variant={items.length > 0 ? "default" : "destructive"} className="text-[10px]">
            {items.length > 0 ? `${items.length} file` : "Wajib"}
          </Badge>
        </div>
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
              Upload
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {readOnly ? "Belum ada lampiran." : "Wajib upload minimal 1 file (PDF/Excel, max 10MB) sebelum input realisasi."}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 text-xs bg-background rounded px-2 py-1.5 border">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate" title={it.file_name}>{it.file_name}</span>
                <span className="text-muted-foreground shrink-0">({formatSize(it.file_size)})</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDownload(it)}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
                {!readOnly && (
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(it)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
