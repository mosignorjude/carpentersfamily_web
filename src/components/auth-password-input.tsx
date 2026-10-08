"use client";

import { type InputHTMLAttributes, useState } from "react";

type AuthPasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

export default function AuthPasswordInput(props: AuthPasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="auth-password-input">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="auth-password-toggle"
        onClick={() => setVisible((current) => !current)}
        title={visible ? "Hide password" : "Show password"}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M2.25 12s3.5-6.25 9.75-6.25S21.75 12 21.75 12 18.25 18.25 12 18.25 2.25 12 2.25 12Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          {visible ? (
            <>
              <circle
                cx="12"
                cy="12"
                r="2.75"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="m4 4 16 16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </>
          ) : (
            <circle
              cx="12"
              cy="12"
              r="2.75"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          )}
        </svg>
      </button>
    </span>
  );
}
