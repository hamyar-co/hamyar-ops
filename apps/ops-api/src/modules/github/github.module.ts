import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [ConfigModule, EventsModule],
  controllers: [GithubController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
