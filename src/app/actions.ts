"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { parseExecutiveRoleRequest } from "@/lib/executive-role-request.mjs";
import { getSiteOrigin, isGoogleAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[A-Za-z0-9_]{3,30}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function containsControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function formString(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function safeSiteUrl(path: string) {
  const origin = getSiteOrigin();
  return origin ? new URL(path, origin).toString() : null;
}

async function clientOrRedirect(destination = "/?notice=configuration") {
  try {
    return await createSupabaseServerClient();
  } catch {
    redirect(destination);
  }
}

function parseDuesMonths(
  formData: FormData,
  selectedField: string,
  additionalField?: string,
) {
  const selectedValues = formData.getAll(selectedField);
  if (selectedValues.some((value) => typeof value !== "string")) return null;

  const additionalValue = additionalField
    ? formData.get(additionalField)
    : null;
  if (additionalValue !== null && typeof additionalValue !== "string") {
    return null;
  }

  const tokens = [
    ...(selectedValues as string[]),
    ...(typeof additionalValue === "string" ? additionalValue.split(",") : []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  if (tokens.length < 1 || tokens.length > 1200) return null;

  const months: string[] = [];
  for (const token of tokens) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(token);
    if (!match || Number(match[1]) < 1900 || Number(match[1]) > 9999) {
      return null;
    }
    months.push(`${token}-01`);
  }

  if (new Set(months).size !== months.length) return null;
  return months.sort();
}

function parseDuesAmount(formData: FormData) {
  const value = formData.get("amount_ngn");
  if (typeof value !== "string" || !/^\d{1,13}$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= 1_200_000_000_000
    ? amount
    : null;
}

function parsePaymentDate(formData: FormData) {
  const value = formData.get("payment_date");
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01"
  ) {
    return null;
  }

  const dateParts = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    dateParts.find((item) => item.type === type)?.value ?? "";
  const todayWAT = `${part("year")}-${part("month")}-${part("day")}`;
  return value <= todayWAT ? value : null;
}

function parseFinanceDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01"
  ) {
    return null;
  }
  const dateParts = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    dateParts.find((item) => item.type === type)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return value <= today ? { date: value, today } : null;
}

function parseFinanceAmount(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d{1,13}$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= 1_000_000_000_000
    ? amount
    : null;
}

function optionalFormString(
  formData: FormData,
  key: string,
  maxLength: number,
) {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength
    ? trimmed
    : undefined;
}

async function getActiveFinanceActor() {
  const supabase = await clientOrRedirect("/?notice=configuration");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active")
    redirect("/?notice=sign-in");

  const { data: assignments, error: assignmentsError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  if (assignmentsError) redirect("/finances?notice=denied");

  return {
    supabase,
    roles: new Set((assignments ?? []).map((assignment) => assignment.role)),
  };
}

function financeRoleAllowed(roles: Set<string>) {
  return (
    roles.has("executive") || roles.has("admin") || roles.has("backup_admin")
  );
}

function financeCorrectionAllowed(roles: Set<string>) {
  return roles.has("admin") || roles.has("backup_admin");
}

function eventNoticeUrl(notice: string) {
  return `/events?${new URLSearchParams({ notice }).toString()}`;
}

function eventFinanceNoticeUrl(eventId: string, notice: string) {
  return `/events/${encodeURIComponent(eventId)}/finance?${new URLSearchParams({ notice }).toString()}`;
}

function eventAttendanceNoticeUrl(eventId: string, notice: string) {
  return `/events/${encodeURIComponent(eventId)}/attendance?${new URLSearchParams({ notice }).toString()}`;
}

function eventManagerAllowed(roles: Set<string>) {
  return (
    roles.has("executive") || roles.has("admin") || roles.has("backup_admin")
  );
}

function attendanceSessionControllerAllowed(roles: Set<string>) {
  return roles.has("executive") || roles.has("admin");
}

function eventFinanceManagerAllowed(actor: {
  roles: Set<string>;
  eventRoles: Set<string>;
}) {
  return (
    eventManagerAllowed(actor.roles) ||
    actor.eventRoles.has("lead") ||
    actor.eventRoles.has("assistant")
  );
}

function eventCorrectionAllowed(roles: Set<string>) {
  return roles.has("admin") || roles.has("backup_admin");
}

function eventDateTimeToISOString(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/.test(
      value,
    )
  ) {
    return null;
  }
  const localWallClock = new Date(`${value}:00.000Z`);
  if (
    Number.isNaN(localWallClock.getTime()) ||
    localWallClock.toISOString().slice(0, 16) !== value
  ) {
    return null;
  }
  return new Date(`${value}:00+01:00`).toISOString();
}

function eventCheckbox(formData: FormData, key: string) {
  const values = formData.getAll(key);
  if (values.length === 0) return false;
  return values.length === 1 && values[0] === "enabled" ? true : null;
}

function eventAmount(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d{0,12}$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount <= 1_000_000_000_000
    ? amount
    : null;
}

function eventText(formData: FormData, key: string, maxLength: number) {
  const values = formData.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  if (containsControlCharacters(values[0])) return null;
  const value = values[0].trim();
  return value.length > 0 &&
    value.length <= maxLength &&
    !containsControlCharacters(value)
    ? value
    : null;
}

function optionalEventText(formData: FormData, key: string, maxLength: number) {
  const values = formData.getAll(key);
  if (values.length === 0) return null;
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  if (containsControlCharacters(values[0])) return undefined;
  const value = values[0].trim();
  if (!value) return null;
  return value.length <= maxLength && !containsControlCharacters(value)
    ? value
    : undefined;
}

function eventFieldsOnly(formData: FormData, allowed: string[]) {
  const allowedSet = new Set(allowed);
  return Array.from(formData.keys()).every((key) => allowedSet.has(key));
}

function eventMinutesContent(formData: FormData) {
  const values = formData.getAll("content");
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  const value = values[0].trim();
  const hasDisallowedControl = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      (codePoint < 32 &&
        codePoint !== 9 &&
        codePoint !== 10 &&
        codePoint !== 13) ||
      codePoint === 127
    );
  });
  return value.length > 0 && value.length <= 20000 && !hasDisallowedControl
    ? value
    : null;
}

function eventAttendanceCutoff(formData: FormData, required: boolean) {
  const values = formData.getAll("late_after_minutes");
  if (values.length === 0 && !required) return null;
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  const value = values[0].trim();
  if (!value && !required) return null;
  if (!/^(0|[1-9]\d{0,2})$/.test(value)) return undefined;
  const cutoff = Number(value);
  return Number.isInteger(cutoff) && cutoff >= 0 && cutoff <= 240
    ? cutoff
    : undefined;
}

