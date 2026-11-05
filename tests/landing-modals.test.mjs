import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("membership intake modal renders form fields and submits to action", () => {
  const content = fs.readFileSync("src/components/landing/membership-intake-modal.tsx", "utf8");
  assert.match(content, /name="full_name"/);
  assert.match(content, /name="email"/);
  assert.match(content, /name="phone"/);
  assert.match(content, /name="profession"/);
  assert.match(content, /name="reason_for_joining"/);
  assert.match(content, /submitMembershipRequestAction/);
});

test("partnership enquiry modal renders form fields and submits to action", () => {
  const content = fs.readFileSync("src/components/landing/partnership-enquiry-modal.tsx", "utf8");
  assert.match(content, /name="contact_name"/);
  assert.match(content, /name="organization_name"/);
  assert.match(content, /name="email"/);
  assert.match(content, /name="phone"/);
  assert.match(content, /name="enquiry_type"/);
  assert.match(content, /name="message"/);
  assert.match(content, /submitPartnershipEnquiryAction/);
});

test("constitution modal omits 60/40 profit sharing mention", () => {
  const content = fs.readFileSync("src/components/landing/constitution-modal.tsx", "utf8");
  assert.doesNotMatch(content, /60%\s*\/\s*40%/);
  assert.doesNotMatch(content, /profit.?sharing/i);
});
