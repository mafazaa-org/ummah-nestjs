import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GroupDocument = Group & Document;

@Schema({ timestamps: true })
export class Group {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop()
  coverImage?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  admin: Types.ObjectId; // الأدمن الأساسي (للتوافق مع الكود القديم)

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[]; // قائمة جميع الأدمنز

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  members: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
  posts: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
  pinnedPosts: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversation?: Types.ObjectId;

  @Prop({ enum: ['public', 'private'], default: 'public' })
  privacy: string;

  // تحكم الأدمن في إظهار أسماء الأعضاء لغير الأعضاء/غير الأدمنز
  @Prop({ default: true })
  showMemberNames: boolean;

  @Prop({ default: false })
  allowMembersToPost: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const GroupSchema = SchemaFactory.createForClass(Group);

// Indexes
GroupSchema.index({ name: 1 });
GroupSchema.index({ admin: 1 });
GroupSchema.index({ admins: 1 });
GroupSchema.index({ isDeleted: 1 });
