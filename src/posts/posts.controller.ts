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
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { RepostDto } from './dto/repost.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createPostDto: CreatePostDto, @Request() req: any) {
    return this.postsService.create(createPostDto, req.user.userId);
  }

  @Get()
  findAll(
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.findAll(
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
    return this.postsService.findByUser(
      userId,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('group/:groupId')
  findByGroup(
    @Param('groupId') groupId: string,
    @Request() req: any,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.findByGroup(
      groupId,
      req.user.userId,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('page/:pageId')
  findByPage(
    @Param('pageId') pageId: string,
    @Request() req: any,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.findByPage(
      pageId,
      req.user.userId,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Request() req: any,
  ) {
    return this.postsService.update(id, updatePostDto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.postsService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  likePost(@Param('id') id: string, @Request() req: any) {
    return this.postsService.likePost(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/share')
  sharePost(@Param('id') id: string, @Request() req: any) {
    return this.postsService.sharePost(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/repost')
  repost(
    @Param('id') id: string,
    @Body() repostDto: RepostDto,
    @Request() req: any,
  ) {
    return this.postsService.repost(id, repostDto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads/posts',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
        const extName = allowedTypes.test(extname(file.originalname).toLowerCase());
        const mimeType = allowedTypes.test(file.mimetype);

        if (extName && mimeType) {
          return cb(null, true);
        }
        cb(new Error('نوع الملف غير مدعوم. المسموح: صور وفيديوهات'), false);
      },
    }),
  )
  uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    return {
      files: files.map((file) => ({
        url: `/uploads/posts/${file.filename}`,
        originalName: file.originalname,
        size: file.size,
        type: file.mimetype.startsWith('image/') ? 'image' : 'video',
      })),
    };
  }
}
