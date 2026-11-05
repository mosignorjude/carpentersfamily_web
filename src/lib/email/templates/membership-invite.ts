export interface MembershipInviteEmailProps {
  email: string;
  token: string;
  siteUrl?: string;
}

export function renderMembershipInviteEmail({
  email,
  token,
  siteUrl = "https://carpentersfamily.com.ng",
}: MembershipInviteEmailProps): { subject: string; html: string; text: string } {
  const subject = "Your Invitation to Join Carpenters Family Social Club";
  const inviteUrl = `${siteUrl.replace(/\/+$/, "")}/signup?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #3D291F; background-color: #FAF8F5; margin: 0; padding: 40px 20px;">
        <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E6DED6; padding: 40px;">
          <h1 style="font-size: 22px; color: #174C37; margin-top: 0;">You're Invited to Carpenters Family</h1>
          <p>Hello,</p>
          <p>Following review by the Executive Committee, we are pleased to invite you to complete your registration as a member of <strong>Carpenters Family Social Club</strong>.</p>
          <p>This personal invitation is <strong>valid for 7 days</strong> and can be used once to create your official account.</p>
          <div style="margin: 32px 0; text-align: center;">
            <a href="${inviteUrl}" style="background-color: #174C37; color: #FFFFFF; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block;">
              Accept Invitation &amp; Register
            </a>
          </div>
          <p style="font-size: 13px; color: #7A6B63;">Or copy this link to your browser:<br /><a href="${inviteUrl}" style="color: #174C37; word-break: break-all;">${inviteUrl}</a></p>
          <hr style="border: none; border-top: 1px solid #E6DED6; margin: 30px 0;" />
          <p style="font-size: 13px; color: #7A6B63; margin-bottom: 0;">Carpenters Family Social Club &middot; By Invitation &amp; Vetted Merit</p>
        </div>
      </body>
    </html>
  `;
  const text = `You're Invited to Carpenters Family\n\nFollowing review by the Executive Committee, we are pleased to invite you to complete your registration as a member of Carpenters Family Social Club.\n\nThis personal invitation is valid for 7 days and can be used once to create your official account.\n\nAccept your invitation at: ${inviteUrl}\n\nCarpenters Family Social Club`;

  return { subject, html, text };
}
