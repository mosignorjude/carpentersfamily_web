import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
const storefront = fs.readFileSync(
  "src/components/tickets/tickets-storefront-view.tsx",
  "utf8",
);
const ribbon = fs.readFileSync(
  "src/components/landing/landing-ribbon.tsx",
  "utf8",
);

/** The markup between the opening <header> and its close. */
function headerBlock(src) {
  const start = src.indexOf("<header");
  const end = src.indexOf("</header>");
  assert.ok(start !== -1 && end > start, "no header element found");
  return src.slice(start, end);
}

test("the landing header keeps a member door visible on phones", () => {
  const header = headerBlock(nav);
  const portalLinks =
    header.match(
      /href="\/portal"[^>]*|className="[^"]*"[^>]*href="\/portal"/g,
    ) ?? [];
  assert.ok(
    portalLinks.length >= 2,
    "expected a desktop portal link and a separate mobile-only one",
  );
  const mobile = portalLinks.find((tag) => /md:hidden/.test(tag));
  assert.ok(
    mobile,
    "no md:hidden Member Portal link — members have to open the drawer to sign in",
  );
  assert.match(mobile, /min-h-\[(4[4-9]|[5-9]\d)px\]/, "below the 44px floor");
});

test("the mobile member link still reads Member Portal", () => {
  const header = headerBlock(nav);
  const mobile = header.split(/md:hidden/)[1] ?? "";
  assert.match(
    mobile,
    /Member Portal/,
    "the label must not be abbreviated to Portal",
  );
});

test("the tickets header cannot be pushed off by the domain echo", () => {
  const header = headerBlock(storefront);
  const at = header.indexOf("carpentersfamily.com.ng/tickets");
  assert.ok(at !== -1, "the header no longer echoes the box office address");
  const before = header.slice(Math.max(0, at - 200), at);
  assert.match(
    before,
    /hidden sm:inline/,
    "on a phone the long address line must collapse so the member button stays on screen",
  );
});

test("the member button on /tickets is never mobile-hidden", () => {
  const header = headerBlock(storefront);
  assert.ok(
    !/md:hidden/.test(header),
    "the tickets header hides a control on mobile",
  );
  assert.match(header, /Member Portal|Member Sign In/);
});

test("the public surfaces say Tickets / Reservations, never RSVP", () => {
  assert.match(ribbon, /Tickets \/ Reservations/);
  assert.ok(!/RSVP/i.test(ribbon), "RSVP is retired copy");
});
