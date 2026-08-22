import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnsibleController } from './ansible.controller';
import { AnsibleService } from './ansible.service';
import { AnsibleProcessor } from './ansible.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'ansible' })],
  controllers: [AnsibleController],
  providers: [AnsibleService, AnsibleProcessor],
  exports: [AnsibleService],
})
export class AnsibleModule implements OnModuleInit {
  constructor(private ansibleService: AnsibleService) {}

  async onModuleInit() {
    await this.ansibleService.seedBuiltInPlaybooks();
  }
}
