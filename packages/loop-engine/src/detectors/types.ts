import type { LoopItemType, LoopParty } from "../types.js";

/** What a single-type detector returns for one sentence, before deadline extraction and evidence attachment. */
export interface DetectorMatch {
  type: LoopItemType;
  text: string;
  confidence: number;
  owner: LoopParty | null;
  counterparties: LoopParty[];
}
