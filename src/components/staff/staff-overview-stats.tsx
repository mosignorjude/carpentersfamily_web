export interface StaffOverviewStat {
  label: string;
  value: string;
  hint: string;
}

export default function StaffOverviewStats({
  stats,
}: {
  stats: StaffOverviewStat[];
}) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {stats.map((stat) => (
        <li
          className="rounded-2xl border border-[#E5DDD3] bg-white p-4 shadow-xs"
          key={stat.label}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
            {stat.label}
          </p>
          <p className="mt-1 text-xl font-extrabold text-[#3D291F] break-words">
            {stat.value}
          </p>
          <p className="mt-1 text-[11px] text-[#7A685D]">{stat.hint}</p>
        </li>
      ))}
    </ul>
  );
}
