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
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createPageDto: CreatePageDto, @Request() req: any) {
    return this.pagesService.create(createPageDto, req.user.userId);
  }

  @Get()
  findAll(@Query('skip') skip?: string, @Query('limit') limit?: string) {
    return this.pagesService.findAll(
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-pages')
  findByUser(@Request() req: any) {
    return this.pagesService.findByUser(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pagesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePageDto: UpdatePageDto,
    @Request() req: any,
  ) {
    return this.pagesService.update(id, updatePageDto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.pagesService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/follow')
  followPage(@Param('id') id: string, @Request() req: any) {
    return this.pagesService.followPage(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unfollow')
  unfollowPage(@Param('id') id: string, @Request() req: any) {
    return this.pagesService.unfollowPage(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/admins')
  addAdmin(
    @Param('id') id: string,
    @Body('userId') userId: string,
    @Request() req: any,
  ) {
    return this.pagesService.addAdmin(id, userId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/admins/:userId')
  removeAdmin(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.pagesService.removeAdmin(id, userId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/pin/:postId')
  pinPost(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Request() req: any,
  ) {
    return this.pagesService.pinPost(id, req.user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/pin/:postId')
  unpinPost(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Request() req: any,
  ) {
    return this.pagesService.unpinPost(id, req.user.userId, postId);
  }
}
