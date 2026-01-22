/**
 * Migration Script: Add admin to admins array for existing groups
 * This script adds the main admin to the admins array for all existing groups
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Group } from '../groups/schemas/group.schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const groupModel = app.get<Model<Group>>(getModelToken(Group.name));

  console.log('🔧 Starting group admins migration...');

  // Get all groups
  const groups = await groupModel.find({ isDeleted: false }).exec();

  console.log(`📋 Found ${groups.length} groups to migrate`);

  let migrated = 0;

  for (const group of groups) {
    // Check if admin is already in admins array
    const adminInAdmins =
      group.admins &&
      group.admins.some(
        (admin: any) => admin.toString() === group.admin.toString(),
      );

    if (!adminInAdmins) {
      // Add admin to admins array
      if (!group.admins) {
        group.admins = [];
      }
      group.admins.push(group.admin);
      await group.save();
      migrated++;
      console.log(`✅ Migrated group "${group.name}" (${group._id})`);
    }
  }

  console.log(`\n🎉 Migration complete! Migrated ${migrated} groups.`);

  await app.close();
}

bootstrap().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
