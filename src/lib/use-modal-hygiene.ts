"use client";

import { type RefObject, useEffect, useRef } from "react";

interface UseModalHygieneOptions {
  isOpen: boolean;
  onClose: () => void;
  dialogRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([aria-hidden="true"]), ' +
  'input:not([disabled]):not([type="hidden"]), ' +
  "select:not([disabled]), " +
  "textarea:not([disabled]), " +
  "a[href], " +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Enterprise modal hygiene hook:
 * 1. Locks body scroll while modal is active, restoring on close/unmount.
 * 2. Catches keyboard `Escape` to dismiss modal cleanly.
 * 3. Traps Tab and Shift+Tab keyboard focus within the modal container.
 * 4. Places initial focus inside the modal on open.
 * 5. Returns focus to the original trigger element on dismiss.
 */
export function useModalHygiene({
  isOpen,
  onClose,
  dialogRef,
}: UseModalHygieneOptions) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Remember previously focused element to return focus on close
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // 2. Lock document body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 3. Move initial focus into the dialog
    const getTargetContainer = (): HTMLElement | null =>
      dialogRef?.current ||
      (document.querySelector(
        '[role="dialog"][aria-modal="true"]',
      ) as HTMLElement | null);

    const focusTimer = setTimeout(() => {
      const targetContainer = getTargetContainer();
      if (targetContainer) {
        const focusableElements =
          targetContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusableElements.length > 0) {
          const firstInteractive = Array.from(focusableElements).find(
            (el) =>
              !el.classList.contains("fixed") &&
              !el.getAttribute("aria-label")?.toLowerCase().includes("overlay"),
          );
          (firstInteractive || focusableElements[0]).focus();
        } else {
          targetContainer.focus();
        }
      }
    }, 50);

    // 4. Keyboard Listener: Escape & Focus Trap (Tab / Shift+Tab)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === "Tab") {
        const container = getTargetContainer();
        if (!container) return;

        const focusable = Array.from(
          container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter(
          (el) =>
            el.offsetParent !== null &&
            !el.getAttribute("aria-label")?.toLowerCase().includes("overlay"),
        );

        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (event.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !container.contains(document.activeElement)
          ) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !container.contains(document.activeElement)
          ) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      // Restore focus to trigger element
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === "function"
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose, dialogRef]);
}
