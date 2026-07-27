import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll(): Promise<Record<string, any>> {
    const settings = await this.prisma.setting.findMany();
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }

  async get(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value;
  }

  async set(key: string, value: any) {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async updateMany(updates: Record<string, any>) {
    await Promise.all(Object.entries(updates).map(([k, v]) => this.set(k, v)));
    return this.getAll();
  }
}
