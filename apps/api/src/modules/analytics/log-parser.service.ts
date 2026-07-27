import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as fs from 'fs';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class LogParserService {
  private readonly logger = new Logger(LogParserService.name);
  private readonly logFilePath = '/var/log/nginx/access.log';

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async parseLogs() {
    if (!fs.existsSync(this.logFilePath)) {
      return;
    }

    const stats = fs.statSync(this.logFilePath);
    const fileSize = BigInt(stats.size);

    let fileState = await this.prisma.logFileState.findUnique({
      where: { filePath: this.logFilePath },
    });

    if (!fileState) {
      fileState = await this.prisma.logFileState.create({
        data: { filePath: this.logFilePath, byteOffset: 0n },
      });
    }

    let currentOffset = fileState.byteOffset;

    if (currentOffset > fileSize) {
      // File was truncated / rotated
      currentOffset = 0n;
    }

    if (currentOffset === fileSize) {
      return; // No new logs
    }

    const bytesToRead = Number(fileSize - currentOffset);
    const buffer = Buffer.alloc(bytesToRead);
    const fd = fs.openSync(this.logFilePath, 'r');

    fs.readSync(fd, buffer, 0, bytesToRead, Number(currentOffset));
    fs.closeSync(fd);

    const newLogs = buffer.toString('utf-8');
    const lines = newLogs.split('\n').filter((line) => line.trim().length > 0);

    const rawRequests: Array<{
      ip: string;
      method: string;
      url: string;
      status: number;
      size: number;
      referer: string | null;
      userAgent: string | null;
      isBot: boolean;
      botScore: number;
      timestamp: Date;
    }> = [];

    for (const line of lines) {
      const parsed = this.parseNginxLine(line);
      if (parsed) {
        rawRequests.push(parsed);
      }
    }

    if (rawRequests.length > 0) {
      await this.prisma.rawRequest.createMany({
        data: rawRequests,
        skipDuplicates: true,
      });
      this.logger.log(`Parsed ${rawRequests.length} new log lines`);
    }

    await this.prisma.logFileState.update({
      where: { filePath: this.logFilePath },
      data: { byteOffset: fileSize },
    });
  }

  private parseNginxLine(line: string) {
    // Example format: 127.0.0.1 - - [10/Jul/2026:12:34:56 +0000] "GET / HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
    const regex = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/;
    const match = line.match(regex);
    if (!match) return null;

    const ip = match[1];
    const timestampStr = match[2]; // e.g. 10/Jul/2026:12:34:56 +0000
    const requestStr = match[3];
    const status = parseInt(match[4], 10);
    const size = match[5] === '-' ? 0 : parseInt(match[5], 10);
    const referer = match[6];
    const userAgent = match[7];

    const reqParts = requestStr.split(' ');
    const method = reqParts[0];
    const url = reqParts[1] || '/';

    let date: Date;
    try {
      const parts = timestampStr.split(' ');
      const dateParts = parts[0].split(':');
      const dayMonthYear = dateParts[0].split('/');
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };

      const day = parseInt(dayMonthYear[0], 10);
      const month = monthMap[dayMonthYear[1]];
      const year = parseInt(dayMonthYear[2], 10);
      const hour = parseInt(dateParts[1], 10);
      const min = parseInt(dateParts[2], 10);
      const sec = parseInt(dateParts[3], 10);

      date = new Date(Date.UTC(year, month, day, hour, min, sec));
    } catch {
      date = new Date(); // fallback
    }

    const { botScore, isBot } = this.detectBot(userAgent);

    return {
      ip,
      method,
      url,
      status,
      size,
      referer: referer === '-' ? null : referer,
      userAgent: userAgent === '-' ? null : userAgent,
      isBot,
      botScore,
      timestamp: date,
    };
  }

  private detectBot(userAgent: string) {
    let score = 0;
    const lowerUA = (userAgent || '').toLowerCase();

    if (lowerUA === '-' || lowerUA === '') score += 50;
    if (lowerUA.includes('bot') || lowerUA.includes('crawler') || lowerUA.includes('spider')) {
      score += 100;
    }

    if (score > 100) score = 100;
    return {
      botScore: score,
      isBot: score >= 60,
    };
  }
}
