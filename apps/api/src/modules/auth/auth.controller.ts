import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoginDto, RefreshDto, TotpVerifyDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: parseInt(process.env.JWT_REFRESH_TTL || '604800') * 1000,
      path: '/api/auth',
    };
  }

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(
      dto.username,
      dto.password,
      dto.totpToken,
      req.ip,
      req.headers['user-agent'],
    );

    res.cookie('refreshToken', result.refreshToken, this.refreshCookieOptions());

    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    const tokens = await this.authService.refresh(refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, this.refreshCookieOptions());

    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) await this.authService.logout(refreshToken);
    res.clearCookie('refreshToken', {
      path: '/api/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }

  @Get('me')
  async me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }

  @Post('totp/setup')
  async totpSetup(@CurrentUser() user: { id: string }) {
    return this.authService.setupTotp(user.id);
  }

  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  async totpVerify(@CurrentUser() user: { id: string }, @Body() dto: TotpVerifyDto) {
    return this.authService.verifyTotp(user.id, dto.token);
  }

  @Post('passkey/register/options')
  async passkeyRegisterOptions(@CurrentUser() user: { id: string }, @Res({ passthrough: true }) res: Response) {
    const options = await this.authService.generatePasskeyRegisterOptions(user.id);
    res.cookie('registrationChallenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
    });
    return options;
  }

  @Post('passkey/register/verify')
  async passkeyRegisterVerify(
    @CurrentUser() user: { id: string },
    @Body() body: { name: string; response: any },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const challenge = req.cookies?.registrationChallenge;
    try {
      return await this.authService.verifyPasskeyRegister(user.id, body.name, body.response, challenge);
    } finally {
      // One-time challenge — always clear after attempt
      res.clearCookie('registrationChallenge', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    }
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('passkey/login/options')
  async passkeyLoginOptions(@Res({ passthrough: true }) res: Response) {
    const options = await this.authService.generatePasskeyLoginOptions();
    res.cookie('loginChallenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
    });
    return options;
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('passkey/login/verify')
  @HttpCode(HttpStatus.OK)
  async passkeyLoginVerify(
    @Body() body: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const challenge = req.cookies?.loginChallenge;
    try {
      const result = await this.authService.verifyPasskeyLogin(
        body,
        challenge,
        req.ip,
        req.headers['user-agent'],
      );

      res.cookie('refreshToken', result.refreshToken, this.refreshCookieOptions());

      return { accessToken: result.accessToken, user: result.user };
    } finally {
      res.clearCookie('loginChallenge', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    }
  }
}
