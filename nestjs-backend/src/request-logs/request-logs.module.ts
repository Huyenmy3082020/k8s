import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestLog } from './request-log.entity.js';
import { RequestLogsService } from './request-logs.service.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RequestLog])],
  providers: [RequestLogsService],
  exports: [RequestLogsService],
})
export class RequestLogsModule {}
