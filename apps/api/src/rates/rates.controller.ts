import { Controller, Get } from '@nestjs/common';
import { latestRatesSchema, type LatestRates } from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { RatesService } from './rates.service';

class LatestRatesDto extends createZodDto(latestRatesSchema) {}

@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get('latest')
  @ZodSerializerDto(LatestRatesDto)
  latest(): Promise<LatestRates> {
    return this.rates.latest();
  }
}
