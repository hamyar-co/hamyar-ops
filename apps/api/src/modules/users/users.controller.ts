import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  ResetPasswordDto,
  DisableTotpDto,
} from './dto';

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Roles('ADMIN')
  @Get()
  findAll() { return this.users.findAll(); }

  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) { return this.users.findOne(id); }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Roles('ADMIN')
  @Patch(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.newPassword);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.users.delete(id, user.id);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Patch('me/profile')
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateUserDto) {
    return this.users.update(user.id, dto);
  }

  @Post('me/totp/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  disableTotp(@CurrentUser() user: { id: string }, @Body() dto: DisableTotpDto) {
    return this.users.disableTotp(user.id, dto.token);
  }

  @Get('me/passkeys')
  findMyPasskeys(@CurrentUser() user: { id: string }) {
    return this.users.findPasskeys(user.id);
  }

  @Delete('me/passkeys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePasskey(@CurrentUser() user: { id: string }, @Param('id') passkeyId: string) {
    return this.users.deletePasskey(user.id, passkeyId);
  }
}
