"use client";

import type { FormEvent, FormHTMLAttributes, ReactNode } from "react";

type NativeFormField =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;
type ServerAction = (formData: FormData) => void | Promise<void>;

type AuthValidatedFormProps = Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "action" | "noValidate" | "onInput" | "onSubmit"
> & {
  action: ServerAction;
  children: ReactNode;
};

function isNativeFormField(
  target: EventTarget | null,
): target is NativeFormField {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function getErrorMessage(field: NativeFormField) {
  const isPassword =
    field instanceof HTMLInputElement && field.type === "password";
  if (
    field.required &&
    (!field.value || (!isPassword && !field.value.trim()))
  ) {
    return "Please fill in this field.";
  }

  if (
    field.validity.typeMismatch &&
    field instanceof HTMLInputElement &&
    field.type === "email"
  ) {
    return "Enter a valid email address.";
  }

  if (field.validity.tooShort && "minLength" in field) {
    return `Use at least ${field.minLength} characters.`;
  }

  if (field.validity.patternMismatch) {
    return field.dataset.errorMessage ?? "Check the format of this field.";
  }

  return field.validity.valid
    ? ""
    : field.validationMessage || "Check this field.";
}

function updateFieldFeedback(field: NativeFormField) {
  const label = field.closest("label");
  const error = label?.querySelector<HTMLElement>("[data-auth-error-copy]");
  if (!label || !error) return false;

  const message = getErrorMessage(field);
  if (message) {
    label.dataset.authInvalid = "true";
    field.setAttribute("aria-invalid", "true");
    error.textContent = message;
    return true;
  }

  delete label.dataset.authInvalid;
  field.removeAttribute("aria-invalid");
  error.textContent = "";
  return false;
}

export function AuthFieldError({ id }: { id: string }) {
  return (
    <span aria-live="polite" className="auth-field-error" id={id} role="alert">
      <svg
        aria-hidden="true"
        fill="none"
        height="17"
        viewBox="0 0 20 20"
        width="17"
      >
        <circle
          cx="10"
          cy="10"
          r="7.2"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M10 6.3v4.1m0 3.1h.01"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <span data-auth-error-copy="" />
    </span>
  );
}

export default function AuthValidatedForm({
  action,
  children,
  ...props
}: AuthValidatedFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    form.dataset.authValidationAttempted = "true";

    const fields = Array.from(
      form.querySelectorAll<NativeFormField>(
        "input[required], select[required], textarea[required]",
      ),
    );
    const invalidFields = fields.filter(updateFieldFeedback);

    if (invalidFields.length > 0) {
      event.preventDefault();
      invalidFields[0]?.focus();
    }
  }

  function handleInput(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (
      form.dataset.authValidationAttempted === "true" &&
      isNativeFormField(event.target) &&
      event.target.form === form
    ) {
      updateFieldFeedback(event.target);
    }
  }

  return (
    <form
      {...props}
      action={action}
      noValidate
      onInput={handleInput}
      onSubmit={handleSubmit}
    >
      {children}
    </form>
  );
}
