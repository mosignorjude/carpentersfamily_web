"use client";

import {
  correctClubFinanceAction,
  createFinanceCategoryAction,
  recordClubFinanceAction,
  retireFinanceCategoryAction,
  voidClubFinanceAction,
} from "@/app/actions";

export type FinanceCategory = {
  id: string;
  name: string;
  retired_at: string | null;
};

export type FinanceTransaction = {
  id: string;
  kind: "income" | "expense";
  amount_ngn: number | string;
  transaction_date: string;
  description: string | null;
  category_id: string | null;
  category_name_snapshot: string | null;
  payer_payee: string | null;
  source_note: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

function confirmSubmit(
  event: React.FormEvent<HTMLFormElement>,
  message: string,
) {
  if (!window.confirm(message)) event.preventDefault();
}

export function ClubIncomeForm({
  today,
  canBackdate,
  idempotencyKey,
}: {
  today: string;
  canBackdate: boolean;
  idempotencyKey: string;
}) {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  return (
    <form action={recordClubFinanceAction} className="form-stack finance-form">
      <input name="kind" type="hidden" value="income" />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />
      <label>
        Amount in whole Naira
        <input
          inputMode="numeric"
          max="1000000000000"
          min="1"
          name="amount_ngn"
          required
          step="1"
          type="number"
        />
      </label>
      <label>
        Date
        <input
          defaultValue={today}
          max={today}
          min={canBackdate ? yearStart : today}
          name="transaction_date"
          required
          type="date"
        />
      </label>
      <label>
        Source note
        <input autoComplete="off" maxLength={500} name="source_note" required />
      </label>
      <label>
        Payer, if available
        <input autoComplete="off" maxLength={160} name="payer_payee" />
      </label>
      <button type="submit">Record non-dues income</button>
    </form>
  );
}

export function ClubExpenseForm({
  categories,
  today,
  canBackdate,
  idempotencyKey,
}: {
  categories: FinanceCategory[];
  today: string;
  canBackdate: boolean;
  idempotencyKey: string;
}) {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  return (
    <form action={recordClubFinanceAction} className="form-stack finance-form">
      <input name="kind" type="hidden" value="expense" />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />
      <label>
        Amount in whole Naira
        <input
          inputMode="numeric"
          max="1000000000000"
          min="1"
          name="amount_ngn"
          required
          step="1"
          type="number"
        />
      </label>
      <label>
        Date
        <input
          defaultValue={today}
          max={today}
          min={canBackdate ? yearStart : today}
          name="transaction_date"
          required
          type="date"
        />
      </label>
      <label>
        Description
        <input autoComplete="off" maxLength={500} name="description" required />
      </label>
      <label>
        Category
        <select name="category_id" required>
          <option value="">Choose a category</option>
          {categories
            .filter((category) => !category.retired_at)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Payee
        <input autoComplete="off" maxLength={160} name="payer_payee" required />
      </label>
      <button type="submit">Record expense</button>
    </form>
  );
}

export function FinanceCategoryForms({
  categories,
}: {
  categories: FinanceCategory[];
}) {
  return (
    <div className="finance-category-list">
      <form
        action={createFinanceCategoryAction}
        className="form-stack finance-form"
      >
        <label>
          New category name
          <input
            autoComplete="off"
            maxLength={80}
            minLength={2}
            name="name"
            required
          />
        </label>
        <label>
          Reason
          <input autoComplete="off" maxLength={500} name="reason" required />
        </label>
        <button type="submit">Add category</button>
      </form>
      <ul className="finance-categories">
        {categories.map((category) => (
          <li key={category.id}>
            <span>
              {category.name}
              {category.retired_at ? " · Retired" : " · Active"}
            </span>
            {!category.retired_at ? (
              <form
                action={retireFinanceCategoryAction}
                className="finance-retire-form"
                onSubmit={(event) =>
                  confirmSubmit(
                    event,
                    `Retire “${category.name}”? Historical entries will keep this category.`,
                  )
                }
              >
                <input name="category_id" type="hidden" value={category.id} />
                <label>
                  Retirement reason
                  <input
                    autoComplete="off"
                    maxLength={500}
                    name="reason"
                    required
                  />
                </label>
                <button className="button-secondary" type="submit">
                  Retire
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinanceCorrectionForm({
  transaction,
  categories,
  today,
}: {
  transaction: FinanceTransaction;
  categories: FinanceCategory[];
  today: string;
}) {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  return (
    <details className="finance-correction">
      <summary>Correct record</summary>
      <form
        action={correctClubFinanceAction}
        className="form-stack finance-form"
      >
        <input name="transaction_id" type="hidden" value={transaction.id} />
        <label>
          Amount in whole Naira
          <input
            defaultValue={transaction.amount_ngn}
            inputMode="numeric"
            max="1000000000000"
            min="1"
            name="amount_ngn"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Date
          <input
            defaultValue={transaction.transaction_date}
            max={today}
            min={yearStart}
            name="transaction_date"
            required
            type="date"
          />
        </label>
        {transaction.kind === "expense" ? (
          <>
            <label>
              Description
              <input
                defaultValue={transaction.description ?? ""}
                maxLength={500}
                name="description"
                required
              />
            </label>
            <label>
              Category
              <select
                defaultValue={transaction.category_id ?? ""}
                name="category_id"
                required
              >
                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                    disabled={Boolean(
                      category.retired_at &&
                        category.id !== transaction.category_id,
                    )}
                  >
                    {category.name}
                    {category.retired_at ? " · Retired" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payee
              <input
                defaultValue={transaction.payer_payee ?? ""}
                maxLength={160}
                name="payer_payee"
                required
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Source note
              <input
                defaultValue={transaction.source_note ?? ""}
                maxLength={500}
                name="source_note"
                required
              />
            </label>
            <label>
              Payer, if available
              <input
                defaultValue={transaction.payer_payee ?? ""}
                maxLength={160}
                name="payer_payee"
              />
            </label>
          </>
        )}
        <label>
          Required correction reason
          <input autoComplete="off" maxLength={500} name="reason" required />
        </label>
        <button className="button-secondary" type="submit">
          Save correction
        </button>
      </form>
    </details>
  );
}

export function FinanceVoidForm({
  transaction,
}: {
  transaction: FinanceTransaction;
}) {
  return (
    <details className="finance-correction">
      <summary>Void record</summary>
      <form
        action={voidClubFinanceAction}
        className="form-stack finance-form"
        onSubmit={(event) =>
          confirmSubmit(
            event,
            "Void this financial record? It will remain in the history and no longer count toward the balance.",
          )
        }
      >
        <input name="transaction_id" type="hidden" value={transaction.id} />
        <label>
          Required reason
          <input autoComplete="off" maxLength={500} name="reason" required />
        </label>
        <button className="button-danger" type="submit">
          Void transaction
        </button>
      </form>
    </details>
  );
}
