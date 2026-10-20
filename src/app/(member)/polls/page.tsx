import CommunicationsPage from "../communications-page";

export default function PollsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return <CommunicationsPage searchParams={searchParams} view="polls" />;
}
