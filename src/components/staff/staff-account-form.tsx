"use client";

import { createStaffAction } from "@/app/(staff)/admin/actions";

export default function StaffAccountForm() {
  return (
    <form
      action={createStaffAction}
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event) => {
        const confirmation =
          "Invite this person as a staff administrator? They will receive a sign-in email and full system administration access once provisioned.";
        if (!window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    >
      <label className="grid gap-1 text-xs font-bold text-[#3D291F]">
        Email address
        <input
          className="min-h-10 rounded-lg border border-[#B8ACA0] px-3 text-sm font-normal"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-[#3D291F]">
        Full name
        <input
          className="min-h-10 rounded-lg border border-[#B8ACA0] px-3 text-sm font-normal"
          maxLength={120}
          name="full_name"
          required
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-[#3D291F]">
        Username
        <input
          className="min-h-10 rounded-lg border border-[#B8ACA0] px-3 text-sm font-normal"
          maxLength={30}
          minLength={3}
          name="username"
          pattern="[A-Za-z0-9_]{3,30}"
          required
        />
      </label>
      <div className="sm:col-span-3">
        <button className="button-secondary" type="submit">
          Invite staff administrator
        </button>
      </div>
    </form>
  );
}
