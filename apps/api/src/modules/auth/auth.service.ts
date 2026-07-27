import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { getJwtAccessSecret, getJwtRefreshSecret } from '../../common/security/secrets';
import {
  clearLoginFailures,
  getLoginLockRemainingMs,
  recordLoginFailure,
} from '../../common/security/login-throttle';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private assertNotLocked(username: string, ip?: string) {
    const remaining = getLoginLockRemainingMs(username, ip);
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      throw new HttpException(
        `Too many failed login attempts. Try again in ${seconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async validateUser(username: string, password: string, ip?: string) {
    this.assertNotLocked(username, ip);

    const user = await this.prisma.user.findUnique({ where: { username } });
    // Constant-time-ish: always bcrypt-compare when user missing to reduce timing oracles
    // Precomputed valid bcrypt hash of a random string (cost 12)
    const DUMMY_HASH = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      recordLoginFailure(username, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordLoginFailure(username, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(username: string, password: string, totpToken?: string, ip?: string, ua?: string) {
    const user = await this.validateUser(username, password, ip);

    if (user.totpEnabled) {
      if (!totpToken) throw new UnauthorizedException('TOTP token required');

      const totpValid = speakeasy.totp.verify({
        secret: user.totpSecret!,
        encoding: 'base32',
        token: totpToken,
        window: 1,
      });

      if (!totpValid) {
        // Try backup codes
        const codeHash = crypto.createHash('sha256').update(totpToken).digest('hex');
        const matchIndex = user.totpBackupCodes.indexOf(codeHash);
        if (matchIndex === -1) {
          recordLoginFailure(username, ip);
          throw new UnauthorizedException('Invalid TOTP token');
        }

        // Consume the used backup code
        const remaining = [...user.totpBackupCodes];
        remaining.splice(matchIndex, 1);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { totpBackupCodes: remaining },
        });
      }
    }

    clearLoginFailures(username, ip);

    const tokens = await this.generateTokens(user.id, user.username, user.role);

    const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: refreshHash,
        ipAddress: ip,
        userAgent: ua,
        expiresAt: new Date(Date.now() + parseInt(process.env.JWT_REFRESH_TTL || '604800') * 1000),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { passwordHash, totpSecret, ...safeUser } = user;

    return { ...tokens, user: safeUser };
  }

  async refresh(refreshToken: string) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const tokens = await this.generateTokens(user.id, user.username, user.role);

    const newHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        expiresAt: new Date(Date.now() + parseInt(process.env.JWT_REFRESH_TTL || '604800') * 1000),
      },
    });

    return tokens;
  }

  async logout(refreshToken: string) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.session.deleteMany({ where: { refreshTokenHash: hash } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        totpEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private generateBackupCodes(): { plain: string[]; hashed: string[] } {
    const plain = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );
    const hashed = plain.map((c) =>
      crypto.createHash('sha256').update(c).digest('hex'),
    );
    return { plain, hashed };
  }

  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const secret = speakeasy.generateSecret({ name: `Hamyar Ops (${user.username})` });
    const { plain: backupCodes, hashed: backupHashes } = this.generateBackupCodes();

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret.base32, totpEnabled: false, totpBackupCodes: backupHashes },
    });

    const otpauthUrl = secret.otpauth_url!;
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrCode, secret: secret.base32, backupCodes };
  }

  async verifyTotp(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) throw new NotFoundException('TOTP not setup');

    const valid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!valid) throw new UnauthorizedException('Invalid TOTP token');

    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { enabled: true };
  }

  private async generateTokens(userId: string, username: string, role: string) {
    const payload = { sub: userId, username, role };
    const accessToken = this.jwtService.sign(payload, {
      secret: getJwtAccessSecret(),
      expiresIn: `${process.env.JWT_ACCESS_TTL || 3600}s`,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: getJwtRefreshSecret(),
      expiresIn: `${process.env.JWT_REFRESH_TTL || 604800}s`,
    });
    return { accessToken, refreshToken };
  }

  getRpIdAndOrigin() {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3004';
    const origin = frontendUrl;
    let rpID = 'localhost';
    try {
      rpID = new URL(frontendUrl).hostname;
    } catch (e) {
      rpID = 'localhost';
    }
    return { rpID, origin };
  }

  async generatePasskeyRegisterOptions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passkeys: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const { rpID } = this.getRpIdAndOrigin();

    const options = await generateRegistrationOptions({
      rpName: 'Hamyar Ops',
      rpID,
      userID: Buffer.from(user.id),
      userName: user.username,
      userDisplayName: user.username,
      attestationType: 'none',
      excludeCredentials: user.passkeys.map((p) => ({
        id: p.credentialId,
        type: 'public-key',
        transports: p.transports as any,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    return options;
  }

  async verifyPasskeyRegister(userId: string, name: string, body: any, expectedChallenge: string) {
    const { rpID, origin } = this.getRpIdAndOrigin();

    if (!expectedChallenge) {
      throw new BadRequestException('Challenge not found in session');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } catch (err: any) {
      throw new BadRequestException(`Passkey verification failed: ${err.message}`);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration not verified');
    }

    const { credential } = verification.registrationInfo;
    const { id: credentialID, publicKey: credentialPublicKey, counter, transports: credentialTransports } = credential;

    const exists = await this.prisma.passkey.findUnique({
      where: { credentialId: credentialID },
    });
    if (exists) {
      throw new ConflictException('Passkey already registered');
    }

    const transports = credentialTransports || body.response.transports || [];

    await this.prisma.passkey.create({
      data: {
        userId,
        name: name || 'Passkey',
        credentialId: credentialID,
        publicKey: Buffer.from(credentialPublicKey),
        counter,
        transports,
      },
    });

    return { success: true };
  }

  async generatePasskeyLoginOptions() {
    const { rpID } = this.getRpIdAndOrigin();

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });

    return options;
  }

  async verifyPasskeyLogin(body: any, expectedChallenge: string, ip?: string, ua?: string) {
    const { rpID, origin } = this.getRpIdAndOrigin();

    if (!expectedChallenge) {
      throw new BadRequestException('Challenge not found in session');
    }

    const passkey = await this.prisma.passkey.findUnique({
      where: { credentialId: body.id },
      include: { user: true },
    });

    if (!passkey) {
      throw new UnauthorizedException('Passkey not registered');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
        },
      });
    } catch (err: any) {
      throw new UnauthorizedException(`Passkey verification failed: ${err.message}`);
    }

    if (!verification.verified || !verification.authenticationInfo) {
      throw new UnauthorizedException('Passkey authentication not verified');
    }

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: verification.authenticationInfo.newCounter },
    });

    const tokens = await this.generateTokens(passkey.user.id, passkey.user.username, passkey.user.role);

    const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await this.prisma.session.create({
      data: {
        userId: passkey.user.id,
        refreshTokenHash: refreshHash,
        ipAddress: ip,
        userAgent: ua,
        expiresAt: new Date(Date.now() + parseInt(process.env.JWT_REFRESH_TTL || '604800') * 1000),
      },
    });

    await this.prisma.user.update({
      where: { id: passkey.user.id },
      data: { lastLoginAt: new Date() },
    });

    const { passwordHash, totpSecret, ...safeUser } = passkey.user;

    return { ...tokens, user: safeUser };
  }
}
