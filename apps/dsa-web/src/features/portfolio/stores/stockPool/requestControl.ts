export const requestSeq = {
  report: 0,
  analyze: 0,
  history: 0,
  marketReviewHistory: 0,
  stockHistory: 0,
  stockBar: 0,
  activeTask: 0,
  activeTaskLocalRevision: 0,
  manualSelectionRequest: 0,
  manualSelectionRequestId: 0,
};

export const dismissedTaskIds = new Set<string>();

export function resetRequestControl(): void {
  requestSeq.history += 1;
  requestSeq.marketReviewHistory += 1;
  requestSeq.stockHistory += 1;
  requestSeq.report = 0;
  requestSeq.analyze = 0;
  requestSeq.manualSelectionRequest = 0;
  requestSeq.manualSelectionRequestId = 0;
  requestSeq.stockBar += 1;
  requestSeq.activeTask += 1;
  requestSeq.activeTaskLocalRevision += 1;
  dismissedTaskIds.clear();
}
