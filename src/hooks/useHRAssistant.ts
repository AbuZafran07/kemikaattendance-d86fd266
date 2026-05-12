import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadHRDocs } from "@/components/HRDocumentModal";

export interface HRReference {
  type: "app" | "document";
  label: string;
}

export interface HRMessage {
  role: "user" | "assistant";
  content: string;
  references?: HRReference[];
}

async function buildAppContext(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: settings }, { data: profile }] = await Promise.all([
      supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["work_hours", "overtime_policy", "special_work_hours"]),
      user
        ? supabase
            .from("profiles")
            .select("full_name, jabatan, departemen, work_type, contract_type, join_date, annual_leave_quota, remaining_leave, ptkp_status")
            .eq("id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const map = new Map<string, any>((settings ?? []).map((s: any) => [s.key, s.value]));
    const wh = map.get("work_hours") ?? {};
    const op = map.get("overtime_policy") ?? {};

    const lines: string[] = [];
    lines.push("=== KETENTUAN APLIKASI (gunakan ini sebagai sumber resmi) ===");
    lines.push(`Jam Kerja: masuk ${wh.check_in_start ?? "-"}–${wh.check_in_end ?? "-"}, pulang ${wh.check_out_start ?? "-"}–${wh.check_out_end ?? "-"}, toleransi terlambat ${wh.late_tolerance_minutes ?? 0} menit.`);
    if (wh.friday_enabled) {
      lines.push(`Jam Kerja Jumat: pulang ${wh.friday_check_out_start ?? "-"}–${wh.friday_check_out_end ?? "-"}.`);
    }
    lines.push(`Lembur: min ${op.min_hours ?? "-"} jam, max ${op.max_hours_per_day ?? "-"} jam/hari, ${op.max_hours_per_week ?? "-"} jam/minggu, ${op.max_hours_per_month ?? "-"} jam/bulan. Multiplier weekday ${op.weekday_rate_multiplier ?? "-"}x, weekend ${op.weekend_rate_multiplier ?? "-"}x, libur nasional ${op.holiday_rate_multiplier ?? "-"}x. Persetujuan: ${op.requires_approval ? "wajib" : "tidak wajib"}.`);
    lines.push(`Tunjangan lembur: makan Rp${(op.meal_allowance_amount ?? 0).toLocaleString("id-ID")} bila ≥ ${op.meal_allowance_threshold_hours ?? "-"} jam, transport ${op.transport_allowance_enabled ? `Rp${(op.transport_allowance_amount ?? 0).toLocaleString("id-ID")}` : "tidak aktif"}.`);
    lines.push(`Pengajuan cuti: minimal ${op.min_days_advance_request ?? 1} hari sebelumnya (kecuali sakit/lupa absen).`);

    if (profile) {
      lines.push("");
      lines.push("=== DATA PENGGUNA SAAT INI ===");
      lines.push(`Nama: ${profile.full_name}, Jabatan: ${profile.jabatan}, Departemen: ${profile.departemen}, Tipe Kerja: ${profile.work_type}, Kontrak: ${profile.contract_type}, Bergabung: ${profile.join_date}, PTKP: ${profile.ptkp_status}.`);
      lines.push(`Kuota cuti tahunan: ${profile.annual_leave_quota ?? 0} hari, sisa ${profile.remaining_leave ?? 0} hari.`);
    }

    return lines.join("\n");
  } catch {
    return "";
  }
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

      const appContext = await buildAppContext();

      const referencePieces: string[] = [];
      if (appContext) referencePieces.push(appContext);
      if (docsContext) referencePieces.push("=== DOKUMEN PERUSAHAAN YANG DIUPLOAD ===\n" + docsContext);

      const referenceBlock = referencePieces.join("\n\n");

      const messagesPayload = referenceBlock
        ? [
            {
              role: "user" as const,
              content:
                "Berikut adalah referensi resmi yang WAJIB kamu gunakan untuk menjawab. " +
                "Selalu utamakan data dari KETENTUAN APLIKASI dan DOKUMEN PERUSAHAAN di bawah ini di atas pengetahuan umum. " +
                "Jika pertanyaan menyangkut angka/aturan spesifik (jam kerja, lembur, cuti, tunjangan, dll), gunakan nilai yang tertera. " +
                "Sebutkan sumbernya secara singkat (mis. \"berdasarkan ketentuan aplikasi\" atau \"berdasarkan dokumen <nama>\").\n\n" +
                referenceBlock,
            },
            { role: "assistant" as const, content: "Baik, saya akan menjawab berdasarkan ketentuan aplikasi dan dokumen perusahaan tersebut." },
            ...history,
          ]
        : history;

      const { data, error } = await supabase.functions.invoke("hr-assistant", {
        body: { messages: messagesPayload },
      });

      if (error) throw error;
      const reply = data?.reply ?? "Maaf, saya tidak dapat menjawab saat ini.";

      const references: HRReference[] = [];
      if (appContext) references.push({ type: "app", label: "Ketentuan Aplikasi" });
      activeDocs.forEach((d) => references.push({ type: "document", label: d.name }));

      setHrMessages([...newMessages, { role: "assistant", content: reply, references }]);
    } catch {
      setHrMessages([...newMessages, { role: "assistant", content: "Maaf, terjadi kesalahan. Silakan coba lagi." }]);
    } finally {
      setHrLoading(false);
    }
  };

  const clearMessages = () => setHrMessages([]);

  return { hrMessages, hrInput, setHrInput, hrLoading, hrMessagesEndRef, sendHRMessage, clearMessages };
}
