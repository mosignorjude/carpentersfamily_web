import { ArrowLeft, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateEventForm } from "@/components/events/create-event-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CreateEventPage() {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/portal?notice=configuration");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/portal?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status, full_name, username")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || profile?.status !== "active") redirect("/portal");

  const { data: clubRoles } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);

  const rolesList = (clubRoles ?? []).map((assignment) => assignment.role);
  const rolesSet = new Set(rolesList);
  const isManager =
    rolesSet.has("executive") ||
    rolesSet.has("admin") ||
    rolesSet.has("president");

  if (!isManager) {
    redirect("/events?notice=denied");
  }

  const userRoleTitle = rolesSet.has("admin")
    ? "Club Admin"
    : rolesSet.has("president")
      ? "President"
      : "Executive Officer";

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
      <Link
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#174C37] hover:underline min-h-[44px]"
        href="/events"
      >
        <ArrowLeft className="w-4 h-4 text-[#174C37] shrink-0" />
        <span>Back to Events & Activities</span>
      </Link>

      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3.5 pb-6 border-b border-[#E5DDD3]">
          <div className="w-12 h-12 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <CalendarPlus className="w-6 h-6 text-[#D6A23A]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F] tracking-tight">
              New Event
            </h1>
            <p className="text-xs text-[#7A685D] font-medium mt-1">
              Authorized for the Executive Council, Club Admin, and President ·{" "}
              {userRoleTitle}
            </p>
          </div>
        </div>

        <div className="pt-6">
          <CreateEventForm />
        </div>
      </section>
    </div>
  );
}
