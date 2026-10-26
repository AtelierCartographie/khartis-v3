/**
 * A join asked for from a table tab, carried out in the tab of the geo file it
 * enriches. Not persisted: it only bridges the switch between the two tabs.
 */
export interface EnrichmentRequest {
  geoDatasetId: string;
  tableDatasetId: string;
  sourceColumn?: string;
  targetColumn?: string;
}

let pendingRequest = $state<EnrichmentRequest | null>(null);

export const enrichmentRequestStore = {
  get pending(): EnrichmentRequest | null {
    return pendingRequest;
  },
  request(request: EnrichmentRequest): void {
    pendingRequest = request;
  },
  /** Hands the request over once, to the tab of its geo file. */
  take(geoDatasetId: string): EnrichmentRequest | null {
    if (pendingRequest?.geoDatasetId !== geoDatasetId) return null;
    const request = pendingRequest;
    pendingRequest = null;
    return request;
  }
};
