import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Post, PostDocument } from '../posts/schemas/post.schema';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
  ) {}

  async create(
    createCommentDto: CreateCommentDto,
    userId: string,
  ): Promise<Comment> {
    // التحقق من وجود المنشور
    const post = await this.postModel.findById(createCommentDto.postId);
    if (!post || post.isDeleted) {
      throw new NotFoundException('المنشور غير موجود');
    }

    // إذا كان تعليق على تعليق آخر
    if (createCommentDto.parentCommentId) {
      const parentComment = await this.commentModel.findById(
        createCommentDto.parentCommentId,
      );
      if (!parentComment || parentComment.isDeleted) {
        throw new NotFoundException('التعليق الأب غير موجود');
      }
    }

    const comment = new this.commentModel({
      post: createCommentDto.postId,
      author: userId,
      content: createCommentDto.content,
      parentComment: createCommentDto.parentCommentId || null,
    });

    const savedComment = await comment.save();

    // إضافة التعليق إلى قائمة تعليقات المنشور
    await this.postModel.findByIdAndUpdate(createCommentDto.postId, {
      $push: { comments: savedComment._id },
    });

    return this.findOne(savedComment._id.toString());
  }

  async findAll(postId: string, skip = 0, limit = 50): Promise<Comment[]> {
    return this.commentModel
      .find({
        post: postId,
        isDeleted: false,
        parentComment: null, // فقط التعليقات الرئيسية
      })
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async findReplies(
    commentId: string,
    skip = 0,
    limit = 20,
  ): Promise<Comment[]> {
    return this.commentModel
      .find({
        parentComment: commentId,
        isDeleted: false,
      })
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async findOne(id: string): Promise<Comment> {
    const comment = await this.commentModel
      .findById(id)
      .populate('author', 'username firstName lastName avatar')
      .populate('likes', 'username')
      .populate('parentComment')
      .exec();

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('التعليق غير موجود');
    }

    return comment;
  }

  async update(
    id: string,
    updateCommentDto: UpdateCommentDto,
    userId: string,
  ): Promise<Comment> {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('التعليق غير موجود');
    }

    if (comment.author.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بتعديل هذا التعليق');
    }

    Object.assign(comment, updateCommentDto);
    return comment.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('التعليق غير موجود');
    }

    if (comment.author.toString() !== userId) {
      throw new ForbiddenException('غير مصرح لك بحذف هذا التعليق');
    }

    // Soft delete
    comment.isDeleted = true;
    await comment.save();

    // إزالة التعليق من قائمة تعليقات المنشور
    await this.postModel.findByIdAndUpdate(comment.post, {
      $pull: { comments: comment._id },
    });
  }

  async likeComment(commentId: string, userId: string): Promise<Comment> {
    const comment = await this.commentModel.findById(commentId);

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('التعليق غير موجود');
    }

    const userIdObj = userId as any;

    if (comment.likes.includes(userIdObj)) {
      // Unlike
      comment.likes = comment.likes.filter(
        (id) => id.toString() !== userId,
      ) as any;
    } else {
      // Like
      comment.likes.push(userIdObj);
    }

    return comment.save();
  }
}
