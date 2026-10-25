import net from "node:net";
import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  render,
  Section,
  Text,
  toPlainText,
} from "@react-email/components";
import { Resend } from "resend";

if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function") {
  net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
}

const DEFAULT_FROM_EMAIL =
  "Carpenters Family <info@mail.carpentersfamily.com.ng>";
const DEFAULT_REPLY_TO_EMAIL = "contact@mail.carpentersfamily.com.ng";
const DEFAULT_FORWARD_TO_EMAIL = "carpentersfamily001@gmail.com";

const apiKey = process.env.RESEND_API_KEY?.trim();
const fromEmail =
  process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
const replyToEmail =
  process.env.RESEND_REPLY_TO_EMAIL?.trim() || DEFAULT_REPLY_TO_EMAIL;
const forwardToEmail =
  process.env.RESEND_FORWARD_TO_EMAIL?.trim() || DEFAULT_FORWARD_TO_EMAIL;
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://127.0.0.1:3000";

const recipientArg = process.argv[2]?.trim();
const targetEmail = recipientArg || forwardToEmail;

if (!apiKey) {
  console.error(
    "\n[Error] RESEND_API_KEY is missing in your environment (.env.local).",
  );
  console.error(
    "Add RESEND_API_KEY=re_... to .env.local, then run:\n  npm run email:test\n",
  );
  process.exit(1);
}

const h = React.createElement;
const sentAtIso = new Date().toISOString();

const emailElement = h(
  Html,
  { lang: "en" },
  h(Head, null),
  h(Preview, null, "Carpenters Family email delivery verification"),
  h(
    Body,
    {
      style: {
        backgroundColor: "#FAF6F0",
        fontFamily:
          '"DM Sans", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        margin: "0",
        padding: "32px 16px",
        color: "#3D291F",
      },
    },
    h(
      Container,
      {
        style: {
          maxWidth: "580px",
          margin: "0 auto",
          backgroundColor: "#FFFFFF",
          borderRadius: "12px",
          border: "1px solid #E5DDD3",
          overflow: "hidden",
        },
      },
      h(
        Section,
        {
          style: {
            backgroundColor: "#0C3325",
            padding: "28px 32px 24px",
          },
        },
        h(Img, {
          src: `${siteUrl.includes("127.0.0.1") || siteUrl.includes("localhost") ? "https://carpentersfamily.com.ng" : siteUrl.replace(/\/+$/, "")}/brand/email-avatar.png`,
          width: "60",
          height: "60",
          alt: "Carpenters Family Social Club",
          style: {
            display: "block",
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            backgroundColor: "#FFFFFF",
            margin: "0 0 14px",
            border: "0",
          },
        }),
        h(
          Text,
          {
            style: {
              color: "#D6A23A",
              fontSize: "12px",
              fontWeight: "700",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 6px",
            },
          },
          "System Verification",
        ),
        h(
          Heading,
          {
            as: "h1",
            style: {
              color: "#FFFFFF",
              fontSize: "22px",
              fontWeight: "700",
              lineHeight: "1.3",
              margin: "0 0 4px",
            },
          },
          "Carpenters Family Social Club",
        ),
        h(
          Text,
          {
            style: {
              color: "#FAF6F0",
              fontSize: "13px",
              margin: "0",
              opacity: 0.85,
            },
          },
          "One Family, Endless Vibes.",
        ),
      ),
      h(Section, {
        style: { height: "4px", backgroundColor: "#D6A23A", width: "100%" },
      }),
      h(
        Section,
        { style: { padding: "32px" } },
        h(
          Heading,
          {
            as: "h2",
            style: {
              color: "#3D291F",
              fontSize: "20px",
              fontWeight: "700",
              lineHeight: "1.35",
              margin: "0 0 16px",
            },
          },
          "Resend Email Integration is Active",
        ),
        h(
          Text,
          {
            style: {
              color: "#3D291F",
              fontSize: "15px",
              lineHeight: "1.6",
              margin: "0 0 20px",
            },
          },
          "Hello, this test confirms that outbound notifications from the Carpenters Family Social Club portal are properly configured and delivering through Resend.",
        ),
        h(
          Section,
          {
            style: {
              backgroundColor: "#FAF6F0",
              border: "1px solid #E5DDD3",
              borderRadius: "10px",
              padding: "16px 20px",
              margin: "0 0 24px",
            },
          },
          h(
            Text,
            {
              style: {
                color: "#174C37",
                fontSize: "13px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "0 0 10px",
              },
            },
            "Active Routing Summary",
          ),
          h(
            Text,
            { style: { fontSize: "13px", margin: "0 0 6px" } },
            `From (Notifications): ${fromEmail}`,
          ),
          h(
            Text,
            { style: { fontSize: "13px", margin: "0 0 6px" } },
            `Reply-To (Club Contact): ${replyToEmail}`,
          ),
          h(
            Text,
            { style: { fontSize: "13px", margin: "0 0 6px" } },
            `Contact Redirect Inbox: ${forwardToEmail}`,
          ),
          h(
            Text,
            { style: { fontSize: "13px", margin: "0 0 6px" } },
            `Delivered To: ${targetEmail}`,
          ),
          h(
            Text,
            { style: { fontSize: "13px", margin: "0" } },
            `Timestamp (UTC): ${sentAtIso}`,
          ),
        ),
        h(
          Button,
          {
            href: siteUrl,
            style: {
              backgroundColor: "#174C37",
              borderRadius: "10px",
              color: "#FFFFFF",
              display: "inline-block",
              fontSize: "14px",
              fontWeight: "600",
              padding: "14px 24px",
              textDecoration: "none",
            },
          },
          "Open Member Portal",
        ),
      ),
      h(
        Section,
        {
          style: {
            backgroundColor: "#FAF6F0",
            padding: "20px 32px 28px",
            borderTop: "1px solid #E5DDD3",
          },
        },
        h(Hr, { style: { borderColor: "#E5DDD3", margin: "12px 0" } }),
        h(
          Text,
          { style: { color: "#6E584C", fontSize: "12px", margin: "0 0 4px" } },
          "Carpenters Family Social Club · Asaba, Delta State",
        ),
        h(
          Text,
          { style: { color: "#6E584C", fontSize: "12px", margin: "0" } },
          "Questions or inquiries? Reply to this email or write to ",
          h(
            Link,
            {
              href: `mailto:${replyToEmail}`,
              style: { color: "#174C37", fontWeight: "600" },
            },
            replyToEmail,
          ),
          ".",
        ),
      ),
    ),
  ),
);

const html = await render(emailElement);
const text = toPlainText(html);

const resend = new Resend(apiKey);

console.log(`Sending verification email via Resend...`);
console.log(`  From:     ${fromEmail}`);
console.log(`  Reply-To: ${replyToEmail}`);
console.log(`  To:       ${targetEmail}`);

const { data, error } = await resend.emails.send({
  from: fromEmail,
  to: targetEmail,
  replyTo: replyToEmail,
  subject: "Carpenters Family — Resend Email Verification",
  html,
  text,
  tags: [{ name: "category", value: "verification" }],
});

if (error) {
  console.error("\n[Resend Error]", error);
  process.exit(1);
}

console.log(`\n[Success] Verification email accepted by Resend!`);
console.log(`  Email ID: ${data?.id}`);
