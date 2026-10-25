import {
  Body,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { ReportPostDto } from './dto/report-post.dto';

const reportsLimitResolver = (context: ExecutionContext) => {
  return Number(process.env.THROTTLE_REPORTS_LIMIT || 5);
};

const reportsTtlResolver = (context: ExecutionContext) => {
  return Number(process.env.THROTTLE_TTL_SECONDS || 60) * 1000;
};

@Controller('posts')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post(':id/report')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    default: {
      limit: reportsLimitResolver,
      ttl: reportsTtlResolver,
    },
  })
  async report(
    @CurrentUser('id') reporterId: string,
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Body() dto: ReportPostDto,
  ) {
    return this.reportsService.reportPost(reporterId, postId, dto.reason);
  }
}
