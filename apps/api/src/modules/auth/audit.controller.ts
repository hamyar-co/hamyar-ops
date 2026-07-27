import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAuditLogs(
    @Query('page', new DefaultValuePipe('1'), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe('50'), ParseIntPipe) limit: number,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
  ) {
    const where: any = {};
    if (action) where.action = { contains: action };
    if (userId) where.userId = userId;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
