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
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    if (search) {
      return this.usersService.searchUsers(search);
    }
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  searchUsers(@Query('q') query: string, @Request() req: any) {
    return this.usersService.searchUsers(query, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('friends')
  getFriends(@Request() req: any) {
    const userId = req?.user?.userId;
    if (!userId) {
      // Defensive: avoid CastError/500 if token missing/invalid
      return [];
    }
    return this.usersService.getFriends(userId);
  }

  // Pin routes must come before :id route to avoid route conflicts
  @UseGuards(JwtAuthGuard)
  @Post('pin/:postId')
  pinPost(@Param('postId') postId: string, @Request() req: any) {
    return this.usersService.pinPost(req.user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('pin/:postId')
  unpinPost(@Param('postId') postId: string, @Request() req: any) {
    return this.usersService.unpinPost(req.user.userId, postId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    // Only allow users to update their own profile
    if (req.user.userId !== id) {
      throw new ForbiddenException('غير مصرح لك بتعديل هذا الملف الشخصي');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/follow')
  followUser(@Param('id') id: string, @Request() req: any) {
    return this.usersService.followUser(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unfollow')
  unfollowUser(@Param('id') id: string, @Request() req: any) {
    return this.usersService.unfollowUser(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    // Only allow users to delete their own account
    if (req.user.userId !== id) {
      throw new ForbiddenException('غير مصرح لك بحذف هذا الحساب');
    }
    return this.usersService.remove(id);
  }
}
