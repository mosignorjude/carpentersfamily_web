"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rpcErrorNotice } from "@/lib/rpc-error-notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, name: string, maxLength: number) {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  const value = values[0].trim();
  if (
    value.length < 1 ||
    value.length > maxLength ||
    containsControlCharacters(value)
  ) {
    return null;
  }
  return value;
}

function containsControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function redirectTarget(
  formData: FormData | undefined,
  notice: string,
): string {
  if (!formData) return `/events?notice=${notice}`;
  const eventId = field(formData, "event_id", 36);
  const tab = field(formData, "tab", 30);
  const hash = tab ? `#${tab}` : "";
  if (eventId && uuidPattern.test(eventId)) {
    return `/events/${encodeURIComponent(eventId)}/dashboard?notice=${notice}${hash}`;
  }
  return `/events?notice=${notice}`;
}

async function getCategoryClient(
  formData?: FormData,
  requireAdminOnly = false,
) {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/?notice=configuration");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const [profileResult, roleResult, eventRoleResult] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("status")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
  ]);

  if (
    profileResult.error ||
    profileResult.data?.status !== "active" ||
    roleResult.error ||
    eventRoleResult.error
  ) {
    redirect(redirectTarget(formData, "denied"));
  }

  const clubRoles = new Set(
    (roleResult.data ?? []).map((assignment) => assignment.role),
  );
  const isAdmin = clubRoles.has("admin") || clubRoles.has("president");

  if (requireAdminOnly) {
    if (!isAdmin) {
      redirect(redirectTarget(formData, "denied"));
    }
  } else {
    const isEventLead = (eventRoleResult.data ?? []).some(
      (assignment) =>
        assignment.role === "lead" || assignment.role === "event_lead",
    );
    if (!isAdmin && !isEventLead) {
      redirect(redirectTarget(formData, "denied"));
    }
  }

  return supabase;
}

function categoryType(value: string | null) {
  return value === "budget_allocation" ||
    value === "expense" ||
    value === "revenue"
    ? value
    : null;
}

function finishMutation(formData: FormData, notice: string): never {
  revalidatePath("/events");
  const eventId = field(formData, "event_id", 36);
  if (eventId && uuidPattern.test(eventId)) {
    revalidatePath(`/events/${eventId}/dashboard`);
    revalidatePath(`/events/${eventId}/finance`);
  }
  redirect(redirectTarget(formData, notice));
}

export async function createEventFinanceCategoryAction(formData: FormData) {
  const type = categoryType(field(formData, "category_type", 30));
  const name = field(formData, "name", 80);
  const reason = field(formData, "reason", 500) || "Initial category entry";
  if (!type || !name || name.length < 2) {
    redirect(redirectTarget(formData, "invalid-request"));
  }

  const supabase = await getCategoryClient(formData, false);
  const { error } = await supabase.rpc("create_event_finance_category", {
    p_category_type: type,
    p_name: name,
    p_reason: reason,
  });
  if (error) redirect(redirectTarget(formData, rpcErrorNotice(error)));
  finishMutation(formData, "category-created");
}

export async function renameEventFinanceCategoryAction(formData: FormData) {
  const id = field(formData, "category_id", 36);
  const name = field(formData, "name", 80);
  const reason = field(formData, "reason", 500);
  if (!id || !uuidPattern.test(id) || !name || name.length < 2 || !reason) {
    redirect(redirectTarget(formData, "invalid-request"));
  }

  const supabase = await getCategoryClient(formData, false);
  const { error } = await supabase.rpc("rename_event_finance_category", {
    p_category_id: id,
    p_name: name,
    p_reason: reason,
  });
  if (error) redirect(redirectTarget(formData, rpcErrorNotice(error)));
  finishMutation(formData, "category-renamed");
}

export async function retireEventFinanceCategoryAction(formData: FormData) {
  const id = field(formData, "category_id", 36);
  const reason = field(formData, "reason", 500);
  if (!id || !uuidPattern.test(id) || !reason) {
    redirect(redirectTarget(formData, "invalid-request"));
  }

  const supabase = await getCategoryClient(formData, true);
  const { error } = await supabase.rpc("retire_event_finance_category", {
    p_category_id: id,
    p_reason: reason,
  });
  if (error) redirect(redirectTarget(formData, rpcErrorNotice(error)));
  finishMutation(formData, "category-retired");
}

