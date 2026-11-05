import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getSystemNotice } from "../src/lib/system-notices.ts";

// A rejected intake redirected to `/?notice=…&modal=…` and hoped the landing page
// would re-render the dialog with its message. It did not: Next treats those
// query variants as the route entry it already prefetched (the hero CTA links to
// `/?modal=membership`), so applying the cached payload rewrote the address and
// dropped the notice. The submitter saw a dialog that had swallowed their form
// with nothing to show for it.
// The refusal therefore travels back as action state, which no navigation can
// lose, and only the accepted submission keeps a URL round-trip — its notice is
// meant to outlive the dialog.
const INTAKES = [
  {
    action: "submitMembershipRequestAction",
    form: "MembershipIntakeForm",
    modal: "membership",
    file: "src/components/landing/membership-intake-modal.tsx",
    success: "membership-request-submitted",
  },
  {
    action: "submitPartnershipEnquiryAction",
    form: "PartnershipEnquiryForm",
    modal: "partnership",
    file: "src/components/landing/partnership-enquiry-modal.tsx",
    success: "partnership-enquiry-submitted",
  },
];

const actionsSource = readFileSync("src/app/actions.ts", "utf8");

function actionBody(name) {
  const start = actionsSource.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} has left src/app/actions.ts`);
  let depth = 0;
  for (
    let i = actionsSource.indexOf("{", start);
    i < actionsSource.length;
    i++
  ) {
    if (actionsSource[i] === "{") depth++;
    else if (actionsSource[i] === "}") {
      depth--;
      if (depth === 0) return actionsSource.slice(start, i + 1);
    }
  }
  throw new Error(`${name} is unbalanced`);
}

test("intake actions answer the dialog instead of redirecting it", () => {
  for (const intake of INTAKES) {
    const body = actionBody(intake.action);

    assert.match(
      body,
      new RegExp(
        `export async function ${intake.action}\\(\\s*_?prevState: IntakeRejection \\| null,\\s*formData: FormData,?\\s*\\)`,
      ),
      `${intake.action} must take the useActionState pair (prevState, formData)`,
    );

    const refusals = [...body.matchAll(/return intakeRejection\(/g)];
    assert.ok(
      refusals.length >= 3,
      `${intake.action} expected validation, configuration and RPC refusals, found ${refusals.length}`,
    );

    const destinations = [...body.matchAll(/["`]\/\?notice=[^"`]*["`]/g)].map(
      (m) => m[0],
    );
    assert.deepEqual(
      destinations,
      [`"/?notice=${intake.success}"`],
      `${intake.action}: only the accepted submission may still round-trip through the URL, and no failure may ask for modal=${intake.modal}`,
    );
  }
});

test("every notice an intake action can refuse with has real copy", () => {
  const keys = [
    ...actionsSource.matchAll(/intakeRejection\("([a-z0-9-]+)",/g),
  ].map((m) => m[1]);
  assert.ok(
    keys.length >= 2,
    `expected the literal intake refusals to be notice keys, found ${keys.length}`,
  );
  for (const key of keys) {
    assert.ok(
      getSystemNotice(key),
      `intakeRejection("${key}") would silently fall back: no SYSTEM_NOTICES entry`,
    );
  }

  // The RPC branch passes whatever code rpcErrorNotice derived, so every code it
  // can return has to resolve too — otherwise a database refusal becomes generic.
  const rules = readFileSync("src/lib/rpc-error-notice.ts", "utf8");
  const block = rules.slice(
    rules.indexOf("const MESSAGE_RULES"),
    rules.indexOf("\n];"),
  );
  const codes = [
    ...new Set([...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1])),
  ];
  assert.ok(codes.length > 10, "MESSAGE_RULES stopped being readable");
  for (const code of codes) {
    assert.ok(
      getSystemNotice(code),
      `rpcErrorNotice can return "${code}", which has no SYSTEM_NOTICES entry`,
    );
  }
});

test("the intake dialog renders the refusal its own action returned", () => {
  for (const intake of INTAKES) {
    const source = readFileSync(intake.file, "utf8");
    assert.match(
      source,
      /import \{[^}]*\buseActionState\b[^}]*\} from "react"/,
      `${intake.modal} modal must own its result through useActionState`,
    );
    assert.match(
      source,
      new RegExp(
        `useActionState(?:<[^(]*>)?\\(\\s*${intake.action},\\s*null,?\\s*\\)`,
      ),
      `${intake.modal} modal must wire ${intake.action} into useActionState`,
    );
    assert.match(
      source,
      /action=\{formAction\}/,
      `${intake.modal} form must submit through the stateful action`,
    );
    assert.match(
      source,
      /notice=\{state/,
      `${intake.modal} modal must show the returned refusal, not a URL-derived one`,
    );
    assert.doesNotMatch(
      source,
      /\bnotice=\{notice\}/,
      `${intake.modal} modal must stop taking its error from props`,
    );
  }
});

test("reopening a closed dialog does not resurrect a stale refusal", () => {
  for (const intake of INTAKES) {
    const source = readFileSync(intake.file, "utf8");
    const gate = source.slice(source.indexOf("export function "));
    const gateBody = gate.slice(0, gate.search(/^\}$/m) + 1);

    assert.match(
      gateBody,
      /if \(!isOpen\) return null;/,
      `${intake.modal} gate must unmount the dialog while closed`,
    );
    assert.doesNotMatch(
      gateBody,
      /useActionState/,
      `${intake.modal} gate must not hold the refusal — a mounted hook survives close and reopens with yesterday's copy`,
    );
    assert.match(
      gateBody,
      new RegExp(`<${intake.form}\\b`),
      `${intake.modal} gate must render ${intake.form} so each open starts fresh`,
    );
  }
});

