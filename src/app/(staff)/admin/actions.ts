"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyMemberLifecycleChanged } from "@/lib/email/notifications";
import { rpcErrorNotice } from "@/lib/rpc-error-notice";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[A-Za-z0-9_]{3,30}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LifecycleOperation = "approve" | "reject" | "deactivate" | "reactivate";

const lifecycleRpc: Record<LifecycleOperation, string> = {
  approve: "staff_approve_member",
  reject: "staff_reject_member",
  deactivate: "staff_deactivate_member",
  reactivate: "staff_reactivate_member",
};

const lifecycleNotice: Record<LifecycleOperation, string> = {
  approve: "member-approved",
  reject: "member-rejected",
  deactivate: "member-deactivated",
  reactivate: "member-reactivated",
};

function formString(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

async function requireStaffActor() {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/?notice=configuration");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status, staff_disabled_at")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.status !== "staff" ||
    profile.staff_disabled_at !== null
  ) {
    redirect("/?notice=denied");
  }

  return { supabase, user: authData.user };
}

export async function createStaffAction(formData: FormData) {
  const { user } = await requireStaffActor();

  const email = formString(formData, "email", 254)?.toLowerCase();
  const fullName = formString(formData, "full_name", 120);
  const username = formString(formData, "username", 30);

  if (
    !email ||
    !emailPattern.test(email) ||
    !fullName ||
    !username ||
    !usernamePattern.test(username)
  ) {
    redirect("/admin/staff?notice=invalid-request");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/admin/staff?notice=configuration");

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, username },
  });
  if (error || !data.user) redirect("/admin/staff?notice=invite-failed");

  const { error: provisionError } = await admin.rpc("provision_staff_profile", {
    p_user_id: data.user.id,
    p_full_name: fullName,
    p_username: username,
    p_actor_id: user.id,
    p_reason: `Staff account created by ${user.email ?? user.id}`,
  });

  if (provisionError) {
    await admin.auth.admin.deleteUser(data.user.id);
    redirect("/admin/staff?notice=provision-failed");
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  redirect("/admin/staff?notice=staff-created");
}

export async function setStaffDisabledAction(formData: FormData) {
  const { supabase, user } = await requireStaffActor();

  const staffId = formString(formData, "staff_id", 36);
  const reason = formString(formData, "reason", 500);
  const disabled = formData.get("disabled") === "true";

  if (!staffId || !uuidPattern.test(staffId) || !reason) {
    redirect("/admin/staff?notice=invalid-request");
  }
  if (staffId === user.id) redirect("/admin/staff?notice=self-action-denied");

  const { error } = await supabase.rpc("staff_set_disabled", {
    p_staff_id: staffId,
    p_disabled: disabled,
    p_reason: reason,
  });
  if (error) redirect(`/admin/staff?notice=${rpcErrorNotice(error)}`);

  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error: banError } = await admin.auth.admin.updateUserById(staffId, {
      ban_duration: disabled ? "876000h" : "none",
    });
    if (banError) {
      revalidatePath("/admin/staff");
      redirect("/admin/staff?notice=ban-partial");
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  redirect(
    `/admin/staff?notice=${disabled ? "staff-disabled" : "staff-enabled"}`,
  );
}

export async function appointPresidentAction(formData: FormData) {
  const { supabase } = await requireStaffActor();

  const memberId = formString(formData, "member_id", 36);
  const reason = formString(formData, "reason", 500);
  if (!memberId || !uuidPattern.test(memberId) || !reason) {
    redirect("/admin/governance?notice=invalid-request");
  }

  const { error } = await supabase.rpc("staff_appoint_president", {
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error) redirect(`/admin/governance?notice=${rpcErrorNotice(error)}`);

  revalidatePath("/admin/governance");
  revalidatePath("/admin");
  revalidatePath("/officers/members");
  revalidatePath("/dues");
  redirect("/admin/governance?notice=president-appointed");
}

export async function revokePresidentAction(formData: FormData) {
  const { supabase } = await requireStaffActor();

  const memberId = formString(formData, "member_id", 36);
  const reason = formString(formData, "reason", 500);
  if (!memberId || !uuidPattern.test(memberId) || !reason) {
    redirect("/admin/governance?notice=invalid-request");
  }

  const { error } = await supabase.rpc("staff_revoke_president", {
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error) redirect(`/admin/governance?notice=${rpcErrorNotice(error)}`);

  revalidatePath("/admin/governance");
  revalidatePath("/admin");
  revalidatePath("/officers/members");
  revalidatePath("/dues");
  redirect("/admin/governance?notice=president-revoked");
}

export async function staffMemberLifecycleAction(formData: FormData) {
  const { supabase } = await requireStaffActor();

  const memberId = formString(formData, "member_id", 36);
  const operation = formString(formData, "operation", 20);
  const reason = formString(formData, "reason", 500);

  if (
    !memberId ||
    !uuidPattern.test(memberId) ||
    !reason ||
    !operation ||
    !Object.hasOwn(lifecycleRpc, operation)
  ) {
    redirect("/admin/members?notice=invalid-request");
  }

  const typedOperation = operation as LifecycleOperation;
  const { error } = await supabase.rpc(lifecycleRpc[typedOperation], {
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error) redirect(`/admin/members?notice=${rpcErrorNotice(error)}`);

  const admin = createSupabaseAdminClient();
  if (admin) {
    await notifyMemberLifecycleChanged({
      supabase: admin,
      memberId,
      operation: typedOperation,
      reason,
    });
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  revalidatePath("/officers/members");
  redirect(`/admin/members?notice=${lifecycleNotice[typedOperation]}`);
}
