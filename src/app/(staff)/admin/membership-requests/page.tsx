import Link from "next/link";
import { reviewMembershipRequestAction } from "@/app/(staff)/admin/actions";
import StaffNoticeToast from "@/components/staff/staff-notice-toast";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { resolveStaffNotice } from "@/lib/staff-notices";

const pageNotices = {
  "membership-approved": {
    message:
      "Membership request approved and single-use invitation token created.",
    isError: false,
  },
  "membership-rejected": {
    message: "Membership request rejected.",
    isError: false,
  },
  "invalid-request": {
    message:
      "Invalid review parameters. Rejection requires a reason of at least 5 characters.",
    isError: true,
  },
};

export default async function AdminMembershipRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; status?: string }>;
}) {
  const params = await searchParams;
  const notice = resolveStaffNotice(params.notice, pageNotices);
  const { supabase } = await requireStaffProfile();
  const currentStatus = params.status || "pending";

  let query = supabase
    .from("membership_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (currentStatus !== "all") {
    query = query.eq("status", currentStatus);
  }

  const { data: requests, error } = await query;

  return (
    <div className="space-y-6">
      <StaffNoticeToast notice={notice} />

      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#3D291F]">
            Membership Intake Requests
          </h1>
          <p className="text-sm text-[#7A685D] mt-1">
            Review prospective member applications and issue invitation links.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {["pending", "approved", "rejected", "all"].map((s) => (
            <Link
              key={s}
              href={`/admin/membership-requests?status=${s}`}
              className={`px-3.5 py-2 min-h-[44px] flex items-center rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${
                currentStatus === s
                  ? "bg-[#174C37] text-white shadow-xs"
                  : "bg-[#FAF6F0] text-[#5C4638] hover:bg-white hover:text-[#3D291F] border border-[#E5DDD3]"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </header>

      {error ? (
        <div className="p-4 bg-[#FFF9F8] border border-[#BA3C2A]/30 rounded-xl text-[#BA3C2A] text-sm font-semibold">
          Failed to load membership requests. Please try again.
        </div>
      ) : !requests || requests.length === 0 ? (
        <div className="p-8 text-center bg-white border border-[#E5DDD3] rounded-2xl shadow-xs">
          <p className="text-[#7A685D] text-sm font-medium">
            No {currentStatus} membership requests found.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white border border-[#E5DDD3] rounded-2xl p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-[#3D291F]">
                    {req.full_name}
                  </h3>
                  <div className="text-sm text-[#7A685D] flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span>{req.email}</span>
                    <span>{req.phone}</span>
                    <span className="font-medium text-[#3D291F]">
                      {req.profession}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                    req.status === "approved"
                      ? "bg-[#174C37]/10 text-[#174C37] border-[#174C37]/30"
                      : req.status === "rejected"
                        ? "bg-[#BA3C2A]/10 text-[#BA3C2A] border-[#BA3C2A]/30"
                        : "bg-[#D6A23A]/15 text-[#8A641A] border-[#D6A23A]/30"
                  }`}
                >
                  {req.status}
                </span>
              </div>

              <div className="bg-[#FAF6F0] p-4 rounded-xl border border-[#E5DDD3] text-sm text-[#3D291F]">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#7A685D] mb-1">
                  Reason for Joining
                </span>
                <p className="whitespace-pre-wrap">{req.reason_for_joining}</p>
              </div>

              {req.rejection_reason && (
                <div className="bg-[#FFF9F8] p-4 rounded-xl border border-[#BA3C2A]/20 text-sm text-[#BA3C2A]">
                  <span className="block text-xs font-bold uppercase tracking-wider text-[#BA3C2A] mb-1">
                    Rejection Reason
                  </span>
                  <p>{req.rejection_reason}</p>
                </div>
              )}

              {req.status === "pending" && (
                <div className="pt-2 border-t border-[#E5DDD3] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <form
                    action={reviewMembershipRequestAction}
                    className="inline-block"
                  >
                    <input type="hidden" name="request_id" value={req.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-5 py-2.5 bg-[#174C37] text-white rounded-xl text-xs font-bold hover:bg-[#103D2B] transition-colors min-h-[44px] flex items-center justify-center cursor-pointer shadow-xs"
                    >
                      Approve &amp; Issue Invite
                    </button>
                  </form>

                  <form
                    action={reviewMembershipRequestAction}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 sm:max-w-md justify-end"
                  >
                    <input type="hidden" name="request_id" value={req.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <input
                      type="text"
                      name="rejection_reason"
                      placeholder="Reason for rejection (min 5 chars)…"
                      className="px-3.5 py-2 text-base sm:text-xs border border-[#E5DDD3] bg-white text-[#3D291F] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#174C37] flex-1 min-h-[44px]"
                      required
                      minLength={5}
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-white text-[#8B261E] hover:bg-[#FFF9F8] border border-[#E5DDD3] hover:border-[#8B261E]/40 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center cursor-pointer"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
