import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

async function fixOldConversations() {
  console.log('🔧 Starting conversation fix script...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const conversationModel = app.get(getModelToken('Conversation'));
  const messageModel = app.get(getModelToken('Message'));

  try {
    // Find all conversations
    const conversations = await conversationModel.find({ isDeleted: false });
    console.log(`📊 Found ${conversations.length} conversations to check`);

    let fixedCount = 0;

    for (const conversation of conversations) {
      const conversationId = conversation._id.toString();
      console.log(`\n🔍 Checking conversation ${conversationId}...`);
      console.log(`   Type: ${conversation.type}`);
      console.log(
        `   Current participants: ${conversation.participants.map((p: any) => p.toString()).join(', ')}`,
      );

      // Get all messages in this conversation
      const messages = await messageModel.find({
        conversation: conversationId,
      });
      console.log(`   Messages count: ${messages.length}`);

      if (messages.length === 0) {
        console.log(`   ⚠️ No messages found, skipping...`);
        continue;
      }

      // Get all unique senders
      const senders = new Set(messages.map((m: any) => m.sender.toString()));
      console.log(`   Unique senders: ${Array.from(senders).join(', ')}`);

      // Check if all senders are participants
      const participantIds = new Set(
        conversation.participants.map((p: any) => p.toString()),
      );
      const missingSenders = Array.from(senders).filter(
        (senderId) => !participantIds.has(senderId),
      );

      if (missingSenders.length > 0) {
        console.log(
          `   ❌ Found ${missingSenders.length} senders not in participants:`,
          missingSenders,
        );

        // Add missing senders to participants
        conversation.participants.push(...missingSenders);
        await conversation.save();

        console.log(
          `   ✅ Fixed! New participants: ${conversation.participants.map((p: any) => p.toString()).join(', ')}`,
        );
        fixedCount++;
      } else {
        console.log(`   ✅ All senders are participants, OK`);
      }
    }

    console.log(`\n✅ Script completed!`);
    console.log(`   Total conversations checked: ${conversations.length}`);
    console.log(`   Conversations fixed: ${fixedCount}`);
    console.log(`   Conversations OK: ${conversations.length - fixedCount}`);
  } catch (error) {
    console.error('❌ Error during fix:', error);
  } finally {
    await app.close();
  }
}

fixOldConversations();
