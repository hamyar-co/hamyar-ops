import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Patch,
} from '@nestjs/common';
import { SshAccessService } from './ssh-access.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { CreateUserSshKeyDto } from '@hamyar-ops/shared';

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

@Controller('ssh-access')
export class SshAccessController {
  constructor(private readonly sshAccess: SshAccessService) {}

  // ─── User's own SSH keys ──────────────────────────────────────────────────

  @Get('keys')
  listMyKeys(@CurrentUser() user: AuthUser) {
    return this.sshAccess.listMyKeys(user.id);
  }

  @Post('keys')
  addKey(@CurrentUser() user: AuthUser, @Body() dto: CreateUserSshKeyDto) {
    return this.sshAccess.addKey(user.id, dto);
  }

  @Delete('keys/:id')
  deleteKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sshAccess.deleteKey(user.id, id);
  }

  @Get('keys/:id/status/:serverId')
  getKeyStatus(
    @Param('id') keyId: string,
    @Param('serverId') serverId: string,
  ) {
    return this.sshAccess.isKeyOnServer(keyId, serverId);
  }

  @Post('keys/:id/push/:serverId')
  @Roles('ADMIN')
  pushKey(
    @CurrentUser() user: AuthUser,
    @Param('id') keyId: string,
    @Param('serverId') serverId: string,
  ) {
    return this.sshAccess.pushKeyToServer(user.id, keyId, serverId);
  }

  @Delete('keys/:id/push/:serverId')
  @Roles('ADMIN')
  removeKey(
    @CurrentUser() user: AuthUser,
    @Param('id') keyId: string,
    @Param('serverId') serverId: string,
  ) {
    return this.sshAccess.removeKeyFromServer(user.id, keyId, serverId);
  }

  // ─── Password auth controls ───────────────────────────────────────────────

  @Get('password-auth/:serverId')
  getPasswordAuth(@Param('serverId') serverId: string) {
    return this.sshAccess.getPasswordAuthStatus(serverId);
  }

  @Patch('password-auth/:serverId')
  @Roles('ADMIN')
  setPasswordAuth(
    @Param('serverId') serverId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.sshAccess.setPasswordAuth(serverId, body.enabled);
  }
}
