import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Shield,
  User,
} from "lucide-react";
import Link from "next/link";

export type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  target_member_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

interface DuesAuditHistoryCardProps {
  auditEntries: AuditRow[];
  actorNames: Map<string, string>;
  targetMemberId: string;
  auditPage: number;
  totalAuditCount: number;
  pageSize: number;
}

function formatDate(date: string) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(value);
}

function formatTime(date: string) {
  const value = new Date(date);
  return new Intl.DateTimeFormat("en-NG", {
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(value);
}

function historyPageHref(memberId: string, page: number) {
  const params = new URLSearchParams({
    member_id: memberId,
    audit_page: String(page),
  });
  return `/dues?${params.toString()}`;
}

export function DuesAuditHistoryCard({
  auditEntries,
  actorNames,
  targetMemberId,
  auditPage,
  totalAuditCount,
  pageSize,
}: DuesAuditHistoryCardProps) {
  const totalPages = Math.ceil(totalAuditCount / pageSize);

  const getActionPill = (action: string) => {
    switch (action) {
      case "dues_payment_recorded":
        return (
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#EAF4ED] text-[#174C37] border border-[#A8D5BC]">
            Payment Recorded
          </span>
        );
      case "dues_payment_corrected":
        return (
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#FDF2F2] text-[#BA3C2A] border border-[#F5C2C2]">
            Payment Corrected
          </span>
        );
      case "dues_month_written_off":
        return (
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]">
            Month Written Off
          </span>
        );
      case "dues_rate_changed":
        return (
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#FDF8EE] text-[#D6A23A] border border-[#EED7A1]">
            Rate Scheduled
          </span>
        );
      default:
        return (
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#FAF6F0] text-[#3D291F] border border-[#E5DDD3]">
            {action.replaceAll("_", " ")}
          </span>
        );
    }
  };

  return (
    <section
      aria-labelledby="dues-audit-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] overflow-hidden shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="dues-audit-heading"
            >
              Officer Dues Audit Trail
            </h2>
          </div>
          <p className="text-xs text-[#54433A] font-medium mt-1">
            Indelible, immutable audit history
          </p>
        </div>

        <span className="text-xs font-bold text-[#174C37] bg-white px-3 py-1 rounded-lg border border-[#E5DDD3] self-start sm:self-auto shadow-2xs">
          {totalAuditCount} Total Audit Records
        </span>
      </div>

      <div className="p-5 sm:p-6 space-y-3.5 pt-0">
        {auditEntries.length === 0 ? (
          <div className="p-8 text-center space-y-2 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
            <FileSearch className="w-8 h-8 text-[#B8ACA0] mx-auto" />
            <h4 className="text-sm font-bold text-[#3D291F]">
              No Audit Records Found
            </h4>
            <p className="text-xs text-[#54433A]">
              Officer modifications will appear here with full before/after
              state diffs.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {auditEntries.map((entry) => {
              const actorName =
                actorNames.get(entry.actor_id) ?? "Authorized Officer";

              return (
                <article
                  className="p-4 sm:p-5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] hover:bg-white transition-colors space-y-2.5 shadow-2xs"
                  key={entry.id}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5DDD3]/75 pb-2">
                    <div className="flex items-center gap-2.5">
                      {getActionPill(entry.action)}
                      <span className="text-xs font-bold text-[#3D291F]">
                        {entry.entity_type}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#54433A] flex items-center gap-2">
                      <span className="font-semibold">
                        {formatDate(entry.occurred_at)}
                      </span>
                      <span>·</span>
                      <span>{formatTime(entry.occurred_at)}</span>
                      <span>·</span>
                      <span className="font-bold text-[#174C37] flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>{actorName}</span>
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#3D291F] font-medium leading-relaxed">
                    <strong className="text-[#54433A] font-bold">
                      Audit Reason:
                    </strong>{" "}
                    {entry.reason || "Operational statutory entry."}
                  </p>

                  {/* Expandable JSON Diff */}
                  <details className="text-xs group border border-[#E5DDD3] rounded-lg bg-white overflow-hidden">
                    <summary className="p-2.5 font-bold text-[#174C37] hover:bg-[#FAF6F0] cursor-pointer flex items-center justify-between transition-colors">
                      <span>View Recorded State Payload (Before / After)</span>
                      <ChevronDown className="w-4 h-4 text-[#54433A] group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="p-3 bg-[#FAF6F0] border-t border-[#E5DDD3] overflow-x-auto">
                      <pre className="text-[11px] font-mono text-[#3D291F] leading-tight whitespace-pre-wrap">
                        {JSON.stringify(
                          {
                            before: entry.before_data,
                            after: entry.after_data,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalAuditCount > pageSize && (
          <nav
            aria-label="Audit history pagination"
            className="flex items-center justify-between pt-3 border-t border-[#E5DDD3] text-xs font-bold text-[#54433A]"
          >
            <div>
              {auditPage > 0 ? (
                <Link
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#174C37] hover:bg-[#FAF6F0] transition-colors"
                  href={historyPageHref(targetMemberId, auditPage - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Newer events</span>
                </Link>
              ) : (
                <div />
              )}
            </div>

            <span>
              Page {auditPage + 1} of {Math.max(1, totalPages)}
            </span>

            <div>
              {(auditPage + 1) * pageSize < totalAuditCount ? (
                <Link
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#174C37] hover:bg-[#FAF6F0] transition-colors"
                  href={historyPageHref(targetMemberId, auditPage + 1)}
                >
                  <span>Older events</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <div />
              )}
            </div>
          </nav>
        )}
      </div>
    </section>
  );
}
