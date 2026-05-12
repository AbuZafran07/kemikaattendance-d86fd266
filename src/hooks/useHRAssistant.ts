import { useState, useEffect, useRef } from "react";
import { loadHRDocs } from "@/components/HRDocumentModal";

const HR_SYSTEM_PROMPT = `Kamu adalah HR Assistant virtual dari PT. Kemika Karya Pratama, perusahaan yang bergerak di bidang industri kimia di Indonesia. Kamu membantu karyawan dan admin HR dengan pertanyaan seputar:

- Kebijakan kehadiran, absensi, dan keterlambatan
- Pengajuan dan sisa cuti tahunan, sakit, izin
- Perjalanan dinas dan reimbursement
- Lembur dan perhitungan lembur
- Penggajian, slip gaji, dan komponen gaji (BPJS, PPh 21, tunjangan)
- Peraturan ketenagakerjaan Indonesia (UU Cipta Kerja, PP 36/2021)
- KPI dan penilaian kinerja
- Pinjaman karyawan
- Prosedur dan kebijakan perusahaan

Gaya komunikasi:
- Profesional namun ramah dan hangat
- Gunakan Bahasa Indonesia yang baik dan mudah dipahami
- Jawab secara ringkas dan jelas, maksimal 3-4 paragraf
- Jika pertanyaan di luar konteks HR, arahkan kembali ke topik HR
- Jika butuh data spesifik karyawan yang tidak kamu miliki, minta mereka cek langsung di sistem atau hubungi admin HR

[UPLOADED_DOCUMENTS_CONTEXT]`;

export interface HRMessage {
  role: "user" | "assistant";
  content: string;
}

export function useHRAssistant() {
  const [hrMessages, setHrMessages] = useState<HRMessage[]>([]);
  const [hrInput, setHrInput] = useState("");
  const [hrLoading, setHrLoading] = useState(false);
  const hrMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hrMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [hrMessages]);

  const sendHRMessage = async (text?: string) => {
    const msg = (text ?? hrInput).trim();
    if (!msg || hrLoading) return;

    const newMessages: HRMessage[] = [...hrMessages, { role: "user", content: msg }];
    setHrMessages(newMessages);
    setHrInput("");
    setHrLoading(true);

    try {
      const history = newMessages.slice(-20);
      const activeDocs = loadHRDocs().filter((d) => d.active);
      const docsContext = activeDocs.length > 0
        ? activeDocs.map((doc) => `=== ${doc.name} ===\n${doc.content.slice(0, 3000)}`).join("\n\n")
        : "";
      const finalSystemPrompt = docsContext
        ? HR_SYSTEM_PROMPT.replace("[UPLOADED_DOCUMENTS_CONTEXT]", `\nBerikut dokumen tambahan perusahaan sebagai referensi:\n\n${docsContext}`)
        : HR_SYSTEM_PROMPT.replace("[UPLOADED_DOCUMENTS_CONTEXT]", "");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: finalSystemPrompt,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      const reply = data.content?.[0]?.text ?? "Maaf, saya tidak dapat menjawab saat ini.";
      setHrMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch {
      setHrMessages([...newMessages, { role: "assistant", content: "Maaf, terjadi kesalahan. Periksa koneksi atau API key Anda." }]);
    } finally {
      setHrLoading(false);
    }
  };

  const clearMessages = () => setHrMessages([]);

  return { hrMessages, hrInput, setHrInput, hrLoading, hrMessagesEndRef, sendHRMessage, clearMessages };
}
