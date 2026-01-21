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
import { FriendRequestsService } from './friend-requests.service';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FriendRequestStatus } from './schemas/friend-request.schema';

@Controller('friend-requests')
export class FriendRequestsController {
  constructor(
    private readonly friendRequestsService: FriendRequestsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() createFriendRequestDto: CreateFriendRequestDto,
    @Request() req: any,
  ) {
    return this.friendRequestsService.create(
      createFriendRequestDto,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Request() req: any, @Query('status') status?: string) {
    const statusEnum =
      status && Object.values(FriendRequestStatus).includes(status as FriendRequestStatus)
        ? (status as FriendRequestStatus)
        : undefined;
    return this.friendRequestsService.findAll(req.user.userId, statusEnum);
  }

  @UseGuards(JwtAuthGuard)
  @Get('received')
  findReceived(@Request() req: any) {
    return this.friendRequestsService.findReceived(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sent')
  findSent(@Request() req: any) {
    return this.friendRequestsService.findSent(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.friendRequestsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/accept')
  accept(@Param('id') id: string, @Request() req: any) {
    return this.friendRequestsService.accept(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reject')
  reject(@Param('id') id: string, @Request() req: any) {
    return this.friendRequestsService.reject(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.friendRequestsService.cancel(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.friendRequestsService.remove(id, req.user.userId);
  }
}
