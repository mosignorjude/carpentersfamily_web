import { redirect } from "next/navigation";

export default async function EventFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    notice?: string;
    from?: string;
    to?: string;
    tab?: string;
  }>;
}) {
  const { eventId } = await params;
  const search = await searchParams;
  const q = new URLSearchParams(search).toString();
  redirect(`/events/${eventId}/dashboard${q ? `?${q}` : ""}`);
}
