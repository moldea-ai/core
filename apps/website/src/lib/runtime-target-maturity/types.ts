// maturity labels managed by the packages website
export type IRuntimeTargetMaturity = 'deprecated' | 'experimental' | 'supported';

// validated website-owned maturity values indexed by adapter and technical target ID
export type IRuntimeTargetMaturityRegistry = Record<string, Record<string, IRuntimeTargetMaturity>>;
