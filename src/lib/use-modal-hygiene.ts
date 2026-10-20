"use client";

import { useEffect } from "react";

interface UseModalHygieneOptions {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Enterprise modal hygiene hook:
 * 1. Locks body scroll while modal is active, restoring on close/unmount.
 * 2. Catches keyboard `Escape` to dismiss modal cleanly.
 */
export function useModalHygiene({ isOpen, onClose }: UseModalHygieneOptions) {
  useEffect(() => {
    if (!isOpen) return;

    // 1. Lock document body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 2. Keyboard Escape listener
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);
}
