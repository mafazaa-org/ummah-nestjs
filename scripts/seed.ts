import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database for development, V2 testing, and frontend...');

  // 1) Seed Super Admin & Users
  const usersData = [
    {
      firebaseUid: 'dev-super-admin',
      displayName: 'المدير العام للمنصة',
      bio: 'حساب الإدارة العليا والسوبر أدمن للمنصة 🛡️⚡',
      globalRole: 'SUPER_ADMIN' as const,
      avatarKey: null,
    },
    {
      firebaseUid: 'dev-user-ahmed',
      displayName: 'أحمد الفاروق',
      bio: 'مهندس برمجيات ومهتم بالتقنية والمحتوى الهادف 💻✨',
      globalRole: 'USER' as const,
      avatarKey: null,
    },
    {
      firebaseUid: 'dev-user-sarah',
      displayName: 'سارة المنصور',
      bio: 'مصممة واجهات ومحبة للقراءة والتطوير المستمر 🎨📖',
      globalRole: 'USER' as const,
      avatarKey: null,
    },
    {
      firebaseUid: 'dev-user-khalid',
      displayName: 'خالد بن الوليد',
      bio: 'مطور أعمال وشغوف بمشاريع عُقاب الناشئة 🚀',
      globalRole: 'USER' as const,
      avatarKey: null,
    },
  ];

  const createdUsers: any[] = [];
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { firebaseUid: u.firebaseUid },
      update: { displayName: u.displayName, bio: u.bio, globalRole: u.globalRole },
      create: u,
    });
    createdUsers.push(user);
    console.log(`  👤 User ready: ${user.displayName} [${user.globalRole}] (${user.id})`);
  }

  // 2) Seed realistic posts
  const postsData = [
    {
      authorId: createdUsers[1].id,
      text: 'السلام عليكم ورحمة الله وبركاته، أهلاً بكم في شبكة عُقاب! نسعد بتواجدكم في هذه المنصة الهادفة 🌟',
    },
    {
      authorId: createdUsers[2].id,
      text: 'تصميم تجربة المستخدم ليست مجرد ألوان وأشكال، بل هي كيفية جعل رحلة المستخدم بديهية ومريحة لأقصى درجة.',
    },
    {
      authorId: createdUsers[3].id,
      text: 'من الرائع رؤية بنية تحتية هندسية متماسكة تعتمد على الكلين كود والـ Keyset Pagination لتحقيق سرعة فائقة!',
    },
  ];

  const seededPosts: any[] = [];
  for (const p of postsData) {
    let post = await prisma.post.findFirst({
      where: { authorId: p.authorId, text: p.text },
    });

    if (!post) {
      post = await prisma.post.create({
        data: {
          authorId: p.authorId,
          text: p.text,
          status: 'ACTIVE',
        },
      });
      console.log(`  📝 Post created: "${(post.text ?? '').slice(0, 30)}..."`);
    }
    seededPosts.push(post);
  }

  // 3) Seed Sample Comments
  if (seededPosts.length > 0) {
    const firstPost = seededPosts[0];
    const existingComment = await prisma.comment.findFirst({
      where: { postId: firstPost.id, authorId: createdUsers[2].id },
    });

    if (!existingComment) {
      await prisma.$transaction(async (tx) => {
        await tx.comment.create({
          data: {
            postId: firstPost.id,
            authorId: createdUsers[2].id,
            text: 'ما شاء الله تبارك الله، بالتوفيق الدائم للمنصة وفريق العمل المبارك!',
            status: 'ACTIVE',
          },
        });
        await tx.post.update({
          where: { id: firstPost.id },
          data: { commentsCount: { increment: 1 } },
        });
      });
      console.log(`  💬 Sample comment added to Post: ${firstPost.id}`);
    }
  }

  // 4) Seed V2 Sample Groups with 3 Privacy Tiers
  const adminUser = createdUsers[0];
  const ahmedUser = createdUsers[1];
  const sarahUser = createdUsers[2];

  // A) Public Group
  const publicGroup = await prisma.conversation.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      type: 'GROUP',
      privacy: 'PUBLIC',
      title: 'ملتقى التقنية والبرمجة العام',
      description: 'مجموعة عامة لكل المطورين والمهتمين بهندسة البرمجيات والنظم الموزعة.',
      createdById: adminUser.id,
      members: {
        create: [
          { userId: adminUser.id, role: 'OWNER', joinedSeq: 0, lastReadSeq: 0 },
          { userId: ahmedUser.id, role: 'ADMIN', joinedSeq: 0, lastReadSeq: 0 },
          { userId: sarahUser.id, role: 'MEMBER', joinedSeq: 0, lastReadSeq: 0 },
        ],
      },
    },
  });
  console.log(`  👥 Public Group ready: "${publicGroup.title}" [PUBLIC]`);

  // B) Private Group (with Invite Code)
  const privateGroup = await prisma.conversation.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      type: 'GROUP',
      privacy: 'PRIVATE',
      title: 'فريق رواد الأعمال والمشاريع',
      description: 'مجموعة خاصة برواد الأعمال، الانضمام عبر طلب معتمد أو رابط دعوة فقط.',
      inviteCode: 'inv-entrepreneurs-2026',
      inviteEnabled: true,
      createdById: ahmedUser.id,
      members: {
        create: [
          { userId: ahmedUser.id, role: 'OWNER', joinedSeq: 0, lastReadSeq: 0 },
        ],
      },
    },
  });
  console.log(`  🔒 Private Group ready: "${privateGroup.title}" [PRIVATE] (Invite: ${privateGroup.inviteCode})`);

  // C) Secret Stealth Group
  const secretGroup = await prisma.conversation.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      type: 'GROUP',
      privacy: 'SECRET',
      title: 'مجلس الإدارة الخاص السري',
      description: 'مجموعة سرية مغلقة، لا يمكن العثور عليها بالبحث والانضمام بالإضافة الحصرية.',
      createdById: adminUser.id,
      members: {
        create: [
          { userId: adminUser.id, role: 'OWNER', joinedSeq: 0, lastReadSeq: 0 },
        ],
      },
    },
  });
  console.log(`  🕵️ Secret Group ready: "${secretGroup.title}" [SECRET] (Non-discoverable)`);

  console.log('✅ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