async function getActiveEventActor(eventId?: string) {
  const supabase = await clientOrRedirect("/?notice=configuration");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active")
    redirect("/?notice=sign-in");

  const { data: assignments, error: assignmentError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  if (assignmentError) redirect(eventNoticeUrl("denied"));

  let eventRoles = new Set<string>();
  if (eventId) {
    const { data: currentRoles, error: eventRoleError } = await supabase
      .from("event_role_assignments")
      .select("role")
      .eq("event_id", eventId)
      .eq("member_id", authData.user.id)
      .is("revoked_at", null);
    if (eventRoleError) redirect(eventNoticeUrl("denied"));
    eventRoles = new Set(
      (currentRoles ?? []).map((assignment) => assignment.role),
    );
  }

  return {
    supabase,
    memberId: authData.user.id,
    roles: new Set((assignments ?? []).map((assignment) => assignment.role)),
    eventRoles,
  };
}

function financeOptionalTextIsSafe(value: string | null | undefined) {
  return (
    value === null ||
    (typeof value === "string" && !containsControlCharacters(value))
  );
}

function financeNoticeUrl(notice: string) {
  return `/finances?${new URLSearchParams({ notice }).toString()}`;
}

function duesNoticeUrl(notice: string, memberId?: string) {
  const params = new URLSearchParams({ notice });
  if (memberId && uuidPattern.test(memberId)) params.set("member_id", memberId);
  return `/dues?${params.toString()}`;
}

async function getActiveDuesActor() {
  const supabase = await clientOrRedirect("/?notice=configuration");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active")
    redirect("/?notice=sign-in");

  const { data: assignments, error: assignmentsError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  if (assignmentsError) redirect(duesNoticeUrl("denied"));

  return {
    supabase,
    memberId: authData.user.id,
    roles: new Set((assignments ?? []).map((assignment) => assignment.role)),
  };
}

export async function recordDuesPaymentAction(formData: FormData) {
  const memberId = formString(formData, "member_id", 36);
  const amount = parseDuesAmount(formData);
  const paymentDate = parsePaymentDate(formData);
  const months = parseDuesMonths(formData, "covered_month", "prepay_months");
  if (
    !memberId ||
    !uuidPattern.test(memberId) ||
    amount === null ||
    !paymentDate ||
    !months
  ) {
    redirect(duesNoticeUrl("invalid-request", memberId ?? undefined));
  }

  const actor = await getActiveDuesActor();
  if (
    !actor.roles.has("executive") &&
    !actor.roles.has("admin") &&
    !actor.roles.has("backup_admin")
  ) {
    redirect(duesNoticeUrl("denied", memberId));
  }

  const { error } = await actor.supabase.rpc("record_dues_payment", {
    p_member_id: memberId,
    p_amount_ngn: amount,
    p_payment_date: paymentDate,
    p_covered_months: months,
  });
  if (error) redirect(duesNoticeUrl("operation-failed", memberId));

  revalidatePath("/dues");
  redirect(duesNoticeUrl("saved", memberId));
}

export async function writeOffDuesAction(formData: FormData) {
  const memberId = formString(formData, "member_id", 36);
  const months = parseDuesMonths(formData, "covered_month");
  const reason = formString(formData, "reason", 500);
  if (
    !memberId ||
    !uuidPattern.test(memberId) ||
    !months ||
    !reason ||
    containsControlCharacters(reason)
  ) {
    redirect(duesNoticeUrl("invalid-request", memberId ?? undefined));
  }

  const actor = await getActiveDuesActor();
  if (
    !actor.roles.has("executive") &&
    !actor.roles.has("admin") &&
    !actor.roles.has("backup_admin")
  ) {
    redirect(duesNoticeUrl("denied", memberId));
  }

  const { error } = await actor.supabase.rpc("write_off_dues_months", {
    p_member_id: memberId,
    p_covered_months: months,
    p_reason: reason,
  });
  if (error) redirect(duesNoticeUrl("operation-failed", memberId));

  revalidatePath("/dues");
  redirect(duesNoticeUrl("saved", memberId));
}

export async function correctDuesPaymentAction(formData: FormData) {
  const paymentId = formString(formData, "payment_id", 36);
  const memberId = formString(formData, "member_id", 36);
  const amount = parseDuesAmount(formData);
  const paymentDate = parsePaymentDate(formData);
  const months = parseDuesMonths(formData, "covered_months");
  const reason = formString(formData, "reason", 500);
  if (
    !paymentId ||
    !uuidPattern.test(paymentId) ||
    !memberId ||
    !uuidPattern.test(memberId) ||
    amount === null ||
    !paymentDate ||
    !months ||
    !reason ||
    containsControlCharacters(reason)
  ) {
    redirect(duesNoticeUrl("invalid-request", memberId ?? undefined));
  }

  const actor = await getActiveDuesActor();
  if (!actor.roles.has("admin") && !actor.roles.has("backup_admin")) {
    redirect(duesNoticeUrl("denied", memberId));
  }

  const { error } = await actor.supabase.rpc("correct_dues_payment", {
    p_payment_id: paymentId,
    p_member_id: memberId,
    p_amount_ngn: amount,
    p_payment_date: paymentDate,
    p_covered_months: months,
    p_reason: reason,
  });
  if (error) redirect(duesNoticeUrl("operation-failed", memberId));

  revalidatePath("/dues");
  redirect(duesNoticeUrl("saved", memberId));
}

export async function setDuesRateAction(formData: FormData) {
  const effectiveMonth = formString(formData, "effective_month", 7);
  const amount = parseDuesAmount(formData);
  const reason = formString(formData, "reason", 500);
  const month =
    effectiveMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)
      ? `${effectiveMonth}-01`
      : null;
  if (
    !month ||
    amount === null ||
    amount > 1_000_000_000 ||
    !reason ||
    containsControlCharacters(reason)
  ) {
    redirect(duesNoticeUrl("invalid-request"));
  }

  const actor = await getActiveDuesActor();
  if (!actor.roles.has("admin") && !actor.roles.has("backup_admin")) {
    redirect(duesNoticeUrl("denied"));
  }

  const { error } = await actor.supabase.rpc("set_dues_rate", {
    p_effective_month: month,
    p_monthly_amount_ngn: amount,
    p_reason: reason,
  });
  if (error) redirect(duesNoticeUrl("operation-failed"));

  revalidatePath("/dues");
  redirect(duesNoticeUrl("rate-saved"));
}

export async function recordClubFinanceAction(formData: FormData) {
  const kind = formString(formData, "kind", 8);
  const amount = parseFinanceAmount(formData.get("amount_ngn"));
  const parsedDate = parseFinanceDate(formData.get("transaction_date"));
  const description = optionalFormString(formData, "description", 500);
  const categoryId = optionalFormString(formData, "category_id", 36);
  const payerPayee = optionalFormString(formData, "payer_payee", 160);
  const sourceNote = optionalFormString(formData, "source_note", 500);
  const idempotencyKey = formString(formData, "idempotency_key", 36);
  if (
    !kind ||
    !["income", "expense"].includes(kind) ||
    amount === null ||
    !parsedDate ||
    !idempotencyKey ||
    !uuidPattern.test(idempotencyKey) ||
    description === undefined ||
    categoryId === undefined ||
    payerPayee === undefined ||
    sourceNote === undefined ||
    (categoryId !== null && !uuidPattern.test(categoryId)) ||
    !financeOptionalTextIsSafe(description) ||
    !financeOptionalTextIsSafe(payerPayee) ||
    !financeOptionalTextIsSafe(sourceNote)
  ) {
    redirect(financeNoticeUrl("invalid-request"));
  }

  const actor = await getActiveFinanceActor();
  if (!financeRoleAllowed(actor.roles)) redirect(financeNoticeUrl("denied"));
  if (
    parsedDate.date !== parsedDate.today &&
    !financeCorrectionAllowed(actor.roles)
  ) {
    redirect(financeNoticeUrl("denied"));
  }

  const { error } = await actor.supabase.rpc(
    "record_club_financial_transaction",
    {
      p_kind: kind,
      p_amount_ngn: amount,
      p_transaction_date: parsedDate.date,
      p_description: description,
      p_category_id: categoryId,
      p_payer_payee: payerPayee,
      p_source_note: sourceNote,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (error) redirect(financeNoticeUrl("operation-failed"));

  revalidatePath("/finances");
  redirect(financeNoticeUrl("saved"));
}

export async function correctClubFinanceAction(formData: FormData) {
  const transactionId = formString(formData, "transaction_id", 36);
  const amount = parseFinanceAmount(formData.get("amount_ngn"));
  const parsedDate = parseFinanceDate(formData.get("transaction_date"));
  const description = optionalFormString(formData, "description", 500);
  const categoryId = optionalFormString(formData, "category_id", 36);
  const payerPayee = optionalFormString(formData, "payer_payee", 160);
  const sourceNote = optionalFormString(formData, "source_note", 500);
  const reason = formString(formData, "reason", 500);
  if (
    !transactionId ||
    !uuidPattern.test(transactionId) ||
    amount === null ||
    !parsedDate ||
    description === undefined ||
    categoryId === undefined ||
    payerPayee === undefined ||
    sourceNote === undefined ||
    (categoryId !== null && !uuidPattern.test(categoryId)) ||
    !reason ||
    containsControlCharacters(reason) ||
    !financeOptionalTextIsSafe(description) ||
    !financeOptionalTextIsSafe(payerPayee) ||
    !financeOptionalTextIsSafe(sourceNote)
  ) {
    redirect(financeNoticeUrl("invalid-request"));
  }

  const actor = await getActiveFinanceActor();
  if (!financeCorrectionAllowed(actor.roles))
    redirect(financeNoticeUrl("denied"));

  const { error } = await actor.supabase.rpc(
    "correct_club_financial_transaction",
    {
      p_transaction_id: transactionId,
      p_amount_ngn: amount,
      p_transaction_date: parsedDate.date,
      p_description: description,
      p_category_id: categoryId,
      p_payer_payee: payerPayee,
      p_source_note: sourceNote,
      p_reason: reason,
    },
  );
  if (error) redirect(financeNoticeUrl("operation-failed"));

  revalidatePath("/finances");
  redirect(financeNoticeUrl("corrected"));
}

export async function voidClubFinanceAction(formData: FormData) {
  const transactionId = formString(formData, "transaction_id", 36);
  const reason = formString(formData, "reason", 500);
  if (
    !transactionId ||
    !uuidPattern.test(transactionId) ||
    !reason ||
    containsControlCharacters(reason)
  ) {
    redirect(financeNoticeUrl("invalid-request"));
  }

  const actor = await getActiveFinanceActor();
  if (!financeCorrectionAllowed(actor.roles))
    redirect(financeNoticeUrl("denied"));

  const { error } = await actor.supabase.rpc(
    "void_club_financial_transaction",
    { p_transaction_id: transactionId, p_reason: reason },
  );
  if (error) redirect(financeNoticeUrl("operation-failed"));

  revalidatePath("/finances");
  redirect(financeNoticeUrl("voided"));
}

export async function createFinanceCategoryAction(formData: FormData) {
  const name = formString(formData, "name", 80);
  const reason = formString(formData, "reason", 500);
  if (
    !name ||
    name.length < 2 ||
    containsControlCharacters(name) ||
    !reason ||
    containsControlCharacters(reason)
  ) {
    redirect(financeNoticeUrl("invalid-request"));
  }

  const actor = await getActiveFinanceActor();
  if (!financeRoleAllowed(actor.roles)) redirect(financeNoticeUrl("denied"));

  const { error } = await actor.supabase.rpc("create_finance_category", {
    p_name: name,
    p_reason: reason,
  });
  if (error) redirect(financeNoticeUrl("operation-failed"));

  revalidatePath("/finances");
  redirect(financeNoticeUrl("category-saved"));
}

export async function retireFinanceCategoryAction(formData: FormData) {
  const categoryId = formString(formData, "category_id", 36);
  const reason = formString(formData, "reason", 500);
  if (
    !categoryId ||
    !uuidPattern.test(categoryId) ||
    !reason ||
    containsControlCharacters(reason)
  ) {
    redirect(financeNoticeUrl("invalid-request"));
  }

  const actor = await getActiveFinanceActor();
  if (!financeRoleAllowed(actor.roles)) redirect(financeNoticeUrl("denied"));

  const { error } = await actor.supabase.rpc("retire_finance_category", {
    p_category_id: categoryId,
    p_reason: reason,
  });
  if (error) redirect(financeNoticeUrl("operation-failed"));

  revalidatePath("/finances");
  redirect(financeNoticeUrl("category-retired"));
}

export async function signInAction(formData: FormData) {
  const email = formString(formData, "email", 254)?.toLowerCase();
  const password = formData.get("password");
  if (!email || !emailPattern.test(email) || typeof password !== "string") {
    redirect("/?notice=credentials");
  }

  const supabase = await clientOrRedirect();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/?notice=credentials");
  redirect("/");
}

export async function signUpAction(formData: FormData) {
  const email = formString(formData, "email", 254)?.toLowerCase();
  const fullName = formString(formData, "full_name", 120);
  const username = formString(formData, "username", 30);
  const password = formData.get("password");
  const confirmPassword = formData.get("confirm_password");

  if (
    !email ||
    !emailPattern.test(email) ||
    !fullName ||
    containsControlCharacters(fullName) ||
    !username ||
    !usernamePattern.test(username) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128 ||
    password !== confirmPassword
  ) {
    redirect("/signup?notice=invalid-signup");
  }

  const emailRedirectTo = safeSiteUrl("/auth/callback");
  if (!emailRedirectTo) redirect("/signup?notice=configuration");

  const supabase = await clientOrRedirect("/signup?notice=configuration");
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: { full_name: fullName, username },
    },
  });

  // Keep the response indistinguishable for an existing address to reduce
  // account enumeration. Auth metadata is validated again by the DB trigger.
  if (error) redirect("/signup?notice=signup-unavailable");
  redirect("/signup?notice=check-email");
}

