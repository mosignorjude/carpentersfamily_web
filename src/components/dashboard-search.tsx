"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClubIcon } from "@/components/club-icon";

type SearchItem = {
  category: string;
  href: string;
  label: string;
};

export default function DashboardSearch({
  announcements,
  events,
  navigation,
  id = "dashboard-search-input",
  autoFocus = false,
}: {
  announcements: { id: string; title: string }[];
  events: { id: string; title: string }[];
  navigation: { href: string; label: string }[];
  id?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const searchItems = useMemo<SearchItem[]>(
    () => [
      ...navigation.map((item) => ({
        category: "Page",
        href: item.href,
        label: item.label,
      })),
      ...events.map((event) => ({
        category: "Event",
        href: "/events",
        label: event.title,
      })),
      ...announcements.map((announcement) => ({
        category: "Announcement",
        href: "/announcements",
        label: announcement.title,
      })),
    ],
    [announcements, events, navigation],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = normalizedQuery
    ? searchItems
        .filter((item) =>
          `${item.category} ${item.label}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
        .slice(0, 6)
    : [];

  return (
    <div className="dashboard-search" ref={containerRef}>
      <ClubIcon className="dashboard-search-icon" name="search" />
      <label className="visually-hidden" htmlFor={id}>
        Search pages, events, announcements, and polls
      </label>
      <input
        autoComplete="off"
        // biome-ignore lint/a11y/noAutofocus: Autofocus is intentionally opt-in for user-toggled mobile search drawer
        autoFocus={autoFocus}
        id={id}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            setQuery("");
          }
        }}
        placeholder="Search pages, events, announcements, and polls…"
        type="search"
        value={query}
      />
      {normalizedQuery && isOpen ? (
        <div aria-live="polite" className="dashboard-search-results">
          {matches.length ? (
            <ul>
              {matches.map((item) => (
                <li key={`${item.category}:${item.href}:${item.label}`}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      setIsOpen(false);
                      setQuery("");
                    }}
                  >
                    <span>{item.category}</span>
                    <strong>{item.label}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No matching pages, events, announcements, or polls.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
