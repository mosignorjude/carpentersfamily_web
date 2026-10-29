import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const recordTransactionModal = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/record-transaction-modal.tsx",
    import.meta.url
  ),
  "utf8"
);
const payDuesModal = readFileSync(
  new URL("../src/components/dues/pay-dues-modal.tsx", import.meta.url),
  "utf8"
);
const categoryManagementModal = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/event-category-management-modal.tsx",
    import.meta.url
  ),
  "utf8"
);
const eventEditModal = readFileSync(
  new URL("../src/components/events/event-edit-modal.tsx", import.meta.url),
  "utf8"
);

describe("Sprint 2 Mobile Bottom Sheet Modals", () => {
  it("adapts RecordTransactionModal overlay and container to bottom sheet on mobile", () => {
    assert.match(
      recordTransactionModal,
      /items-end\s+justify-center\s+p-0\s+sm:p-4|sm:items-center\s+items-end\s+justify-center\s+p-0\s+sm:p-4/
    );
    assert.match(
      recordTransactionModal,
      /rounded-t-2xl\s+sm:rounded-2xl/
    );
  });

  it("adapts PayDuesModal overlay and container to bottom sheet on mobile", () => {
    assert.match(
      payDuesModal,
      /items-end\s+justify-center\s+p-0\s+sm:p-4|sm:items-center\s+items-end\s+justify-center\s+p-0\s+sm:p-4/
    );
    assert.match(
      payDuesModal,
      /rounded-t-2xl\s+sm:rounded-2xl/
    );
  });

  it("adapts EventCategoryManagementModal overlay and container to bottom sheet on mobile", () => {
    assert.match(
      categoryManagementModal,
      /items-end\s+justify-center\s+p-0\s+sm:p-4|sm:items-center\s+items-end\s+justify-center\s+p-0\s+sm:p-4/
    );
    assert.match(
      categoryManagementModal,
      /rounded-t-2xl\s+sm:rounded-2xl/
    );
  });

  it("adapts EventEditModal overlay and container to bottom sheet on mobile", () => {
    assert.match(
      eventEditModal,
      /items-end\s+justify-center\s+p-0\s+sm:p-4|sm:items-center\s+items-end\s+justify-center\s+p-0\s+sm:p-4/
    );
    assert.match(
      eventEditModal,
      /rounded-t-2xl\s+sm:rounded-2xl/
    );
  });
});
