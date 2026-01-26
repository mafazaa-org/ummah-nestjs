import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { GroupsService } from '../groups/groups.service';
import { RepostDto } from './dto/repost.dto';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private groupsService: GroupsService,
  ) {}

  async create(createPostDto: CreatePostDto, userId: string): Promise<Post> {
    const post = new this.postModel({
      ...createPostDto,
      author: userId,
    });

    return post.save();
  }

  async findAll(skip = 0, limit = 20): Promise<Post[]> {
    return this.postModel
      .find({ isDeleted: false })
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .populate('group', 'name')
      .populate({
        path: 'originalPost',
        populate: {
          path: 'author',
          select: 'username firstName lastName avatar',
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async findOne(id: string): Promise<Post> {
    const post = await this.postModel
      .findById(id)
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .populate({
        path: 'originalPost',
        populate: {
          path: 'author',
          select: 'username firstName lastName avatar',
        },
      })
      .exec();

    if (!post || post.isDeleted) {
      throw new NotFoundException('المنشور غير موجود');
    }

    return post;
  }

  async findByUser(userId: string, skip = 0, limit = 20): Promise<Post[]> {
    return this.postModel
      .find({ author: userId, isDeleted: false })
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async findByGroup(
    groupId: string,
    userId: string,
    skip = 0,
    limit = 20,
  ): Promise<Post[]> {
    console.log(`📊 Fetching posts for group: ${groupId} by user: ${userId}`);

    // First check if user can access this group
    await this.groupsService.findOne(groupId, userId);

    const posts = await this.postModel
      .find({ group: groupId, isDeleted: false })
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    console.log(`✅ Found ${posts.length} posts for group ${groupId}`);
    return posts;
  }

  async findByPage(
    pageId: string,
    userId: string,
    skip = 0,
    limit = 20,
  ): Promise<Post[]> {
    console.log(`📊 Fetching posts for page: ${pageId}`);

    // Here we might check if page is public or if user followers/admin
    // For now, assuming pages are public or visible to all

    const posts = await this.postModel
      .find({ page: pageId, isDeleted: false })
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    console.log(`✅ Found ${posts.length} posts for page ${pageId}`);
    return posts;
  }

  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    userId: string,
  ): Promise<Post> {
    const post = await this.postModel.findById(id);

    if (!post || post.isDeleted) {
      throw new NotFoundException('المنشور غير موجود');
    }

    if (post.author.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بتعديل هذا المنشور');
    }

    Object.assign(post, updatePostDto);
    return post.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const post = await this.postModel.findById(id);

    if (!post || post.isDeleted) {
      throw new NotFoundException('المنشور غير موجود');
    }

    if (post.author.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بحذف هذا المنشور');
    }

    post.isDeleted = true;
    await post.save();
  }

  async likePost(postId: string, userId: string): Promise<Post> {
    const post = await this.postModel.findById(postId);

    if (!post || post.isDeleted) {
      throw new NotFoundException('المنشور غير موجود');
    }

    const userIdObj = userId as any;

    if (post.likes.includes(userIdObj)) {
      // Unlike
      post.likes = post.likes.filter((id) => id.toString() !== userId) as any;
    } else {
      // Like
      post.likes.push(userIdObj);
    }

    return post.save();
  }

  async sharePost(postId: string, userId: string): Promise<Post> {
    const post = await this.postModel.findById(postId);

    if (!post || post.isDeleted) {
      throw new NotFoundException('المنشور غير موجود');
    }

    const userIdObj = userId as any;

    if (!post.shares.includes(userIdObj)) {
      post.shares.push(userIdObj);
    }

    return post.save();
  }

  async repost(
    postId: string,
    repostDto: RepostDto,
    userId: string,
  ): Promise<Post> {
    console.log(
      `🔄 Starting repost process: postId=${postId}, userId=${userId}`,
    );

    // Validate input parameters
    if (!postId || !userId) {
      console.log(`❌ Validation failed: postId=${postId}, userId=${userId}`);
      throw new BadRequestException('معرف المنشور ومعرف المستخدم مطلوبان');
    }

    // Find the original post
    console.log(`🔍 Finding original post: ${postId}`);
    const originalPost = await this.postModel.findById(postId);

    if (!originalPost || originalPost.isDeleted) {
      console.log(`❌ Original post not found or deleted: ${postId}`);
      throw new NotFoundException('المنشور الأصلي غير موجود');
    }

    console.log(
      `✅ Found original post: author=${originalPost.author}, group=${originalPost.group}, content=${originalPost.content.substring(0, 50)}...`,
    );

    // Check if the original post is in a private/secret group
    if (originalPost.group) {
      console.log(`🔒 Checking group access for group: ${originalPost.group}`);
      try {
        const group = await this.groupsService.findOne(
          originalPost.group.toString(),
          userId,
        );
        console.log(
          `📋 Group found: privacy=${group?.privacy}, members=${group?.members?.length || 0}`,
        );

        // If group is private or secret, don't allow reposting
        if (
          group &&
          (group.privacy === 'private' || group.privacy === 'secret')
        ) {
          console.log(`🚫 Group is private/secret: ${group.privacy}`);
          throw new ForbiddenException(
            'لا يمكن إعادة نشر المنشورات من المجموعات الخاصة أو السرية',
          );
        }

        // Check if user is member of the group (for public groups)
        if (group && group.privacy === 'public') {
          const isMember = group.members.some(
            (member) => member.toString() === userId,
          );
          console.log(`👥 User is member of public group: ${isMember}`);
          if (!isMember) {
            console.log(`🚫 User is not member of public group`);
            throw new ForbiddenException(
              'يجب أن تكون عضواً في المجموعة لإعادة نشر منشوراتها',
            );
          }
        }
      } catch (error) {
        // If there's an error finding the group, assume it's not accessible
        console.warn(
          `Could not verify group access for post ${postId}:`,
          error.message,
        );
        console.log(`🚫 Group access verification failed`);
        throw new ForbiddenException(
          'لا يمكن التحقق من صلاحية الوصول للمجموعة',
        );
      }
    } else {
      console.log(`ℹ️ No group associated with post, skipping group check`);
    }

    // Check if the original post is from a page - pages are usually public
    // We'll allow reposting from pages

    // Don't allow reposting your own posts
    const originalAuthorId = originalPost.author.toString();
    console.log(
      `👤 Checking authorship: originalAuthor=${originalAuthorId}, userId=${userId}`,
    );
    if (originalAuthorId === userId) {
      console.log(`🚫 User trying to repost their own post`);
      throw new ForbiddenException('لا يمكنك إعادة نشر منشوراتك الخاصة');
    }

    // Create the repost
    // For reposts, if no additional content is provided, use a default message
    const repostContent =
      repostDto.additionalContent?.trim() || '🔄 تم إعادة نشر هذا المنشور'; // Default repost message in Arabic

    console.log(`💾 Creating repost with content: "${repostContent}"`);
    console.log(
      `📝 Repost data: author=${userId}, content="${repostContent}", originalPost=${postId}, isRepost=true`,
    );

    const repost = new this.postModel({
      author: userId,
      content: repostContent,
      originalPost: postId,
      isRepost: true,
      images: [], // Reposts don't include images, just reference the original
    });

    console.log(`✅ Repost object created, validating...`);

    // Validate the repost object before saving
    const validationError = repost.validateSync();
    if (validationError) {
      console.error(`❌ Validation error:`, validationError);
      throw validationError;
    }

    console.log(`✅ Validation passed, saving to database...`);

    try {
      const savedRepost = await repost.save();
      console.log(`🎉 Repost saved successfully: ${savedRepost._id}`);
      return savedRepost;
    } catch (saveError) {
      console.error(`❌ Save error:`, saveError);
      throw saveError;
    }
  }
}
