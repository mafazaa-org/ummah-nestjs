import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Story, StoryDocument } from './schemas/story.schema';
import { CreateStoryDto } from './dto/create-story.dto';

@Injectable()
export class StoriesService {
  constructor(
    @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
  ) {}

  async create(createStoryDto: CreateStoryDto, userId: string): Promise<Story> {
    // الستوري ينتهي بعد 24 ساعة
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const story = new this.storyModel({
      ...createStoryDto,
      author: userId,
      expiresAt,
    });

    return story.save();
  }

  async findAll(skip = 0, limit = 20): Promise<Story[]> {
    const now = new Date();
    const stories = await this.storyModel
      .find({
        expiresAt: { $gt: now }, // فقط الستوريز غير المنتهية
      })
      .populate('author', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
    
    console.log(`📖 Found ${stories.length} active stories (out of ${await this.storyModel.countDocuments()} total)`);
    return stories;
  }

  async findByUser(userId: string, skip = 0, limit = 20): Promise<Story[]> {
    const now = new Date();
    return this.storyModel
      .find({
        author: userId,
        expiresAt: { $gt: now },
      })
      .populate('author', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async findOne(id: string): Promise<Story> {
    const story = await this.storyModel
      .findById(id)
      .populate('author', 'username firstName lastName avatar')
      .exec();

    if (!story) {
      throw new NotFoundException('الستوري غير موجود');
    }

    // التحقق من انتهاء الصلاحية
    if (new Date() > story.expiresAt) {
      throw new NotFoundException('الستوري منتهية الصلاحية');
    }

    return story;
  }

  async remove(id: string, userId: string): Promise<void> {
    const story = await this.storyModel.findById(id);

    if (!story) {
      throw new NotFoundException('الستوري غير موجود');
    }

    if (story.author.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بحذف هذا الستوري');
    }

    await this.storyModel.findByIdAndDelete(id);
  }

  async viewStory(storyId: string, userId: string): Promise<Story> {
    const story = await this.storyModel.findById(storyId);

    if (!story) {
      throw new NotFoundException('الستوري غير موجود');
    }

    // التحقق من انتهاء الصلاحية
    if (new Date() > story.expiresAt) {
      throw new NotFoundException('الستوري منتهية الصلاحية');
    }

    const userIdObj = userId as any;

    // إضافة المستخدم إلى قائمة المشاهدين إذا لم يكن موجوداً
    if (!story.views.includes(userIdObj)) {
      story.views.push(userIdObj);
      await story.save();
    }

    return this.findOne(storyId);
  }

  async getStoryViews(storyId: string, userId: string): Promise<number> {
    const story = await this.storyModel.findById(storyId);

    if (!story) {
      throw new NotFoundException('الستوري غير موجود');
    }

    // فقط صاحب الستوري يمكنه رؤية عدد المشاهدات
    if (story.author.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك برؤية عدد المشاهدات');
    }

    return story.views.length;
  }

  async getStoryViewers(storyId: string, userId: string): Promise<any[]> {
    const story = await this.storyModel
      .findById(storyId)
      .populate('views', 'username firstName lastName avatar')
      .exec();

    if (!story) {
      throw new NotFoundException('الستوري غير موجود');
    }

    // فقط صاحب الستوري يمكنه رؤية قائمة المشاهدين
    if (story.author.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك برؤية قائمة المشاهدين');
    }

    return story.views;
  }
}
