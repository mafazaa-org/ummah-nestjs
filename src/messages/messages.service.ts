import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
  ) {}

  // Conversations
  async createConversation(
    createConversationDto: CreateConversationDto,
    currentUserId: string,
  ): Promise<Conversation> {
    // Always include the current user in participants
    const participants = [
      ...new Set([...createConversationDto.participants, currentUserId]),
    ];

    // Check if private conversation already exists
    if (createConversationDto.type === 'private') {
      const existing = await this.conversationModel.findOne({
        type: 'private',
        participants: { $all: participants },
        isDeleted: false,
      });

      if (existing) {
        console.log(`Found existing conversation: ${existing._id}`);
        return existing;
      }
    }

    console.log(
      `Creating new conversation with participants: ${participants.join(', ')}`,
    );
    const conversation = new this.conversationModel({
      ...createConversationDto,
      participants,
    });
    return conversation.save();
  }

  async createGroupChat(
    createGroupChatDto: CreateGroupChatDto,
    currentUserId: string,
  ): Promise<Conversation> {
    // Always include the current user in participants
    const participants = [
      ...new Set([...createGroupChatDto.participants, currentUserId]),
    ];

    console.log(
      `Creating new group chat "${createGroupChatDto.name}" with participants: ${participants.join(', ')}`,
    );

    const conversation = new this.conversationModel({
      type: 'group',
      participants,
      name: createGroupChatDto.name,
      avatar: createGroupChatDto.avatar,
    });

    const savedConversation = await conversation.save();
    console.log(`✅ Created standalone group chat: ${savedConversation._id}`);

    return savedConversation;
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return this.conversationModel
      .find({
        participants: userId,
        isDeleted: false,
      })
      .populate('participants', 'username firstName lastName avatar')
      .populate('lastMessage')
      .populate('group', 'name avatar')
      .sort({ updatedAt: -1 })
      .exec();
  }

  async getConversation(id: string): Promise<Conversation> {
    const conversation = await this.conversationModel
      .findById(id)
      .populate('participants', 'username firstName lastName avatar')
      .populate('group', 'name avatar')
      .exec();

    if (!conversation || conversation.isDeleted) {
      throw new NotFoundException('المحادثة غير موجودة');
    }

    return conversation;
  }

  async deleteConversation(id: string, userId: string): Promise<void> {
    const conversation = await this.conversationModel.findById(id);

    if (!conversation || conversation.isDeleted) {
      throw new NotFoundException('المحادثة غير موجودة');
    }

    // Check if user is participant
    if (!conversation.participants.some((p) => p.toString() === userId)) {
      throw new BadRequestException('غير مصرح لك بحذف هذه المحادثة');
    }

    conversation.isDeleted = true;
    await conversation.save();
  }

  // Messages
  async createMessage(
    createMessageDto: CreateMessageDto,
    senderId: string,
  ): Promise<Message> {
    const conversation = await this.conversationModel.findById(
      createMessageDto.conversation,
    );

    if (!conversation || conversation.isDeleted) {
      throw new NotFoundException('المحادثة غير موجودة');
    }

    // Check if sender is participant
    if (!conversation.participants.some((p) => p.toString() === senderId)) {
      throw new BadRequestException('غير مصرح لك بإرسال رسائل في هذه المحادثة');
    }

    const message = new this.messageModel({
      ...createMessageDto,
      sender: senderId,
    });

    await message.save();

    // Update conversation's last message and updatedAt
    conversation.lastMessage = message._id as any;
    conversation.updatedAt = new Date();
    await conversation.save();

    return message.populate('sender', 'username firstName lastName avatar');
  }

  async getMessages(
    conversationId: string,
    userId: string,
    skip = 0,
    limit = 50,
  ): Promise<Message[]> {
    console.log(
      `📨 Getting messages for conversation: ${conversationId}, userId: ${userId}`,
    );
    const conversation = await this.conversationModel.findById(conversationId);

    if (!conversation || conversation.isDeleted) {
      console.error(`❌ Conversation not found or deleted: ${conversationId}`);
      throw new NotFoundException('المحادثة غير موجودة');
    }

    console.log(
      `👥 Conversation participants: ${conversation.participants.map((p) => p.toString()).join(', ')}`,
    );

    // Check if user is participant
    if (!conversation.participants.some((p) => p.toString() === userId)) {
      console.error(
        `❌ User ${userId} is NOT a participant of conversation ${conversationId}`,
      );
      console.error(
        `   Participants are: ${conversation.participants.map((p) => p.toString()).join(', ')}`,
      );
      throw new BadRequestException('غير مصرح لك بعرض هذه المحادثة');
    }

    console.log(`✅ User ${userId} is a participant, fetching messages...`);

    return this.messageModel
      .find({
        conversation: conversationId,
        isDeleted: false,
      })
      .populate('sender', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async markAsRead(messageId: string, userId: string): Promise<Message> {
    const message = await this.messageModel.findById(messageId);

    if (!message || message.isDeleted) {
      throw new NotFoundException('الرسالة غير موجودة');
    }

    if (!message.readBy.includes(userId as any)) {
      message.readBy.push(userId as any);
      await message.save();
    }

    return message;
  }

  async deleteMessage(id: string, userId: string): Promise<void> {
    const message = await this.messageModel.findById(id);

    if (!message || message.isDeleted) {
      throw new NotFoundException('الرسالة غير موجودة');
    }

    if (message.sender.toString() !== userId) {
      throw new BadRequestException('غير مصرح لك بحذف هذه الرسالة');
    }

    message.isDeleted = true;
    await message.save();
  }
}
