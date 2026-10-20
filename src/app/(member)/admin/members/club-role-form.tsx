"use client";

import { useId, useRef, useState } from "react";
import { clubRoleChangeAction } from "@/app/actions";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  backup_admin: "Backup Admin",
  executive: "Executive",
  member: "Member",
};

type ClubRole = keyof typeof roleLabels;

type ClubRoleFormProps = {
  canManageAdminRoles: boolean;
  currentRoles: string[];
  memberId: string;
  memberName: string;
};

export default function ClubRoleForm({
  canManageAdminRoles,
  currentRoles,
  memberId,
  memberName,
}: ClubRoleFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const reasonHelpId = `role-reason-help-${id}`;
  const [selectedRole, setSelectedRole] = useState<ClubRole | null>(null);
  const currentRoleLabels =
    currentRoles.length > 0
      ? currentRoles.map((role) => roleLabels[role] ?? role).join(", ")
      : "Member";
  const selectedRoleLabel = selectedRole ? roleLabels[selectedRole] : "";

  return (
    <>
      <label className="visually-hidden" htmlFor={`club-role-${id}`}>
        Change role for {memberName}
      </label>
      <select
        className="member-admin-role-select"
        id={`club-role-${id}`}
        onChange={(event) => {
          const nextRole = event.currentTarget.value as ClubRole | "";
          if (!nextRole) return;
          if (currentRoles.length === 1 && currentRoles[0] === nextRole) {
            event.currentTarget.value = "";
            return;
          }
          if (nextRole === "member" && currentRoles.length === 0) {
            event.currentTarget.value = "";
            return;
          }
          setSelectedRole(nextRole);
          dialogRef.current?.showModal();
        }}
        value=""
      >
        <option disabled value="">
          Change role
        </option>
        <option value="member">Member</option>
        <option value="executive">Executive</option>
        {canManageAdminRoles ? (
          <>
            <option value="admin">Admin</option>
            <option value="backup_admin">Backup Admin</option>
          </>
        ) : null}
      </select>

      <dialog
        aria-labelledby={`role-dialog-title-${id}`}
        className="member-role-dialog"
        onClose={() => setSelectedRole(null)}
        ref={dialogRef}
      >
        <form
          action={clubRoleChangeAction}
          className="member-role-dialog-form"
          key={selectedRole ?? "closed"}
        >
          <input name="member_id" type="hidden" value={memberId} />
          <input name="role" type="hidden" value={selectedRole ?? ""} />
          <div>
            <p className="eyebrow">Role change</p>
            <h2 id={`role-dialog-title-${id}`}>Confirm role change</h2>
            <p>
              Change {memberName}&apos;s club role from {currentRoleLabels} to{" "}
              {selectedRoleLabel}. This replaces their current club-role
              assignments; event-specific roles are unaffected. The change is
              recorded in the audit history.
            </p>
          </div>
          <label htmlFor={`role-reason-${id}`}>
            Reason for this change
            <textarea
              autoComplete="off"
              aria-describedby={reasonHelpId}
              id={`role-reason-${id}`}
              maxLength={500}
              name="reason"
              required
              rows={4}
            />
          </label>
          <p className="muted lifecycle-reason-help" id={reasonHelpId}>
            A reason is required before this role change can be saved.
          </p>
          <div className="member-role-dialog-actions">
            <button
              className="button-secondary"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className={
                selectedRole === "member" ? "button-danger" : "button-primary"
              }
              type="submit"
            >
              Confirm and save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
