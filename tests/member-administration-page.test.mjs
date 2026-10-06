import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getExecutiveRolePresentation,
  getMemberAdministrationCapabilities,
  getMemberLifecyclePresentation,
  getMemberStatusLabel,
} from "../src/lib/member-administration-presentation.mjs";

const page = readFileSync(
  new URL("../src/app/(member)/admin/members/page.tsx", import.meta.url),
  "utf8",
);
const lifecycleForm = readFileSync(
  new URL(
    "../src/app/(member)/admin/members/lifecycle-form.tsx",
    import.meta.url,
  ),
  "utf8",
);
const executiveRoleForm = readFileSync(
  new URL(
    "../src/app/(member)/admin/members/executive-role-form.tsx",
    import.meta.url,
  ),
  "utf8",
);
const serverActions = readFileSync(
  new URL("../src/app/actions.ts", import.meta.url),
  "utf8",
);

test("ordinary members and event roles cannot see member administration controls", () => {
  for (const role of ["member", "committee", "lead", "assistant"]) {
    assert.deepEqual(
      getMemberAdministrationCapabilities([role]),
      {
        canApprove: false,
        canManageStatus: false,
        canManageExecutiveRole: false,
      },
      role,
    );
  }
});

test("Executive can approve but cannot deactivate or reactivate members", () => {
  const capabilities = getMemberAdministrationCapabilities(["executive"]);
  assert.deepEqual(capabilities, {
    canApprove: true,
    canManageStatus: false,
    canManageExecutiveRole: false,
  });
  assert.equal(
    getMemberLifecyclePresentation("pending", true, capabilities).operation,
    "approve",
  );
  assert.equal(
    getMemberLifecyclePresentation("active", true, capabilities).operation,
    null,
  );
  assert.equal(
    getMemberLifecyclePresentation("deactivated", true, capabilities).operation,
    null,
  );
});

test("Admin and Backup Admin can approve and manage member status", () => {
  for (const role of ["admin", "backup_admin"]) {
    const capabilities = getMemberAdministrationCapabilities([role]);
    assert.deepEqual(capabilities, {
      canApprove: true,
      canManageStatus: true,
      canManageExecutiveRole: true,
    });
    assert.equal(
      getMemberLifecyclePresentation("pending", true, capabilities).operation,
      "approve",
    );
    assert.equal(
      getMemberLifecyclePresentation("active", true, capabilities).operation,
      "deactivate",
    );
    assert.deepEqual(
      getMemberLifecyclePresentation("active", true, capabilities, true),
      {
        operation: null,
        profileCompletionRequired: false,
        selfDeactivationBlocked: true,
      },
      `${role} cannot deactivate their own account`,
    );
    assert.equal(
      getMemberLifecyclePresentation("deactivated", true, capabilities)
        .operation,
      "reactivate",
    );
  }
});

test("failed role lookup grants no presentation capabilities", () => {
  assert.deepEqual(getMemberAdministrationCapabilities(["admin"], true), {
    canApprove: false,
    canManageStatus: false,
    canManageExecutiveRole: false,
  });
});

test("only Admin and Backup Admin can grant or remove Executive status", () => {
  for (const role of ["admin", "backup_admin"]) {
    const capabilities = getMemberAdministrationCapabilities([role]);
    assert.equal(
      getExecutiveRolePresentation("active", false, capabilities),
      "grant",
    );
    assert.equal(
      getExecutiveRolePresentation("active", true, capabilities),
      "revoke",
    );
    assert.equal(
      getExecutiveRolePresentation("pending", false, capabilities),
      null,
    );
    assert.equal(
      getExecutiveRolePresentation("deactivated", true, capabilities),
      null,
    );
  }

  for (const role of ["member", "committee", "lead", "assistant", "executive"]) {
    assert.equal(
      getExecutiveRolePresentation(
        "active",
        false,
        getMemberAdministrationCapabilities([role]),
      ),
      null,
      role,
    );
  }
});

test("failed Executive assignment lookup withholds both grant and revoke controls", () => {
  const admin = getMemberAdministrationCapabilities(["admin"]);
  assert.equal(
    getExecutiveRolePresentation("active", false, admin, true),
    null,
  );
  assert.equal(
    getExecutiveRolePresentation("active", true, admin, true),
    null,
  );
});

test("incomplete pending profiles do not show approval controls", () => {
  const capabilities = getMemberAdministrationCapabilities(["executive"]);
  assert.deepEqual(
    getMemberLifecyclePresentation("pending", false, capabilities),
    {
      operation: null,
      profileCompletionRequired: true,
      selfDeactivationBlocked: false,
    },
  );
  assert.deepEqual(
    getMemberLifecyclePresentation("pending", false, {
      canApprove: false,
      canManageStatus: false,
    }),
    {
      operation: null,
      profileCompletionRequired: false,
      selfDeactivationBlocked: false,
    },
  );
});

