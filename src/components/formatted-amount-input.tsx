"use client";

import {
  type ChangeEvent,
  type InputHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Formats a numeric string or number with thousands separators (e.g. 10000 -> 10,000).
 */
export function formatAmountValue(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const str = typeof value === "number" ? String(value) : String(value);
  const digits = str.replace(/\D/g, "");
  if (!digits) return "";
  const num = Number.parseInt(digits, 10);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(
    num,
  );
}

/**
 * Strips all non-digit characters to return a clean numeric string.
 */
export function parseAmountDigits(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}

export interface FormattedAmountInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "defaultValue"
  > {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onAmountChange?: (digits: string, formatted: string) => void;
}

export function FormattedAmountInput({
  value: controlledValue,
  defaultValue,
  onChange,
  onAmountChange,
  className = "",
  placeholder = "0",
  ...restProps
}: FormattedAmountInputProps) {
  const isControlled = controlledValue !== undefined;
  const inputRef = useRef<HTMLInputElement>(null);

  const [internalValue, setInternalValue] = useState<string>(() =>
    formatAmountValue(isControlled ? controlledValue : defaultValue),
  );

  useEffect(() => {
    if (isControlled) {
      setInternalValue(formatAmountValue(controlledValue));
    }
  }, [isControlled, controlledValue]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawInput = input.value;
    const selectionStart = input.selectionStart ?? rawInput.length;

    // Count how many digits are before the cursor before formatting
    const digitsBeforeCursor = rawInput
      .slice(0, selectionStart)
      .replace(/\D/g, "").length;

    const digits = parseAmountDigits(rawInput);
    const formatted = formatAmountValue(digits);

    if (!isControlled) {
      setInternalValue(formatted);
    }

    // Call callbacks
    onAmountChange?.(digits, formatted);

    if (onChange) {
      // Set the input's current value to formatted so standard event handlers read it
      e.target.value = formatted;
      onChange(e);
    }

    // Restore cursor position after formatting update
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let newCursor = 0;
      let digitCount = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          digitCount++;
        }
        if (digitCount === digitsBeforeCursor) {
          newCursor = i + 1;
          break;
        }
      }
      if (digitsBeforeCursor === 0) newCursor = 0;
      if (digitCount < digitsBeforeCursor) newCursor = formatted.length;
      inputRef.current.setSelectionRange(newCursor, newCursor);
    });
  };

  const displayValue = isControlled
    ? formatAmountValue(controlledValue)
    : internalValue;

  return (
    <input
      {...restProps}
      className={className}
      inputMode="numeric"
      onChange={handleChange}
      placeholder={placeholder}
      ref={inputRef}
      type="text"
      value={displayValue}
    />
  );
}

export default FormattedAmountInput;
