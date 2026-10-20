import { Shield } from "lucide-react";

interface CommunicationsPrivacyBannerProps {
  view: "announcements" | "polls";
}

export function CommunicationsPrivacyBanner({
  view,
}: CommunicationsPrivacyBannerProps) {
  const isPolls = view === "polls";

  return (
    <div className="bg-white rounded-xl border border-[#E5DDD3] p-4 text-xs text-[#7A685D] flex items-start gap-3 shadow-xs">
      <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0 mt-0.5">
        <Shield className="w-4 h-4 text-[#174C37]" />
      </div>
      <div className="space-y-1">
        <h3 className="font-bold text-[#3D291F]">
          {isPolls
            ? "Privacy & Electoral Governance Policy:"
            : "Private Read Status Policy:"}
        </h3>
        <p className="leading-relaxed">
          {isPolls
            ? "Voting in Carpenters Family Social Club is strictly confidential. Individual member selections, voter identities, and live participation counts are never revealed while voting is open. Results are released only after the poll has closed, and are withheld if fewer than five members participated to prevent deduction of personal votes."
            : "Announcement read status is strictly personal and private to you. Only you can see whether you have marked an announcement as read. Other members and administrators cannot see your read markers."}
        </p>
      </div>
    </div>
  );
}
