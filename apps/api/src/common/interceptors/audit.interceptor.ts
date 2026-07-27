import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, ip } = request;

    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(method)) return next.handle();

    return next.handle().pipe(
      tap(async () => {
        if (!user) return;
        const [, , resourceType, resourceId] = url.split('/');
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: `${method} ${url}`,
            resourceType,
            resourceId,
            ipAddress: ip,
          },
        });
      }),
    );
  }
}
