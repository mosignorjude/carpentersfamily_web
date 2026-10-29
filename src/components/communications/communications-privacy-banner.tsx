import { Shield } from "lucide-react";

interface CommunicationsPrivacyBannerProps {
  view: "announcements" | "polls";
}

export function CommunicationsPrivacyBanner({
  view,
}: CommunicationsPrivacyBannerProps) {
  const isPolls = view === "polls";

  return (
    <details className="bg-white rounded-xl border border-[#E5DDD3] p-3.5 sm:p-4 text-xs text-[#7A685D] shadow-xs group">
      <summary className="flex items-center justify-between cursor-pointer list-none select-none min-h-[36px]">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0">
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#174C37]" />
          </div>
          <span className="font-bold text-[#3D291F] truncate">
            {isPolls
              ? "Privacy & Electoral Governance Policy"
              : "Private Read Status Policy"}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-[#174C37] group-open:hidden shrink-0">
          View Policy ▾
        </span>
        <span className="text-[11px] font-semibold text-[#7A685D] hidden group-open:inline shrink-0">
          Hide ▴
        </span>
      </summary>

      <div className="mt-2.5 pt-2.5 border-t border-[#E5DDD3] space-y-1 animate-in fade-in duration-150">
        <p className="leading-relaxed text-[#5C4638]">
          {isPolls
            ? "Voting in Carpenters Family Social Club is strictly confidential. Individual member selections, voter identities, and live participation counts are never revealed while voting is open. Results are released only after the poll has closed, and are withheld if fewer than five members participated to prevent deduction of personal votes."
            : "Announcement read status is strictly personal and private to you. Only you can see whether you have marked an announcement as read. Other members and administrators cannot see your read markers."}
        </p>
      </div>
    </details>
  );
}
