import { Module } from '@nestjs/common';
import { PostgresController } from './postgres.controller';
import { PostgresService } from './postgres.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PostgresController],
  providers: [PostgresService],
  exports: [PostgresService],
})
export class PostgresModule {}
