export const PLANS = {
  starter: { name: 'Starter', price: 0, blurb: 'For your first clients', activeProjects: 3, members: 1, storageGb: 5, feeEnv: 'PLATFORM_FEE_STARTER', defaultFee: 1.5 },
  studio: { name: 'Studio', price: 25000, blurb: 'For independent studios', activeProjects: Infinity, members: 3, storageGb: 100, feeEnv: 'PLATFORM_FEE_STUDIO', defaultFee: 0 },
  agency: { name: 'Agency', price: 60000, blurb: 'For teams and agencies', activeProjects: Infinity, members: 15, storageGb: 1000, feeEnv: 'PLATFORM_FEE_AGENCY', defaultFee: 0 },
} as const;
export type PlanKey = keyof typeof PLANS;

export function platformFeePct(plan: PlanKey) {
  const p = PLANS[plan] ?? PLANS.starter;
  const v = Number(process.env[p.feeEnv]);
  return Number.isFinite(v) && process.env[p.feeEnv] !== undefined && process.env[p.feeEnv] !== '' ? v : p.defaultFee;
}

export const LEAD_STAGES = [
  ['new', 'New enquiry'], ['call', 'Call booked'], ['proposal', 'Proposal sent'], ['won', 'Won'], ['lost', 'Lost'],
] as const;
