"use client";

import { Info, Lock } from "lucide-react";
import type React from "react";

export const MemberAdminPermissionGuide: React.FC = () => {
  return (
    <div className="bg-white rounded-xl border border-[#E5DDD3] p-4 sm:p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-[#174C37]" />
        <h3 className="text-xs font-bold text-[#3D291F] uppercase tracking-wider">
          Governance & Permission Rules
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-[#7A685D]">
        <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3]/70 space-y-1">
          <span className="font-semibold text-[#174C37] block">
            Requests & Event Staffing
          </span>
          <p>
            Executive, Admin, and Backup Admin can review requests and staff
            events.
          </p>
        </div>
        <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3]/70 space-y-1">
          <span className="font-semibold text-[#174C37] block">
            Account Status Management
          </span>
          <p>
            Only Admin and Backup Admin can deactivate or reactivate member
            accounts.
          </p>
        </div>
        <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3]/70 space-y-1">
          <span className="font-semibold text-[#174C37] block">
            Executive Assignment & Audit
          </span>
          <p>
            Admins can assign or remove Executive status. All changes require
            reasons recorded in audit history.
          </p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-[#E5DDD3]/70 text-[11px] text-[#7A685D] flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
        <span>
          Admin and Backup Admin roles are established by club trustees and
          cannot be reassigned via this portal.
        </span>
      </div>
    </div>
  );
};
