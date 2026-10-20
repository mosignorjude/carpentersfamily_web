"use client";

import { ChevronDown, Edit3, FileText, History, Shield } from "lucide-react";
import { useState } from "react";
import { saveEventMinutesAction } from "@/app/actions";
import { EmptyStateCard, FormSubmitButton } from "@/components/ui";
import type { MinutesRow } from "./attendance-types";

interface MinutesCardProps {
  eventId: string;
  minutes: MinutesRow | null;
  canWriteMinutes: boolean;
  returnTo?: string;
}

const watShortDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export function MinutesCard({
  eventId,
  minutes,
  canWriteMinutes,
  returnTo,
}: MinutesCardProps) {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <section
      aria-labelledby="minutes-card-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center font-bold">
            <FileText className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="text-base font-extrabold text-[#3D291F]"
                id="minutes-card-heading"
              >
                Meeting Minutes & Secretariat Record
              </h2>
            </div>
            <p className="text-xs text-[#7A685D]">
              Official proceedings transcribed for the General Assembly
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {minutes ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#FAF6F0] text-[#174C37] border border-[#174C37]/30">
              Revision {minutes.revision_number}
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-[#7A685D] bg-[#FAF6F0] border border-[#E5DDD3]">
              Pending Transcription
            </span>
          )}

          {canWriteMinutes && (
            <button
              id="btn-toggle-minutes-editor"
              className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white hover:bg-[#FAF6F0] text-xs font-bold text-[#174C37] flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
              onClick={() => setEditorOpen(!editorOpen)}
              type="button"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>
                {editorOpen
                  ? "Close Editor"
                  : minutes
                    ? "Edit Minutes"
                    : "Write Minutes"}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  editorOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Reader View */}
      {minutes ? (
        <div className="space-y-3">
          <div className="p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#3D291F] leading-relaxed whitespace-pre-wrap font-sans">
            {minutes.content}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#7A685D] pt-1">
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#174C37]" />
              <span>
                Last recorded:{" "}
                {watShortDateTime.format(new Date(minutes.updated_at))} WAT
              </span>
            </span>
            <span className="font-mono">Secretariat Approved</span>
          </div>
        </div>
      ) : (
        <EmptyStateCard
          actionLabel={
            canWriteMinutes && !editorOpen ? "Write Minutes" : undefined
          }
          className="my-2"
          description="Meeting proceedings and deliberations will be transcribed and published here by the Secretariat."
          icon={FileText}
          onAction={
            canWriteMinutes && !editorOpen
              ? () => setEditorOpen(true)
              : undefined
          }
          title="Minutes Pending Publication"
        />
      )}

      {/* Secretariat Editor Form */}
      {canWriteMinutes && editorOpen && (
        <div className="pt-4 border-t border-[#E5DDD3] bg-[#FAF6F0]/60 p-5 rounded-xl border animate-in fade-in duration-150">
          <form action={saveEventMinutesAction} className="space-y-4">
            <input name="event_id" type="hidden" value={eventId} />
            {returnTo && (
              <input name="return_to" type="hidden" value={returnTo} />
            )}

            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="minutes-content-input"
              >
                {minutes
                  ? "Revised Minutes Content"
                  : "Meeting Deliberations & Minutes Content"}{" "}
                <span className="text-[#BA3C2A]">*</span>
              </label>
              <textarea
                className="w-full h-48 p-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] leading-relaxed"
                defaultValue={minutes?.content ?? ""}
                id="minutes-content-input"
                maxLength={20000}
                name="content"
                placeholder="Call to order, quorum verification, officer reports, resolutions passed, and adjournment notes..."
                required
              />
            </div>

            {minutes && (
              <div>
                <label
                  className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                  htmlFor="minutes-reason-input"
                >
                  Reason for Revision <span className="text-[#BA3C2A]">*</span>
                </label>
                <input
                  className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="minutes-reason-input"
                  maxLength={500}
                  name="reason"
                  placeholder="e.g. Corrected typo in Welfare Committee disbursement figure"
                  required
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#7A685D] flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-[#174C37]" />
                <span>Audited to Club Records</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 rounded-xl border border-[#E5DDD3] bg-white text-xs font-bold text-[#54433A] hover:bg-[#FAF6F0] cursor-pointer min-h-[40px]"
                  onClick={() => setEditorOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <FormSubmitButton
                  className="min-h-[40px] px-5"
                  loadingText="Publishing Minutes..."
                >
                  {minutes
                    ? "Publish Revised Minutes"
                    : "Save & Publish Minutes"}
                </FormSubmitButton>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