export async function googleSignInAction() {
  if (!isGoogleAuthConfigured()) redirect("/?notice=google-unavailable");

  const redirectTo = safeSiteUrl("/auth/callback");
  if (!redirectTo) redirect("/?notice=configuration");

  const supabase = await clientOrRedirect();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error || !data.url) redirect("/?notice=google-unavailable");
  redirect(data.url);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = formString(formData, "email", 254)?.toLowerCase();
  if (!email || !emailPattern.test(email)) redirect("/?notice=reset-requested");

  const redirectTo = safeSiteUrl("/auth/callback?next=%2Freset-password");
  if (!redirectTo) redirect("/?notice=configuration");

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Use the same response for unknown addresses and provider errors.
  }
  redirect("/?notice=reset-requested");
}

export async function updatePasswordAction(formData: FormData) {
  const password = formData.get("password");
  const confirmation = formData.get("confirm_password");
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128 ||
    password !== confirmation
  ) {
    redirect("/reset-password?notice=invalid-password");
  }

  const supabase = await clientOrRedirect("/reset-password?notice=expired");
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) redirect("/reset-password?notice=expired");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?notice=update-failed");
  redirect("/?notice=password-updated");
}

export async function completeProfileAction(formData: FormData) {
  const fullName = formString(formData, "full_name", 120);
  const username = formString(formData, "username", 30);
  if (
    !fullName ||
    containsControlCharacters(fullName) ||
    !username ||
    !usernamePattern.test(username)
  ) {
    redirect("/?notice=invalid-profile");
  }

  const supabase = await clientOrRedirect();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status, profile_completed_at")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (
    profileError ||
    profile?.status !== "pending" ||
    profile.profile_completed_at
  ) {
    redirect("/?notice=profile-locked");
  }

  const { error } = await supabase.rpc("complete_member_profile", {
    p_full_name: fullName,
    p_username: username,
  });
  if (error) redirect("/?notice=profile-update-failed");
  revalidatePath("/");
  redirect("/?notice=profile-complete");
}