test("unknown profile states use a safe label and expose no lifecycle action", () => {
  const admin = getMemberAdministrationCapabilities(["admin"]);
  assert.equal(getMemberStatusLabel("unexpected_status"), "Status unavailable");
  assert.equal(getMemberStatusLabel("toString"), "Status unavailable");
  assert.equal(getMemberStatusLabel("__proto__"), "Status unavailable");
  assert.equal(
    getMemberLifecyclePresentation("unexpected_status", true, admin).operation,
    null,
  );
});

test("the page authenticates, gates account state and role, and selects minimal member fields", () => {
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /ownProfile\?\.status !== "active"/);
  assert.match(page, /\.eq\("id", authData\.user\.id\)/);
  assert.match(page, /\.eq\("member_id", authData\.user\.id\)/);
  assert.match(page, /if \(roleError\)/);
  assert.match(page, /if \(!capabilities\.canApprove\)/);
  assert.match(page, /capabilities\.canManageExecutiveRole/);
  assert.match(page, /\.select\("member_id, role"\)/);
  assert.match(page, /executiveRoleLookupFailed/);
  assert.match(page, /member\.id === authData\.user\.id/);
  assert.match(page, /You cannot deactivate your own account/);
  assert.match(
    page,
    /\.select\("id, full_name, username, status, profile_completed_at"\)/,
  );
  assert.doesNotMatch(page, /\.select\([^\n]*email/i);
});

test("roster query failure withholds every member row and lifecycle form", () => {
  assert.match(
    page,
    /const members = membersError \? \[\] : \(memberRows \?\? \[\]\)/,
  );
  assert.match(page, /!membersError && members\.length > 0/);
  assert.match(page, /No member details or actions are\s*available/);
  assert.match(page, /href="\/admin\/members">Try again/);
});

test("member names and usernames render as React text without unsafe HTML", () => {
  assert.match(page, /\{member\.full_name\}/);
  assert.match(page, /\{member\.username\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|\binnerHTML\s*=/i);
});

test("lifecycle forms require an audit reason and confirm the selected operation", () => {
  assert.match(lifecycleForm, /action=\{memberLifecycleAction\}/);
  assert.match(lifecycleForm, /window\.confirm\(confirmation\)/);
  assert.match(lifecycleForm, /name="reason"/);
  assert.match(lifecycleForm, /maxLength=\{500\}/);
  assert.match(lifecycleForm, /required/);
  assert.match(lifecycleForm, /aria-describedby=/);
  assert.match(lifecycleForm, /confirmed email/);
});

test("Executive role controls are reasoned, confirmed, and hard-coded to Executive", () => {
  assert.match(executiveRoleForm, /action=\{executiveRoleAction\}/);
  assert.match(executiveRoleForm, /window\.confirm\(confirmation\)/);
  assert.match(executiveRoleForm, /name="role" type="hidden" value="executive"/);
  assert.match(executiveRoleForm, /name="reason"/);
  assert.match(executiveRoleForm, /maxLength=\{500\}/);
  assert.match(executiveRoleForm, /required/);
  assert.match(executiveRoleForm, /aria-describedby=/);
});

test("server action still independently validates identity, role, target ID, reason, and database RPC", () => {
  const action = serverActions.slice(
    serverActions.indexOf("export async function memberLifecycleAction"),
  );
  assert.match(action, /supabase\.auth\.getUser\(\)/);
  assert.match(action, /profile\?\.status !== "active"/);
  assert.match(action, /uuidPattern\.test\(memberId\)/);
  assert.match(
    action,
    /const allowed = operation === "approve" \? canApprove : canManageStatus/,
  );
  assert.match(action, /p_member_id: memberId/);
  assert.match(action, /p_reason: reason/);
});

test("Executive role Server Action independently checks actor and uses only fixed Executive RPC calls", () => {
  const action = serverActions.slice(
    serverActions.indexOf("export async function executiveRoleAction"),
    serverActions.indexOf("export async function signOutAction"),
  );
  assert.match(action, /parseExecutiveRoleRequest\(formData\)/);
  assert.match(action, /supabase\.auth\.getUser\(\)/);
  assert.match(action, /profile\?\.status !== "active"/);
  assert.match(action, /.eq\("member_id", authData\.user\.id\)/);
  assert.match(action, /roles\.has\("admin"\)/);
  assert.match(action, /roles\.has\("backup_admin"\)/);
  assert.match(action, /"grant_club_role" : "revoke_club_role"/);
  assert.match(action, /p_role: "executive"/);
  assert.match(action, /p_member_id: request\.memberId/);
  assert.match(action, /p_reason: request\.reason/);
  assert.doesNotMatch(action, /service_role|SERVICE_ROLE/);
});

test("query notices are allowlisted and prototype-like values are ignored", () => {
  assert.match(page, /Object\.hasOwn\(notices, params\.notice\)/);
  assert.match(
    page,
    /params\.notice && Object\.hasOwn\(notices, params\.notice\)/,
  );
});
