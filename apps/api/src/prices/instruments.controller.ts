import { Controller, Get, Query } from '@nestjs/common';
import {
  instrumentsQuerySchema,
  instrumentsResponseSchema,
  type InstrumentsResponse,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { RequiresFeature } from '../plans/requires-feature.decorator';
import { PricesService } from './prices.service';

class InstrumentsQueryDto extends createZodDto(instrumentsQuerySchema) {}
class InstrumentsDto extends createZodDto(instrumentsResponseSchema) {}

/** INV-07: search the shared catalog to link an investment. */
@RequiresFeature('investments')
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly prices: PricesService) {}

  @Get()
  @ZodSerializerDto(InstrumentsDto)
  async search(@Query() query: InstrumentsQueryDto): Promise<InstrumentsResponse> {
    return {
      items: await this.prices.search(query.type, query.q),
      priced: this.prices.pricedTypes().includes(query.type),
    };
  }
}
