import { Module, forwardRef } from '@nestjs/common';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { AnsibleModule } from '../ansible/ansible.module';

@Module({
  imports: [forwardRef(() => AnsibleModule)],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
