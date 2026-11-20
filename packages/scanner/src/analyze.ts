import {
  computeMetrics,
  convertRoomPlan,
  type ConversionWarning,
  type ConversionWarningCode,
  type ModelMetrics,
  type RoomModelV1,
} from '@bairmair/room-model';

export type ScanAnalysis =
  | {
      ok: true;
      model: RoomModelV1;
      metrics: ModelMetrics;
      /** How often each conversion warning occurred. */
      warnings: Partial<Record<ConversionWarningCode, number>>;
      warningCount: number;
      /** Rooms with fewer than 3 walls along their outline: the scan probably missed part. */
      incompleteRoomIds: string[];
    }
  | { ok: false; error: string };

export function countWarnings(
  warnings: readonly ConversionWarning[],
): Partial<Record<ConversionWarningCode, number>> {
  const counts: Partial<Record<ConversionWarningCode, number>> = {};
  for (const warning of warnings) counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  return counts;
}

/**
 * Converts a raw RoomPlan export with the shared converter, exactly as the server will.
 * Never throws: a failure is part of the result, because the raw file is still worth sharing.
 */
export function analyzeExport(rawJson: string): ScanAnalysis {
  try {
    const { model, warnings } = convertRoomPlan(JSON.parse(rawJson));
    return {
      ok: true,
      model,
      metrics: computeMetrics(model),
      warnings: countWarnings(warnings),
      warningCount: warnings.length,
      incompleteRoomIds: warnings
        .filter((warning) => warning.code === 'incomplete-room' && warning.elementId)
        .map((warning) => warning.elementId!),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
