import StaffAccountForm from "@/components/staff/staff-account-form";
import StaffAccountTable, {
  type StaffAccountRow,
} from "@/components/staff/staff-account-table";
import StaffNotice from "@/components/staff/staff-notice";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { resolveStaffNotice } from "@/lib/staff-notices";

const pageNotices = {
  "staff-created": {
    message:
      "Invitation sent. The new staff administrator can sign in after accepting the invite.",
    isError: false,
  },
  "staff-disabled": {
    message:
      "Staff access revoked. The account cannot sign in until it is re-enabled.",
    isError: false,
  },
  "staff-enabled": {
    message: "Staff access restored.",
    isError: false,
  },
  "invite-failed": {
    message:
      "The sign-in invitation could not be sent. The email may already belong to an account.",
    isError: true,
  },
  "provision-failed": {
    message:
      "The staff profile could not be created, so the invitation was cancelled.",
    isError: true,
  },
  "ban-partial": {
    message:
      "The staff account was updated, but its sign-in ban could not be applied. Retry the change.",
    isError: true,
  },
  configuration: {
    message:
      "Staff invitations require the service-role key to be configured for this environment.",
    isError: true,
  },
};

export default async function StaffAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = resolveStaffNotice(params.notice, pageNotices);
  const { supabase, userId } = await requireStaffProfile();

  const { data, error } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, created_at, staff_disabled_at")
    .eq("status", "staff")
    .order("created_at", { ascending: true });

  const accounts: StaffAccountRow[] = (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    createdAt: row.created_at,
    disabledAt: row.staff_disabled_at,
  }));
  const activeStaffCount = accounts.filter(
    (account) => account.disabledAt === null,
  ).length;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
          Staff administration
        </p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          Staff accounts
        </h1>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-[#7A685D]">
          Staff administrators manage accounts and appoint the President. The
          last active staff account cannot be disabled, and no one can change
          their own access.
        </p>
      </section>

      <StaffNotice notice={notice} />

      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-[#3D291F]">
            Invite a staff administrator
          </h2>
          <p className="mt-1 text-xs text-[#7A685D]">
            The invite email creates the sign-in account. The staff profile is
            provisioned in the same step.
          </p>
        </div>
        <StaffAccountForm />
      </section>

      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-[#3D291F]">
            Current staff
          </h2>
          <p className="mt-1 text-xs text-[#7A685D]">
            {activeStaffCount} active of {accounts.length} staff accounts.
          </p>
        </div>
        {error ? (
          <p
            className="rounded-xl border border-[#E5C5C1] bg-[#FAF0EE] p-4 text-xs font-semibold text-[#76342D]"
            role="alert"
          >
            The staff accounts could not be loaded. Refresh the page and try
            again.
          </p>
        ) : accounts.length > 0 ? (
          <StaffAccountTable
            accounts={accounts}
            activeStaffCount={activeStaffCount}
            currentUserId={userId}
          />
        ) : (
          <p className="text-xs text-[#7A685D]">No staff accounts exist yet.</p>
        )}
      </section>
    </div>
  );
}
