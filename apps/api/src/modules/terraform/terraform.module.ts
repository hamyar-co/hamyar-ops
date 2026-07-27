import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TerraformController } from './terraform.controller';
import { TerraformService } from './terraform.service';
import { TerraformProcessor } from './terraform.processor';
import { BackupsModule } from '../backups/backups.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'terraform' }),
    forwardRef(() => BackupsModule),
  ],
  controllers: [TerraformController],
  providers: [TerraformService, TerraformProcessor],
  exports: [TerraformService],
})
export class TerraformModule {}
