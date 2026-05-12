import { useState, useRef, useCallback, useEffect } from "react";
import { FileText, UploadCloud, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

const STORAGE_KEY = "kemika_hr_docs";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_CONTENT_CHARS = 5000;

export interface HRDoc {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  active: boolean;
  content: string;
}

export function loadHRDocs(): HRDoc[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHRDocs(docs: HRDoc[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

async function parseFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "txt") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) ?? "");
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  if (ext === "pdf") {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: { str: string }) => item.str).join(" ") + "\n";
    }
    return text;
  }

  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  throw new Error("Format tidak didukung");
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function HRDocumentModal({ isOpen, onClose }: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<HRDoc[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setDocs(loadHRDocs());
  }, [isOpen]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const current = loadHRDocs();
    if (current.length >= MAX_FILES) {
      toast({ title: "Batas dokumen tercapai", description: `Maksimal ${MAX_FILES} file.`, variant: "destructive" });
      return;
    }

    const fileArr = Array.from(files);
    const accepted = [".pdf", ".txt", ".docx"];
    const toProcess: File[] = [];

    for (const file of fileArr) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!accepted.includes(ext)) {
        toast({ title: "Format tidak didukung", description: `${file.name} bukan PDF, DOCX, atau TXT.`, variant: "destructive" });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "File terlalu besar", description: `${file.name} melebihi batas 5MB.`, variant: "destructive" });
        continue;
      }
      toProcess.push(file);
    }

    if (!toProcess.length) return;
    setUploading(true);

    const newDocs: HRDoc[] = [];
    for (const file of toProcess) {
      try {
        const content = await parseFile(file);
        newDocs.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          name: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          active: true,
          content: content.slice(0, MAX_CONTENT_CHARS),
        });
      } catch {
        toast({ title: "Gagal memproses file", description: `${file.name} tidak dapat dibaca.`, variant: "destructive" });
      }
    }

    if (newDocs.length) {
      const updated = [...current, ...newDocs].slice(0, MAX_FILES);
      saveHRDocs(updated);
      setDocs(updated);
      toast({ title: "Dokumen berhasil diupload dan siap digunakan" });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [toast]);

  const toggleActive = (id: string) => {
    const updated = docs.map((d) => d.id === id ? { ...d, active: !d.active } : d);
    saveHRDocs(updated);
    setDocs(updated);
  };

  const confirmDelete = (id: string) => setDeleteTarget(id);

  const executeDelete = () => {
    if (!deleteTarget) return;
    const updated = docs.filter((d) => d.id !== deleteTarget);
    saveHRDocs(updated);
    setDocs(updated);
    setDeleteTarget(null);
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Modal backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}
        onClick={onClose}
      >
        <div
          style={{ width: 420, height: "100vh", background: "#fff", display: "flex", flexDirection: "column", animation: "hrPanelSlideIn 250ms ease", overflowY: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>Knowledge Base — Dokumen Perusahaan</p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                  Upload SOP, peraturan, dan kebijakan agar HR Assistant dapat menjawab lebih akurat.
                </p>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <X style={{ width: 18, height: 18, color: "#6b7280" }} />
              </button>
            </div>
            <div style={{ height: 1, background: "#e5e7eb", margin: "16px 0" }} />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
            {/* Upload Zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              style={{
                border: `2px dashed ${dragging ? "#0F6E56" : "#1D9E75"}`,
                background: dragging ? "#e6f7f2" : "#f0faf6",
                borderRadius: 12,
                padding: 32,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                transition: "all 150ms",
                marginBottom: 20,
              }}
            >
              {uploading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTop: "3px solid #0F6E56", borderRadius: "50%", animation: "hrSpin 0.8s linear infinite" }} />
                  <style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style>
                  <p style={{ margin: 0, fontSize: 13, color: "#0F6E56" }}>Memproses dokumen...</p>
                </div>
              ) : (
                <>
                  <UploadCloud style={{ width: 32, height: 32, color: "#1D9E75" }} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#111827" }}>Drag & drop atau klik untuk upload</p>
                  <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>PDF, DOCX, TXT • Maks 5MB per file • Maks 10 file</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ marginTop: 8, padding: "8px 20px", background: "#0F6E56", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Pilih File
                  </button>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx"
              multiple
              style={{ display: "none" }}
              onChange={(e) => e.target.files && processFiles(e.target.files)}
            />

            {/* Document List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {docs.length === 0 ? (
                <p style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", padding: "24px 0" }}>
                  Belum ada dokumen. Upload SOP atau peraturan perusahaan.
                </p>
              ) : (
                docs.map((doc) => (
                  <div key={doc.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <FileText style={{ width: 20, height: 20, color: "#0F6E56", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>
                        {formatBytes(doc.size)} • {formatDate(doc.uploadedAt)}
                      </p>
                      <button
                        onClick={() => toggleActive(doc.id)}
                        style={{
                          marginTop: 6, padding: "2px 10px", borderRadius: 9999, border: "none",
                          background: doc.active ? "#dcfce7" : "#f3f4f6",
                          color: doc.active ? "#15803d" : "#6b7280",
                          fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {doc.active ? "Aktif" : "Tidak Aktif"}
                      </button>
                    </div>
                    <button
                      onClick={() => confirmDelete(doc.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
                    >
                      <Trash2 style={{ width: 15, height: 15, color: "#ef4444" }} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 320, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "#111827" }}>Hapus dokumen ini?</p>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>Tindakan tidak dapat dibatalkan.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 8, background: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Batal
              </button>
              <button
                onClick={executeDelete}
                style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: "#ef4444", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
