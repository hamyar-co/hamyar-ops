export const WsEvents = {
  // Subscriptions
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',

  // PM2
  PM2_STATUS: 'pm2:status',
  PM2_LOG: 'pm2:log',

  // Docker
  DOCKER_STATS: 'docker:stats',
  DOCKER_EVENT: 'docker:event',
  DOCKER_LOG: 'docker:log',

  // Server
  SERVER_METRICS: 'server:metrics',

  // Logs
  LOGS_LINE: 'logs:line',

  // Alerts
  ALERT_TRIGGERED: 'alert:triggered',
  NOTIFICATION_PUSH: 'notification:push',

  // Deploy
  DEPLOY_START: 'deploy:start',
  DEPLOY_LOG: 'deploy:log',
  DEPLOY_DONE: 'deploy:done',

  // Terminal
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_CLOSED: 'terminal:closed',
  TERMINAL_ERROR: 'terminal:error',

  // Backups
  BACKUP_START: 'backup:start',
  BACKUP_LOG: 'backup:log',
  BACKUP_DONE: 'backup:done',

  // Terraform
  TF_LOG: 'terraform:log',
  TF_DONE: 'terraform:done',

  // Ansible
  ANSIBLE_LOG: 'ansible:log',
  ANSIBLE_DONE: 'ansible:done',

  // Pipelines
  PIPELINE_LOG: 'pipeline:log',
  PIPELINE_STEP: 'pipeline:step',
  PIPELINE_DONE: 'pipeline:done',

  // Registry / image builds
  BUILD_LOG: 'registry:build:log',
  BUILD_DONE: 'registry:build:done',

  // Events system (v1.3.0)
  EVENT_NEW: 'event:new',

  // Cron jobs
  CRON_RUN_START: 'cron:run:start',
  CRON_RUN_DONE: 'cron:run:done',

  // Supervisor
  SUPERVISOR_STATUS: 'supervisor:status',

  // GitHub deploy
  GITHUB_DEPLOY_LOG: 'github:deploy:log',
  GITHUB_DEPLOY_DONE: 'github:deploy:done',
} as const;

export type WsEventKey = (typeof WsEvents)[keyof typeof WsEvents];

export type WsTopic =
  | 'pm2'
  | 'docker'
  | 'server'
  | `pm2:logs:${string}`
  | `docker:logs:${string}`
  | `deploy:logs:${string}`
  | `backup:logs:${string}`
  | `terraform:${string}`
  | `ansible:${string}`
  | `pipeline:${string}`
  | `registry:build:${string}`
  | 'logs:nginx'
  | 'logs:system';
