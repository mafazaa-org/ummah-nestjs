import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {}

  async create(createUserDto: any): Promise<User> {
    // Check if username already exists
    const existingUsername = await this.userModel.findOne({
      username: createUserDto.username.toLowerCase(),
    });

    if (existingUsername) {
      throw new ConflictException('اسم المستخدم موجود بالفعل');
    }

    // Check if auth code already exists (if provided)
    if (createUserDto.authCode) {
      const existingCode = await this.userModel.findOne({
        authCode: createUserDto.authCode,
      });

      if (existingCode) {
        throw new ConflictException('رمز المصادقة مستخدم بالفعل');
      }
    }

    // Create user - explicitly exclude email and password fields
    const userData = {
      username: createUserDto.username.toLowerCase(),
      authCode: createUserDto.authCode,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
    };

    const user = new this.userModel(userData);

    return user.save();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find({ isActive: true }).select('-password').exec();
  }

  async searchUsers(query: string, currentUserId?: string): Promise<User[]> {
    const searchRegex = new RegExp(query, 'i');
    const users = await this.userModel
      .find({
        isActive: true,
        $or: [
          { username: searchRegex },
          { firstName: searchRegex },
          { lastName: searchRegex },
        ],
      })
      .select('-password')
      .limit(20)
      .exec();

    // Exclude current user from results
    if (currentUserId) {
      return users.filter((user) => user._id.toString() !== currentUserId);
    }

    return users;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userModel
      .findById(id)
      .select('-password')
      .populate({
        path: 'pinnedPosts',
        populate: {
          path: 'author',
          select: 'username firstName lastName avatar',
        },
      })
      .exec();

    if (!user || !user.isActive) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userModel
      .findOne({ username: username.toLowerCase() })
      .select('-password')
      .exec();
  }

  async findByAuthCode(authCode: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ authCode }).exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-password')
      .exec();

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    return user;
  }

  async followUser(userId: string, followUserId: string): Promise<User> {
    if (userId === followUserId) {
      throw new BadRequestException('لا يمكنك متابعة نفسك');
    }

    const user = await this.userModel.findById(userId);
    const followUser = await this.userModel.findById(followUserId);

    if (!user || !followUser) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    if (user.following.includes(followUserId)) {
      throw new BadRequestException('أنت تتابع هذا المستخدم بالفعل');
    }

    user.following.push(followUserId);
    followUser.followers.push(userId);

    await user.save();
    await followUser.save();

    return this.findOne(userId);
  }

  async unfollowUser(userId: string, followUserId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    const followUser = await this.userModel.findById(followUserId);

    if (!user || !followUser) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    user.following = user.following.filter(
      (id) => id.toString() !== followUserId,
    );
    followUser.followers = followUser.followers.filter(
      (id) => id.toString() !== userId,
    );

    await user.save();
    await followUser.save();

    return this.findOne(userId);
  }

  async getFriends(userId: string): Promise<User[]> {
    // Defensive: return empty if userId invalid
    if (!userId) return [];

    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // Ensure friends is an array
    const friendsIds = Array.isArray((user as any).friends)
      ? (user as any).friends
      : [];

    // Get all friends (users in the friends array)
    const friends = await this.userModel
      .find({
        _id: { $in: friendsIds },
        isActive: true,
      })
      .select('-password')
      .exec();

    return friends;
  }

  async pinPost(userId: string, postId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // Initialize if undefined
    if (!user.pinnedPosts) {
      user.pinnedPosts = [];
    }

    // Check if already pinned
    if (user.pinnedPosts.includes(postId)) {
      throw new BadRequestException('المنشور مثبت بالفعل');
    }

    // Limit pinned posts (e.g., max 3) - Optional but good practice
    if (user.pinnedPosts.length >= 3) {
      throw new BadRequestException(
        'لقد وصلت للحد الأقصى للمنشورات المثبتة (3)',
      );
    }

    user.pinnedPosts.push(postId);
    await user.save();
    return user;
  }

  async unpinPost(userId: string, postId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    if (!user.pinnedPosts || !user.pinnedPosts.includes(postId)) {
      throw new BadRequestException('المنشور غير مثبت');
    }

    user.pinnedPosts = user.pinnedPosts.filter((id) => id !== postId);
    await user.save();
    return user;
  }

  async remove(id: string): Promise<void> {
    const result = await this.userModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    );

    if (!result) {
      throw new NotFoundException('المستخدم غير موجود');
    }
  }
}
