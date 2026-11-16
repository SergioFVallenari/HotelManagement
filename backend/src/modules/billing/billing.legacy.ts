export type LegacyTrial = { companyId: number; startedAt: Date; endsAt: Date };

export function earliestLegacyTrial(trials: readonly LegacyTrial[]): LegacyTrial | null {
  if (trials.length === 0) return null;
  for (const trial of trials) {
    if (!Number.isFinite(trial.startedAt.getTime()) || trial.endsAt.getTime() - trial.startedAt.getTime() !== 14 * 86_400_000) {
      throw new Error('El trial existente tiene fechas inválidas');
    }
  }
  return [...trials].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.companyId - b.companyId)[0]!;
}
