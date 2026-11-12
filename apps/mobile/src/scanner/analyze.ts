import {
  computeMetrics,
  convertRoomPlan,
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
    }
  | { ok: false; error: string };

/**
 * Converts a raw RoomPlan export with the shared converter, exactly as the server will.
 * Never throws: a failure is part of the result, because the raw file is still worth sharing.
 */
export function analyzeExport(rawJson: string): ScanAnalysis {
  try {
    const { model, warnings } = convertRoomPlan(JSON.parse(rawJson));
    const counts: Partial<Record<ConversionWarningCode, number>> = {};
    for (const warning of warnings) counts[warning.code] = (counts[warning.code] ?? 0) + 1;
    return {
      ok: true,
      model,
      metrics: computeMetrics(model),
      warnings: counts,
      warningCount: warnings.length,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
