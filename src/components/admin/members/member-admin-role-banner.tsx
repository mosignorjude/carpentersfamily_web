"use client";

import { AlertTriangle, RefreshCw, Shield } from "lucide-react";
import type React from "react";
import type { OfficerRole } from "./member-admin-types";

interface MemberAdminRoleBannerProps {
  currentOfficerName: string;
  currentOfficerRoleTitle: string;
  simulatedRole: OfficerRole;
  onRoleChange: (role: OfficerRole) => void;
  roleLookupFailed: boolean;
  onToggleRoleLookupFailed: () => void;
}

export const MemberAdminRoleBanner: React.FC<MemberAdminRoleBannerProps> = ({
  currentOfficerName,
  currentOfficerRoleTitle,
  simulatedRole,
  onRoleChange,
  roleLookupFailed,
  onToggleRoleLookupFailed,
}) => {
  return (
    <div className="space-y-4">
      {/* Authenticated Workspace Banner */}
      <div className="bg-[#103D2B] text-white rounded-xl p-4 sm:p-5 border border-[#174C37] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#174C37] border border-[#D6A23A]/40 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#D6A23A]">
                Authenticated Officer Workspace
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#174C37] text-white border border-[#D6A23A]/30 font-medium">
                WAT Protocol
              </span>
            </div>
            <h2 className="text-base font-bold text-white">
              {currentOfficerName} Â· {currentOfficerRoleTitle}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 bg-[#0C3325] px-3 py-1.5 rounded-lg border border-[#174C37]">
            <span className="text-[#E5DDD3]/70">Officer Role:</span>
            <select
              value={simulatedRole}
              onChange={(e) => onRoleChange(e.target.value as OfficerRole)}
              className="bg-transparent text-[#D6A23A] font-semibold focus:outline-hidden cursor-pointer"
            >
              <option value="admin" className="bg-[#0C3325] text-white">
                Admin (Full Access)
              </option>
              <option value="backup_admin" className="bg-[#0C3325] text-white">
                Backup Admin (Full Access)
              </option>
              <option value="executive" className="bg-[#0C3325] text-white">
                Executive (Requests & Staffing)
              </option>
              <option value="member" className="bg-[#0C3325] text-white">
                General Member (Access Restricted)
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={onToggleRoleLookupFailed}
            className={`cf-btn cf-btn--banner ${
              roleLookupFailed ? "cf-btn--banner-offline" : ""
            }`}
            title="Simulate external role verification lookup failure to test graceful fallback"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${roleLookupFailed ? "animate-spin" : ""}`}
            />
            <span>
              {roleLookupFailed
                ? "Role Service: Offline"
                : "Role Service: Normal"}
            </span>
          </button>
        </div>
      </div>

      {/* Role Lookup Failure Notice */}
      {roleLookupFailed && (
        <div className="bg-[#FFF8E6] border border-[#D6A23A] rounded-xl p-4 text-xs text-[#3D291F] flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#D6A23A] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Role Verification Service Unavailable</p>
            <p className="text-[#7A685D] leading-relaxed">
              External club role verification cannot be loaded right now. Per
              club security rules, role modification controls are temporarily
              withheld, while independently verified account status controls
              (deactivation/reactivation) remain safely accessible.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
