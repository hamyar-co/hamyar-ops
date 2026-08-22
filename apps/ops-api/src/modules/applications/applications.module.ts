import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { DeployService } from './deploy.service';
import { PM2Module } from '../pm2/pm2.module';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [PM2Module, DockerModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, DeployService],
  exports: [ApplicationsService, DeployService],
})
export class ApplicationsModule {}
