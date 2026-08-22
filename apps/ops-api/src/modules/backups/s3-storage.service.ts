import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { S3ConfigDto } from '@hamyar-ops/shared';

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private clients = new Map<string, { client: S3Client; bucket: string; config: any }>();

  constructor(private prisma: PrismaService) {}

  private async getHandle(s3ConfigId: string) {
    const cached = this.clients.get(s3ConfigId);
    if (cached) return cached;

    const cfg = await this.prisma.s3Config.findUnique({ where: { id: s3ConfigId } });
    if (!cfg) throw new Error(`S3 config ${s3ConfigId} not found`);

    const client = new S3Client({
      region: cfg.region || 'default',
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: cfg.usePathStyle,
    });
    const handle = { client, bucket: cfg.bucket, config: cfg };
    this.clients.set(s3ConfigId, handle);
    return handle;
  }

  async testConnection(s3ConfigId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const { client, bucket } = await this.getHandle(s3ConfigId);
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
      );
      return { ok: true, message: `Connected. ${(res.KeyCount ?? 0)} keys visible.` };
    } catch (e: any) {
      this.clients.delete(s3ConfigId);
      return { ok: false, message: e?.message ?? 'Connection failed' };
    }
  }

  async upload(s3ConfigId: string, key: string, body: Buffer): Promise<void> {
    const { client, bucket } = await this.getHandle(s3ConfigId);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/gzip',
      }),
    );
  }

  async download(s3ConfigId: string, key: string): Promise<Buffer> {
    const { client, bucket } = await this.getHandle(s3ConfigId);
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async delete(s3ConfigId: string, key: string): Promise<void> {
    const { client, bucket } = await this.getHandle(s3ConfigId);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async list(s3ConfigId: string, prefix: string): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const { client, bucket } = await this.getHandle(s3ConfigId);
    const out: { key: string; size: number; lastModified: Date }[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) {
        out.push({ key: o.Key!, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date() });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  toDto(cfg: any): S3ConfigDto {
    return {
      id: cfg.id,
      name: cfg.name,
      endpoint: cfg.endpoint,
      region: cfg.region,
      bucket: cfg.bucket,
      accessKeyId: cfg.accessKeyId,
      usePathStyle: cfg.usePathStyle,
      createdAt: cfg.createdAt.toISOString(),
      updatedAt: cfg.updatedAt.toISOString(),
    };
  }
}