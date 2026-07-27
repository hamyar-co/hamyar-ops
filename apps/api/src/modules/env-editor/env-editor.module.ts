import { Module } from '@nestjs/common';
import { EnvEditorService } from './env-editor.service';
import { EnvEditorController } from './env-editor.controller';
import { PM2Module } from '../pm2/pm2.module';

@Module({
  imports: [PM2Module],
  controllers: [EnvEditorController],
  providers: [EnvEditorService],
})
export class EnvEditorModule {}