export async function memberLifecycleAction(formData: FormData) {
  const operation = formString(formData, "operation", 20);
  const memberId = formString(formData, "member_id", 36);
  const reason = formString(formData, "reason", 500);
  if (
    !operation ||
    !["approve", "deactivate", "reactivate"].includes(operation) ||
    !memberId ||
    !uuidPattern.test(memberId) ||
    !reason
  ) {
    redirect("/admin/members?notice=invalid-request");
  }

  const supabase = await clientOrRedirect("/?notice=configuration");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    redirect("/admin/members?notice=denied");
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  if (assignmentsError) redirect("/admin/members?notice=denied");

  const roles = new Set(
    (assignments ?? []).map((assignment) => assignment.role),
  );
  const canApprove =
    roles.has("executive") || roles.has("admin") || roles.has("backup_admin");
  const canManageStatus = roles.has("admin") || roles.has("backup_admin");
  const allowed = operation === "approve" ? canApprove : canManageStatus;
  if (!allowed) redirect("/admin/members?notice=denied");

  const rpcName = {
    approve: "approve_member",
    deactivate: "deactivate_member",
    reactivate: "reactivate_member",
  }[operation] as "approve_member" | "deactivate_member" | "reactivate_member";

  const { error } = await supabase.rpc(rpcName, {
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error) redirect("/admin/members?notice=operation-failed");

  revalidatePath("/admin/members");
  redirect("/admin/members?notice=saved");
}

export async function executiveRoleAction(formData: FormData) {
  const request = parseExecutiveRoleRequest(formData);
  if (!request) redirect("/admin/members?notice=invalid-request");

  const supabase = await clientOrRedirect("/?notice=configuration");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    redirect("/admin/members?notice=denied");
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  if (assignmentsError) redirect("/admin/members?notice=denied");

  const roles = new Set(
    (assignments ?? []).map((assignment) => assignment.role),
  );
  if (!roles.has("admin") && !roles.has("backup_admin")) {
    redirect("/admin/members?notice=denied");
  }

  const rpcName =
    request.operation === "grant" ? "grant_club_role" : "revoke_club_role";
  const { error } = await supabase.rpc(rpcName, {
    p_member_id: request.memberId,
    p_role: "executive",
    p_reason: request.reason,
  });
  if (error) redirect("/admin/members?notice=operation-failed");

  revalidatePath("/admin/members");
  redirect("/admin/members?notice=role-updated");
}

export async function signOutAction() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Clear the local browser flow by returning to the public sign-in screen.
  }
  redirect("/");
}

