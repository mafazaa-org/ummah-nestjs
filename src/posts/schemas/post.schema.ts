import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  content: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  likes: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
  comments: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  shares: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Group' })
  group?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Page' })
  page?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post' })
  originalPost?: Types.ObjectId; // For reposts

  @Prop({ default: false })
  isRepost: boolean; // Whether this post is a repost

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Indexes for performance
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ isDeleted: 1 });
