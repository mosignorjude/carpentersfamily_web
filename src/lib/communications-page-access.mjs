/**
 * @param {{
 *   roles?: string[],
 *   eventLeadIds?: string[],
 *   activeEventIds?: string[],
 *   roleLookupFailed?: boolean,
 * }} input
 */
export function getCommunicationsPageAccess({
  roles = [],
  eventLeadIds = [],
  activeEventIds = [],
  roleLookupFailed = false,
}) {
  const roleSet = new Set(roleLookupFailed ? [] : roles);
  const leadEventSet = new Set(roleLookupFailed ? [] : eventLeadIds);
  const activeEventSet = new Set(activeEventIds);
  const globalPublisher =
    !roleLookupFailed && (roleSet.has("admin") || roleSet.has("executive"));
  const publishEventIds = activeEventIds.filter(
    (eventId) => globalPublisher || leadEventSet.has(eventId),
  );

  return {
    globalPublisher,
    canPublish:
      !roleLookupFailed && (globalPublisher || publishEventIds.length > 0),
    publishEventIds,
    /**
     * @param {string | null} eventId
     * @param {boolean} [historyAvailable]
     */
    canManageForEvent(eventId, historyAvailable = true) {
      if (roleLookupFailed || !historyAvailable) return false;
      if (eventId === null) return globalPublisher;
      return (
        activeEventSet.has(eventId) &&
        (globalPublisher || leadEventSet.has(eventId))
      );
    },
  };
}

/**
 * @param {Array<{
 *   has_voted: boolean,
 *   results_visible: boolean,
 *   votes: number | null,
 * }>} options
 * @param {boolean} summaryUnavailable
 * @param {boolean} [pollOpen]
 */
export function getPollSummaryPresentation(
  options,
  summaryUnavailable,
  pollOpen = false,
) {
  const hasOptions = options.length > 0;
  const hasVoted =
    !summaryUnavailable &&
    hasOptions &&
    options.every((option) => option.has_voted);
  const aggregateReady =
    hasOptions &&
    options.every((option) => option.results_visible && option.votes !== null);
  const aggregateTotal = aggregateReady
    ? options.reduce((sum, option) => sum + (option.votes ?? 0), 0)
    : null;
  const resultsVisible =
    !summaryUnavailable &&
    !pollOpen &&
    aggregateTotal !== null &&
    aggregateTotal >= 5;
  const totalVotes = resultsVisible ? aggregateTotal : null;

  return {
    hasVoted,
    resultsVisible,
    totalVotes,
    state: summaryUnavailable
      ? "unavailable"
      : resultsVisible
        ? "released"
        : hasOptions
          ? "hidden"
          : "loading",
  };
}
