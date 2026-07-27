import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuditController } from './audit.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { getJwtAccessSecret } from '../../common/security/secrets';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: getJwtAccessSecret(),
      signOptions: { expiresIn: process.env.JWT_ACCESS_TTL ? `${process.env.JWT_ACCESS_TTL}s` : '1h' },
    }),
  ],
  controllers: [AuthController, AuditController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
