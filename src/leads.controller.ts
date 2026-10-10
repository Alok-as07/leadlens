import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Put, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { EnrichService } from './enrich.service';
import { LeadsService, ListQuery } from './leads.service';
import { Icp } from './types';

@Controller('api')
export class LeadsController {
  constructor(private readonly leads: LeadsService, private readonly enrich: EnrichService) {}

  @Post('leads/import')
  @HttpCode(200)
  import(@Body() body: unknown) {
    if (typeof body !== 'string' || !body.trim()) {
      throw new BadRequestException('Send CSV text with Content-Type: text/csv');
    }
    try { return this.leads.importCsv(body); }
    catch (e) { throw new BadRequestException(`Could not parse CSV: ${(e as Error).message}`); }
  }

  @Get('leads/export.csv')
  export(@Query('minScore') minScore: string, @Query('tier') tier: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leadlens-export.csv"');
    res.send(this.leads.exportCsv(minScore, tier));
  }

  @Get('leads') list(@Query() q: ListQuery) { return this.leads.list(q); }

  @Post('leads/enrich')
  @HttpCode(200)
  enrichTop(@Body() body: { limit?: number }) { return this.enrich.enrichTop(Number(body?.limit) || 10); }

  @Post('leads/:id/enrich')
  @HttpCode(200)
  async enrichOne(@Param('id', ParseIntPipe) id: number) {
    const outreach = await this.enrich.enrichOne(id);
    if (outreach === null) throw new NotFoundException('Lead not found');
    return { outreach };
  }

  @Delete('leads') @HttpCode(204) clear() { this.leads.clear(); }

  @Get('icp') icp() { return this.leads.getIcp(); }
  @Put('icp') setIcp(@Body() body: Partial<Icp>) { return this.leads.setIcp(body); }
  @Get('stats') stats() { return this.leads.stats(); }
}
