/**
 * A non-fatal issue encountered while mapping a raw upstream record onto a
 * CueNexa Loop contract, e.g. a missing optional field that was defaulted.
 * Adapters collect these instead of throwing so one malformed field doesn't
 * discard an otherwise-usable record.
 */
export interface NormalizationWarning {
  field: string;
  message: string;
}

/**
 * The result of normalizing a single raw record: the contract-shaped record
 * itself, plus any warnings raised while producing it.
 */
export interface NormalizationResult<T> {
  record: T;
  warnings: NormalizationWarning[];
}
