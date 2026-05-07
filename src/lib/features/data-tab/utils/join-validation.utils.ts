interface JoinStatsLike {
  joinedCount: number;
}

export function canFinalizeJoin(stats: JoinStatsLike): boolean {
  return stats.joinedCount > 0;
}
