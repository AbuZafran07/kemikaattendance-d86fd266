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
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

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

    const budgetUrl = Deno.env.get("BUDGET_EXPENSE_URL");
    const budgetSecret = Deno.env.get("BUDGET_EXPENSE_SECRET");
    if (!budgetUrl || !budgetSecret) {
      return new Response(
        JSON.stringify({ error: "Integration not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call Budget Expense
    const upstream = await fetch(budgetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": budgetSecret,
      },
      body: JSON.stringify({
        start_date,
        end_date,
        statuses: ["approved", "paid", "review_finance"],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error("Budget Expense upstream error", upstream.status, text);
      return new Response(
        JSON.stringify({ error: "Upstream service error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const upstreamJson = await upstream.json().catch(() => ({}));
    const claims: ClaimRecord[] = Array.isArray(upstreamJson)
      ? upstreamJson
      : (upstreamJson?.data ?? upstreamJson?.claims ?? []);

    // Build lookup maps
    const norm = (s?: string | null) =>
      (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const byEmail = new Map<string, { id: string; full_name: string }>();
    const byName = new Map<string, { id: string; full_name: string }>();
    for (const e of employees) {
      if (e.email) byEmail.set(norm(e.email), { id: e.id, full_name: e.full_name || "" });
      if (e.full_name) byName.set(norm(e.full_name), { id: e.id, full_name: e.full_name });
    }

    const aggregated = new Map<string, AggregatedItem>();
    let unmatched = 0;

    for (const c of claims) {
      const status = (c.status || "").toLowerCase();
      if (!["approved", "paid", "review_finance"].includes(status)) continue;
      const amount = Number(c.approved_amount ?? 0) || 0;
      if (amount <= 0) continue;

      const emailKey = norm(c.employee_email);
      const nameKey = norm(c.employee_full_name || c.patient_name);

      let match: { id: string; full_name: string } | undefined;
      let matchedBy: "email" | "name" = "email";
      if (emailKey && byEmail.has(emailKey)) {
        match = byEmail.get(emailKey);
        matchedBy = "email";
      } else if (nameKey && byName.has(nameKey)) {
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
      cur.total += amount;
      cur.count += 1;
      // Keep the strongest match (email beats name)
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
        total_claims: claims.length,
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
