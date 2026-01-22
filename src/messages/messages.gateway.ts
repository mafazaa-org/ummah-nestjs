import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(private readonly messagesService: MessagesService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.connectedUsers.set(userId, client.id);
      console.log(`User ${userId} connected with socket ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = Array.from(this.connectedUsers.entries()).find(
      ([, socketId]) => socketId === client.id,
    )?.[0];

    if (userId) {
      this.connectedUsers.delete(userId);
      console.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      type: string;
      senderId: string;
    },
  ) {
    try {
      console.log(`📩 Received sendMessage event from ${data.senderId}:`, {
        conversationId: data.conversationId,
        content: data.content.substring(0, 50),
        type: data.type,
      });

      const message = await this.messagesService.createMessage(
        {
          conversation: data.conversationId,
          type: data.type,
          content: data.content,
        },
        data.senderId,
      );

      console.log(`✅ Message created successfully: ${(message as any)._id}`);

      // Get conversation participants
      const conversation = await this.messagesService.getConversation(
        data.conversationId,
      );

      // Send message to all participants
      conversation.participants.forEach((participantId: any) => {
        const socketId = this.connectedUsers.get(participantId.toString());
        if (socketId) {
          console.log(
            `📤 Sending message to participant ${participantId.toString()}`,
          );
          this.server.to(socketId).emit('newMessage', message);
        } else {
          console.log(
            `⚠️ Participant ${participantId.toString()} is not connected`,
          );
        }
      });

      return { success: true, message };
    } catch (error) {
      console.error(`❌ Error in sendMessage:`, error);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @MessageBody() data: { messageId: string; userId: string },
  ) {
    try {
      await this.messagesService.markAsRead(data.messageId, data.userId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody()
    data: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    },
  ) {
    // Broadcast typing status to other participants
    this.server.emit(`typing:${data.conversationId}`, {
      userId: data.userId,
      isTyping: data.isTyping,
    });
  }

  // Method to send message from service
  sendMessageToUser(userId: string, event: string, data: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }
}
