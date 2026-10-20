"use client";

import { type ChangeEvent, useState } from "react";

type EventType = "meeting" | "party" | "other";

function FeatureCheckbox({
  name,
  children,
  disabled = false,
  checked,
  onChange,
}: {
  name: string;
  children: string;
  disabled?: boolean;
  checked?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="check-option">
      <input
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={onChange}
        type="checkbox"
        value="enabled"
      />
      {children}
    </label>
  );
}

export default function EventCreateOptions() {
  const [eventType, setEventType] = useState<EventType>("meeting");
  const [ticketingEnabled, setTicketingEnabled] = useState(false);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [incomeEnabled, setIncomeEnabled] = useState(false);
  const [expensesEnabled, setExpensesEnabled] = useState(false);

  return (
    <>
      <label>
        Event type
        <select
          name="event_type"
          onChange={(event) => setEventType(event.target.value as EventType)}
          required
          value={eventType}
        >
          <option value="meeting">Meeting</option>
          <option value="party">Party</option>
          <option value="other">Other</option>
        </select>
      </label>
      <fieldset className="feature-fieldset">
        <legend>Event features</legend>
        {eventType === "meeting" ? (
          <>
            <FeatureCheckbox name="minutes_enabled">
              Meeting minutes
            </FeatureCheckbox>
            <FeatureCheckbox name="attendance_enabled">
              Attendance
            </FeatureCheckbox>
          </>
        ) : eventType === "party" ? (
          <p className="muted">
            Budget, revenue, and expenses are enabled automatically for parties.
          </p>
        ) : (
          <>
            <FeatureCheckbox name="minutes_enabled">
              Meeting minutes
            </FeatureCheckbox>
            <FeatureCheckbox name="attendance_enabled">
              Attendance
            </FeatureCheckbox>
            <FeatureCheckbox
              checked={budgetEnabled}
              name="budget_enabled"
              onChange={(event) =>
                setBudgetEnabled(event.currentTarget.checked)
              }
            >
              Budget and allocations
            </FeatureCheckbox>
            <FeatureCheckbox
              checked={incomeEnabled}
              name="income_enabled"
              onChange={(event) =>
                setIncomeEnabled(event.currentTarget.checked)
              }
            >
              Other revenue
            </FeatureCheckbox>
            <FeatureCheckbox
              checked={expensesEnabled}
              name="expenses_enabled"
              onChange={(event) =>
                setExpensesEnabled(event.currentTarget.checked)
              }
            >
              Expenses
            </FeatureCheckbox>
          </>
        )}
        {eventType === "party" ? (
          <>
            <FeatureCheckbox
              checked={ticketingEnabled}
              name="ticketing_enabled"
              onChange={(event) =>
                setTicketingEnabled(event.currentTarget.checked)
              }
            >
              Enable ticket tiers and sales
            </FeatureCheckbox>
            <p className="muted">
              Ticketing works on parties. Selecting it enables ticket tier
              management, pass capacity limits, and ticket sales tracking.
            </p>
          </>
        ) : null}
      </fieldset>
    </>
  );
}
