import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FilesService } from './files.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('files')
@Roles('ADMIN')
export class FilesController {
  constructor(private files: FilesService) {}

  @Get()
  list(
    @Query('path') dirPath: string,
    @Query('serverId') serverId?: string,
  ) { return this.files.listDirectory(dirPath, serverId); }

  @Get('content')
  content(
    @Query('path') filePath: string,
    @Query('serverId') serverId?: string,
  ) { return this.files.readFile(filePath, serverId); }

  @Post('write')
  write(@Body() body: { path: string; content: string; serverId?: string }) {
    return this.files.writeFile(body.path, body.content, body.serverId);
  }

  @Delete()
  delete(
    @Query('path') filePath: string,
    @Query('serverId') serverId?: string,
  ) { return this.files.deleteFile(filePath, serverId); }

  @Get('download')
  download(@Query('path') filePath: string, @Res() res: Response) {
    return this.files.streamDownload(filePath, res);
  }
}
