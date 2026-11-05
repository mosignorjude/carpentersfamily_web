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

      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-900">
            Membership Intake Requests
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Review prospective member applications and issue cryptographic
            invitations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {["pending", "approved", "rejected", "all"].map((s) => (
            <Link
              key={s}
              href={`/admin/membership-requests?status=${s}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                currentStatus === s
                  ? "bg-emerald-800 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </header>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
          Failed to load membership requests. Please try again.
        </div>
      ) : !requests || requests.length === 0 ? (
        <div className="p-8 text-center bg-stone-50 border border-stone-200 rounded-2xl">
          <p className="text-stone-600 text-sm">
            No {currentStatus} membership requests found.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-stone-900">
                    {req.full_name}
                  </h3>
                  <div className="text-sm text-stone-500 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span>{req.email}</span>
                    <span>{req.phone}</span>
                    <span className="font-medium text-stone-700">
                      {req.profession}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
                    req.status === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : req.status === "rejected"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {req.status}
                </span>
              </div>

              <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 text-sm text-stone-700">
                <span className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                  Reason for Joining
                </span>
                <p className="whitespace-pre-wrap">{req.reason_for_joining}</p>
              </div>

              {req.rejection_reason && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-sm text-red-800">
                  <span className="block text-xs font-bold uppercase tracking-wider text-red-600 mb-1">
                    Rejection Reason
                  </span>
                  <p>{req.rejection_reason}</p>
                </div>
              )}

              {req.status === "pending" && (
                <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <form
                    action={reviewMembershipRequestAction}
                    className="inline-block"
                  >
                    <input type="hidden" name="request_id" value={req.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-sm font-semibold hover:bg-emerald-900 transition-colors"
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
                      className="px-3 py-1.5 text-sm border border-stone-300 rounded-xl focus:outline-emerald-800 flex-1"
                      required
                      minLength={5}
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-stone-100 text-stone-700 hover:bg-red-50 hover:text-red-700 border border-stone-200 rounded-xl text-sm font-semibold transition-colors"
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
