import { z } from "zod";
import { MiniAppIcon } from "./miniApp.ts";

const NonNegativeInteger = z.number().int().nonnegative();

export const TokenUsage = z.object({
  input: NonNegativeInteger.default(0),
  output: NonNegativeInteger.default(0),
  cacheRead: NonNegativeInteger.default(0),
  cacheWrite: NonNegativeInteger.default(0),
  totalTokens: NonNegativeInteger.default(0),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

export const FelixProfile = z.object({
  name: z.string().default(""),
});
export type FelixProfile = z.infer<typeof FelixProfile>;

export const SetProfileNameRequest = z.object({
  name: z.string().trim().min(1).max(60),
});
export type SetProfileNameRequest = z.infer<typeof SetProfileNameRequest>;

export const TokenActivityDay = z.object({
  date: z.string(),
  tokens: NonNegativeInteger,
});
export type TokenActivityDay = z.infer<typeof TokenActivityDay>;

export const ProfileAppUsage = z.object({
  appId: z.string(),
  name: z.string(),
  emoji: z.string(),
  icon: MiniAppIcon.nullable().default(null),
  tokens: NonNegativeInteger,
});
export type ProfileAppUsage = z.infer<typeof ProfileAppUsage>;

export const ProfileStats = z.object({
  lifetimeTokens: NonNegativeInteger,
  peakTokens: NonNegativeInteger,
  currentStreakDays: NonNegativeInteger,
  longestStreakDays: NonNegativeInteger,
  activity: TokenActivityDay.array(),
  topApps: ProfileAppUsage.array(),
});
export type ProfileStats = z.infer<typeof ProfileStats>;

export const ProfileOverview = z.object({
  profile: FelixProfile,
  stats: ProfileStats,
});
export type ProfileOverview = z.infer<typeof ProfileOverview>;
