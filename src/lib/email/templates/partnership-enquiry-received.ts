export interface PartnershipEnquiryReceivedEmailProps {
  contactName: string;
  organizationName: string;
}

export function renderPartnershipEnquiryReceivedEmail({
  contactName,
  organizationName,
}: PartnershipEnquiryReceivedEmailProps): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Carpenters Family — Partnership Enquiry Received";
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #3D291F; background-color: #FAF8F5; margin: 0; padding: 40px 20px;">
        <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E6DED6; padding: 40px;">
          <h1 style="font-size: 22px; color: #174C37; margin-top: 0;">Partnership Proposal Received</h1>
          <p>Dear ${contactName},</p>
          <p>Thank you for submitting a partnership enquiry on behalf of <strong>${organizationName}</strong>.</p>
          <p>A club representative will review your proposal and respond promptly to discuss collaboration opportunities.</p>
          <hr style="border: none; border-top: 1px solid #E6DED6; margin: 30px 0;" />
          <p style="font-size: 13px; color: #7A6B63; margin-bottom: 0;">Carpenters Family Social Club &middot; Corporate Partnerships</p>
        </div>
      </body>
    </html>
  `;
  const text = `Dear ${contactName},\n\nThank you for submitting a partnership enquiry on behalf of ${organizationName}.\n\nA club representative will review your proposal and respond promptly to discuss collaboration opportunities.\n\nCarpenters Family Social Club`;

  return { subject, html, text };
}
