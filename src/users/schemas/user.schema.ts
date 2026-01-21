import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  username: string;

  @Prop({ required: true, unique: true, trim: true })
  authCode: string; // 70-character unique random code

  @Prop({ trim: true })
  refreshToken?: string; // For token refresh system

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop()
  avatar?: string;

  @Prop()
  bio?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  followers: string[];

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  following: string[];

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  friends: string[];

  @Prop({ type: [{ type: String, ref: 'Post' }], default: [] })
  pinnedPosts: string[];

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes will be created manually to avoid conflicts
