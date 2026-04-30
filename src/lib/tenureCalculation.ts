/**
 * Calculate employee tenure using payroll cutoff system.
 * 
 * In the cutoff system (e.g., cutoffDay=21):
 * - 1 month = from the 21st of month X to the 20th of month X+1
 * - Join Dec 21 → Jan 20 = 1 month, Jan 21 → Feb 20 = 1 month, etc.
 * 
 * @param joinDate Employee join date
 * @param refDate Reference date (e.g., Idul Fitri date)
 * @param cutoffDay The cutoff day (default 21)
 * @returns { fullMonths, remainingDays, totalMonthsFraction }
 */
export function calculateCutoffTenure(
  joinDate: Date,
  refDate: Date,
  cutoffDay: number = 21
): { fullMonths: number; remainingDays: number; totalMonthsFraction: number } {
  if (refDate.getTime() < joinDate.getTime()) {
    return { fullMonths: 0, remainingDays: 0, totalMonthsFraction: 0 };
  }

  // In cutoff system, the period ends on cutoffDay-1 of the next month.
  // E.g., period Feb 21 – Mar 20 is 1 full month. So Mar 20 should complete that period.
  // We add 1 day to refDate so the last day of a period is counted as completing the month.
  const adjustedRef = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 1);

  // Determine which cutoff period each date falls in
  // If day >= cutoffDay → period started this month at cutoffDay
  // If day < cutoffDay → period started previous month at cutoffDay

  const jDay = joinDate.getDate();
  let jPeriodMonth = joinDate.getMonth();
  let jPeriodYear = joinDate.getFullYear();
  let jDayInPeriod: number;

  if (jDay >= cutoffDay) {
    jDayInPeriod = jDay - cutoffDay;
  } else {
    jPeriodMonth -= 1;
    if (jPeriodMonth < 0) {
      jPeriodMonth = 11;
      jPeriodYear -= 1;
    }
    // Days from previous month's cutoff to this date
    const daysInPrevMonth = new Date(joinDate.getFullYear(), joinDate.getMonth(), 0).getDate();
    jDayInPeriod = jDay + (daysInPrevMonth - cutoffDay);
  }

  const rDay = adjustedRef.getDate();
  let rPeriodMonth = adjustedRef.getMonth();
  let rPeriodYear = adjustedRef.getFullYear();
  let rDayInPeriod: number;

  if (rDay >= cutoffDay) {
    rDayInPeriod = rDay - cutoffDay;
  } else {
    rPeriodMonth -= 1;
    if (rPeriodMonth < 0) {
      rPeriodMonth = 11;
      rPeriodYear -= 1;
    }
    const daysInPrevMonth = new Date(adjustedRef.getFullYear(), adjustedRef.getMonth(), 0).getDate();
    rDayInPeriod = rDay + (daysInPrevMonth - cutoffDay);
  }

  // Calculate months between the two cutoff periods
  let fullMonths = (rPeriodYear - jPeriodYear) * 12 + (rPeriodMonth - jPeriodMonth);
  let remainingDays = rDayInPeriod - jDayInPeriod;

  if (remainingDays < 0) {
    fullMonths -= 1;
    remainingDays += 30; // Use 30 as per Permenaker regulation
  }

  fullMonths = Math.max(fullMonths, 0);
  remainingDays = Math.max(remainingDays, 0);

  const totalMonthsFraction = fullMonths + remainingDays / 30;

  return { fullMonths, remainingDays, totalMonthsFraction };
}

/**
 * Calculate prorate factor for an employee who joined mid-cutoff period.
 * 
 * @param joinDate Employee join date
 * @param periodMonth Payroll period month (1-12)
 * @param periodYear Payroll period year
 * @param cutoffDay The cutoff day (default 21)
 * @returns factor between 0 and 1 (1 = full month, 0.5 = half month, etc.)
 */
