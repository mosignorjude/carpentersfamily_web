export interface MembershipRequestReceivedEmailProps {
  fullName: string;
  email: string;
}

export function renderMembershipRequestReceivedEmail({
  fullName,
}: MembershipRequestReceivedEmailProps): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Carpenters Family — Application Received";
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #3D291F; background-color: #FAF8F5; margin: 0; padding: 40px 20px;">
        <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E6DED6; padding: 40px;">
          <h1 style="font-size: 22px; color: #174C37; margin-top: 0;">Membership Application Received</h1>
          <p>Dear ${fullName},</p>
          <p>Thank you for expressing interest in joining <strong>Carpenters Family Social Club</strong>. Your application has been successfully received.</p>
          <p>Every prospective member is carefully reviewed by our <strong>Executive Committee</strong> to ensure alignment with club values, brotherhood, and collective welfare.</p>
          <p>If your application is approved, you will receive a secure single-use invitation link with instructions to complete your registration.</p>
          <hr style="border: none; border-top: 1px solid #E6DED6; margin: 30px 0;" />
          <p style="font-size: 13px; color: #7A6B63; margin-bottom: 0;">Carpenters Family Social Club &middot; Discretion, Brotherhood, Excellence</p>
        </div>
      </body>
    </html>
  `;
  const text = `Dear ${fullName},\n\nThank you for expressing interest in joining Carpenters Family Social Club. Your application has been successfully received.\n\nEvery prospective member is carefully reviewed by our Executive Committee to ensure alignment with club values, brotherhood, and collective welfare.\n\nIf your application is approved, you will receive a secure single-use invitation link with instructions to complete your registration.\n\nCarpenters Family Social Club`;

  return { subject, html, text };
}
