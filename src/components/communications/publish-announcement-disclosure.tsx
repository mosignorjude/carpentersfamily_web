"use client";

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useState } from "react";
import { createAnnouncementAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import type { EventOption } from "./communications-types";

interface PublishAnnouncementDisclosureProps {
  globalPublisher: boolean;
  publishEvents: EventOption[];
}

export function PublishAnnouncementDisclosure({
  globalPublisher,
  publishEvents,
}: PublishAnnouncementDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [priority, setPriority] = useState<"standard" | "important" | "urgent">(
    "standard",
  );

  return (
    <div className="bg-white rounded-xl border border-[#E5DDD3] shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="cf-btn cf-btn--accordion w-full"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0">
            <Plus className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#3D291F]">
              Publish an announcement
            </h2>
            <p className="text-xs text-[#7A685D]">
              {globalPublisher
                ? "Authorized as Club Administrator / Executive Officer"
                : "Authorized as Event Lead for active assigned events"}
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[#7A685D]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#7A685D]" />
        )}
      </button>

      {isOpen && (
        <div className="p-5 border-t border-[#E5DDD3] bg-[#FAF6F0]/40">
          <form
            action={createAnnouncementAction}
            className="space-y-4 max-w-2xl"
          >
            {/* Audience selection */}
            <div>
              <label
                htmlFor="announcement-audience"
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Audience / Scope
              </label>
              <select
                id="announcement-audience"
                name="event_id"
                defaultValue={
                  globalPublisher ? "" : (publishEvents[0]?.id ?? "")
                }
                className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              >
                {globalPublisher && (
                  <option value="">
                    Club-Wide (General Assembly & All Members)
                  </option>
                )}
                {publishEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    Event: {event.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority & Expiry (Admin / Executive only per DB policy) */}
            {globalPublisher && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="announcement-priority"
                    className="block text-xs font-bold text-[#3D291F] mb-1"
                  >
                    Priority Level
                  </label>
                  <select
                    id="announcement-priority"
                    name="priority"
                    value={priority}
                    onChange={(e) =>
                      setPriority(
                        e.target.value as "standard" | "important" | "urgent",
                      )
                    }
                    className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
                  >
                    <option value="standard">Standard Notice</option>
                    <option value="important">Important Notice</option>
                    <option value="urgent">
                      Urgent Alert (Requires Expiry)
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="announcement-expires-at"
                    className="block text-xs font-bold text-[#3D291F] mb-1"
                  >
                    Highlight Expiry{" "}
                    {priority === "urgent"
                      ? "(Required)"
                      : priority === "important"
                        ? "(Optional)"
                        : "(N/A for Standard)"}
                  </label>
                  <input
                    id="announcement-expires-at"
                    name="expires_at"
                    type="datetime-local"
                    disabled={priority === "standard"}
                    required={priority === "urgent"}
                    className={`w-full p-2.5 border rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden ${
                      priority === "standard"
                        ? "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed"
                        : "bg-white border-[#E5DDD3]"
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <label
                htmlFor="announcement-title"
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Announcement Title
              </label>
              <input
                id="announcement-title"
                name="title"
                type="text"
                required
                maxLength={160}
                placeholder="e.g. Schedule Update for Year-End Family Banquet"
                className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="announcement-message"
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Message Content (Plain text)
              </label>
              <textarea
                id="announcement-message"
                name="message"
                required
                rows={4}
                maxLength={10000}
                placeholder="Enter the official notice or circular content here..."
                className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="cf-btn cf-btn--neutral"
              >
                Cancel
              </button>
              <FormSubmitButton
                className="cf-btn cf-btn--primary"
                pendingLabel="Publishing Notice…"
                statusToastMessage="Broadcasting official notice to club members."
              >
                Publish Notice
              </FormSubmitButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
