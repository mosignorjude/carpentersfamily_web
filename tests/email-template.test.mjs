import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  DEFAULT_FROM_EMAIL,
  DEFAULT_PRODUCTION_SITE_URL,
  DEFAULT_REPLY_TO_EMAIL,
  extractEmailAddress,
  getEmailLogoUrl,
  isContactRecipient,
} from "../src/lib/email/config.ts";

test("getEmailLogoUrl resolves to a public HTTPS circular avatar asset", () => {
  const prevEnv = process.env.NEXT_PUBLIC_SITE_URL;

  try {
    // 1. Local development fallback to production domain for email clients
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3000";
    assert.equal(
      getEmailLogoUrl(),
      `${DEFAULT_PRODUCTION_SITE_URL}/brand/email-avatar.png`,
    );

    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    assert.equal(
      getEmailLogoUrl(),
      `${DEFAULT_PRODUCTION_SITE_URL}/brand/email-avatar.png`,
    );

    // 2. Production domain configuration
    process.env.NEXT_PUBLIC_SITE_URL = "https://carpentersfamily.com.ng";
    assert.equal(
      getEmailLogoUrl(),
      "https://carpentersfamily.com.ng/brand/email-avatar.png",
    );

    // 3. Staging/Custom domain configuration
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.carpentersfamily.com.ng/";
    assert.equal(
      getEmailLogoUrl(),
      "https://staging.carpentersfamily.com.ng/brand/email-avatar.png",
    );
  } finally {
    process.env.NEXT_PUBLIC_SITE_URL = prevEnv;
  }
});

test("email avatar assets exist on disk with valid 512x512 circular dimensions", () => {
  const pngPath = "public/brand/email-avatar.png";
  const svgPath = "public/brand/email-avatar.svg";

  assert.equal(fs.existsSync(pngPath), true, "email-avatar.png must exist");
  assert.equal(fs.existsSync(svgPath), true, "email-avatar.svg must exist");

  const pngBuf = fs.readFileSync(pngPath);
  assert.equal(pngBuf.readUInt32BE(0), 0x89504e47, "Must have PNG signature");
  assert.equal(pngBuf.readUInt32BE(16), 512, "Width must be 512");
  assert.equal(pngBuf.readUInt32BE(20), 512, "Height must be 512");

  const svgContent = fs.readFileSync(svgPath, "utf8");
  assert.match(svgContent, /viewBox="0 0 512 512"/);
  assert.match(svgContent, /circle.*fill="#FFFFFF"/);
});

test("BaseEmailLayout renders circular white logo in header banner", () => {
  const layoutSource = fs.readFileSync(
    "src/lib/email/templates/base-layout.tsx",
    "utf8",
  );

  assert.match(
    layoutSource,
    /<Img[\s\S]*?src=\{getEmailLogoUrl\(\)\}/,
    "Email layout must render logo using getEmailLogoUrl()",
  );
  assert.match(
    layoutSource,
    /height="60"/,
    "Logo height must be explicitly set to 60 for email client compatibility",
  );
  assert.match(
    layoutSource,
    /width="60"/,
    "Logo width must be explicitly set to 60 for email client compatibility",
  );
  assert.match(
    layoutSource,
    /borderRadius:\s*"50%"/,
    "Logo styling must include circular border radius",
  );
  assert.match(
    layoutSource,
    /backgroundColor:\s*"#FFFFFF"/,
    "Logo styling must include white background fallback",
  );
});

test("email address extraction and contact recipient validation", () => {
  assert.equal(
    extractEmailAddress("Carpenters Family <info@mail.carpentersfamily.com.ng>"),
    "info@mail.carpentersfamily.com.ng",
  );
  assert.equal(
    extractEmailAddress("contact@mail.carpentersfamily.com.ng"),
    "contact@mail.carpentersfamily.com.ng",
  );

  assert.equal(
    isContactRecipient(["contact@mail.carpentersfamily.com.ng"]),
    true,
  );
  assert.equal(
    isContactRecipient(["info@mail.carpentersfamily.com.ng"]),
    false,
  );
});
