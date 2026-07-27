import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as crypto from 'crypto';

const SAFE_SELECT = {
  id: true,
  username: true,
  email: true,
  role: true,
  totpEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: { username: string; email: string; password: string; role: 'ADMIN' | 'VIEWER' }) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (exists) throw new ConflictException('Username or email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { username: dto.username, email: dto.email, passwordHash, role: dto.role },
      select: SAFE_SELECT,
    });
  }

  async update(id: string, dto: { username?: string; email?: string; role?: 'ADMIN' | 'VIEWER' }) {
    await this.findOne(id);
    if (dto.username || dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(dto.username ? [{ username: dto.username }] : []),
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
        },
      });
      if (conflict) throw new ConflictException('Username or email already in use');
    }
    return this.prisma.user.update({ where: { id }, data: dto, select: SAFE_SELECT });
  }

  async delete(id: string, requestingUserId: string) {
    if (id === requestingUserId) throw new BadRequestException('Cannot delete your own account');
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
  }

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async resetPassword(id: string, newPassword: string) {
    await this.findOne(id);
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async disableTotp(id: string, totpToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.totpEnabled || !user.totpSecret) throw new BadRequestException('2FA is not enabled');

    const totpValid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: totpToken,
      window: 1,
    });

    if (!totpValid) {
      const codeHash = crypto.createHash('sha256').update(totpToken).digest('hex');
      if (!user.totpBackupCodes.includes(codeHash)) {
        throw new UnauthorizedException('Invalid TOTP token');
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] },
    });
  }

  async findPasskeys(userId: string) {
    return this.prisma.passkey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deletePasskey(userId: string, passkeyId: string) {
    const passkey = await this.prisma.passkey.findFirst({
      where: { id: passkeyId, userId },
    });
    if (!passkey) throw new NotFoundException('Passkey not found');

    await this.prisma.passkey.delete({ where: { id: passkeyId } });
  }
}
