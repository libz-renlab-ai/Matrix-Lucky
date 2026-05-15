export interface SoftAndWeights {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  tauFloor: number;
}

export const DEFAULT_SOFTAND: SoftAndWeights = {
  w1: 0.4,
  w2: 0.4,
  w3: 0.3,
  w4: 0.5,
  tauFloor: 0.50,
};

export function scoreSoftAnd(args: {
  triggerSim: number;
  patternSim: number;
  hardNegativeSims: number[];
  weights?: SoftAndWeights;
}): number {
  const w = args.weights ?? DEFAULT_SOFTAND;
  const minSim = Math.min(args.triggerSim, args.patternSim);
  const floor = Math.max(0, w.tauFloor - minSim);
  const hnMax = args.hardNegativeSims.length > 0
    ? Math.max(...args.hardNegativeSims)
    : 0;
  return w.w1 * args.triggerSim
       + w.w2 * args.patternSim
       - w.w3 * floor
       - w.w4 * hnMax;
}
