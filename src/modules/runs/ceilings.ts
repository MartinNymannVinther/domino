import { RUN_LIMITS } from "@/modules/flow";

/**
 * A run's own ceilings (docs/adr/0013, amending 0009). The AI ceilings
 * count calls per person, workspace and installation; these bound one
 * run so that a flow with a loop over a pile cannot run forever, and
 * they are on the run rather than in the environment because a run is
 * a thing a person starts and can see the size of. The two the input
 * check needs live with the format, so the canvas can say them too.
 */
export const RUN_CEILINGS = {
  /** Items across every list input; a bigger pile is two runs. */
  itemsPerRun: RUN_LIMITS.itemsPerRun,
  /** Characters of text a single input may hold. */
  textChars: RUN_LIMITS.textChars,
  /** Steps, loops included. */
  stepsPerRun: 5000,
  /** Model calls in one run. */
  modelCallsPerRun: 1000,
} as const;
