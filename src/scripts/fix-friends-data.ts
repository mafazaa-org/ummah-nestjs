/**
 * Migration Script: Fix Friends Data
 * This script adds all accepted friend requests to the friends array
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../users/schemas/user.schema';
import { FriendRequest, FriendRequestStatus } from '../friend-requests/schemas/friend-request.schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const friendRequestModel = app.get<Model<FriendRequest>>(getModelToken(FriendRequest.name));

  console.log('🔧 Starting friends data migration...');
  
  // Get all accepted friend requests
  const acceptedRequests = await friendRequestModel.find({
    status: FriendRequestStatus.ACCEPTED,
  }).exec();

  console.log(`📋 Found ${acceptedRequests.length} accepted friend requests`);

  let fixed = 0;

  for (const request of acceptedRequests) {
    const senderId = request.sender.toString();
    const receiverId = request.receiver.toString();

    // Add to sender's friends
    await userModel.findByIdAndUpdate(senderId, {
      $addToSet: { friends: receiverId },
    });

    // Add to receiver's friends
    await userModel.findByIdAndUpdate(receiverId, {
      $addToSet: { friends: senderId },
    });

    fixed++;
    console.log(`✅ Fixed friendship: ${senderId} ↔️ ${receiverId}`);
  }

  console.log(`\n🎉 Migration complete! Fixed ${fixed} friendships.`);

  await app.close();
}

bootstrap().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
