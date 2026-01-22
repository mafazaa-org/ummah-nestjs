import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

async function deleteInvalidConversations() {
  console.log('🗑️ Starting invalid conversation deletion script...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const conversationModel = app.get(getModelToken('Conversation'));
  const messageModel = app.get(getModelToken('Message'));

  try {
    // Find all conversations
    const conversations = await conversationModel.find({ isDeleted: false });
    console.log(`📊 Found ${conversations.length} conversations to check`);

    let deletedCount = 0;
    const conversationsToDelete = [];

    for (const conversation of conversations) {
      const conversationId = conversation._id.toString();

      // Get all messages in this conversation
      const messages = await messageModel.find({
        conversation: conversationId,
      });

      // If conversation is private and has only 1 participant, or has no messages, mark for deletion
      if (
        conversation.type === 'private' &&
        (conversation.participants.length < 2 || messages.length === 0)
      ) {
        console.log(`❌ Invalid conversation ${conversationId}:`);
        console.log(
          `   Participants: ${conversation.participants.length} (should be 2)`,
        );
        console.log(`   Messages: ${messages.length}`);
        conversationsToDelete.push(conversationId);
      }
    }

    if (conversationsToDelete.length > 0) {
      console.log(
        `\n🗑️ Deleting ${conversationsToDelete.length} invalid conversations...`,
      );

      const result = await conversationModel.updateMany(
        { _id: { $in: conversationsToDelete } },
        { $set: { isDeleted: true } },
      );

      console.log(`✅ Deleted ${result.modifiedCount} conversations`);
      deletedCount = result.modifiedCount;
    } else {
      console.log(`\n✅ No invalid conversations found!`);
    }

    console.log(`\n✅ Script completed!`);
    console.log(`   Total conversations checked: ${conversations.length}`);
    console.log(`   Conversations deleted: ${deletedCount}`);
    console.log(
      `   Valid conversations: ${conversations.length - deletedCount}`,
    );
  } catch (error) {
    console.error('❌ Error during deletion:', error);
  } finally {
    await app.close();
  }
}

deleteInvalidConversations();
