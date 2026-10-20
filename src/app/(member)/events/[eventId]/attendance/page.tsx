import { redirect } from "next/navigation";

export default async function EventAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ notice?: string; tab?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  ) {
    redirect("/events?notice=invalid-request");
  }

  const nextParams = new URLSearchParams({ event: eventId });
  if (query.notice) nextParams.set("notice", query.notice);
  if (query.tab) nextParams.set("tab", query.tab);

  redirect(`/attendance?${nextParams.toString()}`);
}
