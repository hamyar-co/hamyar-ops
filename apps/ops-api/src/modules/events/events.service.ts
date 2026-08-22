import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: DeployEventBus,
  ) {}

  async list(filters: {
    type?: string;
    serverId?: string;
    appName?: string;
    userId?: string;
    severity?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.type) where.type = filters.type;
    if (filters.serverId) where.serverId = filters.serverId;
    if (filters.appName) where.appName = filters.appName;
    if (filters.userId) where.userId = filters.userId;
    if (filters.severity) where.severity = filters.severity;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        ...e,
        metadata: e.metadata as Record<string, unknown> | null,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  async create(dto: {
    type: string;
    title: string;
    description?: string;
    metadata?: Record<string, unknown>;
    serverId?: string;
    serverName?: string;
    appName?: string;
    userId?: string;
    severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  }) {
    const event = await this.prisma.event.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        metadata: dto.metadata ? (dto.metadata as any) : undefined,
        serverId: dto.serverId,
        serverName: dto.serverName,
        appName: dto.appName,
        userId: dto.userId,
        severity: dto.severity ?? 'INFO',
      },
    });

    // Broadcast to all connected browsers
    this.eventBus.emit('event:new', {
      ...event,
      createdAt: event.createdAt.toISOString(),
    });

    return event;
  }

  async deleteOld(olderThanDays = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    return this.prisma.event.deleteMany({ where: { createdAt: { lt: cutoff } } });
  }
}
