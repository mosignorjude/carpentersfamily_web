import assert from "node:assert/strict";
import test from "node:test";
import { parseExecutiveRoleRequest } from "../src/lib/executive-role-request.mjs";

const memberId = "00000000-0000-4000-8000-000000000001";

function validRequest(overrides = {}) {
  const formData = new FormData();
  const values = {
    operation: "grant",
    member_id: memberId,
    role: "executive",
    reason: "Approved by the board",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    formData.append(key, value);
  }
  return formData;
}

test("accepts only a reasoned grant/revoke request for the Executive role", () => {
  assert.deepEqual(parseExecutiveRoleRequest(validRequest()), {
    operation: "grant",
    memberId,
    reason: "Approved by the board",
  });
  assert.deepEqual(
    parseExecutiveRoleRequest(
      validRequest({ operation: "revoke", reason: "Term ended" }),
    ),
    { operation: "revoke", memberId, reason: "Term ended" },
  );
});

test("rejects Admin and Backup Admin role tampering", () => {
  for (const role of ["admin", "backup_admin", "member", "Executive"]) {
    assert.equal(parseExecutiveRoleRequest(validRequest({ role })), null, role);
  }
});

test("rejects unknown fields, duplicate fields, and missing fields", () => {
  const unexpected = validRequest();
  unexpected.append("is_admin", "true");
  assert.equal(parseExecutiveRoleRequest(unexpected), null);

  const duplicated = validRequest();
  duplicated.append("role", "admin");
  assert.equal(parseExecutiveRoleRequest(duplicated), null);

  const missing = validRequest();
  missing.delete("reason");
  assert.equal(parseExecutiveRoleRequest(missing), null);
});

test("rejects invalid operation, member ID, empty/long/control-character reasons", () => {
  assert.equal(
    parseExecutiveRoleRequest(validRequest({ operation: "grant_admin" })),
    null,
  );
  assert.equal(
    parseExecutiveRoleRequest(validRequest({ member_id: "another-member" })),
    null,
  );
  assert.equal(parseExecutiveRoleRequest(validRequest({ reason: "  " })), null);
  assert.equal(parseExecutiveRoleRequest(validRequest({ reason: "x".repeat(501) })), null);
  assert.equal(
    parseExecutiveRoleRequest(validRequest({ reason: "Change\nrole" })),
    null,
  );
});
