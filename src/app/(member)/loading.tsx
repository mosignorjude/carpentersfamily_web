export default function MemberLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading page workspace"
      className="space-y-6 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 animate-in fade-in duration-150"
      role="status"
    >
      {/* Skeleton Hero Banner */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs animate-pulse space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2.5 max-w-lg w-full">
            <div className="h-4 w-28 bg-[#E5DDD3]/70 rounded-md" />
            <div className="h-8 w-64 bg-[#E5DDD3] rounded-lg" />
            <div className="h-4 w-full max-w-md bg-[#E5DDD3]/50 rounded-md" />
          </div>
          <div className="h-16 w-36 bg-[#FAF6F0] border border-[#E5DDD3]/60 rounded-xl shrink-0" />
        </div>
      </div>

      {/* Skeleton Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs animate-pulse space-y-4">
          <div className="h-4 w-32 bg-[#E5DDD3]/70 rounded-md" />
          <div className="h-10 w-24 bg-[#E5DDD3] rounded-lg" />
          <div className="h-3 w-40 bg-[#E5DDD3]/50 rounded-md" />
        </div>
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs animate-pulse space-y-4">
          <div className="h-4 w-28 bg-[#E5DDD3]/70 rounded-md" />
          <div className="h-10 w-32 bg-[#E5DDD3] rounded-lg" />
          <div className="h-3 w-36 bg-[#E5DDD3]/50 rounded-md" />
        </div>
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs animate-pulse space-y-4 md:col-span-2 lg:col-span-1">
          <div className="h-4 w-36 bg-[#E5DDD3]/70 rounded-md" />
          <div className="h-10 w-20 bg-[#E5DDD3] rounded-lg" />
          <div className="h-3 w-44 bg-[#E5DDD3]/50 rounded-md" />
        </div>
      </div>

      {/* Screen reader announcement */}
      <span className="sr-only">Loading page content, please wait...</span>
    </div>
  );
}
