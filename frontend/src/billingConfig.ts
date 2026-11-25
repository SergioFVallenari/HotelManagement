import { billingExperienceEnabled } from './lib/billingVisibility';

export const BILLING_EXPERIENCE_ENABLED = billingExperienceEnabled(import.meta.env.VITE_BILLING_ENABLED);