test("the landing page hands intake errors to the action, not the modal", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  assert.match(
    page,
    /<LandingModals initialModal=\{params\.modal\} \/>/,
    "page.tsx must not feed a URL-derived notice into the intake dialogs",
  );

  const modals = readFileSync(
    "src/components/landing/landing-modals.tsx",
    "utf8",
  );
  assert.doesNotMatch(
    modals,
    /notice/,
    "LandingModals no longer has an intake notice to forward",
  );

  const shell = readFileSync("src/components/landing/modal-shell.tsx", "utf8");
  assert.match(
    shell,
    /role="alert"/,
    "ModalShell must expose its notice as an alert, not decoration",
  );
});

// React resets a form once its action settles, so a refusal that only carries a
// message silently wipes what the user typed. The rejection comes back with the
// draft, and every field wears it as its default value: after the reset the
// form reads exactly as it did before the submit.
test("a refusal returns the draft it rejected", () => {
  for (const intake of INTAKES) {
    const body = actionBody(intake.action);
    const echoed = [
      ...body.matchAll(/return intakeRejection\([^,]+, formData\)/g),
    ];
    const refusals = [...body.matchAll(/return intakeRejection\(/g)];
    assert.equal(
      echoed.length,
      refusals.length,
      `${intake.action}: ${refusals.length - echoed.length} refusal(s) return a message but no draft`,
    );

    const source = readFileSync(intake.file, "utf8");
    const fields = [...source.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]);
    assert.ok(
      fields.length >= 4,
      `${intake.modal} modal lost its named fields`,
    );
    for (const field of fields) {
      assert.ok(
        source.includes(`defaultValue={state?.values.${field}}`),
        `${intake.modal} drops the draft for ${field}, so a refusal costs the user their typing`,
      );
    }

    // React only reads a select's defaultValue when it mounts, so after the
    // reset the pick silently falls back to option 0. Remounting it on refusal
    // is what actually restores the chosen enquiry type.
    for (const block of source.matchAll(/<select\b[\s\S]*?>/g)) {
      const name = /name="([a-z_]+)"/.exec(block[0]);
      assert.ok(name, `${intake.modal} renders a select with no field name`);
      assert.ok(
        new RegExp(`key=\\{state\\?\\.values\\.${name[1]}`).test(block[0]),
        `${intake.modal}: the ${name[1]} select reverts to its first option after a refusal unless it remounts`,
      );
    }
  }
});
