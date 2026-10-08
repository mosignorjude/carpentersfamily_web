import type { ReactNode } from "react";
import { clubBrand } from "@/lib/brand";

export function AuthBrand() {
  return (
    <div className="signin-brand">
      {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
      <img
        alt=""
        height={194}
        src="/brand/carpenters-family-mark.png"
        width={105}
      />
      <span>
        <strong>{clubBrand.shortName}</strong>
        <small>Social Club</small>
      </span>
    </div>
  );
}

function AuthPromotion() {
  return (
    <aside
      aria-labelledby="auth-promotion-heading"
      className="signin-promo-panel"
    >
      <div className="signin-promo-inner">
        <p className="signin-promo-kicker">WELCOME</p>
        <div className="signin-promo-artwork">
          {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
          <img
            alt="Illustration of a member completing online account setup at a computer."
            height={864}
            src="/brand/carpenters-family-auth-promo.jpg"
            width={1229}
          />
        </div>
        <div className="signin-promo-copy">
          <p className="signin-promo-eyebrow">Your private member portal</p>
          <h2 id="auth-promotion-heading">Keep the club connected.</h2>
          <p>
            Manage membership, dues, events, attendance, and club updates in one
            private place.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function AuthPageLayout({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: "signup";
}) {
  return (
    <main
      className={`signin-experience${variant ? ` ${variant}-experience` : ""}`}
    >
      <div className="signin-layout">
        <section className="signin-form-panel">{children}</section>
        <AuthPromotion />
      </div>
    </main>
  );
}
