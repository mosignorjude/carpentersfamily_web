export type ClubIconName =
  | "activity"
  | "arrow-right"
  | "bell"
  | "calendar"
  | "chart"
  | "check-circle"
  | "chevron-down"
  | "clock"
  | "file"
  | "home"
  | "lock"
  | "mail"
  | "megaphone"
  | "poll"
  | "search"
  | "settings"
  | "ticket"
  | "users"
  | "wallet";

export function ClubIcon({
  className,
  name,
}: {
  className?: string;
  name: ClubIconName;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {name === "activity" ? <path d="M3 12h4l2.2-6 4.2 12 2.3-6H21" /> : null}
      {name === "arrow-right" ? <path d="M5 12h14m-6-6 6 6-6 6" /> : null}
      {name === "bell" ? (
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" />
      ) : null}
      {name === "calendar" ? (
        <>
          <rect height="17" rx="2" width="18" x="3" y="5" />
          <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01" />
        </>
      ) : null}
      {name === "chart" ? (
        <path d="M4 20V11m5 9V5m5 15v-7m5 7V8M2 20h20" />
      ) : null}
      {name === "check-circle" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      ) : null}
      {name === "chevron-down" ? <path d="m6 9 6 6 6-6" /> : null}
      {name === "clock" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </>
      ) : null}
      {name === "file" ? (
        <>
          <path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5M8 13h8M8 17h8" />
        </>
      ) : null}
      {name === "home" ? (
        <path d="m3 10 9-7 9 7M5 9v11h14V9m-9 11v-6h4v6" />
      ) : null}
      {name === "lock" ? (
        <>
          <rect height="11" rx="2" width="16" x="4" y="10" />
          <path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" />
        </>
      ) : null}
      {name === "mail" ? (
        <>
          <rect height="14" rx="2" width="18" x="3" y="5" />
          <path d="m3 7 9 6 9-6" />
        </>
      ) : null}
      {name === "megaphone" ? (
        <>
          <path d="M3 10v4a2 2 0 0 0 2 2h2l10 4V4L7 8H5a2 2 0 0 0-2 2Z" />
          <path d="m7 16 2 5h3l-2-4m7-9a4 4 0 0 1 0 8" />
        </>
      ) : null}
      {name === "poll" ? (
        <>
          <rect height="17" rx="2" width="18" x="3" y="3.5" />
          <path d="M7 8h.01M10 8h7M7 12h.01M10 12h7M7 16h.01M10 16h7" />
        </>
      ) : null}
      {name === "search" ? (
        <>
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 5 5" />
        </>
      ) : null}
      {name === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="m19.4 15 .1.1 1.2.9-1.2 2.1-1.4-.6a7.8 7.8 0 0 1-1.8 1.1l-.2 1.5h-2.4l-.3-1.5a7.8 7.8 0 0 1-1.8-1.1l-1.4.6-1.2-2.1 1.2-.9a7 7 0 0 1 0-2.1l-1.2-.9 1.2-2.1 1.4.6a7.8 7.8 0 0 1 1.8-1.1l.3-1.5h2.4l.2 1.5a7.8 7.8 0 0 1 1.8 1.1l1.4-.6 1.2 2.1-1.2.9a7 7 0 0 1 0 2.1Z" />
        </>
      ) : null}
      {name === "ticket" ? (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" />
          <path d="M13 7v2m0 3v2m0 3v1" />
        </>
      ) : null}
      {name === "users" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-1.3a6 6 0 0 1 12 0V20m1-14.8a3 3 0 0 1 0 5.6M18 14a5 5 0 0 1 3 4.6V20" />
        </>
      ) : null}
      {name === "wallet" ? (
        <>
          <path d="M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13v3" />
          <path d="M15 13h6" />
          <circle cx="15.5" cy="13" r=".6" />
        </>
      ) : null}
    </svg>
  );
}