export async function saveEventBudgetAllocationCategoryAction(
  formData: FormData,
) {
  const eventId = field(formData, "event_id", 36);
  if (!eventId || !uuidPattern.test(eventId)) {
    redirect(redirectTarget(formData, "invalid-request"));
  }

  const actionType = field(formData, "action_type", 20) || "create";
  const name = field(formData, "name", 80);
  const oldName = field(formData, "old_name", 80);
  const rawCategoryId = field(formData, "category_id", 36);
  const reason = field(formData, "reason", 500);
  const rawPercent = field(formData, "allocation_percent", 20);
  const rawAmount = field(formData, "allocation_amount_ngn", 30);
  const rawTotal = field(formData, "total_ngn", 30);

  if (!reason || reason.trim().length === 0) {
    redirect(redirectTarget(formData, "invalid-request"));
  }

  const isRemove = actionType === "remove";
  const supabase = await getCategoryClient(formData, isRemove);

  // 1. Fetch current event budget
  const { data: budgetData } = await supabase
    .from("event_budgets")
    .select("total_ngn")
    .eq("event_id", eventId)
    .maybeSingle();

  let totalNgn = Number(budgetData?.total_ngn ?? 0);
  if (totalNgn <= 0 && rawTotal) {
    totalNgn = Math.round(Number(rawTotal.replace(/[^0-9.]/g, ""))) || 0;
  }
  if (totalNgn <= 0) {
    redirect(redirectTarget(formData, "budget-required"));
  }

  // 2. Fetch current allocations
  const { data: currentAllocationsData } = await supabase
    .from("event_budget_allocations")
    .select(
      "position, allocation_name, amount_ngn, category_id, allocation_percent",
    )
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  const existingAllocations: {
    categoryId: string;
    name: string;
    amount_ngn: number;
    percent: number;
  }[] = [];

  for (const a of currentAllocationsData ?? []) {
    if (a.allocation_name.toLowerCase().includes("unallocated")) continue;
    let catId = a.category_id as string | null;
    if (!catId) {
      const { data: matchedCat } = await supabase
        .from("event_finance_categories")
        .select("id")
        .eq("category_type", "budget_allocation")
        .is("retired_at", null)
        .ilike("name", a.allocation_name)
        .maybeSingle();
      catId = matchedCat?.id ?? null;
    }
    const amt = Number(a.amount_ngn);
    const pct =
      Number(a.allocation_percent) > 0
        ? Number(a.allocation_percent)
        : totalNgn > 0
          ? Number(((amt * 100) / totalNgn).toFixed(4))
          : 0;

    if (catId) {
      existingAllocations.push({
        categoryId: catId,
        name: a.allocation_name,
        amount_ngn: amt,
        percent: pct,
      });
    }
  }

  // 3. Compute target percent & amount
  let targetPercent = 0;
  let targetAmount = 0;

  if (rawPercent) {
    const p = Number(rawPercent);
    if (!Number.isNaN(p) && p > 0) {
      targetPercent = Number(p.toFixed(4));
      targetAmount = Math.round((totalNgn * targetPercent) / 100);
    }
  } else if (rawAmount) {
    const a = Math.round(Number(rawAmount.replace(/[^0-9.]/g, ""))) || 0;
    if (a > 0 && totalNgn > 0) {
      targetAmount = a;
      targetPercent = Number(((a * 100) / totalNgn).toFixed(4));
    }
  }

  let updatedAllocations: {
    categoryId: string;
    name: string;
    amount_ngn: number;
    percent: number;
  }[] = [];

  if (actionType === "create") {
    if (
      !name ||
      name.trim().length < 2 ||
      targetAmount <= 0 ||
      targetPercent <= 0
    ) {
      redirect(redirectTarget(formData, "invalid-request"));
    }
    const trimmedName = name.trim();

    // Find or create category in event_finance_categories
    let targetCategoryId =
      rawCategoryId && uuidPattern.test(rawCategoryId) ? rawCategoryId : "";
    if (!targetCategoryId) {
      const { data: existingCat } = await supabase
        .from("event_finance_categories")
        .select("id")
        .eq("category_type", "budget_allocation")
        .is("retired_at", null)
        .ilike("name", trimmedName)
        .maybeSingle();

      if (existingCat?.id) {
        targetCategoryId = existingCat.id;
      } else {
        const { data: createdCatId, error: createCatError } =
          await supabase.rpc("create_event_finance_category", {
            p_category_type: "budget_allocation",
            p_name: trimmedName,
            p_reason: reason,
          });
        if (createCatError || !createdCatId) {
          redirect(redirectTarget(formData, rpcErrorNotice(createCatError)));
        }
        targetCategoryId = createdCatId as string;

        // Ensure corresponding expense category exists for recording transactions
        const { data: existingExpCat } = await supabase
          .from("event_finance_categories")
          .select("id")
          .eq("category_type", "expense")
          .is("retired_at", null)
          .ilike("name", trimmedName)
          .maybeSingle();

        if (!existingExpCat) {
          await supabase.rpc("create_event_finance_category", {
            p_category_type: "expense",
            p_name: trimmedName,
            p_reason: reason,
          });
        }
      }
    }

    const alreadyExists = existingAllocations.some(
      (a) =>
        a.categoryId === targetCategoryId ||
        a.name.toLowerCase() === trimmedName.toLowerCase(),
    );

    if (alreadyExists) {
      updatedAllocations = existingAllocations.map((a) =>
        a.categoryId === targetCategoryId ||
        a.name.toLowerCase() === trimmedName.toLowerCase()
          ? {
              categoryId: targetCategoryId,
              name: trimmedName,
              amount_ngn: targetAmount,
              percent: targetPercent,
            }
          : a,
      );
    } else {
      updatedAllocations = [
        ...existingAllocations,
        {
          categoryId: targetCategoryId,
          name: trimmedName,
          amount_ngn: targetAmount,
          percent: targetPercent,
        },
      ];
    }
  } else if (actionType === "edit") {
    const lookupKey = (oldName || name || "").trim().toLowerCase();
    if (!lookupKey || targetAmount <= 0 || targetPercent <= 0) {
      redirect(redirectTarget(formData, "invalid-request"));
    }
    const finalName = (name || oldName || "").trim();
    if (!finalName || finalName.length < 2) {
      redirect(redirectTarget(formData, "invalid-request"));
    }

    updatedAllocations = existingAllocations.map((a) => {
      if (
        (rawCategoryId && a.categoryId === rawCategoryId) ||
        a.name.toLowerCase() === lookupKey
      ) {
        return {
          categoryId: a.categoryId || rawCategoryId || "",
          name: finalName,
          amount_ngn: targetAmount,
          percent: targetPercent,
        };
      }
      return a;
    });

    const needsRename = Boolean(
      rawCategoryId && oldName && finalName && oldName.trim() !== finalName,
    );

    // Validate ceiling before mutating category definitions
    const checkSumPercent = updatedAllocations.reduce(
      (sum, a) => sum + a.percent,
      0,
    );
    const checkSumAmount = updatedAllocations.reduce(
      (sum, a) => sum + a.amount_ngn,
      0,
    );
    if (checkSumPercent > 100.0001 || checkSumAmount > totalNgn) {
      redirect(redirectTarget(formData, "invalid-request"));
    }

    if (needsRename) {
      const { error: renameError } = await supabase.rpc(
        "rename_event_finance_category",
        {
          p_category_id: rawCategoryId,
          p_name: finalName,
          p_reason: reason,
        },
      );
      if (renameError) {
        redirect(redirectTarget(formData, rpcErrorNotice(renameError)));
      }
    }
  } else if (actionType === "remove") {
    const lookupKey = (oldName || name || "").trim().toLowerCase();
    updatedAllocations = existingAllocations.filter(
      (a) =>
        (!rawCategoryId || a.categoryId !== rawCategoryId) &&
        a.name.toLowerCase() !== lookupKey,
    );
  }

  // 4. Validate that allocations do not exceed total budget ceiling (<= 100%)
  const allocatedSumPercent = updatedAllocations.reduce(
    (sum, a) => sum + a.percent,
    0,
  );
  const allocatedSumAmount = updatedAllocations.reduce(
    (sum, a) => sum + a.amount_ngn,
    0,
  );

  if (allocatedSumPercent > 100.0001 || allocatedSumAmount > totalNgn) {
    redirect(redirectTarget(formData, "invalid-request"));
  }

  // 5. Send strictly formatted allocations { category_id, percentage } to set_event_budget
  // Allocations can sum to any amount <= 100%. Unallocated funds remain in the event buffer naturally.
  const rpcAllocations = updatedAllocations.map((a) => ({
    category_id: a.categoryId,
    percentage: Number(a.percent.toFixed(4)),
  }));

  const { error } = await supabase.rpc("set_event_budget", {
    p_event_id: eventId,
    p_total_ngn: totalNgn,
    p_allocations: rpcAllocations,
    p_reason: reason,
  });

  if (error) {
    redirect(redirectTarget(formData, rpcErrorNotice(error)));
  }

  finishMutation(formData, "budget-saved");
}
