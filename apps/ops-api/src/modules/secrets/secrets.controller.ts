import { Controller, Get, Post, Body } from '@nestjs/common';
import { SecretsService } from './secrets.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('secrets')
@Roles('ADMIN')
export class SecretsController {
  constructor(private secrets: SecretsService) {}

  @Get('vault-status')
  getVaultStatus() {
    return this.secrets.getVaultStatus();
  }

  @Post('vault-password')
  @Roles('ADMIN')
  setVaultPassword(@Body() body: { password: string }) {
    return this.secrets.setVaultPassword(body.password);
  }

  @Post('ansible/encrypt')
  @Roles('ADMIN')
  encryptAnsibleVar(@Body() body: { key: string; value: string; password: string }) {
    return this.secrets.encryptAnsibleVar(body.key, body.value, body.password);
  }

  @Post('ansible/decrypt')
  @Roles('ADMIN')
  decryptAnsibleVar(@Body() body: { encrypted: string; password: string }) {
    return this.secrets.decryptAnsibleVar(body.encrypted, body.password);
  }
}