export function calculateProrateFactor(
  joinDate: Date,
  periodMonth: number,
  periodYear: number,
  cutoffDay: number = 21
): number {
  // Cutoff period for payroll month M:
  // Start: cutoffDay of month (M-1)
  // End: cutoffDay-1 of month M
  const prevMonth = periodMonth - 1; // 0-indexed for Date constructor
  const periodStartMonth = prevMonth - 1; // JS month (0-based) for month M-1
  const periodStart = new Date(periodYear, periodStartMonth, cutoffDay);
  
  // Handle year boundary (e.g. January payroll → start is Dec cutoffDay of prev year)
  // Date constructor handles this automatically with negative months
  
  const periodEndDay = cutoffDay - 1;
  const periodEnd = new Date(periodYear, prevMonth, periodEndDay); // month M, day cutoffDay-1
  
  // If join date is before or on period start, full salary
  if (joinDate.getTime() <= periodStart.getTime()) {
    return 1;
  }
  
  // If join date is after period end, no salary
  if (joinDate.getTime() > periodEnd.getTime()) {
    return 0;
  }
  
  // Employee joined mid-period: calculate working days ratio
  // Total days in period
  const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  // Days worked (from join date to period end, inclusive)
  const workedDays = Math.round((periodEnd.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  return Math.min(1, Math.max(0, workedDays / totalDays));
}

/**
 * Calculate prorate factor that accounts for BOTH join date and resign date
 * within the same payroll cutoff period.
 *
 * - If joinDate is after period start, employee starts working partway in.
 * - If resignDate is before period end, employee stops working partway through.
 * - Returns workedDays / totalDays (0..1).
 *
 * @param joinDate Employee join date (always provided)
 * @param resignDate Employee resign date (null if still active)
 * @param periodMonth Payroll period month (1-12)
 * @param periodYear Payroll period year
 * @param cutoffDay The cutoff day (default 21)
 * @returns factor between 0 and 1
 */
export function calculateProrateFactorWithResign(
  joinDate: Date,
  resignDate: Date | null,
  periodMonth: number,
  periodYear: number,
  cutoffDay: number = 21
): number {
  const prevMonth = periodMonth - 1; // JS month index for period END month
  const periodStartMonth = prevMonth - 1; // JS month index for period START month
  const periodStart = new Date(periodYear, periodStartMonth, cutoffDay);
  const periodEnd = new Date(periodYear, prevMonth, cutoffDay - 1);

  // Effective start = max(joinDate, periodStart)
  const effectiveStart = joinDate.getTime() > periodStart.getTime() ? joinDate : periodStart;
  // Effective end = min(resignDate, periodEnd) when resignDate exists
  const effectiveEnd =
    resignDate && resignDate.getTime() < periodEnd.getTime() ? resignDate : periodEnd;

  // Out of bounds
  if (effectiveEnd.getTime() < periodStart.getTime()) return 0;
  if (effectiveStart.getTime() > periodEnd.getTime()) return 0;
  if (effectiveEnd.getTime() < effectiveStart.getTime()) return 0;

  const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
  const workedDays = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;

  return Math.min(1, Math.max(0, workedDays / totalDays));
}

/**
 * Returns the cutoff period boundaries for a given payroll month.
 */
export function getCutoffPeriodBounds(
  periodMonth: number,
  periodYear: number,
  cutoffDay: number = 21
): { start: Date; end: Date } {
  const prevMonth = periodMonth - 1;
  const start = new Date(periodYear, prevMonth - 1, cutoffDay);
  const end = new Date(periodYear, prevMonth, cutoffDay - 1);
  return { start, end };
}

/**
 * Validates that a (start_date, end_date) pair correctly maps to the
 * payroll month/year using the configured cutoff day.
 * Used to guard medical reimbursement / allowance period sync.
 */
export function validateCutoffPeriodForPayroll(
  startStr: string,
  endStr: string,
  payrollMonth: number,
  payrollYear: number,
  cutoffDay: number = 21
): { valid: boolean; reason?: string; expected: { start: string; end: string } } {
  const { start, end } = getCutoffPeriodBounds(payrollMonth, payrollYear, cutoffDay);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const expected = { start: fmt(start), end: fmt(end) };
  if (startStr !== expected.start || endStr !== expected.end) {
    return {
      valid: false,
      reason: `Periode ${startStr}–${endStr} tidak sesuai cut-off payroll ${pad(payrollMonth)}/${payrollYear} (harusnya ${expected.start}–${expected.end}).`,
      expected,
    };
  }
  return { valid: true, expected };
}

