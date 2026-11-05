import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SYSTEM_NOTICES } from "../src/lib/system-notices.ts";
import { rpcErrorNotice } from "../src/lib/rpc-error-notice.ts";

test("intake notices are registered in SYSTEM_NOTICES", () => {
  assert.ok(SYSTEM_NOTICES["membership-request-submitted"]);
  assert.ok(SYSTEM_NOTICES["partnership-enquiry-submitted"]);
  assert.ok(SYSTEM_NOTICES["request-already-pending"]);
  assert.ok(SYSTEM_NOTICES["invite-invalid"]);
  assert.ok(SYSTEM_NOTICES["invite-expired"]);
});

test("rpcErrorNotice maps duplicate intake requests to request-already-pending", () => {
  const notice = rpcErrorNotice(new Error("A pending membership request already exists for this email"));
  assert.equal(notice, "request-already-pending");
});

test("actions.ts exports submitMembershipRequestAction and submitPartnershipEnquiryAction", () => {
  const actionsContent = fs.readFileSync("src/app/actions.ts", "utf8");
  assert.match(actionsContent, /export\s+async\s+function\s+submitMembershipRequestAction/);
  assert.match(actionsContent, /export\s+async\s+function\s+submitPartnershipEnquiryAction/);
});
