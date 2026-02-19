interface JoinStatsLike {
  joinedCount: number;
  toVerifyCount: number;
  duplicateCount: number;
}

export function hasBlockingJoinIssues(stats: JoinStatsLike): boolean {
  return stats.toVerifyCount > 0;
}

export function canFinalizeJoin(stats: JoinStatsLike): boolean {
  return stats.joinedCount > 0 && !hasBlockingJoinIssues(stats);
}
