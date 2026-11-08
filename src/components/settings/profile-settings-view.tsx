"use client";

import { Camera, KeyRound, Mail, Trash2, User } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import {
  updateMemberEmailAction,
  updateMemberPasswordAction,
  updateMemberProfileSettingsAction,
} from "@/app/actions";
import AuthPasswordInput from "@/components/auth-password-input";
import { FormSubmitButton } from "@/components/ui/cf-button";

interface ProfileSettingsViewProps {
  fullName: string;
  username: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

export function ProfileSettingsView({
  fullName,
  username,
  email,
  role,
  avatarUrl,
}: ProfileSettingsViewProps) {
  const [previewAvatar, setPreviewAvatar] = useState<string>(avatarUrl ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const initial = (fullName || username || "M").trim().charAt(0).toUpperCase();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please select a valid PNG, JPEG, or WebP image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;

      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSide = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSide) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          }
        } else if (height > maxSide) {
          width = Math.round((width * maxSide) / height);
          height = maxSide;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.85);
        setPreviewAvatar(compressed);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6 font-sans text-[#3D291F]">
      {/* Header */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-2">
        <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#174C37] block">
          Account &amp; Security
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#3D291F]">
          Profile Settings
        </h1>
        <p className="text-xs sm:text-sm text-[#5C4638] max-w-2xl leading-relaxed">
          Manage your profile photo, username, email address, and password.
        </p>
      </section>

      {/* 1. Username & Profile Photo */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#E5DDD3]">
          <User className="w-5 h-5 text-[#174C37]" />
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#3D291F]">
              Photo &amp; Username
            </h2>
            <p className="text-xs text-[#7A685D]">
              {fullName} · {role}
            </p>
          </div>
        </div>

        <form action={updateMemberProfileSettingsAction} className="space-y-5">
          <input name="avatar_url" type="hidden" value={previewAvatar} />

          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-[#174C37] text-white flex items-center justify-center font-extrabold text-2xl shrink-0 shadow-sm overflow-hidden border-2 border-[#E5DDD3]">
              {previewAvatar ? (
                /* biome-ignore lint/performance/noImgElement: Data URI avatar preview */
                <img
                  alt=""
                  className="w-full h-full object-cover"
                  src={previewAvatar}
                />
              ) : (
                initial
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <label
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] hover:bg-white text-xs font-bold text-[#174C37] cursor-pointer transition-colors"
                  htmlFor="profile-avatar-upload"
                >
                  <Camera className="w-4 h-4" />
                  <span>Upload Profile Photo</span>
                </label>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  id="profile-avatar-upload"
                  onChange={handleFileChange}
                  type="file"
                />

                {previewAvatar && (
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5DDD3] bg-white hover:bg-red-50 text-xs font-bold text-[#BA3C2A] cursor-pointer transition-colors"
                    onClick={() => setPreviewAvatar("")}
                    type="button"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Photo</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#7A685D]">
                Supported formats: PNG, JPG, or WebP. Automatically resized to a
                square portrait.
              </p>
              {uploadError && (
                <p className="text-xs font-semibold text-[#BA3C2A]">
                  {uploadError}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-wider text-[#54433A] mb-1.5"
                htmlFor="settings-full-name"
              >
                Full Name
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#7A685D] cursor-not-allowed"
                disabled
                id="settings-full-name"
                type="text"
                value={fullName}
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-wider text-[#54433A] mb-1.5"
                htmlFor="settings-username"
              >
                Username
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-semibold text-[#3D291F]"
                defaultValue={username}
                id="settings-username"
                maxLength={30}
                minLength={3}
                name="username"
                pattern="^[A-Za-z0-9_]{3,30}$"
                required
                type="text"
              />
              <span className="text-[11px] text-[#7A685D] mt-1 block">
                3–30 letters, numbers, or underscores.
              </span>
            </div>
          </div>

          <div className="flex sm:justify-end">
            <FormSubmitButton
              className="cf-btn cf-btn--primary w-full sm:w-auto px-5 py-2.5 text-xs font-bold min-h-[44px]"
              pendingLabel="Saving Profile…"
              statusToastMessage="Saving your profile settings…"
            >
              Save Profile
            </FormSubmitButton>
          </div>
        </form>
      </section>

      {/* 2. Email Address */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#E5DDD3]">
          <Mail className="w-5 h-5 text-[#174C37]" />
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#3D291F]">
              Email Address
            </h2>
            <p className="text-xs text-[#7A685D]">
              Update the email address used to sign in.
            </p>
          </div>
        </div>

        <form action={updateMemberEmailAction} className="space-y-4">
          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-[#54433A] mb-1.5"
              htmlFor="settings-email"
            >
              Email Address
            </label>
            <input
              className="w-full h-11 px-3.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-semibold text-[#3D291F]"
              defaultValue={email}
              id="settings-email"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </div>

          <div className="flex sm:justify-end">
            <FormSubmitButton
              className="cf-btn cf-btn--primary w-full sm:w-auto px-5 py-2.5 text-xs font-bold min-h-[44px]"
              pendingLabel="Updating Email…"
              statusToastMessage="Requesting email address update…"
            >
              Update Email
            </FormSubmitButton>
          </div>
        </form>
      </section>

      {/* 3. Password */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#E5DDD3]">
          <KeyRound className="w-5 h-5 text-[#174C37]" />
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#3D291F]">
              Change Password
            </h2>
            <p className="text-xs text-[#7A685D]">
              Choose a strong password of at least 12 characters.
            </p>
          </div>
        </div>

        <form action={updateMemberPasswordAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-wider text-[#54433A] mb-1.5"
                htmlFor="settings-password"
              >
                New Password
              </label>
              <AuthPasswordInput
                autoComplete="new-password"
                className="w-full h-11 px-3.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-semibold text-[#3D291F]"
                id="settings-password"
                maxLength={128}
                minLength={12}
                name="password"
                placeholder="At least 12 characters"
                required
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-wider text-[#54433A] mb-1.5"
                htmlFor="settings-confirm-password"
              >
                Confirm New Password
              </label>
              <AuthPasswordInput
                autoComplete="new-password"
                className="w-full h-11 px-3.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-semibold text-[#3D291F]"
                id="settings-confirm-password"
                maxLength={128}
                minLength={12}
                name="confirm_password"
                placeholder="Re-enter new password"
                required
              />
            </div>
          </div>

          <div className="flex sm:justify-end">
            <FormSubmitButton
              className="cf-btn cf-btn--primary w-full sm:w-auto px-5 py-2.5 text-xs font-bold min-h-[44px]"
              pendingLabel="Updating Password…"
              statusToastMessage="Updating your account password…"
            >
              Update Password
            </FormSubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
