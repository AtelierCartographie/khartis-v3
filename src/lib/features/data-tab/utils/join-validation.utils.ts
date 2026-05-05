interface JoinStatsLike {
  joinedCount: number;
}

// Per issue #102 (TomBor, 2026-05-04): the assisted join is a feedback
// dashboard, not a hard gate. Entities flagged "to verify" are already joined
// to the basemap, and duplicates / unrecognized rows are surfaced for the user
// to act on. The only requirement to advance is at least one joined entity.
export function canFinalizeJoin(stats: JoinStatsLike): boolean {
  return stats.joinedCount > 0;
}
