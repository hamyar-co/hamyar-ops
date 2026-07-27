import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ServerFirewallService } from './server-firewall.service';
import { Roles } from '../../common/decorators/roles.decorator';
import type { CreateServerFirewallRuleDto } from '@hamyar-ops/shared';

@Controller('server-firewall')
export class ServerFirewallController {
  constructor(private readonly firewallService: ServerFirewallService) {}

  @Get(':serverId/status')
  getStatus(@Param('serverId') serverId: string) {
    return this.firewallService.getStatus(serverId);
  }

  @Get(':serverId/rules')
  getRules(@Param('serverId') serverId: string) {
    return this.firewallService.getRules(serverId);
  }

  @Roles('ADMIN')
  @Post(':serverId/rules')
  addRule(
    @Param('serverId') serverId: string,
    @Body() dto: CreateServerFirewallRuleDto,
  ) {
    return this.firewallService.addRule(serverId, dto);
  }

  @Roles('ADMIN')
  @Delete(':serverId/rules/:ruleNum')
  deleteRule(
    @Param('serverId') serverId: string,
    @Param('ruleNum', ParseIntPipe) ruleNum: number,
  ) {
    return this.firewallService.deleteRule(serverId, ruleNum);
  }

  @Roles('ADMIN')
  @Post(':serverId/enable')
  enable(@Param('serverId') serverId: string) {
    return this.firewallService.enable(serverId);
  }

  @Roles('ADMIN')
  @Post(':serverId/disable')
  disable(@Param('serverId') serverId: string) {
    return this.firewallService.disable(serverId);
  }

  @Roles('ADMIN')
  @Post(':serverId/defaults')
  setDefaults(@Param('serverId') serverId: string) {
    return this.firewallService.setDefaults(serverId);
  }
}
