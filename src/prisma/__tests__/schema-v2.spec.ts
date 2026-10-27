import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

describe('Phase 1: Database Schema & Invariants V2 (Test vs Counter-Test)', () => {
  let prisma: PrismaClient;
  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    // Create test users for schema invariant checks
    userA = await prisma.user.create({
      data: {
        firebaseUid: `schema-user-a-${Date.now()}`,
        displayName: 'User A',
      },
    });

    userB = await prisma.user.create({
      data: {
        firebaseUid: `schema-user-b-${Date.now()}`,
        displayName: 'User B',
      },
    });
  });

  afterAll(async () => {
    // Cleanup created data
    await prisma.conversation.deleteMany({
      where: { createdById: { in: [userA.id, userB.id] } },
    });
    await prisma.post.deleteMany({
      where: { authorId: { in: [userA.id, userB.id] } },
    });
    await prisma.pushToken.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.$disconnect();
  });

  // 1. Direct Key Uniqueness
  it('[Happy Path] allows creating a DIRECT conversation with a unique directKey', async () => {
    const directKey = `${userA.id}:${userB.id}`;
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        directKey,
        createdById: userA.id,
      },
    });
    expect(conv.id).toBeDefined();
    expect(conv.directKey).toBe(directKey);
  });

  it('[Counter-Test] rejects creating another conversation with the duplicate directKey', async () => {
    const directKey = `${userA.id}:${userB.id}`;
    await expect(
      prisma.conversation.create({
        data: {
          type: 'DIRECT',
          directKey,
          createdById: userB.id,
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  // 2. Atomic Seq Uniqueness per Conversation
  it('[Happy Path] allows inserting messages with distinct seq in the same conversation', async () => {
    const group = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        privacy: 'PUBLIC',
        title: 'Seq Test Group',
        createdById: userA.id,
      },
    });

    const msg1 = await prisma.message.create({
      data: {
        conversationId: group.id,
        seq: 1,
        senderId: userA.id,
        clientMsgId: uuidv4(),
        type: 'TEXT',
        text: 'Message 1',
      },
    });

    const msg2 = await prisma.message.create({
      data: {
        conversationId: group.id,
        seq: 2,
        senderId: userA.id,
        clientMsgId: uuidv4(),
        type: 'TEXT',
        text: 'Message 2',
      },
    });

    expect(msg1.seq).toBe(1);
    expect(msg2.seq).toBe(2);
  });

  it('[Counter-Test] rejects inserting duplicate seq in the same conversation', async () => {
    const group = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        privacy: 'PUBLIC',
        title: 'Seq Duplicate Test Group',
        createdById: userA.id,
      },
    });

    await prisma.message.create({
      data: {
        conversationId: group.id,
        seq: 1,
        senderId: userA.id,
        clientMsgId: uuidv4(),
        type: 'TEXT',
        text: 'First message',
      },
    });

    await expect(
      prisma.message.create({
        data: {
          conversationId: group.id,
          seq: 1, // Duplicate seq
          senderId: userB.id,
          clientMsgId: uuidv4(),
          type: 'TEXT',
          text: 'Conflicting seq message',
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  // 3. Idempotency Key Uniqueness (conversationId, senderId, clientMsgId)
  it('[Counter-Test] rejects duplicate clientMsgId from the same sender in the same conversation', async () => {
    const group = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        privacy: 'PUBLIC',
        title: 'Idempotency Test Group',
        createdById: userA.id,
      },
    });

    const clientMsgId = uuidv4();

    await prisma.message.create({
      data: {
        conversationId: group.id,
        seq: 1,
        senderId: userA.id,
        clientMsgId,
        type: 'TEXT',
        text: 'Initial delivery',
      },
    });

    // Replay with identical clientMsgId
    await expect(
      prisma.message.create({
        data: {
          conversationId: group.id,
          seq: 2,
          senderId: userA.id,
          clientMsgId, // Same clientMsgId
          type: 'TEXT',
          text: 'Replayed delivery attempt',
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  // 4. Group Join Request Uniqueness (conversationId, userId)
  it('[Happy Path] allows user to submit a join request to a PRIVATE group', async () => {
    const privateGroup = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        privacy: 'PRIVATE',
        title: 'Private Invariant Group',
        createdById: userA.id,
      },
    });

    const req = await prisma.groupJoinRequest.create({
      data: {
        conversationId: privateGroup.id,
        userId: userB.id,
        status: 'PENDING',
      },
    });

    expect(req.id).toBeDefined();
    expect(req.status).toBe('PENDING');
  });

  it('[Counter-Test] rejects duplicate pending join request for the same user in the same group', async () => {
    const privateGroup = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        privacy: 'PRIVATE',
        title: 'Spam Join Request Group',
        createdById: userA.id,
      },
    });

    await prisma.groupJoinRequest.create({
      data: {
        conversationId: privateGroup.id,
        userId: userB.id,
        status: 'PENDING',
      },
    });

    // Duplicate attempt
    await expect(
      prisma.groupJoinRequest.create({
        data: {
          conversationId: privateGroup.id,
          userId: userB.id,
          status: 'PENDING',
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  // 5. Comments on Posts & Foreign Key Integrity
  it('[Happy Path] allows creating a Comment on an active Post', async () => {
    const post = await prisma.post.create({
      data: {
        authorId: userA.id,
        text: 'Testing Comments Schema',
        status: 'ACTIVE',
      },
    });

    const comment = await prisma.comment.create({
      data: {
        postId: post.id,
        authorId: userB.id,
        text: 'Great post!',
        status: 'ACTIVE',
      },
    });

    expect(comment.id).toBeDefined();
    expect(comment.postId).toBe(post.id);
    expect(comment.authorId).toBe(userB.id);
  });

  it('[Counter-Test] rejects creating a Comment for a non-existent postId', async () => {
    await expect(
      prisma.comment.create({
        data: {
          postId: uuidv4(), // Non-existent post ID
          authorId: userB.id,
          text: 'Ghost comment',
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  // 6. PushToken Uniqueness
  it('[Counter-Test] rejects inserting a duplicate push token across users', async () => {
    const sharedToken = `token-fcm-${Date.now()}`;

    await prisma.pushToken.create({
      data: {
        userId: userA.id,
        provider: 'FCM',
        platform: 'ANDROID',
        token: sharedToken,
      },
    });

    // Attempt to register same token for userB
    await expect(
      prisma.pushToken.create({
        data: {
          userId: userB.id,
          provider: 'FCM',
          platform: 'ANDROID',
          token: sharedToken,
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  // 7. GlobalRole Invariant
  it('[Happy Path] User defaults to globalRole USER and supports SUPER_ADMIN', async () => {
    const regularUser = await prisma.user.create({
      data: {
        firebaseUid: `reg-${Date.now()}`,
        displayName: 'Regular User',
      },
    });
    expect(regularUser.globalRole).toBe('USER');

    const superAdmin = await prisma.user.create({
      data: {
        firebaseUid: `admin-${Date.now()}`,
        displayName: 'Platform Super Admin',
        globalRole: 'SUPER_ADMIN',
      },
    });
    expect(superAdmin.globalRole).toBe('SUPER_ADMIN');

    // Cleanup
    await prisma.user.deleteMany({
      where: { id: { in: [regularUser.id, superAdmin.id] } },
    });
  });

  // 8. Call LiveKit Room Uniqueness
  it('[Counter-Test] rejects creating another Call with duplicate livekitRoom identifier', async () => {
    const conv = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        privacy: 'PUBLIC',
        title: 'Call Invariant Group',
        createdById: userA.id,
      },
    });

    const roomName = `call_room_${Date.now()}`;

    await prisma.call.create({
      data: {
        conversationId: conv.id,
        initiatorId: userA.id,
        livekitRoom: roomName,
        status: 'RINGING',
      },
    });

    await expect(
      prisma.call.create({
        data: {
          conversationId: conv.id,
          initiatorId: userB.id,
          livekitRoom: roomName, // Duplicate room identifier
          status: 'RINGING',
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
