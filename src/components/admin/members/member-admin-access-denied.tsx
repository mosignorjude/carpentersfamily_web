"use client";

import { Lock, Shield } from "lucide-react";
import Link from "next/link";
import type React from "react";
import type { OfficerRole } from "./member-admin-types";

interface MemberAdminAccessDeniedProps {
  simulatedRole: OfficerRole;
  onRoleChange: (role: OfficerRole) => void;
}

export const MemberAdminAccessDenied: React.FC<
  MemberAdminAccessDeniedProps
> = ({ simulatedRole, onRoleChange }) => {
  return (
    <div className="space-y-6">
      {/* Role Testing Selector */}
      <div className="bg-white rounded-xl border border-[#E5DDD3] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-[#7A685D]">
          <Shield className="w-4 h-4 text-[#D6A23A]" />
          <span className="font-semibold text-[#3D291F]">
            Role Access Simulation:
          </span>
          <span>Switch roles to test officer permissions.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#7A685D]">Simulating:</span>
          <select
            value={simulatedRole}
            onChange={(e) => onRoleChange(e.target.value as OfficerRole)}
            className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37]"
          >
            <option value="admin">Admin (Bro. Chukwuma Obi)</option>
            <option value="backup_admin">Backup Admin (Adeola Balogun)</option>
            <option value="executive">Executive (Bro. Efe Okonkwo)</option>
            <option value="member">
              Member (Engr. D. K. Adeleke) [Access Denied]
            </option>
          </select>
        </div>
      </div>

      {/* Calm Access Denied State */}
      <div className="bg-white rounded-xl border border-[#E5DDD3] p-10 text-center max-w-xl mx-auto space-y-4">
        <div className="w-14 h-14 rounded-full bg-[#FAF6F0] border border-[#E5DDD3] text-[#7A685D] mx-auto flex items-center justify-center">
          <Lock className="w-6 h-6 text-[#7A685D]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#3D291F]">
            Officer Access Restricted
          </h2>
          <p className="text-sm text-[#7A685D] leading-relaxed">
            Member administration is reserved exclusively for authenticated club
            officers (Executive, Admin, and Backup Admin). Your signed-in
            profile is registered with general member credentials.
          </p>
        </div>
        <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-xs text-[#7A685D] text-left">
          <p className="font-semibold text-[#3D291F] mb-1">
            Carpenters Family Governance Notice:
          </p>
          <p>
            To safeguard personal member information, member requests, account
            management, and staffing controls are withheld when officer
            credentials cannot be verified.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/" className="cf-btn cf-btn--primary cf-btn--wide">
            Return to Member Home
          </Link>
        </div>
      </div>
    </div>
  );
};
