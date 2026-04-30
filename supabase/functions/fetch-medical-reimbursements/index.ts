// Proxy to Budget Expense /export-medical-reimbursements
// Aggregates approved/paid/review_finance medical claims by employee email & full_name
// for a given cut-off period (start_date..end_date inclusive).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ClaimRecord {
  employee_id?: string | null;
  patient_name?: string | null;
  employee_email?: string | null;
  employee_full_name?: string | null;
  claim_amount?: number | string | null;
  approved_amount?: number | string | null;
  status?: string | null;
  approved_at?: string | null;
  claim_date?: string | null;
}

interface AggregatedItem {
  total: number;
  count: number;
  matched_by: "email" | "name";
  source_name?: string;
}

function normalizeBudgetExpenseEndpointCandidate(value: string): string {
  const urlMatch = value.match(/https?:\/\/[^\s"'`<>]+/i)?.[0];
  const supabaseHostMatch = value.match(/[a-z0-9-]+\.supabase\.co(?:\/[^\s"'`<>]*)?/i)?.[0];
  const projectRefMatch = value.match(/\b[a-z0-9]{20}\b/i)?.[0];

  return (urlMatch || supabaseHostMatch || projectRefMatch || value)
    .trim()
    .replace(/^BUDGET_EXPENSE_URL\s*[:=]\s*/i, "")
    .replace(/^export\s+/i, "")
    .replace(/^["'`]+|["'`,;]+$/g, "")
    .trim()
    .replace(/\/+$/g, "");
}

function getBudgetExpenseEndpoint(rawUrl: string): string | null {
  const cleaned = normalizeBudgetExpenseEndpointCandidate(rawUrl);

  const candidates = cleaned ? [cleaned] : [];
  if (!/^https?:\/\//i.test(cleaned)) {
    if (/^[a-z0-9]{20}$/i.test(cleaned)) {
      candidates.push(`https://${cleaned}.supabase.co`);
    }
    candidates.push(`https://${cleaned}`);
  }

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (!/^https?:$/.test(url.protocol) || !url.hostname) continue;
      if (!url.hostname.includes(".")) continue;
      if (!url.pathname || url.pathname === "/") {
        url.pathname = "/functions/v1/export-medical-reimbursements";
      }
      return url.toString();
    } catch {
      // Try next normalized candidate.
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Only admin/HR may call this
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles || []).some((r: any) =>
      r.role === "admin" || r.role === "hr"
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { start_date, end_date, employees } = body as {
      start_date?: string;
      end_date?: string;
      employees?: { id: string; full_name?: string; email?: string }[];
    };
    if (!start_date || !end_date || !Array.isArray(employees)) {
      return new Response(
        JSON.stringify({ error: "start_date, end_date, employees required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate ISO date format & ordering, and ensure cut-off span (max ~32 days).
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRe.test(start_date) || !isoRe.test(end_date)) {
      return new Response(
        JSON.stringify({ error: "start_date/end_date must be YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const startMs = Date.parse(`${start_date}T00:00:00Z`);
    const endMs = Date.parse(`${end_date}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
      return new Response(
        JSON.stringify({ error: "Invalid date range" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const spanDays = Math.round((endMs - startMs) / 86400000) + 1;
    if (spanDays < 27 || spanDays > 32) {
      return new Response(
        JSON.stringify({
          error: `Period span ${spanDays} days is outside allowed cut-off range (27–32)`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const budgetUrl = Deno.env.get("BUDGET_EXPENSE_URL");
    const budgetSecret = Deno.env.get("BUDGET_EXPENSE_SECRET");
    if (!budgetUrl || !budgetSecret) {
      console.error("Budget Expense integration is not configured");
      return new Response(
        JSON.stringify({
          success: false,
          warning: "Medical reimbursement sync unavailable",
          period: { start_date, end_date },
          matched_employees: 0,
          unmatched_claims: 0,
          total_claims: 0,
          data: {},
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const budgetEndpoint = getBudgetExpenseEndpoint(budgetUrl);
    if (!budgetEndpoint) {
      const cleanedDebug = normalizeBudgetExpenseEndpointCandidate(budgetUrl);
      console.error(
        `BUDGET_EXPENSE_URL is not a valid URL. raw_length=${budgetUrl.length} starts="${budgetUrl.slice(0, 12)}" cleaned="${cleanedDebug}"`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          warning: "Medical reimbursement sync unavailable",
          period: { start_date, end_date },
          matched_employees: 0,
          unmatched_claims: 0,
          total_claims: 0,
          data: {},
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build employee payload for Budget Expense (must include email + full_name)
    const norm = (s?: string | null) =>
      (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const empPayload = employees
      .filter((e) => e.email && e.full_name)
      .map((e) => ({ email: e.email!.trim(), full_name: e.full_name!.trim() }));

    if (empPayload.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          period: { start_date, end_date },
          matched_employees: 0,
          unmatched_claims: 0,
          total_claims: 0,
          data: {},
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call Budget Expense (chunk by 500 — upstream limit)
    const chunks: { email: string; full_name: string }[][] = [];
    for (let i = 0; i < empPayload.length; i += 500) {
      chunks.push(empPayload.slice(i, i + 500));
    }

    type UpstreamClaim = {
      claim_number?: string;
      amount: number;
      status: string;
      approved_at?: string | null;
      submitted_at?: string | null;
    };
    type UpstreamItem = {
      email: string;
      full_name: string;
      matched_by: "email" | "full_name" | "none";
      total_amount: number;
      claim_count: number;
      claims?: UpstreamClaim[];
    };
    const allResults: UpstreamItem[] = [];

    for (const chunk of chunks) {
      const upstream = await fetch(budgetEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": budgetSecret,
          "Origin": "https://kemikaattendance.lovable.app",
        },
        body: JSON.stringify({
          start_date,
          end_date,
          employees: chunk,
        }),
      }).catch((error) => {
        console.error("Budget Expense fetch failed", error);
        return null;
      });

      if (!upstream) {
        return new Response(
          JSON.stringify({
            success: false,
            warning: "Medical reimbursement sync unavailable",
            period: { start_date, end_date },
            matched_employees: 0,
            unmatched_claims: 0,
            total_claims: 0,
            data: {},
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        console.error(`Budget Expense upstream error status=${upstream.status} endpoint=${budgetEndpoint} body=${text}`);
        return new Response(
          JSON.stringify({
            success: false,
            warning: "Medical reimbursement sync unavailable",
            period: { start_date, end_date },
            matched_employees: 0,
            unmatched_claims: 0,
            total_claims: 0,
            data: {},
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const upstreamJson = await upstream.json().catch(() => ({}));
      const items: UpstreamItem[] = Array.isArray(upstreamJson?.results)
        ? upstreamJson.results
        : [];
      allResults.push(...items);
    }

    // Lookup back to user_id by email/full_name
    const byEmail = new Map<string, { id: string; full_name: string }>();
    const byName = new Map<string, { id: string; full_name: string }>();
    for (const e of employees) {
      if (e.email) byEmail.set(norm(e.email), { id: e.id, full_name: e.full_name || "" });
      if (e.full_name) byName.set(norm(e.full_name), { id: e.id, full_name: e.full_name });
    }

    const aggregated = new Map<string, AggregatedItem>();
    let totalClaims = 0;
    let unmatched = 0;

    for (const r of allResults) {
      // FILTER: hanya hitung klaim ber-status 'approved'.
      // Klaim 'paid' sudah dibayarkan terpisah (jangan double-bayar lewat payroll).
      // Klaim 'review_finance' belum final.
      const approvedClaims = (r.claims || []).filter((c) => c.status === "approved");
      const approvedTotal = approvedClaims.reduce(
        (s, c) => s + (Number(c.amount) || 0),
        0,
      );
      const approvedCount = approvedClaims.length;

      totalClaims += approvedCount;
      if (approvedTotal <= 0 || r.matched_by === "none") {
        if (r.matched_by === "none" && approvedCount > 0) unmatched++;
        continue;
      }
      const emailKey = norm(r.email);
      const nameKey = norm(r.full_name);
      let match: { id: string; full_name: string } | undefined;
      let matchedBy: "email" | "name" = "email";
      if (r.matched_by === "email" && byEmail.has(emailKey)) {
        match = byEmail.get(emailKey);
        matchedBy = "email";
      } else if (byName.has(nameKey)) {
        match = byName.get(nameKey);
        matchedBy = "name";
      }
      if (!match) {
        unmatched++;
        continue;
      }
      const cur = aggregated.get(match.id) || {
        total: 0,
        count: 0,
        matched_by: matchedBy,
        source_name: match.full_name,
      };
      cur.total += approvedTotal;
      cur.count += approvedCount;
      if (matchedBy === "email") cur.matched_by = "email";
      aggregated.set(match.id, cur);
    }

    const result: Record<string, AggregatedItem> = {};
    for (const [k, v] of aggregated.entries()) result[k] = v;

    return new Response(
      JSON.stringify({
        success: true,
        period: { start_date, end_date },
        matched_employees: aggregated.size,
        unmatched_claims: unmatched,
        total_claims: totalClaims,
        data: result,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fetch-medical-reimbursements error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
