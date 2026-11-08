import Link from "next/link";
import { handlePartnershipEnquiryAction } from "@/app/(staff)/admin/actions";
import StaffNoticeToast from "@/components/staff/staff-notice-toast";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { resolveStaffNotice } from "@/lib/staff-notices";

const pageNotices = {
  "enquiry-updated": {
    message: "Partnership enquiry updated successfully.",
    isError: false,
  },
  "invalid-request": {
    message: "Invalid enquiry update request.",
    isError: true,
  },
};

export default async function AdminPartnershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; status?: string }>;
}) {
  const params = await searchParams;
  const notice = resolveStaffNotice(params.notice, pageNotices);
  const { supabase } = await requireStaffProfile();
  const currentStatus = params.status || "pending";

  let query = supabase
    .from("partnership_enquiries")
    .select("*")
    .order("created_at", { ascending: false });

  if (currentStatus !== "all") {
    query = query.eq("status", currentStatus);
  }

  const { data: enquiries, error } = await query;

  return (
    <div className="space-y-6">
      <StaffNoticeToast notice={notice} />

      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
            Partnership &amp; Brand Enquiries
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Manage proposals, corporate bookings, sponsorships, and brand
            activations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {["pending", "contacted", "closed", "all"].map((s) => (
            <Link
              key={s}
              href={`/admin/partnerships?status=${s}`}
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
          Failed to load partnership enquiries. Please try again.
        </div>
      ) : !enquiries || enquiries.length === 0 ? (
        <div className="p-8 text-center bg-stone-50 border border-stone-200 rounded-2xl">
          <p className="text-stone-600 text-sm">
            No {currentStatus} partnership enquiries found.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {enquiries.map((enq) => (
            <div
              key={enq.id}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-stone-900">
                    {enq.organization_name}
                  </h3>
                  <div className="text-sm text-stone-500 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span>Contact: {enq.contact_name}</span>
                    <span>{enq.email}</span>
                    <span>{enq.phone}</span>
                    <span className="font-semibold text-emerald-800 uppercase tracking-wide text-xs">
                      {enq.enquiry_type.replace("_", " ")}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
                    enq.status === "closed"
                      ? "bg-stone-100 text-stone-800"
                      : enq.status === "contacted"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {enq.status}
                </span>
              </div>

              <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 text-sm text-stone-700">
                <span className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                  Message / Proposal
                </span>
                <p className="whitespace-pre-wrap">{enq.message}</p>
              </div>

              {enq.notes && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-900">
                  <span className="block text-xs font-bold uppercase tracking-wider text-blue-700 mb-1">
                    Staff Notes
                  </span>
                  <p>{enq.notes}</p>
                </div>
              )}

              <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-end gap-2">
                <form
                  action={handlePartnershipEnquiryAction}
                  className="inline-flex gap-2 items-center"
                >
                  <input type="hidden" name="enquiry_id" value={enq.id} />
                  {enq.status !== "contacted" && (
                    <button
                      type="submit"
                      name="status"
                      value="contacted"
                      className="px-3 py-1.5 bg-blue-700 text-white rounded-xl text-xs font-semibold hover:bg-blue-800 transition-colors"
                    >
                      Mark Contacted
                    </button>
                  )}
                  {enq.status !== "closed" && (
                    <button
                      type="submit"
                      name="status"
                      value="closed"
                      className="px-3 py-1.5 bg-stone-700 text-white rounded-xl text-xs font-semibold hover:bg-stone-800 transition-colors"
                    >
                      Close Enquiry
                    </button>
                  )}
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
