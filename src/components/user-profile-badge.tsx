"use client";

import { LogOut } from "lucide-react";
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

  // Sidebar Footer Variant (Dark palette for dashboard sidebar)
  if (variant === "sidebar") {
    return (
      <div
        className={`flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            aria-hidden="true"
            className="w-9 h-9 rounded-full bg-[#D6A23A] text-[#1F1713] flex items-center justify-center font-bold text-sm shrink-0 shadow-xs"
          >
            {initial}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white tracking-tight truncate leading-tight">
              {user.fullName}
            </span>
            <span className="text-[10px] font-medium text-white/70 truncate">
              {user.role} · {cleanUsername}
            </span>
          </div>
        </div>

        <form action={signOutAction} className="shrink-0">
          <button
            aria-label="Sign out"
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Sign out"
            type="submit"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    );
  }

  // Header Variant (Light/Stone palette matching top bar, with mobile dropdown)
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* 1. Desktop Inline Badge (Visible on sm and larger) */}
      <div className="hidden sm:flex items-center gap-3 pl-2 pr-1 py-1 rounded-xl bg-white/75 border border-[#E5DDD3] shadow-2xs">
        {/* Circular Initial Avatar */}
        <div
          aria-hidden="true"
          className="w-9 h-9 rounded-full bg-[#174C37] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs"
        >
          {initial}
        </div>

        {/* Name and Role Stack */}
        <div className="flex flex-col min-w-0 max-w-[140px] md:max-w-[180px]">
          <span className="text-xs font-bold text-[#3D291F] tracking-tight truncate leading-tight">
            {user.fullName}
          </span>
          <span className="text-[10px] font-semibold text-[#7A685D] uppercase tracking-wider truncate">
            {user.role} · {cleanUsername}
          </span>
        </div>

        {/* Signout Action Icon */}
        <form action={signOutAction} className="shrink-0 ml-1">
          <button
            aria-label="Sign out"
            className="p-2 rounded-lg text-[#7A685D] hover:text-[#BA3C2A] hover:bg-red-50/80 transition-colors cursor-pointer"
            title="Sign out"
            type="submit"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* 2. Mobile Compact Avatar with Dropdown (Visible on screens < sm) */}
      <div className="sm:hidden relative">
        <button
          aria-expanded={isDropdownOpen}
          aria-haspopup="menu"
          aria-label={`User menu for ${user.fullName}`}
          className="w-9 h-9 rounded-full bg-[#174C37] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#174C37]"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          type="button"
        >
          {initial}
        </button>

        {isDropdownOpen && (
          <div
            aria-label="User profile options"
            className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-white border border-[#E5DDD3] shadow-xl p-3 z-50 animate-in fade-in duration-150"
            role="menu"
          >
            {/* User Identity Header */}
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#E5DDD3]">
              <div
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-[#174C37] text-white flex items-center justify-center font-bold text-xs shrink-0"
              >
                {initial}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-[#3D291F] truncate leading-tight">
                  {user.fullName}
                </span>
                <span className="text-[10px] font-semibold text-[#7A685D] uppercase tracking-wider truncate">
                  {user.role} · {cleanUsername}
                </span>
              </div>
            </div>

            {/* Sign Out Action Button */}
            <form action={signOutAction} className="pt-2">
              <button
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold text-[#BA3C2A] hover:bg-red-50 transition-colors cursor-pointer"
                role="menuitem"
                type="submit"
              >
                <LogOut className="w-4 h-4 text-[#BA3C2A]" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfileBadge;
