import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Group, GroupDocument } from './schemas/group.schema';
import {
  Conversation,
  ConversationDocument,
} from '../messages/schemas/conversation.schema';
import {
  JoinRequest,
  JoinRequestDocument,
} from './schemas/join-request.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(Group.name) private groupModel: Model<GroupDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(JoinRequest.name)
    private joinRequestModel: Model<JoinRequestDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Hydrate group users (admin/admins/members) even if stored as string IDs.
   * This avoids Mongoose populate failing when Group stores IDs as strings.
   */
  private async hydrateGroupUsers(groupObj: any): Promise<any> {
    const toId = (v: any): string => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (v._id) return v._id.toString();
      if (v.id) return v.id.toString();
      return v.toString?.() ?? '';
    };

    const ids = new Set<string>();
    const adminId = toId(groupObj.admin);
    if (adminId) ids.add(adminId);
    for (const a of groupObj.admins ?? []) {
      const id = toId(a);
      if (id) ids.add(id);
    }
    for (const m of groupObj.members ?? []) {
      const id = toId(m);
      if (id) ids.add(id);
    }

    const objectIds = [...ids]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return groupObj;
    }

    const users = await this.userModel
      .find({ _id: { $in: objectIds } })
      .select('username firstName lastName avatar')
      .lean()
      .exec();

    const byId = new Map<string, any>(
      users.map((u: any) => [u._id.toString(), u]),
    );

    const hydrateOne = (v: any) => {
      const id = toId(v);
      const u = byId.get(id);
      if (!u) {
        return typeof v === 'object' && v !== null ? v : { _id: id };
      }
      return {
        _id: id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        avatar: u.avatar,
      };
    };

    groupObj.admin = groupObj.admin ? hydrateOne(groupObj.admin) : undefined;
    groupObj.admins = (groupObj.admins ?? []).map(hydrateOne);
    groupObj.members = (groupObj.members ?? []).map(hydrateOne);

    return groupObj;
  }

  async create(createGroupDto: CreateGroupDto, userId: string): Promise<Group> {
    // Create the group
    const group = new this.groupModel({
      ...createGroupDto,
      admin: userId,
      admins: [userId], // Admin is automatically in admins array
      members: [userId], // Admin is automatically a member
    });

    const savedGroup = await group.save();

    // Create a group conversation automatically
    const conversation = new this.conversationModel({
      type: 'group',
      participants: [userId],
      group: savedGroup._id,
      name: savedGroup.name,
      avatar: savedGroup.coverImage,
    });

    const savedConversation = await conversation.save();

    // Link the conversation to the group
    savedGroup.conversation = savedConversation._id as any;
    await savedGroup.save();

    console.log(
      `✅ Created group "${savedGroup.name}" with conversation ${savedConversation._id}`,
    );

    return savedGroup;
  }

  async findAll(
    userId: string,
    skip: number = 0,
    limit: number = 20,
  ): Promise<Group[]> {
    // Show groups where user is a member OR public groups
    return this.groupModel
      .find({
        isDeleted: false,
        $or: [{ members: userId }, { privacy: 'public' }],
      })
      .populate('admin', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, userId: string): Promise<Group | any> {
    const group = await this.groupModel
      .findById(id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate({
        path: 'pinnedPosts',
        populate: {
          path: 'author',
          select: 'username firstName lastName avatar',
        },
      })
      .exec();

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if user is a member or if group is public
    // Handle both populated and non-populated members arrays
    const isMember =
      group.members &&
      group.members.some((member: any) => {
        const memberId = member?._id
          ? member._id.toString()
          : member?.toString();
        return memberId === userId;
      });

    // احسب الـ admin بشكل يدعم الحالة المعبأة (populated) وغير المعبأة
    const mainAdminId = (group as any).admin?._id
      ? (group as any).admin._id.toString()
      : (group as any).admin?.toString();

    const isAdmin =
      mainAdminId === userId ||
      (group.admins &&
        group.admins.some((admin: any) => {
          const adminId = admin?._id ? admin._id.toString() : admin?.toString();
          return adminId === userId;
        }));
    const isPublic = group.privacy === 'public';

    if (!isMember && !isPublic) {
      throw new ForbiddenException('غير مصرح لك بعرض هذا التكتل');
    }

    const canSeeNames = group.showMemberNames !== false || isMember || isAdmin;
    if (canSeeNames) {
      // Ensure we always return user objects for admin/member management UI
      const obj = (group as any).toObject ? (group as any).toObject() : group;
      return this.hydrateGroupUsers(obj);
    }

    const sanitized = (group as any).toObject();
    sanitized.admin = sanitized.admin
      ? { _id: sanitized.admin._id ?? sanitized.admin, username: 'أدمن مخفي' }
      : undefined;
    sanitized.admins = (sanitized.admins || []).map((admin: any) => ({
      _id: admin._id ?? admin,
      username: 'أدمن مخفي',
    }));
    sanitized.members = (sanitized.members || []).map((member: any) => ({
      _id: member._id ?? member,
      username: 'عضو مخفي',
    }));

    return sanitized;
  }

  async findByUser(userId: string): Promise<Group[]> {
    return this.groupModel
      .find({
        isDeleted: false,
        members: userId,
      })
      .populate('admin', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(
    id: string,
    updateGroupDto: UpdateGroupDto,
    userId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(id);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    if (group.admin.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بتعديل هذا التكتل');
    }

    Object.assign(group, updateGroupDto);
    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }

  async remove(id: string, userId: string): Promise<void> {
    const group = await this.groupModel.findById(id);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    if (group.admin.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بحذف هذا التكتل');
    }

    group.isDeleted = true;
    await group.save();
  }

  async joinGroup(groupId: string, userId: string): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if group is private
    if (group.privacy === 'private') {
      throw new ForbiddenException(
        'هذا التكتل خاص. يجب أن يتم دعوتك من قبل المسؤول',
      );
    }

    const userIdObj = userId as any;

    // Check if user is already admin
    if (group.admin.toString() === userId) {
      throw new BadRequestException('أنت مسؤول هذا التكتل بالفعل');
    }

    if (group.members.includes(userIdObj)) {
      throw new BadRequestException('أنت بالفعل عضو في هذا التكتل');
    }

    group.members.push(userIdObj);

    // Add user to the group conversation
    if (group.conversation) {
      const conversation = await this.conversationModel.findById(
        group.conversation,
      );
      if (conversation && !conversation.participants.includes(userIdObj)) {
        conversation.participants.push(userIdObj);
        await conversation.save();
        console.log(
          `✅ Added user ${userId} to group conversation ${conversation._id}`,
        );
      }
    }

    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }

  async leaveGroup(groupId: string, userId: string): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    if (group.admin.toString() === userId) {
      throw new BadRequestException('لا يمكن للمسؤول مغادرة التكتل');
    }

    group.members = group.members.filter(
      (member) => member.toString() !== userId,
    );

    // Remove user from the group conversation
    if (group.conversation) {
      const conversation = await this.conversationModel.findById(
        group.conversation,
      );
      if (conversation) {
        conversation.participants = conversation.participants.filter(
          (participant) => participant.toString() !== userId,
        );
        await conversation.save();
        console.log(
          `✅ Removed user ${userId} from group conversation ${conversation._id}`,
        );
      }
    }

    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }

  // Helper method to check if user is admin
  private isUserAdmin(group: any, userId: string): boolean {
    return (
      group.admins &&
      group.admins.some((admin: any) => admin.toString() === userId)
    );
  }

  async addMember(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, requesterId)) {
      throw new ForbiddenException('غير مصرح لك بإضافة أعضاء لهذا التكتل');
    }

    const targetUserIdObj = targetUserId as any;

    // Check if user is already a member
    if (group.members.includes(targetUserIdObj)) {
      throw new BadRequestException('هذا المستخدم عضو بالفعل في التكتل');
    }

    // Add user to members
    group.members.push(targetUserIdObj);

    // Add user to the group conversation
    if (group.conversation) {
      const conversation = await this.conversationModel.findById(
        group.conversation,
      );
      if (
        conversation &&
        !conversation.participants.includes(targetUserIdObj)
      ) {
        conversation.participants.push(targetUserIdObj);
        await conversation.save();
        console.log(
          `✅ Added user ${targetUserId} to group conversation ${conversation._id}`,
        );
      }
    }

    console.log(
      `✅ Added user ${targetUserId} to group ${groupId} by admin ${requesterId}`,
    );
    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }

  async removeMember(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, requesterId)) {
      throw new ForbiddenException('غير مصرح لك بإزالة أعضاء من هذا التكتل');
    }

    // Cannot remove the main admin
    if (group.admin.toString() === targetUserId) {
      throw new BadRequestException('لا يمكن إزالة المسؤول الأساسي من التكتل');
    }

    // Cannot remove yourself if you're not the main admin
    if (
      requesterId === targetUserId &&
      group.admin.toString() !== requesterId
    ) {
      throw new BadRequestException('لا يمكنك إزالة نفسك من التكتل');
    }

    // Remove user from members
    group.members = group.members.filter(
      (member) => member.toString() !== targetUserId,
    );

    // Remove user from admins if they are one
    group.admins = group.admins.filter(
      (admin) => admin.toString() !== targetUserId,
    );

    // Remove user from the group conversation
    if (group.conversation) {
      const conversation = await this.conversationModel.findById(
        group.conversation,
      );
      if (conversation) {
        conversation.participants = conversation.participants.filter(
          (participant) => participant.toString() !== targetUserId,
        );
        await conversation.save();
        console.log(
          `✅ Removed user ${targetUserId} from group conversation ${conversation._id}`,
        );
      }
    }

    console.log(
      `✅ Removed user ${targetUserId} from group ${groupId} by admin ${requesterId}`,
    );
    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }

  async promoteAdmin(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, requesterId)) {
      throw new ForbiddenException('غير مصرح لك بترقية أعضاء لهذا التكتل');
    }

    const targetUserIdObj = targetUserId as any;

    // Check if user is a member
    if (!group.members.includes(targetUserIdObj)) {
      throw new BadRequestException('هذا المستخدم ليس عضواً في التكتل');
    }

    // Check if user is already an admin
    if (group.admins.includes(targetUserIdObj)) {
      throw new BadRequestException('هذا المستخدم أدمن بالفعل');
    }

    // Add user to admins
    group.admins.push(targetUserIdObj);

    console.log(
      `✅ Promoted user ${targetUserId} to admin in group ${groupId} by admin ${requesterId}`,
    );
    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }

  async demoteAdmin(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, requesterId)) {
      throw new ForbiddenException('غير مصرح لك بإزالة أدمنز من هذا التكتل');
    }

    // Cannot demote the main admin
    if (group.admin.toString() === targetUserId) {
      throw new BadRequestException('لا يمكن إزالة صلاحيات المسؤول الأساسي');
    }

    // Cannot demote yourself
    if (requesterId === targetUserId) {
      throw new BadRequestException('لا يمكنك إزالة صلاحياتك الخاصة');
    }

    const targetUserIdObj = targetUserId as any;

    // Check if user is an admin
    if (!group.admins.includes(targetUserIdObj)) {
      throw new BadRequestException('هذا المستخدم ليس أدمن');
    }

    // Remove user from admins
    group.admins = group.admins.filter(
      (admin) => admin.toString() !== targetUserId,
    );

    console.log(
      `✅ Demoted user ${targetUserId} from admin in group ${groupId} by admin ${requesterId}`,
    );
    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }

  async requestJoin(
    groupId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if user is already a member
    const isMember = group.members.some(
      (member) => member.toString() === userId,
    );
    if (isMember) {
      throw new BadRequestException('أنت بالفعل عضو في هذا التكتل');
    }

    // Check if there's already a pending request
    const existingRequest = await this.joinRequestModel.findOne({
      user: userId,
      group: groupId,
      status: 'pending',
    });

    if (existingRequest) {
      throw new BadRequestException('لديك طلب انضمام معلق بالفعل');
    }

    // For public groups, add directly
    if (group.privacy === 'public') {
      group.members.push(userId as any);

      // Add user to the group conversation
      if (group.conversation) {
        const conversation = await this.conversationModel.findById(
          group.conversation,
        );
        if (
          conversation &&
          !conversation.participants.includes(userId as any)
        ) {
          conversation.participants.push(userId as any);
          await conversation.save();
          console.log(
            `✅ Added user ${userId} to group conversation ${conversation._id}`,
          );
        }
      }

      await group.save();
      console.log(`✅ User ${userId} joined public group ${groupId}`);
      return { message: 'تم الانضمام للتكتل بنجاح' };
    }

    // For private groups, create join request
    const joinRequest = new this.joinRequestModel({
      user: userId,
      group: groupId,
      status: 'pending',
    });

    await joinRequest.save();
    console.log(
      `📝 Created join request for user ${userId} to group ${groupId}`,
    );

    return { message: 'تم إرسال طلب الانضمام للمسؤول' };
  }

  async getJoinRequests(
    groupId: string,
    userId: string,
  ): Promise<JoinRequest[]> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, userId)) {
      throw new ForbiddenException('غير مصرح لك بعرض طلبات الانضمام');
    }

    return this.joinRequestModel
      .find({ group: groupId, status: 'pending' })
      .populate('user', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async approveJoinRequest(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, requesterId)) {
      throw new ForbiddenException('غير مصرح لك بالموافقة على طلبات الانضمام');
    }

    const joinRequest = await this.joinRequestModel.findOne({
      user: targetUserId,
      group: groupId,
      status: 'pending',
    });

    if (!joinRequest) {
      throw new NotFoundException('طلب الانضمام غير موجود');
    }

    // Add user to members
    group.members.push(targetUserId as any);

    // Add user to the group conversation
    if (group.conversation) {
      const conversation = await this.conversationModel.findById(
        group.conversation,
      );
      if (
        conversation &&
        !conversation.participants.includes(targetUserId as any)
      ) {
        conversation.participants.push(targetUserId as any);
        await conversation.save();
        console.log(
          `✅ Added user ${targetUserId} to group conversation ${conversation._id}`,
        );
      }
    }

    // Update request status
    joinRequest.status = 'approved';
    await joinRequest.save();

    await group.save();
    console.log(
      `✅ Approved join request for user ${targetUserId} to group ${groupId} by admin ${requesterId}`,
    );

    return { message: 'تم قبول طلب الانضمام' };
  }

  async rejectJoinRequest(
    groupId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, requesterId)) {
      throw new ForbiddenException('غير مصرح لك برفض طلبات الانضمام');
    }

    const joinRequest = await this.joinRequestModel.findOne({
      user: targetUserId,
      group: groupId,
      status: 'pending',
    });

    if (!joinRequest) {
      throw new NotFoundException('طلب الانضمام غير موجود');
    }

    // Update request status
    joinRequest.status = 'rejected';
    await joinRequest.save();

    console.log(
      `❌ Rejected join request for user ${targetUserId} to group ${groupId} by admin ${requesterId}`,
    );

    return { message: 'تم رفض طلب الانضمام' };
  }

  async updateGroupSettings(
    groupId: string,
    settings: any,
    userId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    if (!this.isUserAdmin(group, userId)) {
      throw new ForbiddenException('غير مصرح لك بتعديل إعدادات التكتل');
    }

    // Update settings
    if (settings.allowMembersToPost !== undefined) {
      const allow =
        typeof settings.allowMembersToPost === 'string'
          ? settings.allowMembersToPost === 'true'
          : !!settings.allowMembersToPost;
      group.allowMembersToPost = allow;
    }
    if (settings.showMemberNames !== undefined) {
      const showNames =
        typeof settings.showMemberNames === 'string'
          ? settings.showMemberNames === 'true'
          : !!settings.showMemberNames;
      group.showMemberNames = showNames;
    }

    const savedGroup = await group.save();

    // Return populated group
    return this.groupModel
      .findById(savedGroup._id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('members', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .exec();
  }
  async pinPost(
    groupId: string,
    userId: string,
    postId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    const userIdObj = userId as any;

    // Check if requester is admin
    const isAdmin =
      group.admin.toString() === userId || this.isUserAdmin(group, userId);
    if (!isAdmin) {
      throw new ForbiddenException(
        'غير مصرح لك بتثبيت المنشورات في هذا التكتل',
      );
    }

    // Initialize if undefined
    if (!group.pinnedPosts) {
      group.pinnedPosts = [];
    }

    const postIdObj = postId as any; // Cast to conform to ObjectId type

    // Check if already pinned (comparing strings)
    const isPinned = group.pinnedPosts.some((id) => id.toString() === postId);
    if (isPinned) {
      throw new BadRequestException('المنشور مثبت بالفعل');
    }

    if (group.pinnedPosts.length >= 3) {
      throw new BadRequestException(
        'لقد وصلت للحد الأقصى للمنشورات المثبتة (3)',
      );
    }

    group.pinnedPosts.push(postIdObj);
    return group.save();
  }

  async unpinPost(
    groupId: string,
    userId: string,
    postId: string,
  ): Promise<Group> {
    const group = await this.groupModel.findById(groupId);

    if (!group || group.isDeleted) {
      throw new NotFoundException('التكتل غير موجود');
    }

    // Check if requester is admin
    const isAdmin =
      group.admin.toString() === userId || this.isUserAdmin(group, userId);
    if (!isAdmin) {
      throw new ForbiddenException(
        'غير مصرح لك بإلغاء تثبيت المنشورات في هذا التكتل',
      );
    }

    if (
      !group.pinnedPosts ||
      !group.pinnedPosts.some((id) => id.toString() === postId)
    ) {
      throw new BadRequestException('المنشور غير مثبت');
    }

    group.pinnedPosts = group.pinnedPosts.filter(
      (id) => id.toString() !== postId,
    );
    return group.save();
  }
}
