export interface UserProfileData {
  fullName: string;
  username: string;
  role: string;
}

export function formatPrimaryRole(roleList: string[]): string {
  if (roleList.includes("admin")) return "ADMIN";
  if (roleList.includes("backup_admin")) return "BACKUP ADMIN";
  if (roleList.includes("executive")) return "EXECUTIVE";
  if (roleList.includes("lead")) return "EVENT LEAD";
  if (roleList.includes("assistant")) return "EVENT ASSISTANT";
  if (roleList.includes("committee")) return "COMMITTEE";
  return "MEMBER";
}
