import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Issue 02: auth callback never sends welcome emails or misclassifies password recovery", () => {
  it("never calls notifyWelcomeIfActive inside /auth/callback/route.ts", async () => {
    const callbackSource = await readFile(
      new URL("../src/app/auth/callback/route.ts", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(
      callbackSource,
      /\bnotifyWelcomeIfActive\b/,
      "/auth/callback must not import or call notifyWelcomeIfActive (welcome emails belong strictly to approval)",
    );
  });

  it("gates pending registration receipt out of /reset-password recovery callbacks", async () => {
    const helper = await import("../src/lib/auth-callback.ts");

    assert.equal(
      helper.resolveAuthCallbackDestination("/reset-password"),
      "/reset-password",
    );
    assert.equal(
      helper.resolveAuthCallbackDestination("/portal"),
      "/portal",
    );
    assert.equal(
      helper.resolveAuthCallbackDestination(null),
      "/portal",
    );

    assert.equal(
      helper.shouldNotifyPendingRegistrationOnCallback({
        destination: "/reset-password",
        emailConfirmedAt: "2026-11-07T10:24:03Z",
      }),
      false,
      "password recovery callback must never trigger pending registration receipt",
    );

    assert.equal(
      helper.shouldNotifyPendingRegistrationOnCallback({
        destination: "/portal",
        emailConfirmedAt: "2026-11-07T10:24:03Z",
      }),
      true,
      "confirmed signup callback to /portal should check pending registration notice",
    );

    assert.equal(
      helper.shouldNotifyPendingRegistrationOnCallback({
        destination: "/portal",
        emailConfirmedAt: null,
      }),
      false,
      "unconfirmed callback must not trigger confirmed registration receipt",
    );

    const callbackSource = await readFile(
      new URL("../src/app/auth/callback/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      callbackSource,
      /shouldNotifyPendingRegistrationOnCallback/,
      "/auth/callback must use shouldNotifyPendingRegistrationOnCallback so recovery never runs signup receipt logic",
    );
  });
});
