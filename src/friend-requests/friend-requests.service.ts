import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FriendRequest,
  FriendRequestDocument,
  FriendRequestStatus,
} from './schemas/friend-request.schema';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class FriendRequestsService {
  constructor(
    @InjectModel(FriendRequest.name)
    private friendRequestModel: Model<FriendRequestDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(
    createFriendRequestDto: CreateFriendRequestDto,
    senderId: string,
  ): Promise<FriendRequest> {
    // لا يمكن إرسال طلب صداقة لنفسك
    if (senderId === createFriendRequestDto.receiverId) {
      throw new BadRequestException('لا يمكنك إرسال طلب صداقة لنفسك');
    }

    // التحقق من وجود المستخدم المستقبل
    const receiver = await this.userModel.findById(
      createFriendRequestDto.receiverId,
    );
    if (!receiver || !receiver.isActive) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // التحقق من وجود طلب صداقة مسبق
    const existingRequest = await this.friendRequestModel.findOne({
      $or: [
        {
          sender: senderId,
          receiver: createFriendRequestDto.receiverId,
        },
        {
          sender: createFriendRequestDto.receiverId,
          receiver: senderId,
        },
      ],
    });

    if (existingRequest) {
      if (existingRequest.status === FriendRequestStatus.PENDING) {
        throw new ConflictException('يوجد طلب صداقة معلق بالفعل');
      }
      if (existingRequest.status === FriendRequestStatus.ACCEPTED) {
        throw new ConflictException('أنتما أصدقاء بالفعل');
      }
    }

    const friendRequest = new this.friendRequestModel({
      sender: senderId,
      receiver: createFriendRequestDto.receiverId,
      status: FriendRequestStatus.PENDING,
    });

    return friendRequest.save();
  }

  async findAll(userId: string, status?: FriendRequestStatus) {
    const query: any = {
      $or: [{ sender: userId }, { receiver: userId }],
    };

    if (status) {
      query.status = status;
    }

    return this.friendRequestModel
      .find(query)
      .populate('sender', 'username firstName lastName avatar')
      .populate('receiver', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findReceived(userId: string): Promise<FriendRequest[]> {
    return this.friendRequestModel
      .find({
        receiver: userId,
        status: FriendRequestStatus.PENDING,
      })
      .populate('sender', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findSent(userId: string): Promise<FriendRequest[]> {
    return this.friendRequestModel
      .find({
        sender: userId,
        status: FriendRequestStatus.PENDING,
      })
      .populate('receiver', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<FriendRequest> {
    const friendRequest = await this.friendRequestModel
      .findById(id)
      .populate('sender', 'username firstName lastName avatar')
      .populate('receiver', 'username firstName lastName avatar')
      .exec();

    if (!friendRequest) {
      throw new NotFoundException('طلب الصداقة غير موجود');
    }

    return friendRequest;
  }

  async accept(id: string, userId: string): Promise<FriendRequest> {
    const friendRequest = await this.friendRequestModel.findById(id);

    if (!friendRequest) {
      throw new NotFoundException('طلب الصداقة غير موجود');
    }

    // فقط المستقبل يمكنه القبول
    if (friendRequest.receiver.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بقبول هذا الطلب');
    }

    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('طلب الصداقة غير معلق');
    }

    // تحديث حالة الطلب
    friendRequest.status = FriendRequestStatus.ACCEPTED;
    await friendRequest.save();

    // إضافة كل منهما كصديق للآخر في friends array
    await this.userModel.findByIdAndUpdate(friendRequest.sender, {
      $addToSet: {
        friends: friendRequest.receiver,
        following: friendRequest.receiver,
        followers: friendRequest.receiver,
      },
    });

    await this.userModel.findByIdAndUpdate(friendRequest.receiver, {
      $addToSet: {
        friends: friendRequest.sender,
        following: friendRequest.sender,
        followers: friendRequest.sender,
      },
    });

    console.log(
      `✅ Friend request accepted: ${friendRequest.sender} ↔️ ${friendRequest.receiver}`,
    );

    return this.findOne(id);
  }

  async reject(id: string, userId: string): Promise<FriendRequest> {
    const friendRequest = await this.friendRequestModel.findById(id);

    if (!friendRequest) {
      throw new NotFoundException('طلب الصداقة غير موجود');
    }

    // فقط المستقبل يمكنه الرفض
    if (friendRequest.receiver.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك برفض هذا الطلب');
    }

    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('طلب الصداقة غير معلق');
    }

    friendRequest.status = FriendRequestStatus.REJECTED;
    return friendRequest.save();
  }

  async cancel(id: string, userId: string): Promise<FriendRequest> {
    const friendRequest = await this.friendRequestModel.findById(id);

    if (!friendRequest) {
      throw new NotFoundException('طلب الصداقة غير موجود');
    }

    // فقط المرسل يمكنه الإلغاء
    if (friendRequest.sender.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بإلغاء هذا الطلب');
    }

    if (friendRequest.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('طلب الصداقة غير معلق');
    }

    friendRequest.status = FriendRequestStatus.CANCELLED;
    return friendRequest.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const friendRequest = await this.friendRequestModel.findById(id);

    if (!friendRequest) {
      throw new NotFoundException('طلب الصداقة غير موجود');
    }

    // المرسل أو المستقبل يمكنهما الحذف
    if (
      friendRequest.sender.toString() !== userId &&
      friendRequest.receiver.toString() !== userId
    ) {
      throw new ForbiddenException('غير مصرح لك بحذف هذا الطلب');
    }

    await this.friendRequestModel.findByIdAndDelete(id);
  }
}
