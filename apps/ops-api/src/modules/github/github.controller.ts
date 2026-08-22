import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { GithubService } from './github.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { GithubDeployDto } from '@hamyar-ops/shared';

@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  // Public — lets frontend check if GitHub OAuth is configured before prompting connect
  @Public()
  @Get('config')
  getConfig() {
    return { configured: this.githubService.isConfigured() };
  }

  // Returns the GitHub OAuth URL — frontend does the redirect
  @Get('auth')
  getAuthUrl(@CurrentUser() user: { id: string }) {
    return this.githubService.getAuthUrl(user.id);
  }

  // GitHub redirects here after authorization — must be public (no Bearer token in browser redirect)
  @Public()
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      await this.githubService.handleCallback(code, state);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/github?connected=true`);
    } catch (err: any) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(
        `${frontendUrl}/github?error=${encodeURIComponent(err.message ?? 'OAuth failed')}`,
      );
    }
  }

  @Get('status')
  getStatus(@CurrentUser() user: { id: string }) {
    return this.githubService.getConnection(user.id);
  }

  @Delete('disconnect')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(@CurrentUser() user: { id: string }) {
    return this.githubService.disconnect(user.id);
  }

  @Get('repos')
  listRepos(@CurrentUser() user: { id: string }) {
    return this.githubService.listRepos(user.id);
  }

  @Get('repos/:owner/:repo/branches')
  getBranches(
    @CurrentUser() user: { id: string },
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    return this.githubService.getRepoBranches(user.id, owner, repo);
  }

  @Post('deploy')
  @Roles('ADMIN')
  deploy(
    @CurrentUser() user: { id: string },
    @Body() dto: GithubDeployDto,
  ) {
    return this.githubService.deployFromGithub(user.id, dto);
  }
}
