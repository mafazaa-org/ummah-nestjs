import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoryDocument = Story & Document;

@Schema({ timestamps: true })
export class Story {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true })
  mediaUrl: string; // رابط الصورة أو الفيديو

  @Prop({ type: String, default: 'image' })
  mediaType: 'image' | 'video'; // نوع الميديا

  @Prop({ trim: true, maxlength: 500 })
  caption?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  views: Types.ObjectId[]; // من شاهد الستوري

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  expiresAt: Date; // تاريخ انتهاء الستوري (24 ساعة)
}

export const StorySchema = SchemaFactory.createForClass(Story);

// Indexes for performance
StorySchema.index({ author: 1, createdAt: -1 });
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL Index - يحذف تلقائياً بعد انتهاء الصلاحية
