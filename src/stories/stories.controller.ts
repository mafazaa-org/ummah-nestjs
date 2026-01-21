import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createStoryDto: CreateStoryDto, @Request() req: any) {
    return this.storiesService.create(createStoryDto, req.user.userId);
  }

  @Get()
  findAll(
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storiesService.findAll(
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('user/:userId')
  findByUser(
    @Param('userId') userId: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storiesService.findByUser(
      userId,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.storiesService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/view')
  viewStory(@Param('id') id: string, @Request() req: any) {
    return this.storiesService.viewStory(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/views')
  getStoryViews(@Param('id') id: string, @Request() req: any) {
    return this.storiesService.getStoryViews(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/viewers')
  getStoryViewers(@Param('id') id: string, @Request() req: any) {
    return this.storiesService.getStoryViewers(id, req.user.userId);
  }
}
