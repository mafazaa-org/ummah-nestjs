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
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ManageMemberDto } from './dto/manage-member.dto';
import { JoinRequestDto } from './dto/join-request.dto';
import { UpdateGroupSettingsDto } from './dto/update-group-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createGroupDto: CreateGroupDto, @Request() req: any) {
    return this.groupsService.create(createGroupDto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Request() req: any,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.groupsService.findAll(
      req.user.userId,
      skip ? parseInt(skip) : 0,
      limit ? parseInt(limit) : 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-groups')
  findByUser(@Request() req: any) {
    return this.groupsService.findByUser(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.findOne(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGroupDto: UpdateGroupDto,
    @Request() req: any,
  ) {
    return this.groupsService.update(id, updateGroupDto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.remove(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  joinGroup(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.joinGroup(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/leave')
  leaveGroup(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.leaveGroup(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/add-member')
  addMember(
    @Param('id') id: string,
    @Body() manageMemberDto: ManageMemberDto,
    @Request() req: any,
  ) {
    return this.groupsService.addMember(
      id,
      manageMemberDto.userId,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/remove-member')
  removeMember(
    @Param('id') id: string,
    @Body() manageMemberDto: ManageMemberDto,
    @Request() req: any,
  ) {
    return this.groupsService.removeMember(
      id,
      manageMemberDto.userId,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/promote-admin')
  promoteAdmin(
    @Param('id') id: string,
    @Body() manageMemberDto: ManageMemberDto,
    @Request() req: any,
  ) {
    return this.groupsService.promoteAdmin(
      id,
      manageMemberDto.userId,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/demote-admin')
  demoteAdmin(
    @Param('id') id: string,
    @Body() manageMemberDto: ManageMemberDto,
    @Request() req: any,
  ) {
    return this.groupsService.demoteAdmin(
      id,
      manageMemberDto.userId,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/request-join')
  requestJoin(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.requestJoin(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/join-requests')
  getJoinRequests(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.getJoinRequests(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/approve-request')
  approveRequest(
    @Param('id') id: string,
    @Body() joinRequestDto: JoinRequestDto,
    @Request() req: any,
  ) {
    return this.groupsService.approveJoinRequest(
      id,
      joinRequestDto.userId,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reject-request')
  rejectRequest(
    @Param('id') id: string,
    @Body() joinRequestDto: JoinRequestDto,
    @Request() req: any,
  ) {
    return this.groupsService.rejectJoinRequest(
      id,
      joinRequestDto.userId,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/settings')
  updateSettings(
    @Param('id') id: string,
    @Body() updateGroupSettingsDto: UpdateGroupSettingsDto,
    @Request() req: any,
  ) {
    return this.groupsService.updateGroupSettings(
      id,
      updateGroupSettingsDto,
      req.user.userId,
    );
  }
  @UseGuards(JwtAuthGuard)
  @Post(':id/pin/:postId')
  pinPost(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Request() req: any,
  ) {
    return this.groupsService.pinPost(id, req.user.userId, postId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/pin/:postId')
  unpinPost(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Request() req: any,
  ) {
    return this.groupsService.unpinPost(id, req.user.userId, postId);
  }
}
