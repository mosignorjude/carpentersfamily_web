"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Users,
  X,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ClubMemberRecord } from "./member-admin-types";

interface MembershipRequestsSectionProps {
  pendingRequests: ClubMemberRecord[];
  onOpenApproveModal: (member: ClubMemberRecord) => void;
  onOpenRejectModal: (member: ClubMemberRecord) => void;
}

export const MembershipRequestsSection: React.FC<
  MembershipRequestsSectionProps
> = ({ pendingRequests, onOpenApproveModal, onOpenRejectModal }) => {
  const [expanded, setExpanded] = useState<boolean>(true);

  return (
    <section className="bg-white rounded-xl border border-[#E5DDD3] shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="cf-btn cf-btn--accordion"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37]">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#3D291F]">
                Membership requests
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#D6A23A]/15 text-[#8A641A] border border-[#D6A23A]/30">
                {pendingRequests.length} Pending
              </span>
            </div>
            <p className="text-xs text-[#7A685D]">
              New prospective member applications submitted to Carpenters Family
              Secretariat.
            </p>
          </div>
        </div>
        <span className="p-1.5 text-[#7A685D]" aria-hidden="true">
          {expanded ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#E5DDD3] p-5">
          {pendingRequests.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7A685D] space-y-1">
              <CheckCircle2 className="w-8 h-8 text-[#174C37] mx-auto opacity-70" />
              <p className="font-semibold text-[#3D291F]">
                No Pending Requests
              </p>
              <p>
                All submitted membership applications have been reviewed and
                acted upon.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => {
                const isEligible = req.profileState === "complete";

                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Member Info */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#3D291F] truncate">
                          {req.fullName}
                        </span>
                        <span className="text-xs font-mono text-[#7A685D] bg-white px-2 py-0.5 rounded border border-[#E5DDD3]">
                          {req.username}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#7A685D]">
                        <span>
                          Request date:{" "}
                          <strong className="text-[#3D291F]">
                            {req.requestDateWAT}
                          </strong>
                        </span>
                      </div>

                      {/* Profile completion state */}
                      <div className="pt-1 flex items-center gap-2 text-xs">
                        <span className="font-medium text-[#3D291F]">
                          Eligibility State:
                        </span>
                        {isEligible ? (
                          <span className="inline-flex items-center gap-1 text-[#174C37] font-semibold bg-[#174C37]/10 px-2.5 py-0.5 rounded-full text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Complete & Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#8B261E] font-semibold bg-[#8B261E]/10 px-2.5 py-0.5 rounded-full text-[11px]">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Requirements Incomplete</span>
                          </span>
                        )}
                      </div>

                      {/* Outstanding requirement explanation if incomplete */}
                      {!isEligible && req.profileStateDescription && (
                        <p className="text-xs text-[#8B261E] font-medium bg-[#8B261E]/5 p-2 rounded-md border border-[#8B261E]/20 mt-1">
                          {req.profileStateDescription}
                        </p>
                      )}
                      {isEligible && req.profileStateDescription && (
                        <p className="text-xs text-[#174C37] font-medium mt-1">
                          {req.profileStateDescription}
                        </p>
                      )}
                    </div>

                    {/* Officer Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0">
                      {/* Approve Button */}
                      <button
                        type="button"
                        disabled={!isEligible}
                        onClick={() => onOpenApproveModal(req)}
                        className="cf-btn cf-btn--primary"
                        title={
                          isEligible
                            ? "Approve application and activate member"
                            : "Approval unavailable: Outstanding eligibility requirements must be completed first"
                        }
                      >
                        <Check className="w-4 h-4" />
                        <span>Approve</span>
                      </button>

                      {/* Reject Button */}
                      <button
                        type="button"
                        onClick={() => onOpenRejectModal(req)}
                        className="cf-btn cf-btn--neutral cf-btn--danger-text"
                      >
                        <X className="w-4 h-4" />
                        <span>Reject...</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
