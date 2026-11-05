/** The refusal an intake dialog renders when its action will not accept the form. */
export interface IntakeNotice {
  title: string;
  message: string;
}

/** A refusal plus the draft it rejected: React resets the form, so the fields need their text back. */
export interface IntakeRejection extends IntakeNotice {
  values: Record<string, string>;
}
