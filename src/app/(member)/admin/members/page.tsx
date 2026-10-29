import { redirect } from "next/navigation";

export default function LegacyAdminMembersPage() {
  redirect("/officers/members");
}
