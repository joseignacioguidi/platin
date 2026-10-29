import { z } from 'zod';
import { colorTokenSchema } from './accounts';
import { roleSchema, userStatusSchema } from './auth';
import { categoryKindSchema, iconNameSchema } from './categories';
import { localDateSchema, pageSchema, rateTypeSchema, uuidSchema } from './common';

// ---------- Settings (ADM-05) ----------

/** Open or closed sign-up. */
export const registrationSettingSchema = z.object({ open: z.boolean() });

/** Message shown to every user while today is inside [startsOn, endsOn]. */
export const announcementSettingSchema = z
  .object({
    text: z.string().trim().max(280),
    startsOn: localDateSchema.nullable(),
    endsOn: localDateSchema.nullable(),
  })
  .refine((value) => !value.startsOn || !value.endsOn || value.startsOn <= value.endsOn, {
    message: 'La fecha de fin tiene que ser posterior a la de inicio',
    path: ['endsOn'],
  });

export const suggestedCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: categoryKindSchema,
  icon: iconNameSchema,
  color: colorTokenSchema,
});

/** Categories every new user starts with (system categories are always added). */
export const suggestedCategoriesSettingSchema = z.object({
  categories: z
    .array(suggestedCategorySchema)
    .max(60)
    .refine(
      (list) => new Set(list.map((c) => `${c.kind}:${c.name.toLowerCase()}`)).size === list.length,
      'Hay categorías repetidas',
    ),
});

/** Rate type new users start with to value dollars. */
export const defaultRateSettingSchema = z.object({ rateType: rateTypeSchema });

export const SETTING_SCHEMAS = {
  registration: registrationSettingSchema,
  announcement: announcementSettingSchema,
  'suggested-categories': suggestedCategoriesSettingSchema,
  'default-rate': defaultRateSettingSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
export const settingKeySchema = z.enum(
  Object.keys(SETTING_SCHEMAS) as [SettingKey, ...SettingKey[]],
);
export const settingKeyParamSchema = z.object({ key: settingKeySchema });

export const settingSchema = z.object({
  key: settingKeySchema,
  value: z.unknown(),
  updatedAt: z.string().nullable(),
});

export const updateSettingRequestSchema = z.object({ value: z.unknown() });

export type RegistrationSetting = z.infer<typeof registrationSettingSchema>;
export type AnnouncementSetting = z.infer<typeof announcementSettingSchema>;
export type SuggestedCategory = z.infer<typeof suggestedCategorySchema>;
export type SuggestedCategoriesSetting = z.infer<typeof suggestedCategoriesSettingSchema>;
export type DefaultRateSetting = z.infer<typeof defaultRateSettingSchema>;
export type Setting = z.infer<typeof settingSchema>;

/** GET /announcements/current: the announcement in force today, if any. */
export const currentAnnouncementSchema = z.object({
  announcement: z.object({ text: z.string(), endsOn: localDateSchema.nullable() }).nullable(),
});
export type CurrentAnnouncement = z.infer<typeof currentAnnouncementSchema>;

// ---------- Metrics (ADM-02) ----------

export const adminMetricsSchema = z.object({
  totalUsers: z.number().int(),
  activeLast7Days: z.number().int(),
  activeLast30Days: z.number().int(),
  suspendedUsers: z.number().int(),
  /** Sign-ups per week (Monday to Sunday) for the last 12 weeks, oldest first. */
  signupsByWeek: z.array(z.object({ weekStart: localDateSchema, count: z.number().int() })),
  /** Users with at least one active record of each feature. */
  featureUsage: z.object({
    cards: z.number().int(),
    goals: z.number().int(),
    fixed: z.number().int(),
    investments: z.number().int(),
    savingsPockets: z.number().int(),
  }),
  usersByPlan: z.array(z.object({ planId: uuidSchema, name: z.string(), count: z.number().int() })),
});
export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

// ---------- Users (ADM-03, ADM-04) ----------

/** Account data only: never amounts, balances, descriptions, categories or account names. */
export const adminUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string().nullable(),
  role: roleSchema,
  status: userStatusSchema,
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  /** The plan in force (PLN-06). */
  plan: z.object({
    id: uuidSchema,
    name: z.string(),
    source: z.enum(['DEFAULT', 'ADMIN', 'REQUEST', 'PAYMENT']),
    endsAt: z.string().nullable(),
  }),
});

export const adminUserDetailSchema = adminUserSchema.extend({
  activeSessions: z.number().int(),
  /** How many records of each type the user has; never their content. */
  counts: z.object({
    accounts: z.number().int(),
    pockets: z.number().int(),
    categories: z.number().int(),
    transactions: z.number().int(),
    transfers: z.number().int(),
    cards: z.number().int(),
    cardCharges: z.number().int(),
    fixed: z.number().int(),
    goals: z.number().int(),
  }),
});

export const adminUsersQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  status: userStatusSchema.optional(),
  role: roleSchema.optional(),
  planId: uuidSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminUsersPageSchema = pageSchema(adminUserSchema);

export const deleteUserRequestSchema = z.object({
  confirmEmail: z.string().trim().toLowerCase().min(1, 'Escribí el email del usuario'),
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminUsersQuery = z.input<typeof adminUsersQuerySchema>;
export type AdminUsersPage = z.infer<typeof adminUsersPageSchema>;
export type DeleteUserRequest = z.infer<typeof deleteUserRequestSchema>;

// ---------- Audit (ADM-07) ----------

export const auditEntrySchema = z.object({
  id: uuidSchema,
  actorId: uuidSchema,
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetUserId: uuidSchema.nullable(),
  targetEmail: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const auditQuerySchema = z.object({
  targetUserId: uuidSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const auditPageSchema = pageSchema(auditEntrySchema);

export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
