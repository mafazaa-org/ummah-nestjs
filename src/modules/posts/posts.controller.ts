import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/auth-mode.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.posts.create(userId, dto);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.posts.findVisibleById(id);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.updateText(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('id') userId: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.posts.softDelete(userId, id);
  }
}
