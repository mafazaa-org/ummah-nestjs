import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // Conversations
  @Post('conversations')
  createConversation(@Body() createConversationDto: CreateConversationDto, @Request() req: any) {
    return this.messagesService.createConversation(createConversationDto, req.user.userId);
  }

  @Post('group-chats')
  createGroupChat(@Body() createGroupChatDto: CreateGroupChatDto, @Request() req: any) {
    return this.messagesService.createGroupChat(createGroupChatDto, req.user.userId);
  }

  @Get('conversations')
  getConversations(@Request() req: any) {
    return this.messagesService.getConversations(req.user.userId);
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string) {
    return this.messagesService.getConversation(id);
  }

  @Delete('conversations/:id')
  deleteConversation(@Param('id') id: string, @Request() req: any) {
    return this.messagesService.deleteConversation(id, req.user.userId);
  }

  // Messages
  @Post()
  createMessage(@Body() createMessageDto: CreateMessageDto, @Request() req: any) {
    return this.messagesService.createMessage(createMessageDto, req.user.userId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/messages',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx/;
        const extName = allowedTypes.test(extname(file.originalname).toLowerCase());
        const mimeType = allowedTypes.test(file.mimetype);

        if (extName && mimeType) {
          return cb(null, true);
        }
        cb(new Error('نوع الملف غير مدعوم'), false);
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return {
      fileUrl: `/uploads/messages/${file.filename}`,
      fileName: file.originalname,
      fileSize: file.size,
    };
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Param('id') id: string,
    @Query('skip') skip: string,
    @Query('limit') limit: string,
    @Request() req: any,
  ) {
    return this.messagesService.getMessages(
      id,
      req.user.userId,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 50,
    );
  }

  @Post(':id/read')
  markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.messagesService.markAsRead(id, req.user.userId);
  }

  @Delete(':id')
  deleteMessage(@Param('id') id: string, @Request() req: any) {
    return this.messagesService.deleteMessage(id, req.user.userId);
  }
}
