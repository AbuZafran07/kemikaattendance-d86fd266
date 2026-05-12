import { FileText, Database } from "lucide-react";
import type { HRReference } from "@/hooks/useHRAssistant";

interface Props {
  references?: HRReference[];
}

export default function HRReferenceChips({ references }: Props) {
  const refs = references ?? [];
  return (
    <div
      style={{
        marginLeft: 32,
        background: "#E1F5EE",
        borderLeft: "3px solid #1D9E75",
        borderRadius: "0 6px 6px 0",
        padding: "8px 10px",
      }}
    >
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#0F6E56" }}>
        📚 Sumber Rujukan
      </p>
      {refs.length === 0 ? (
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
          Tidak ada referensi terlampir — jawaban berdasarkan pengetahuan umum HR.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {refs.map((r, i) => {
            const Icon = r.type === "app" ? Database : FileText;
            return (
              <span
                key={i}
                title={r.type === "app" ? "Ketentuan resmi dari konfigurasi aplikasi" : "Dokumen yang diupload ke knowledge base"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: "#fff",
                  border: "1px solid #1D9E75",
                  color: "#0F6E56",
                  fontSize: 10.5,
                  fontWeight: 500,
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon style={{ width: 11, height: 11, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
