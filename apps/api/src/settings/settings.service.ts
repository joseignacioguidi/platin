import { HttpStatus, Injectable } from '@nestjs/common';
import {
  SETTING_SCHEMAS,
  type CurrentAnnouncement,
  type Setting,
  type SettingKey,
  type SettingValue,
} from '@platin/contracts';
import { isAnnouncementActive } from '@platin/domain';
import { AuditService } from '../audit/audit.service';
import { SUGGESTED_CATEGORIES } from '../categories/suggested-categories';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Value of each key until the admin changes it. */
const DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  registration: { open: true },
  announcement: { text: '', startsOn: null, endsOn: null },
  'suggested-categories': { categories: [...SUGGESTED_CATEGORIES] },
  'default-rate': { rateType: 'MEP' },
};

type Client = Pick<Prisma.TransactionClient, 'appSetting'>;

/** ADM-05: global configuration, one validated JSON value per key. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async value<K extends SettingKey>(
    key: K,
    client: Client = this.prisma,
  ): Promise<SettingValue<K>> {
    const row = await client.appSetting.findUnique({ where: { key } });
    if (!row) return DEFAULTS[key];
    // A stored value that no longer matches its schema falls back to the default.
    const parsed = SETTING_SCHEMAS[key].safeParse(row.value);
    return parsed.success ? (parsed.data as SettingValue<K>) : DEFAULTS[key];
  }

  async get(key: SettingKey): Promise<Setting> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return {
      key,
      value: await this.value(key),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async update(key: SettingKey, value: unknown, actorId: string): Promise<Setting> {
    const parsed = SETTING_SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'The value is not valid for this setting',
        parsed.error.issues.map((issue) => ({
          path: ['value', ...issue.path].join('.'),
          message: issue.message,
        })),
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await this.value(key, tx);
      const json = parsed.data as Prisma.InputJsonValue;
      await tx.appSetting.upsert({
        where: { key },
        create: { key, value: json, updatedBy: actorId },
        update: { value: json, updatedBy: actorId },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'setting.update',
        payload: { key, before, after: parsed.data },
      });
    });
    return this.get(key);
  }

  async currentAnnouncement(): Promise<CurrentAnnouncement> {
    const notice = await this.value('announcement');
    return {
      announcement: isAnnouncementActive(notice, this.clock.today())
        ? { text: notice.text, endsOn: notice.endsOn }
        : null,
    };
  }
}
