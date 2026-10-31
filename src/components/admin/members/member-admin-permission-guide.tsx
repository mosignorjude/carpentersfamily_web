"use client";

import { Info, Lock } from "lucide-react";
import type React from "react";

export const MemberAdminPermissionGuide: React.FC = () => {
  return (
    <details className="bg-white rounded-xl border border-[#E5DDD3] p-3.5 sm:p-5 shadow-xs group">
      <summary className="flex items-center justify-between cursor-pointer list-none select-none min-h-[40px]">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[#174C37]" />
          <h3 className="text-xs font-bold text-[#3D291F] uppercase tracking-wider inline">
            Governance &amp; Permission Rules
          </h3>
        </div>
        <span className="text-xs font-semibold text-[#174C37] group-open:hidden">
          View Guide ▾
        </span>
        <span className="text-xs font-semibold text-[#7A685D] hidden group-open:inline">
          Hide ▴
        </span>
      </summary>

      <div className="mt-3 pt-3 border-t border-[#E5DDD3] space-y-3 animate-in fade-in duration-150">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-[#7A685D]">
          <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3]/70 space-y-1">
            <span className="font-semibold text-[#174C37] block">
              Requests &amp; Event Staffing
            </span>
            <p>
              Executive, Admin, and President can review requests and staff
              events.
            </p>
          </div>
          <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3]/70 space-y-1">
            <span className="font-semibold text-[#174C37] block">
              Account Status Management
            </span>
            <p>
              Only Admin and President can deactivate or reactivate member
              accounts.
            </p>
          </div>
          <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3]/70 space-y-1">
            <span className="font-semibold text-[#174C37] block">
              Executive Assignment &amp; Audit
            </span>
            <p>
              Admins can assign or remove Executive status. All changes require
              reasons recorded in audit history.
            </p>
          </div>
        </div>

        <div className="pt-2 text-[11px] text-[#7A685D] flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
          <span>
            Admin and President roles are established by the club's system
            administrators and cannot be reassigned via this portal.
          </span>
        </div>
      </div>
    </details>
  );
};
