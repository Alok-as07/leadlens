import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DbService } from './db.service';
import { EnrichService } from './enrich.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public'), exclude: ['/api/(.*)'] })],
  controllers: [LeadsController],
  providers: [DbService, LeadsService, EnrichService],
})
export class AppModule {}
