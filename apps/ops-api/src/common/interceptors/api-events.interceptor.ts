import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { EventsService } from '../../modules/events/events.service';
import { SettingsService } from '../../modules/settings/settings.service';

@Injectable()
export class ApiEventsInterceptor implements NestInterceptor {
  constructor(
    private eventsService: EventsService,
    private settingsService: SettingsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, body, ip } = request;

    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(method) && !url.includes('/auth/login') && !url.includes('/auth/logout')) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: async (data) => {
          this.logEvent(request, data, Date.now() - start, 'SUCCESS');
        },
        error: async (err) => {
          this.logEvent(request, { error: err.message, status: err.status }, Date.now() - start, 'ERROR');
        },
      }),
    );
  }

  private async logEvent(request: any, responseData: any, durationMs: number, severity: 'SUCCESS' | 'ERROR') {
    const { method, url, user, body, ip } = request;

    let title = `${method} ${url}`;
    let appName: string | undefined;
    let serverName: string | undefined;
    let type = 'SYSTEM';

    // Rich Mapping of URL to human-readable event title
    if (url.includes('/auth/login')) {
      type = 'SYSTEM';
      title = 'User Login';
    } else if (url.includes('/auth/logout')) {
      type = 'SYSTEM';
      title = 'User Logout';
    } else if (url.includes('/env')) {
      type = 'FILE_OP';
      title = `Edit Environment Variables (${method})`;
    } else if (url.includes('/nginx')) {
      type = 'SERVER_CONFIG';
      title = `Nginx Config Modification (${method})`;
    } else if (url.includes('/server-firewall')) {
      type = 'FIREWALL';
      title = `Firewall Rule Edit (${method})`;
    } else if (url.includes('/applications')) {
      type = 'APP_EVENT';
      if (method === 'POST') title = 'Create Application';
      if (method === 'DELETE') title = 'Delete Application';
      if (url.includes('/deploy')) title = 'Trigger App Deployment';
      if (url.includes('/restart')) title = 'Restart Application';
      if (url.includes('/restore')) title = 'App Restoration / Rollback';
    } else if (url.includes('/servers')) {
      type = 'SERVER_CMD';
      if (method === 'POST') title = 'Add Remote Server';
      if (method === 'DELETE') title = 'Delete Remote Server';
    }

    // Extract names if available in body or params
    if (body?.name || body?.appName) appName = body.name || body.appName;
    if (request.params?.name) appName = request.params.name;
    
    if (body?.host || body?.serverName) serverName = body.serverName || body.host;

    try {
      await this.eventsService.create({
        type,
        title,
        description: `API Request: ${method} ${url}`,
        metadata: {
          request: {
            method,
            url,
            body: this.sanitizeBody(body),
            ip,
          },
          response: this.sanitizeBody(responseData),
          durationMs,
        },
        appName,
        serverName,
        userId: user?.id,
        severity,
      });
    } catch (err) {
      console.error('Failed to log API event', err);
    }
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;
    if (typeof body !== 'object') return body;
    
    const sanitized = { ...body };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'privateKey', 'accessToken'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeBody(sanitized[key]);
      }
    }
    
    return sanitized;
  }
}
