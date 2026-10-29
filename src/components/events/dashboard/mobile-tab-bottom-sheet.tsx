"use client";

import { Check, ChevronDown, X } from "lucide-react";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { DashboardTab } from "./dashboard-types";

export interface MobileTabItem {
  id: DashboardTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MobileTabBottomSheetProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  tabs: MobileTabItem[];
}

export function MobileTabBottomSheet({
  activeTab,
  onSelectTab,
  tabs,
}: MobileTabBottomSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const activeTabItem = tabs.find((t) => t.id === activeTab) || tabs[0];
  const ActiveIcon = activeTabItem?.icon;

  // Handle Escape key and focus management
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        setIsOpen(false);
        triggerButtonRef.current?.focus();
      }
    }

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  function handleSelect(tabId: DashboardTab) {
    onSelectTab(tabId);
    setIsOpen(false);
    triggerButtonRef.current?.focus();
  }

  function handleClose() {
    setIsOpen(false);
    triggerButtonRef.current?.focus();
  }

  return (
    <div className="w-full">
      {/* Trigger Button: Styled Warm Editorial Card Bar */}
      <button
        ref={triggerButtonRef}
        aria-controls="mobile-event-dashboard-sheet"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="w-full flex items-center justify-between p-3 bg-[#FAF6F0] hover:bg-[#F3EDE2] active:bg-[#ECE4D8] rounded-xl border border-[#E5DDD3] shadow-2xs transition-colors cursor-pointer text-left min-h-[52px] group"
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white border border-[#E5DDD3] shadow-2xs flex items-center justify-center shrink-0 text-[#174C37]">
            {ActiveIcon && <ActiveIcon className="w-4 h-4 text-[#174C37]" />}
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#7A685D] leading-none mb-1">
              Active Section
            </span>
            <span className="block font-bold text-sm text-[#174C37] truncate group-hover:text-[#0E3324]">
              {activeTabItem?.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8A641A] bg-[#FBF4E6] px-2.5 py-1.5 rounded-lg border border-[#F0DFBE] shrink-0">
          <span>{tabs.length} Sections</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Modal Bottom Sheet Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-90 flex items-end justify-center sm:hidden">
          {/* Backdrop Scrim */}
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={handleClose}
          />

          {/* Slide-over Drawer Panel */}
          <div
            ref={sheetPanelRef}
            aria-describedby={descriptionId}
            aria-labelledby={titleId}
            aria-modal="true"
            className="relative z-10 w-full max-h-[85vh] bg-white rounded-t-[28px] border-t border-[#E5DDD3] shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250 ease-out"
            id="mobile-event-dashboard-sheet"
            role="dialog"
            tabIndex={-1}
          >
            {/* Drag Handle Bar */}
            <button
              aria-label="Close dashboard sections"
              className="pt-3 pb-1 flex justify-center cursor-pointer"
              onClick={handleClose}
              type="button"
            >
              <div className="w-12 h-1.5 bg-[#D8CEBE] rounded-full" />
            </button>

            {/* Sheet Header */}
            <div className="px-5 py-3 border-b border-[#F2ECE4] flex items-center justify-between">
              <div>
                <h3
                  className="font-serif font-bold text-base text-[#2A2521]"
                  id={titleId}
                >
                  Event Dashboard Sections
                </h3>
                <p className="text-xs text-[#7A685D]" id={descriptionId}>
                  Select a section to switch your active view
                </p>
              </div>

              <button
                aria-label="Close sections sheet"
                className="w-8 h-8 rounded-full bg-[#FAF6F0] hover:bg-[#F3EDE2] text-[#5C4638] hover:text-[#2A2521] flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
                onClick={handleClose}
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of 8 Sections */}
            <div className="p-3 space-y-1 overflow-y-auto overscroll-contain flex-1">
              {tabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full p-3 rounded-xl flex items-center justify-between transition-colors text-left min-h-[52px] cursor-pointer border-0 ${
                      isActive
                        ? "bg-[#FAF6F0] border border-[#E5DDD3]"
                        : "hover:bg-[#FBF9F5] active:bg-[#F2ECE4] bg-transparent"
                    }`}
                    data-tab-id={tab.id}
                    key={tab.id}
                    onClick={() => handleSelect(tab.id)}
                    type="button"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-2">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isActive
                            ? "bg-[#174C37] text-white shadow-2xs"
                            : "bg-[#FAF6F0] text-[#174C37] border border-[#E5DDD3]"
                        }`}
                      >
                        <TabIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-semibold truncate ${
                            isActive ? "text-[#174C37]" : "text-[#2A2521]"
                          }`}
                        >
                          {tab.label}
                        </div>
                        <div className="text-xs text-[#7A685D] truncate leading-tight mt-0.5">
                          {tab.subtitle}
                        </div>
                      </div>
                    </div>

                    {isActive && (
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#174C37]/10 text-[#174C37] shrink-0">
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileTabBottomSheet;
