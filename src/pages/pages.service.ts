import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Page, PageDocument } from './schemas/page.schema';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';

@Injectable()
export class PagesService {
  constructor(@InjectModel(Page.name) private pageModel: Model<PageDocument>) {}

  async create(createPageDto: CreatePageDto, userId: string): Promise<Page> {
    const page = new this.pageModel({
      ...createPageDto,
      admin: userId,
      followers: [userId], // Admin is automatically a follower
    });
    return page.save();
  }

  async findAll(skip: number = 0, limit: number = 20): Promise<Page[]> {
    return this.pageModel
      .find({ isDeleted: false })
      .populate('admin', 'username firstName lastName avatar')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Page> {
    const page = await this.pageModel
      .findById(id)
      .populate('admin', 'username firstName lastName avatar')
      .populate('admins', 'username firstName lastName avatar')
      .populate('followers', 'username firstName lastName avatar')
      .populate({
        path: 'pinnedPosts',
        populate: {
          path: 'author',
          select: 'username firstName lastName avatar',
        },
      })
      .exec();

    if (!page || page.isDeleted) {
      throw new NotFoundException('الصفحة غير موجودة');
    }

    return page;
  }

  async findByUser(userId: string): Promise<Page[]> {
    return this.pageModel
      .find({
        isDeleted: false,
        admin: userId,
      })
      .populate('admin', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(
    id: string,
    updatePageDto: UpdatePageDto,
    userId: string,
  ): Promise<Page> {
    const page = await this.pageModel.findById(id);

    if (!page || page.isDeleted) {
      throw new NotFoundException('الصفحة غير موجودة');
    }

    if (page.admin.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بتعديل هذه الصفحة');
    }

    Object.assign(page, updatePageDto);
    return page.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const page = await this.pageModel.findById(id);

    if (!page || page.isDeleted) {
      throw new NotFoundException('الصفحة غير موجودة');
    }

    if (page.admin.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بحذف هذه الصفحة');
    }

    page.isDeleted = true;
    await page.save();
  }

  async followPage(pageId: string, userId: string): Promise<Page> {
    const page = await this.pageModel.findById(pageId);

    if (!page || page.isDeleted) {
      throw new NotFoundException('الصفحة غير موجودة');
    }

    const userIdObj = userId as any;

    if (page.followers.includes(userIdObj)) {
      throw new BadRequestException('أنت بالفعل تتابع هذه الصفحة');
    }

    page.followers.push(userIdObj);
    return page.save();
  }

  async unfollowPage(pageId: string, userId: string): Promise<Page> {
    const page = await this.pageModel.findById(pageId);

    if (!page || page.isDeleted) {
      throw new NotFoundException('الصفحة غير موجودة');
    }

    if (page.admin.toString() === userId) {
      throw new BadRequestException('لا يمكن للمسؤول إلغاء متابعة الصفحة');
    }

    page.followers = page.followers.filter(
      (follower) => follower.toString() !== userId,
    );

    return page.save();
  }

  async addAdmin(
    pageId: string,
    adminId: string,
    userId: string,
  ): Promise<Page> {
    const page = await this.pageModel.findById(pageId);

    if (!page || page.isDeleted) {
      throw new NotFoundException('الصفحة غير موجودة');
    }

    if (page.admin.toString() !== userId) {
      throw new ForbiddenException('فقط مالك الصفحة يمكنه إضافة مسؤولين');
    }

    const adminIdObj = adminId as any;

    if (
      !page.admins.includes(adminIdObj) &&
      page.admin.toString() !== adminId
    ) {
      page.admins.push(adminIdObj);
    } else {
      throw new BadRequestException('المستخدم مسؤول بالفعل');
    }

    return page.save();
  }

  async removeAdmin(
    pageId: string,
    adminId: string,
    userId: string,
  ): Promise<Page> {
    const page = await this.pageModel.findById(pageId);

    if (!page || page.isDeleted) {
      throw new NotFoundException('الصفحة غير موجودة');
    }

    if (page.admin.toString() !== userId) {
      throw new ForbiddenException('فقط مالك الصفحة يمكنه إزالة المسؤولين');
    }

    page.admins = page.admins.filter((id) => id.toString() !== adminId);

    return page.save();
  }

  async pinPost(pageId: string, userId: string, postId: string): Promise<Page> {
    const isAuthorized = await this.isAdminOrOwner(pageId, userId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'غير مصرح لك بتثبيت المنشورات في هذه الصفحة',
      );
    }

    const page = await this.pageModel.findById(pageId);
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    // Initialize if undefined
    if (!page.pinnedPosts) {
      page.pinnedPosts = [];
    }

    const postIdObj = postId as any; // Cast to conform to ObjectId type

    // Check if already pinned (comparing strings)
    const isPinned = page.pinnedPosts.some((id) => id.toString() === postId);
    if (isPinned) {
      throw new BadRequestException('المنشور مثبت بالفعل');
    }

    if (page.pinnedPosts.length >= 3) {
      throw new BadRequestException(
        'لقد وصلت للحد الأقصى للمنشورات المثبتة (3)',
      );
    }

    page.pinnedPosts.push(postIdObj);
    return page.save();
  }

  async unpinPost(
    pageId: string,
    userId: string,
    postId: string,
  ): Promise<Page> {
    const isAuthorized = await this.isAdminOrOwner(pageId, userId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'غير مصرح لك بإلغاء تثبيت المنشورات في هذه الصفحة',
      );
    }

    const page = await this.pageModel.findById(pageId);
    if (!page) throw new NotFoundException('الصفحة غير موجودة');

    if (
      !page.pinnedPosts ||
      !page.pinnedPosts.some((id) => id.toString() === postId)
    ) {
      throw new BadRequestException('المنشور غير مثبت');
    }

    page.pinnedPosts = page.pinnedPosts.filter(
      (id) => id.toString() !== postId,
    );
    return page.save();
  }

  async isAdminOrOwner(pageId: string, userId: string): Promise<boolean> {
    const page = await this.pageModel.findById(pageId);
    if (!page) return false;

    const isOwner = page.admin.toString() === userId;
    const isAdmin =
      page.admins && page.admins.some((id) => id.toString() === userId);

    return isOwner || isAdmin;
  }
}
