import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { SshModule } from './infrastructure/ssh/ssh.module';
import { AuthModule } from './modules/auth/auth.module';
import { PM2Module } from './modules/pm2/pm2.module';
import { DockerModule } from './modules/docker/docker.module';
import { NginxModule } from './modules/nginx/nginx.module';
import { ServerModule } from './modules/server/server.module';
import { LogsModule } from './modules/logs/logs.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { FilesModule } from './modules/files/files.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { UsersModule } from './modules/users/users.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { StatusModule } from './modules/status/status.module';
import { EnvEditorModule } from './modules/env-editor/env-editor.module';
import { AppHealthModule } from './modules/app-health/app-health.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { BackupsModule } from './modules/backups/backups.module';
import { NetworkModule } from './modules/network/network.module';
import { ErrorLogsModule } from './modules/error-logs/error-logs.module';
import { MultiServerModule } from './modules/multi-server/multi-server.module';
import { AnsibleModule } from './modules/ansible/ansible.module';
import { TerraformModule } from './modules/terraform/terraform.module';
import { SecretsModule } from './modules/secrets/secrets.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { RegistryModule } from './modules/registry/registry.module';
import { EventsModule } from './modules/events/events.module';
import { MicroservicesModule } from './modules/microservices/microservices.module';
import { CronJobsModule } from './modules/cron-jobs/cron-jobs.module';
import { SupervisorModule } from './modules/supervisor/supervisor.module';
import { ServerConfigModule } from './modules/server-config/server-config.module';
import { SshAccessModule } from './modules/ssh-access/ssh-access.module';
import { ServerFirewallModule } from './modules/server-firewall/server-firewall.module';
import { GithubModule } from './modules/github/github.module';
import { EventsGateway } from './gateways/events.gateway';
import { EventsBusModule } from './infrastructure/events/events-bus.module';

import { AnalyticsModule } from './modules/analytics/analytics.module';
import { LoadTestingModule } from './modules/load-testing/load-testing.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiEventsInterceptor } from './common/interceptors/api-events.interceptor';

import { PostgresModule } from './modules/postgres/postgres.module';
import { RedisModule as RedisAppModule } from './modules/redis/redis.module';
import { RabbitMQModule } from './modules/rabbitmq/rabbitmq.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60000, limit: 100 },
      { name: 'auth', ttl: 60000, limit: 5 },
    ]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    SshModule,
    AuthModule,
    PM2Module,
    DockerModule,
    NginxModule,
    ServerModule,
    LogsModule,
    MonitoringModule,
    FilesModule,
    SettingsModule,
    TerminalModule,
    UsersModule,
    ApplicationsModule,
    EnvEditorModule,
    AppHealthModule,
    StatusModule,
    SchedulerModule,
    BackupsModule,
    NetworkModule,
    ErrorLogsModule,
    MultiServerModule,
    AnsibleModule,
    TerraformModule,
    SecretsModule,
    ObservabilityModule,
    PipelineModule,
    RegistryModule,
    EventsModule,
    CronJobsModule,
    SupervisorModule,
    ServerConfigModule,
    SshAccessModule,
    ServerFirewallModule,
    GithubModule,
    EventsBusModule,
    MicroservicesModule,
    AnalyticsModule,
    LoadTestingModule,
    PostgresModule,
    RedisAppModule,
    RabbitMQModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    EventsGateway,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiEventsInterceptor },
  ],
})
export class AppModule {}
