import type { ReactNode } from "react";
import { ClubIcon } from "@/components/club-icon";
import { clubBrand } from "@/lib/brand";

export function AuthBrand({
  inverse = false,
  showText = false,
}: {
  inverse?: boolean;
  showText?: boolean;
}) {
  return (
    <div className={`signin-brand${inverse ? " signin-brand-inverse" : ""}`}>
      {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
      <img
        alt={clubBrand.name}
        height={194}
        src={clubBrand.logoSrc}
        width={105}
      />
      {showText && (
        <span>
          <strong>{clubBrand.shortName}</strong>
          <small>{clubBrand.slogan}</small>
        </span>
      )}
    </div>
  );
}

type AuthPageVariant =
  | "signin"
  | "signup"
  | "forgot-password"
  | "reset-password";

type AuthHeroCopy = {
  heading: string;
  emphasis: string;
  description: string;
};

const authHeroCopy: Record<AuthPageVariant, AuthHeroCopy> = {
  signin: {
    heading: "Welcome Back,",
    emphasis: "Good to See You Again.",
    description:
      "Stay connected with your family, track dues and updates, and be part of what’s next.",
  },
  signup: {
    heading: "A Family Built",
    emphasis: "Together.",
    description:
      "Request access to the Carpenters Family community and stay close to members, events, and club updates.",
  },
  "forgot-password": {
    heading: "Let’s Get You",
    emphasis: "Back In.",
    description:
      "Request a secure password reset to regain access to your Carpenters Family account.",
  },
  "reset-password": {
    heading: "Secure Your",
    emphasis: "Account.",
    description:
      "Choose a new password to protect your member account and continue using the portal.",
  },
};

function AuthPhotoPanel({ variant }: { variant: AuthPageVariant }) {
  const copy = authHeroCopy[variant];
  return (
    <aside aria-labelledby="auth-hero-heading" className="auth-hero-panel">
      {/* biome-ignore lint/performance/noImgElement: CSS positioning avoids Next/Image inline styles blocked by the production CSP. */}
      <img
        alt=""
        aria-hidden="true"
        className="signin-hero-image"
        decoding="async"
        fetchPriority="high"
        height={1024}
        src={clubBrand.eventHeroSrc}
        width={1536}
      />
      <div aria-hidden="true" className="signin-hero-shade" />
      <div className="signin-hero-content">
        <div>
          <AuthBrand inverse showText />
          <div className="signin-hero-message">
            <h2 id="auth-hero-heading">
              {copy.heading}
              <span>{copy.emphasis}</span>
            </h2>
            <p>{copy.description}</p>
          </div>
        </div>
        <ul
          aria-label="Member portal features"
          className="signin-hero-features"
        >
          <li>
            <ClubIcon name="calendar" />
            <span>Events &amp; Ticketing</span>
          </li>
          <li>
            <ClubIcon name="users" />
            <span>Members &amp; Community</span>
          </li>
          <li>
            <ClubIcon name="wallet" />
            <span>Finances &amp; Dues</span>
          </li>
          <li>
            <ClubIcon name="megaphone" />
            <span>Updates &amp; Announcements</span>
          </li>
        </ul>
      </div>
    </aside>
  );
}

export function AuthPageLayout({
  children,
  variant = "signin",
}: {
  children: ReactNode;
  variant?: AuthPageVariant;
}) {
  return (
    <main className={`signin-experience signin-experience-${variant}`}>
      <div className={`signin-layout signin-layout-${variant}`}>
        <section className="signin-form-panel">{children}</section>
        <AuthPhotoPanel variant={variant} />
      </div>
    </main>
  );
}
