import { Controller, Get } from '@nestjs/common';
import { currentAnnouncementSchema, type CurrentAnnouncement } from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { SettingsService } from './settings.service';

class CurrentAnnouncementDto extends createZodDto(currentAnnouncementSchema) {}

/** The global announcement for every signed-in user (ADM-05). */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('current')
  @ZodSerializerDto(CurrentAnnouncementDto)
  current(): Promise<CurrentAnnouncement> {
    return this.settings.currentAnnouncement();
  }
}
