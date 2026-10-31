import type { StaffNoticeCopy } from "@/lib/staff-notices";

export default function StaffNotice({ notice }: { notice?: StaffNoticeCopy }) {
  if (!notice) return null;
  return (
    <p
      className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
        notice.isError
          ? "border-[#E5C5C1] bg-[#FAF0EE] text-[#76342D]"
          : "border-[#C9DED2] bg-[#F0F7F2] text-[#204F3D]"
      }`}
      role={notice.isError ? "alert" : "status"}
    >
      {notice.message}
    </p>
  );
}