export async function createEventAction(formData: FormData) {
  const actor = await getActiveEventActor();
  if (!eventManagerAllowed(actor.roles)) redirect(eventNoticeUrl("denied"));
  const allowed = [
    "title",
    "event_type",
    "starts_at",
    "location",
    "description",
    "minutes_enabled",
    "attendance_enabled",
    "budget_enabled",
    "income_enabled",
    "expenses_enabled",
    "ticketing_enabled",
  ];
  if (!eventFieldsOnly(formData, allowed))
    redirect(eventNoticeUrl("invalid-request"));

  const title = eventText(formData, "title", 120);
  const eventType = eventText(formData, "event_type", 20);
  if (formData.getAll("starts_at").length !== 1) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const startsAt = eventDateTimeToISOString(formData.get("starts_at"));
  const location = eventText(formData, "location", 200);
  const description = optionalEventText(formData, "description", 2000);
  const minutesEnabled = eventCheckbox(formData, "minutes_enabled");
  const attendanceEnabled = eventCheckbox(formData, "attendance_enabled");
  const budgetEnabled = eventCheckbox(formData, "budget_enabled");
  const incomeEnabled = eventCheckbox(formData, "income_enabled");
  const expensesEnabled = eventCheckbox(formData, "expenses_enabled");
  const ticketingEnabled = eventCheckbox(formData, "ticketing_enabled");
  if (
    !title ||
    !["meeting", "party", "other"].includes(eventType ?? "") ||
    !startsAt ||
    !location ||
    description === undefined ||
    minutesEnabled === null ||
    attendanceEnabled === null ||
    budgetEnabled === null ||
    incomeEnabled === null ||
    expensesEnabled === null ||
    ticketingEnabled === null
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }

  const { error } = await actor.supabase.rpc("create_event", {
    p_title: title,
    p_event_type: eventType,
    p_starts_at: startsAt,
    p_location: location,
    p_description: description,
    p_minutes_enabled: minutesEnabled,
    p_attendance_enabled: attendanceEnabled,
    p_budget_enabled: budgetEnabled,
    p_income_enabled: incomeEnabled,
    p_expenses_enabled: expensesEnabled,
    p_ticketing_enabled: ticketingEnabled,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  redirect(eventNoticeUrl("created"));
}

export async function updateEventDetailsAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId))
    redirect(eventNoticeUrl("invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (
    !eventManagerAllowed(actor.roles) &&
    !actor.eventRoles.has("lead") &&
    !actor.eventRoles.has("assistant")
  ) {
    redirect(eventNoticeUrl("denied"));
  }
  if (
    !eventFieldsOnly(formData, [
      "event_id",
      "title",
      "starts_at",
      "location",
      "description",
      "reason",
    ])
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const title = eventText(formData, "title", 120);
  if (formData.getAll("starts_at").length !== 1) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const startsAt = eventDateTimeToISOString(formData.get("starts_at"));
  const location = eventText(formData, "location", 200);
  const description = optionalEventText(formData, "description", 2000);
  const reason = eventText(formData, "reason", 500);
  if (
    !title ||
    !startsAt ||
    !location ||
    description === undefined ||
    !reason
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const { error } = await actor.supabase.rpc("update_event_details", {
    p_event_id: eventId,
    p_title: title,
    p_starts_at: startsAt,
    p_location: location,
    p_description: description,
    p_reason: reason,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  redirect(eventNoticeUrl("updated"));
}

export async function assignEventRoleAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId))
    redirect(eventNoticeUrl("invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!eventManagerAllowed(actor.roles)) redirect(eventNoticeUrl("denied"));
  if (
    !eventFieldsOnly(formData, [
      "event_id",
      "member_id",
      "event_role",
      "reason",
    ])
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const memberId = eventText(formData, "member_id", 36);
  const role = eventText(formData, "event_role", 20);
  const reason = eventText(formData, "reason", 500);
  if (
    !memberId ||
    !uuidPattern.test(memberId) ||
    !["lead", "assistant", "committee"].includes(role ?? "") ||
    !reason
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const { error } = await actor.supabase.rpc("assign_event_role", {
    p_event_id: eventId,
    p_member_id: memberId,
    p_role: role,
    p_reason: reason,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  redirect(eventNoticeUrl("role-saved"));
}

export async function revokeEventRoleAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId))
    redirect(eventNoticeUrl("invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!eventManagerAllowed(actor.roles)) redirect(eventNoticeUrl("denied"));
  if (!eventFieldsOnly(formData, ["event_id", "member_id", "reason"])) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const memberId = eventText(formData, "member_id", 36);
  const reason = eventText(formData, "reason", 500);
  if (!memberId || !uuidPattern.test(memberId) || !reason) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const { error } = await actor.supabase.rpc("revoke_event_role", {
    p_event_id: eventId,
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  redirect(eventNoticeUrl("role-saved"));
}

export async function setEventBudgetAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId))
    redirect(eventNoticeUrl("invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (
    !eventManagerAllowed(actor.roles) &&
    !actor.eventRoles.has("lead") &&
    !actor.eventRoles.has("assistant")
  ) {
    redirect(eventNoticeUrl("denied"));
  }
  if (
    !eventFieldsOnly(formData, [
      "event_id",
      "total_ngn",
      "allocation_name",
      "allocation_amount_ngn",
      "reason",
    ])
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const total = eventAmount(formData.get("total_ngn"));
  const reason = eventText(formData, "reason", 500);
  const names = formData.getAll("allocation_name");
  const amounts = formData.getAll("allocation_amount_ngn");
  if (
    total === null ||
    formData.getAll("total_ngn").length !== 1 ||
    formData.getAll("event_id").length !== 1 ||
    !reason ||
    names.length < 1 ||
    names.length > 50 ||
    names.length !== amounts.length
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const allocations: { name: string; amount_ngn: number }[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const nameValue = names[index];
    const amountValue = amounts[index];
    if (typeof nameValue !== "string" || typeof amountValue !== "string") {
      redirect(eventNoticeUrl("invalid-request"));
    }
    if (!nameValue.trim() && !amountValue.trim()) continue;
    if (containsControlCharacters(nameValue)) {
      redirect(eventNoticeUrl("invalid-request"));
    }
    const name = nameValue.trim();
    const amount = eventAmount(amountValue);
    if (
      !name ||
      name.length > 80 ||
      containsControlCharacters(name) ||
      amount === null
    ) {
      redirect(eventNoticeUrl("invalid-request"));
    }
    allocations.push({ name, amount_ngn: amount });
  }
  if (
    allocations.length < 1 ||
    allocations.length > 50 ||
    allocations.reduce((sum, allocation) => sum + allocation.amount_ngn, 0) !==
      total
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }

  const { error } = await actor.supabase.rpc("set_event_budget", {
    p_event_id: eventId,
    p_total_ngn: total,
    p_allocations: allocations,
    p_reason: reason,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  redirect(eventNoticeUrl("budget-saved"));
}

export async function setEventStatusAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId))
    redirect(eventNoticeUrl("invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!eventManagerAllowed(actor.roles) && !actor.eventRoles.has("lead")) {
    redirect(eventNoticeUrl("denied"));
  }
  if (!eventFieldsOnly(formData, ["event_id", "status", "reason", "confirm"])) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const status = eventText(formData, "status", 20);
  const reason = eventText(formData, "reason", 500);
  const confirmValues = formData.getAll("confirm");
  if (
    !["completed", "cancelled"].includes(status ?? "") ||
    !reason ||
    confirmValues.length !== 1 ||
    confirmValues[0] !== "yes"
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const { error } = await actor.supabase.rpc("set_event_status", {
    p_event_id: eventId,
    p_status: status,
    p_reason: reason,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventNoticeUrl(status === "completed" ? "completed" : "cancelled"));
}

export async function reopenEventAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId))
    redirect(eventNoticeUrl("invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!financeCorrectionAllowed(actor.roles))
    redirect(eventNoticeUrl("denied"));
  if (!eventFieldsOnly(formData, ["event_id", "reason", "confirm"])) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const reason = eventText(formData, "reason", 500);
  const confirmValues = formData.getAll("confirm");
  if (!reason || confirmValues.length !== 1 || confirmValues[0] !== "yes") {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const { error } = await actor.supabase.rpc("set_event_status", {
    p_event_id: eventId,
    p_status: "scheduled",
    p_reason: reason,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventNoticeUrl("reopened"));
}

export async function archiveEventAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId))
    redirect(eventNoticeUrl("invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!eventManagerAllowed(actor.roles)) redirect(eventNoticeUrl("denied"));
  if (!eventFieldsOnly(formData, ["event_id", "reason", "confirm"])) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const reason = eventText(formData, "reason", 500);
  const confirmValues = formData.getAll("confirm");
  if (!reason || confirmValues.length !== 1 || confirmValues[0] !== "yes") {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const { error } = await actor.supabase.rpc("archive_event", {
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) redirect(eventNoticeUrl("operation-failed"));
  revalidatePath("/events");
  redirect(eventNoticeUrl("archived"));
}

function eventFinanceInput(
  formData: FormData,
  fields: string[],
  idField: string,
) {
  const eventId = eventText(formData, "event_id", 36);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    !eventFieldsOnly(formData, fields)
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const recordId = eventText(formData, idField, 36);
  if (!recordId || !uuidPattern.test(recordId)) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  return { eventId, recordId };
}

function eventCapacity(formData: FormData, key: string, maximum: number) {
  const value = formData.get(key);
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function eventFinanceOptionalText(
  formData: FormData,
  key: string,
  maxLength: number,
) {
  const value = optionalEventText(formData, key, maxLength);
  return value === undefined ? undefined : value;
}

export async function createEventTicketTierAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    !eventFieldsOnly(formData, [
      "event_id",
      "name",
      "price_ngn",
      "capacity",
      "reason",
    ])
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const name = eventText(formData, "name", 80);
  const price = eventAmount(formData.get("price_ngn"));
  const capacity = eventCapacity(formData, "capacity", 100_000);
  const reason = eventText(formData, "reason", 500);
  if (!name || price === null || capacity === null || !reason) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (!eventFinanceManagerAllowed(actor)) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("create_event_ticket_tier", {
    p_event_id: eventId,
    p_name: name,
    p_price_ngn: price,
    p_capacity: capacity,
    p_reason: reason,
  });
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  redirect(eventFinanceNoticeUrl(eventId, "tier-saved"));
}

export async function updateEventTicketTierAction(formData: FormData) {
  const { eventId, recordId: tierId } = eventFinanceInput(
    formData,
    ["event_id", "tier_id", "name", "price_ngn", "capacity", "reason"],
    "tier_id",
  );
  const name = eventText(formData, "name", 80);
  const price = eventAmount(formData.get("price_ngn"));
  const capacity = eventCapacity(formData, "capacity", 100_000);
  const reason = eventText(formData, "reason", 500);
  if (!name || price === null || capacity === null || !reason) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (!eventFinanceManagerAllowed(actor)) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("update_event_ticket_tier", {
    p_tier_id: tierId,
    p_name: name,
    p_price_ngn: price,
    p_capacity: capacity,
    p_reason: reason,
  });
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  redirect(eventFinanceNoticeUrl(eventId, "tier-saved"));
}

export async function retireEventTicketTierAction(formData: FormData) {
  const { eventId, recordId: tierId } = eventFinanceInput(
    formData,
    ["event_id", "tier_id", "reason"],
    "tier_id",
  );
  const reason = eventText(formData, "reason", 500);
  if (!reason) redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!eventFinanceManagerAllowed(actor)) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("retire_event_ticket_tier", {
    p_tier_id: tierId,
    p_reason: reason,
  });
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  redirect(eventFinanceNoticeUrl(eventId, "tier-retired"));
}

export async function recordEventFinancialTransactionAction(
  formData: FormData,
) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId)) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const kind = eventText(formData, "kind", 8);
  const amount = eventAmount(formData.get("amount_ngn"));
  const transactionDate = parseFinanceDate(formData.get("transaction_date"));
  const description = eventFinanceOptionalText(formData, "description", 500);
  const payerPayee = eventFinanceOptionalText(formData, "payer_payee", 160);
  const sourceNote = eventFinanceOptionalText(formData, "source_note", 500);
  const paymentMethod = eventFinanceOptionalText(
    formData,
    "payment_method",
    24,
  );
  const idempotencyKey = eventText(formData, "idempotency_key", 36);
  if (
    !eventFieldsOnly(formData, [
      "event_id",
      "kind",
      "amount_ngn",
      "transaction_date",
      "description",
      "payer_payee",
      "source_note",
      "payment_method",
      "idempotency_key",
    ]) ||
    !["income", "expense"].includes(kind ?? "") ||
    amount === null ||
    !transactionDate ||
    description === undefined ||
    payerPayee === undefined ||
    sourceNote === undefined ||
    paymentMethod === undefined ||
    !idempotencyKey ||
    !uuidPattern.test(idempotencyKey) ||
    (kind === "income" && (!sourceNote || !paymentMethod || description)) ||
    (kind === "expense" &&
      (!description || !payerPayee || sourceNote || paymentMethod))
  ) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (!eventFinanceManagerAllowed(actor)) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  if (
    transactionDate.date !== transactionDate.today &&
    !eventCorrectionAllowed(actor.roles)
  ) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc(
    "record_event_financial_transaction",
    {
      p_event_id: eventId,
      p_kind: kind,
      p_amount_ngn: amount,
      p_transaction_date: transactionDate.date,
      p_description: description,
      p_payer_payee: payerPayee,
      p_source_note: sourceNote,
      p_payment_method: paymentMethod,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventFinanceNoticeUrl(eventId, "saved"));
}

export async function correctEventFinancialTransactionAction(
  formData: FormData,
) {
  const { eventId, recordId: transactionId } = eventFinanceInput(
    formData,
    [
      "event_id",
      "transaction_id",
      "amount_ngn",
      "transaction_date",
      "description",
      "payer_payee",
      "source_note",
      "payment_method",
      "reason",
    ],
    "transaction_id",
  );
  const amount = eventAmount(formData.get("amount_ngn"));
  const transactionDate = parseFinanceDate(formData.get("transaction_date"));
  const description = eventFinanceOptionalText(formData, "description", 500);
  const payerPayee = eventFinanceOptionalText(formData, "payer_payee", 160);
  const sourceNote = eventFinanceOptionalText(formData, "source_note", 500);
  const paymentMethod = eventFinanceOptionalText(
    formData,
    "payment_method",
    24,
  );
  const reason = eventText(formData, "reason", 500);
  if (
    amount === null ||
    !transactionDate ||
    description === undefined ||
    payerPayee === undefined ||
    sourceNote === undefined ||
    paymentMethod === undefined ||
    !reason
  ) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (!eventCorrectionAllowed(actor.roles)) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  const { data: current, error: currentError } = await actor.supabase
    .from("event_financial_transactions")
    .select("id, event_id, kind")
    .eq("id", transactionId)
    .maybeSingle();
  if (currentError || !current || current.event_id !== eventId) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  if (
    (current.kind === "income" &&
      (!sourceNote || !paymentMethod || description)) ||
    (current.kind === "expense" &&
      (!description || !payerPayee || sourceNote || paymentMethod))
  ) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  const { error } = await actor.supabase.rpc(
    "correct_event_financial_transaction",
    {
      p_transaction_id: transactionId,
      p_amount_ngn: amount,
      p_transaction_date: transactionDate.date,
      p_description: description,
      p_payer_payee: payerPayee,
      p_source_note: sourceNote,
      p_payment_method: paymentMethod,
      p_reason: reason,
    },
  );
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventFinanceNoticeUrl(eventId, "corrected"));
}

export async function voidEventFinancialTransactionAction(formData: FormData) {
  const { eventId, recordId: transactionId } = eventFinanceInput(
    formData,
    ["event_id", "transaction_id", "reason"],
    "transaction_id",
  );
  const reason = eventText(formData, "reason", 500);
  if (!reason) redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!eventCorrectionAllowed(actor.roles)) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc(
    "void_event_financial_transaction",
    { p_transaction_id: transactionId, p_reason: reason },
  );
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventFinanceNoticeUrl(eventId, "voided"));
}

export async function recordEventTicketSaleAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId)) {
    redirect(eventNoticeUrl("invalid-request"));
  }
  const tierId = eventText(formData, "tier_id", 36);
  const quantity = eventCapacity(formData, "quantity", 1000);
  const buyerName = eventFinanceOptionalText(formData, "buyer_name", 160);
  const paymentMethod = eventFinanceOptionalText(
    formData,
    "payment_method",
    24,
  );
  const idempotencyKey = eventText(formData, "idempotency_key", 36);
  const methods = [
    "cash",
    "bank_transfer",
    "mobile_money",
    "card",
    "cheque",
    "other",
  ];
  if (
    !eventFieldsOnly(formData, [
      "event_id",
      "tier_id",
      "quantity",
      "buyer_name",
      "payment_method",
      "idempotency_key",
    ]) ||
    !tierId ||
    !uuidPattern.test(tierId) ||
    quantity === null ||
    buyerName === undefined ||
    paymentMethod === undefined ||
    (paymentMethod !== null && !methods.includes(paymentMethod)) ||
    !idempotencyKey ||
    !uuidPattern.test(idempotencyKey)
  ) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  const { error } = await actor.supabase.rpc("record_event_ticket_sale", {
    p_event_id: eventId,
    p_tier_id: tierId,
    p_quantity: quantity,
    p_buyer_name: buyerName,
    p_payment_method: paymentMethod,
    p_idempotency_key: idempotencyKey,
  });
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventFinanceNoticeUrl(eventId, "sale-saved"));
}

export async function editEventTicketSaleAction(formData: FormData) {
  const { eventId, recordId: saleId } = eventFinanceInput(
    formData,
    [
      "event_id",
      "sale_id",
      "quantity",
      "buyer_name",
      "payment_method",
      "reason",
    ],
    "sale_id",
  );
  const quantity = eventCapacity(formData, "quantity", 1000);
  const buyerName = eventFinanceOptionalText(formData, "buyer_name", 160);
  const paymentMethod = eventFinanceOptionalText(
    formData,
    "payment_method",
    24,
  );
  const reason = eventText(formData, "reason", 500);
  const methods = [
    "cash",
    "bank_transfer",
    "mobile_money",
    "card",
    "cheque",
    "other",
  ];
  if (
    quantity === null ||
    buyerName === undefined ||
    paymentMethod === undefined ||
    (paymentMethod !== null && !methods.includes(paymentMethod)) ||
    !reason
  ) {
    redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  const { error } = await actor.supabase.rpc("edit_event_ticket_sale", {
    p_sale_id: saleId,
    p_quantity: quantity,
    p_buyer_name: buyerName,
    p_payment_method: paymentMethod,
    p_reason: reason,
  });
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventFinanceNoticeUrl(eventId, "sale-edited"));
}

export async function refundEventTicketSaleAction(formData: FormData) {
  const { eventId, recordId: saleId } = eventFinanceInput(
    formData,
    ["event_id", "sale_id", "reason"],
    "sale_id",
  );
  const reason = eventText(formData, "reason", 500);
  if (!reason) redirect(eventFinanceNoticeUrl(eventId, "invalid-request"));
  const actor = await getActiveEventActor(eventId);
  if (!eventCorrectionAllowed(actor.roles)) {
    redirect(eventFinanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("refund_event_ticket_sale", {
    p_sale_id: saleId,
    p_reason: reason,
  });
  if (error) redirect(eventFinanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/finance`);
  revalidatePath("/finances");
  redirect(eventFinanceNoticeUrl(eventId, "refunded"));
}

export async function saveEventMinutesAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  const content = eventMinutesContent(formData);
  const reason = optionalEventText(formData, "reason", 500);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    content === null ||
    reason === undefined ||
    !eventFieldsOnly(formData, ["event_id", "content", "reason"])
  ) {
    redirect(eventAttendanceNoticeUrl(eventId ?? "", "invalid-request"));
  }

  const actor = await getActiveEventActor(eventId);
  if (!actor.roles.has("admin") && !actor.roles.has("executive")) {
    redirect(eventAttendanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("save_event_minutes", {
    p_event_id: eventId,
    p_content: content,
    p_reason: reason,
  });
  if (error) redirect(eventAttendanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath("/events");
  redirect(eventAttendanceNoticeUrl(eventId, "minutes-saved"));
}

export async function setAttendanceDefaultAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  const cutoff = eventAttendanceCutoff(formData, true);
  const reason = eventText(formData, "reason", 500);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    cutoff === undefined ||
    !reason ||
    !eventFieldsOnly(formData, ["event_id", "late_after_minutes", "reason"])
  ) {
    redirect(eventAttendanceNoticeUrl(eventId ?? "", "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (!attendanceSessionControllerAllowed(actor.roles)) {
    redirect(eventAttendanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("set_attendance_default", {
    p_late_after_minutes: cutoff,
    p_reason: reason,
  });
  if (error) redirect(eventAttendanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath("/events");
  redirect(eventAttendanceNoticeUrl(eventId, "cutoff-saved"));
}

export async function openEventAttendanceAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  const cutoff = eventAttendanceCutoff(formData, false);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    cutoff === undefined ||
    !eventFieldsOnly(formData, ["event_id", "late_after_minutes"])
  ) {
    redirect(eventAttendanceNoticeUrl(eventId ?? "", "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (!attendanceSessionControllerAllowed(actor.roles)) {
    redirect(eventAttendanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("open_event_attendance", {
    p_event_id: eventId,
    p_late_after_minutes: cutoff,
  });
  if (error) redirect(eventAttendanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/attendance`);
  redirect(eventAttendanceNoticeUrl(eventId, "attendance-opened"));
}

export async function closeEventAttendanceAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    !eventFieldsOnly(formData, ["event_id"])
  ) {
    redirect(eventAttendanceNoticeUrl(eventId ?? "", "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (!attendanceSessionControllerAllowed(actor.roles)) {
    redirect(eventAttendanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("close_event_attendance", {
    p_event_id: eventId,
  });
  if (error) redirect(eventAttendanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/attendance`);
  redirect(eventAttendanceNoticeUrl(eventId, "attendance-closed"));
}

export async function checkInEventAttendanceAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  const qrToken = optionalEventText(formData, "qr_token", 64);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    qrToken === undefined ||
    (qrToken !== null && !/^[0-9a-f]{64}$/.test(qrToken)) ||
    !eventFieldsOnly(formData, ["event_id", "qr_token"])
  ) {
    redirect(eventAttendanceNoticeUrl(eventId ?? "", "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  const challengeHash = qrToken
    ? createHash("sha256").update(qrToken, "utf8").digest("hex")
    : null;
  const { error } = await actor.supabase.rpc("check_in_event_attendance", {
    p_event_id: eventId,
    p_challenge_hash: challengeHash,
  });
  if (error) redirect(eventAttendanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/attendance`);
  redirect(eventAttendanceNoticeUrl(eventId, "checked-in"));
}

export async function correctEventAttendanceAction(formData: FormData) {
  const eventId = eventText(formData, "event_id", 36);
  const memberId = eventText(formData, "member_id", 36);
  const status = eventText(formData, "attendance_status", 20);
  const reason = eventText(formData, "reason", 500);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    !memberId ||
    !uuidPattern.test(memberId) ||
    !["present", "absent", "rejected"].includes(status ?? "") ||
    !reason ||
    !eventFieldsOnly(formData, [
      "event_id",
      "member_id",
      "attendance_status",
      "reason",
    ])
  ) {
    redirect(eventAttendanceNoticeUrl(eventId ?? "", "invalid-request"));
  }
  const actor = await getActiveEventActor(eventId);
  if (
    !eventManagerAllowed(actor.roles) &&
    !actor.eventRoles.has("lead") &&
    !actor.eventRoles.has("assistant")
  ) {
    redirect(eventAttendanceNoticeUrl(eventId, "denied"));
  }
  const { error } = await actor.supabase.rpc("correct_event_attendance", {
    p_event_id: eventId,
    p_member_id: memberId,
    p_status: status,
    p_reason: reason,
  });
  if (error) redirect(eventAttendanceNoticeUrl(eventId, "operation-failed"));
  revalidatePath(`/events/${eventId}/attendance`);
  redirect(eventAttendanceNoticeUrl(eventId, "attendance-corrected"));
}

export async function issueEventAttendanceQrAction(
  _previousState: {
    qrDataUrl: string | null;
    expiresAt: string | null;
    error: string | null;
  },
  formData: FormData,
): Promise<{
  qrDataUrl: string | null;
  expiresAt: string | null;
  error: string | null;
}> {
  const eventId = eventText(formData, "event_id", 36);
  if (
    !eventId ||
    !uuidPattern.test(eventId) ||
    !eventFieldsOnly(formData, ["event_id"])
  ) {
    return {
      qrDataUrl: null,
      expiresAt: null,
      error: "The event request is invalid.",
    };
  }
  const actor = await getActiveEventActor(eventId);
  if (!attendanceSessionControllerAllowed(actor.roles)) {
    return {
      qrDataUrl: null,
      expiresAt: null,
      error: "You cannot issue an attendance QR for this event.",
    };
  }
  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return {
      qrDataUrl: null,
      expiresAt: null,
      error:
        "Set NEXT_PUBLIC_SITE_URL to the trusted app origin before issuing QR codes.",
    };
  }

  const token = randomBytes(32).toString("hex");
  const challengeHash = createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
  const expiresAt = new Date(Date.now() + 90_000);
  const { error } = await actor.supabase.rpc("issue_event_attendance_qr", {
    p_event_id: eventId,
    p_challenge_hash: challengeHash,
    p_expires_at: expiresAt.toISOString(),
  });
  if (error) {
    return {
      qrDataUrl: null,
      expiresAt: null,
      error:
        "The attendance QR could not be issued. Confirm the session is open and try again.",
    };
  }

  const scanUrl = new URL(`/events/${eventId}/attendance`, siteOrigin);
  scanUrl.hash = `checkin=${token}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(scanUrl.toString(), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    });
    return { qrDataUrl, expiresAt: expiresAt.toISOString(), error: null };
  } catch {
    return {
      qrDataUrl: null,
      expiresAt: null,
      error: "The attendance QR image could not be generated.",
    };
  }
}

async function getActiveCommunicationActor() {
  const supabase = await clientOrRedirect("/?notice=configuration");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active")
    redirect("/?notice=sign-in");
  return supabase;
}

function communicationFieldsOnly(formData: FormData, allowed: string[]) {
  const allowedSet = new Set(allowed);
  return Array.from(formData.keys()).every((key) => allowedSet.has(key));
}

function communicationSingleText(
  formData: FormData,
  key: string,
  maxLength: number,
  multiline = false,
) {
  const values = formData.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  const value = values[0].trim();
  if (!value || value.length > maxLength) return null;
  const hasDisallowedControl = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (multiline && [9, 10, 13].includes(codePoint)) return false;
    return codePoint < 32 || codePoint === 127;
  });
  return hasDisallowedControl ? null : value;
}

function communicationUuid(formData: FormData, key: string) {
  const value = communicationSingleText(formData, key, 36);
  return value && uuidPattern.test(value) ? value.toLowerCase() : null;
}

function communicationEventId(formData: FormData) {
  const values = formData.getAll("event_id");
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  const value = values[0].trim();
  if (!value) return null;
  return uuidPattern.test(value) ? value.toLowerCase() : undefined;
}

function communicationDuration(formData: FormData) {
  const value = communicationSingleText(formData, "duration_minutes", 5);
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const duration = Number(value);
  return Number.isSafeInteger(duration) && duration >= 5 && duration <= 43_200
    ? duration
    : null;
}

function communicationPollType(formData: FormData) {
  const value = communicationSingleText(formData, "poll_type", 20);
  return value === "yes_no" || value === "multiple_choice" ? value : null;
}

function communicationPollOptions(
  formData: FormData,
  pollType: "yes_no" | "multiple_choice",
) {
  if (pollType === "yes_no") return ["Yes", "No"];
  const raw = communicationSingleText(formData, "options", 1000, true);
  if (!raw) return null;
  const options = raw
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean);
  if (options.length < 2 || options.length > 8) return null;
  if (
    options.some(
      (option) => option.length > 120 || containsControlCharacters(option),
    ) ||
    new Set(options.map((option) => option.toLocaleLowerCase("en"))).size !==
      options.length
  ) {
    return null;
  }
  return options;
}

function communicationNotice(notice: string) {
  return `/announcements?notice=${encodeURIComponent(notice)}`;
}

export async function createAnnouncementAction(formData: FormData) {
  if (!communicationFieldsOnly(formData, ["event_id", "title", "message"])) {
    redirect(communicationNotice("invalid-request"));
  }
  const eventId = communicationEventId(formData);
  const title = communicationSingleText(formData, "title", 160);
  const message = communicationSingleText(formData, "message", 10_000, true);
  if (eventId === undefined || !title || !message) {
    redirect(communicationNotice("invalid-request"));
  }

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("create_announcement", {
    p_event_id: eventId,
    p_title: title,
    p_message: message,
  });
  if (error) redirect(communicationNotice("operation-failed"));
  revalidatePath("/announcements");
  redirect(communicationNotice("created"));
}

export async function updateAnnouncementAction(formData: FormData) {
  if (
    !communicationFieldsOnly(formData, [
      "announcement_id",
      "title",
      "message",
      "reason",
    ])
  ) {
    redirect(communicationNotice("invalid-request"));
  }
  const announcementId = communicationUuid(formData, "announcement_id");
  const title = communicationSingleText(formData, "title", 160);
  const message = communicationSingleText(formData, "message", 10_000, true);
  const reason = communicationSingleText(formData, "reason", 500);
  if (!announcementId || !title || !message || !reason) {
    redirect(communicationNotice("invalid-request"));
  }

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("update_announcement", {
    p_announcement_id: announcementId,
    p_title: title,
    p_message: message,
    p_reason: reason,
  });
  if (error) redirect(communicationNotice("operation-failed"));
  revalidatePath("/announcements");
  redirect(communicationNotice("updated"));
}

export async function markAnnouncementReadAction(formData: FormData) {
  if (!communicationFieldsOnly(formData, ["announcement_id"])) {
    redirect(communicationNotice("invalid-request"));
  }
  const announcementId = communicationUuid(formData, "announcement_id");
  if (!announcementId) redirect(communicationNotice("invalid-request"));

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("mark_announcement_read", {
    p_announcement_id: announcementId,
  });
  if (error) redirect(communicationNotice("operation-failed"));
  revalidatePath("/announcements");
  redirect(communicationNotice("read"));
}

export async function createAnnouncementPollAction(formData: FormData) {
  if (
    !communicationFieldsOnly(formData, [
      "event_id",
      "question",
      "duration_minutes",
      "poll_type",
      "options",
    ])
  ) {
    redirect(communicationNotice("invalid-request"));
  }
  const eventId = communicationEventId(formData);
  const question = communicationSingleText(formData, "question", 300);
  const duration = communicationDuration(formData);
  const pollType = communicationPollType(formData);
  const options = pollType
    ? communicationPollOptions(formData, pollType)
    : null;
  if (
    eventId === undefined ||
    !question ||
    duration === null ||
    !pollType ||
    !options
  ) {
    redirect(communicationNotice("invalid-request"));
  }

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("create_announcement_poll", {
    p_event_id: eventId,
    p_question: question,
    p_duration_minutes: duration,
    p_poll_type: pollType,
    p_options: options,
  });
  if (error) redirect(communicationNotice("operation-failed"));
  revalidatePath("/announcements");
  redirect(communicationNotice("poll-created"));
}

export async function updateAnnouncementPollAction(formData: FormData) {
  if (
    !communicationFieldsOnly(formData, [
      "poll_id",
      "question",
      "duration_minutes",
      "poll_type",
      "options",
      "reason",
    ])
  ) {
    redirect(communicationNotice("invalid-request"));
  }
  const pollId = communicationUuid(formData, "poll_id");
  const question = communicationSingleText(formData, "question", 300);
  const duration = communicationDuration(formData);
  const pollType = communicationPollType(formData);
  const options = pollType
    ? communicationPollOptions(formData, pollType)
    : null;
  const reason = communicationSingleText(formData, "reason", 500);
  if (
    !pollId ||
    !question ||
    duration === null ||
    !pollType ||
    !options ||
    !reason
  ) {
    redirect(communicationNotice("invalid-request"));
  }

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("update_announcement_poll", {
    p_poll_id: pollId,
    p_question: question,
    p_duration_minutes: duration,
    p_poll_type: pollType,
    p_options: options,
    p_reason: reason,
  });
  if (error) redirect(communicationNotice("operation-failed"));
  revalidatePath("/announcements");
  redirect(communicationNotice("poll-updated"));
}

export async function castAnnouncementPollVoteAction(formData: FormData) {
  if (
    !communicationFieldsOnly(formData, [
      "poll_id",
      "option_id",
      "confirm_final_vote",
    ])
  ) {
    redirect(communicationNotice("invalid-request"));
  }
  const pollId = communicationUuid(formData, "poll_id");
  const optionId = communicationUuid(formData, "option_id");
  const confirmation = communicationSingleText(
    formData,
    "confirm_final_vote",
    3,
  );
  if (!pollId || !optionId || confirmation !== "yes") {
    redirect(communicationNotice("invalid-request"));
  }

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("cast_announcement_poll_vote", {
    p_poll_id: pollId,
    p_option_id: optionId,
  });
  if (error) redirect(communicationNotice("operation-failed"));
  revalidatePath("/announcements");
  redirect(communicationNotice("voted"));
}

const inAppPreferenceCategories = new Set([
  "announcement",
  "new_poll",
  "poll_closing",
  "attendance_open",
  "event_activity",
]);

function notificationNotice(notice: string) {
  return `/notifications?notice=${encodeURIComponent(notice)}`;
}

export async function markNotificationReadAction(formData: FormData) {
  if (!communicationFieldsOnly(formData, ["notification_id"])) {
    redirect(notificationNotice("invalid-request"));
  }
  const notificationId = communicationUuid(formData, "notification_id");
  if (!notificationId) redirect(notificationNotice("invalid-request"));

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) redirect(notificationNotice("operation-failed"));
  revalidatePath("/notifications");
  redirect(notificationNotice("read"));
}

export async function setNotificationPreferenceAction(formData: FormData) {
  if (!communicationFieldsOnly(formData, ["category", "enabled"])) {
    redirect(notificationNotice("invalid-request"));
  }
  const category = communicationSingleText(formData, "category", 40);
  const enabled = communicationSingleText(formData, "enabled", 5);
  if (
    !category ||
    !inAppPreferenceCategories.has(category) ||
    (enabled !== "true" && enabled !== "false")
  ) {
    redirect(notificationNotice("invalid-request"));
  }

  const supabase = await getActiveCommunicationActor();
  const { error } = await supabase.rpc("set_notification_preference", {
    p_category: category,
    p_enabled: enabled === "true",
  });
  if (error) redirect(notificationNotice("operation-failed"));
  revalidatePath("/notifications");
  redirect(notificationNotice("preference-saved"));
}
