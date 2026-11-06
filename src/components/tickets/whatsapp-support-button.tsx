"use client";

export function WhatsAppSupportButton() {
  const phone = "2348145751584";
  const message = encodeURIComponent(
    "Hello Carpenters Family Social Club, I need support with my ticket order.",
  );
  const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

  return (
    <aside
      aria-label="WhatsApp Support"
      className="fixed bottom-5 right-5 z-50 pointer-events-auto"
    >
      <a
        aria-label="Contact support on WhatsApp"
        className="min-h-[48px] px-4 py-2.5 rounded-full bg-forest hover:bg-deep-forest-hover text-white border border-ochre/40 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all inline-flex items-center gap-2.5 no-underline font-semibold text-xs sm:text-sm"
        href={whatsappUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span className="w-7 h-7 rounded-full bg-emerald-500 text-white grid place-items-center shrink-0">
          <svg
            aria-hidden="true"
            className="w-4 h-4 fill-current"
            viewBox="0 0 24 24"
          >
            <path d="M19.05 4.91A9.816 9.816 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01Zm-7.01 15.24c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.17-.48-.29Z" />
          </svg>
        </span>
        <span>Contact Support</span>
      </a>
    </aside>
  );
}
