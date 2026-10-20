import CommunicationsPage from "../communications-page";

export default function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <CommunicationsPage searchParams={searchParams} view="announcements" />
  );
}
