"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions";
import type { UserProfileData } from "@/lib/user-profile";

export type { UserProfileData };

interface UserProfileBadgeProps {
  user: UserProfileData;
  className?: string;
  variant?: "header" | "sidebar";
}

export function UserProfileBadge({
  user,
  className = "",
  variant = "header",
}: UserProfileBadgeProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initial = (user.fullName || user.username || "M")
    .trim()
    .charAt(0)
    .toUpperCase();

  const cleanUsername = user.username.startsWith("@")
    ? user.username
    : `@${user.username}`;

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!isDropdownOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Sidebar Footer Variant (Only [icon] Sign out)
  if (variant === "sidebar") {
    return (
      <form action={signOutAction} className={`w-full ${className}`}>
        <button
          aria-label="Sign out"
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Sign out"
          type="submit"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </form>
    );
  }

  // Header Variant (Desktop & Mobile clickable profile badge with dropdown)
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* 1. Desktop Inline Badge Trigger (Visible on sm and larger) */}
      <button
        aria-expanded={isDropdownOpen}
        aria-haspopup="menu"
        aria-label={`User menu for ${user.fullName}`}
        className="hidden sm:flex items-center gap-2.5 px-2.5 py-1 rounded-xl bg-white/75 hover:bg-white border border-[#E5DDD3] shadow-2xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#174C37] text-left"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        type="button"
      >
        {/* Circular Initial Avatar */}
        <div
          aria-hidden="true"
          className="w-9 h-9 rounded-full bg-[#174C37] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs overflow-hidden"
        >
          {user.avatarUrl ? (
            /* biome-ignore lint/performance/noImgElement: Avatar supports data URIs and CSP-safe img rendering */
            <img
              alt=""
              className="w-full h-full object-cover"
              src={user.avatarUrl}
            />
          ) : (
            initial
          )}
        </div>

        {/* Name and Role Stack (No @Username or Signout button in banner) */}
        <div className="flex flex-col min-w-0 max-w-[140px] md:max-w-[180px]">
          <span className="text-xs font-bold text-[#3D291F] tracking-tight truncate leading-tight">
            {user.fullName}
          </span>
          <span className="text-[10px] font-semibold text-[#7A685D] uppercase tracking-wider truncate">
            {user.role}
          </span>
        </div>
      </button>

      {/* 2. Mobile Compact Avatar Trigger (Visible on screens < sm) */}
      <div className="sm:hidden">
        <button
          aria-expanded={isDropdownOpen}
          aria-haspopup="menu"
          aria-label={`User menu for ${user.fullName}`}
          className="w-9 h-9 rounded-full bg-[#174C37] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#174C37] overflow-hidden"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          type="button"
        >
          {user.avatarUrl ? (
            /* biome-ignore lint/performance/noImgElement: Avatar supports data URIs and CSP-safe img rendering */
            <img
              alt=""
              className="w-full h-full object-cover"
              src={user.avatarUrl}
            />
          ) : (
            initial
          )}
        </button>
      </div>

      {/* Shared Dropdown Menu: [@Username] bottom border, [icon] Settings bottom border, [icon] Sign out */}
      {isDropdownOpen && (
        <div
          aria-label="User profile options"
          className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white border border-[#E5DDD3] shadow-xl overflow-hidden z-50 animate-in fade-in duration-150"
          role="menu"
        >
          {/* 1. [@Username] with bottom border (plus [Full Name] - [role] on mobile) */}
          <div className="px-3.5 py-2.5 border-b border-[#E5DDD3] bg-[#FAF6F0]/60">
            <span className="block sm:hidden text-xs font-bold text-[#3D291F] truncate leading-tight mb-0.5">
              {user.fullName} - {user.role}
            </span>
            <span className="block text-xs font-bold font-mono text-[#54433A] truncate">
              {cleanUsername}
            </span>
          </div>

          {/* 2. [icon] Settings with bottom border */}
          <div className="p-1.5 border-b border-[#E5DDD3]">
            <Link
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-bold text-[#3D291F] hover:bg-[#FAF6F0] transition-colors cursor-pointer no-underline"
              href="/settings"
              onClick={() => setIsDropdownOpen(false)}
              role="menuitem"
            >
              <Settings className="w-4 h-4 text-[#174C37] shrink-0" />
              <span>Settings</span>
            </Link>
          </div>

          {/* 3. [icon] Sign out */}
          <div className="p-1.5">
            <form action={signOutAction}>
              <button
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-bold text-[#BA3C2A] hover:bg-red-50 transition-colors cursor-pointer"
                role="menuitem"
                type="submit"
              >
                <LogOut className="w-4 h-4 text-[#BA3C2A] shrink-0" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserProfileBadge;
