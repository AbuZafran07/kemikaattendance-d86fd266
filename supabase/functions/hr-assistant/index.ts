import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsPreflightRequest, getCorsHeaders } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `Kamu adalah HR Assistant virtual dari PT. Kemika Karya Pratama, perusahaan yang bergerak di bidang industri kimia di Indonesia. Kamu membantu karyawan dan admin HR dengan pertanyaan seputar:

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
- Jika butuh data spesifik karyawan yang tidak kamu miliki, minta mereka cek langsung di sistem atau hubungi admin HR`;

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const accessToken = authHeader.replace("Bearer ", "").trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages: { role: string; content: string }[] = body.messages ?? [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit history to last 20 messages and sanitize content
    const safeMessages = messages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 2000),
    }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...safeMessages,
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "Maaf, saya tidak dapat menjawab saat ini.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hr-assistant error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
