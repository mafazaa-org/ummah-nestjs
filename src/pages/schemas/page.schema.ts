import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PageDocument = Page & Document;

@Schema({ timestamps: true })
export class Page {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop()
  coverImage?: string;

  @Prop()
  profileImage?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  admin: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  followers: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
  posts: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
  pinnedPosts: Types.ObjectId[];

  @Prop({
    enum: ['business', 'community', 'brand', 'public_figure', 'other'],
    default: 'other',
  })
  category: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const PageSchema = SchemaFactory.createForClass(Page);

// Indexes
PageSchema.index({ name: 1 });
PageSchema.index({ admin: 1 });
PageSchema.index({ isDeleted: 1 });
