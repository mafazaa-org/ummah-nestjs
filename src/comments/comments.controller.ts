import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCommentDto: CreateCommentDto, @Request() req: any) {
    return this.commentsService.create(createCommentDto, req.user.userId);
  }

  @Get('post/:postId')
  findAll(
    @Param('postId') postId: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentsService.findAll(
      postId,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get(':id/replies')
  findReplies(
    @Param('id') id: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentsService.findReplies(
      id,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.update(id, updateCommentDto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.commentsService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  likeComment(@Param('id') id: string, @Request() req: any) {
    return this.commentsService.likeComment(id, req.user.userId);
  }
}
