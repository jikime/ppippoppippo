import type { Role } from './world';

// Keep the existing asset names; participant variants now differ in skin/hair,
// while their blue uniform identifies the same role at every viewing distance.
export const PARTICIPANT_VARIANTS = ['participant-teal','participant-navy','participant-cream'] as const;
export const AVATAR_VARIANTS = [...PARTICIPANT_VARIANTS,'operator','paramedic','judge','host'] as const;
export const characterVariant = (role: Role, ordinal: number) => role === 'participant' ? PARTICIPANT_VARIANTS[ordinal % 3] : role;
export const characterUrl = (variant: string) => `/models/${variant}.glb?v=role-colors-2`;
