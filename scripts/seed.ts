import { PrismaClient, MediaType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database for development and frontend testing...');

  // 1) Clean existing seed data safely if needed (Optional, or upsert)
  const usersData = [
    {
      firebaseUid: 'dev-user-ahmed',
      displayName: 'أحمد الفاروق',
      bio: 'مهندس برمجيات ومهتم بالتقنية والمحتوى الهادف 💻✨',
      avatarKey: null,
    },
    {
      firebaseUid: 'dev-user-sarah',
      displayName: 'سارة المنصور',
      bio: 'مصممة واجهات ومحبة للقراءة والتطوير المستمر 🎨📖',
      avatarKey: null,
    },
    {
      firebaseUid: 'dev-user-khalid',
      displayName: 'خالد بن الوليد',
      bio: 'مطور أعمال وشغوف بمشاريع الأمة الناشئة 🚀',
      avatarKey: null,
    },
  ];

  const createdUsers = [];
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { firebaseUid: u.firebaseUid },
      update: { displayName: u.displayName, bio: u.bio },
      create: u,
    });
    createdUsers.push(user);
    console.log(`  👤 User ready: ${user.displayName} (${user.id})`);
  }

  // 2) Seed realistic posts
  const postsData = [
    {
      authorId: createdUsers[0].id,
      text: 'السلام عليكم ورحمة الله وبركاته، أهلاً بكم في شبكة أمة! نسعد بتواجدكم في هذه المنصة الهادفة 🌟',
    },
    {
      authorId: createdUsers[1].id,
      text: 'تصميم تجربة المستخدم ليست مجرد ألوان وأشكال، بل هي كيفية جعل رحلة المستخدم بديهية ومريحة لأقصى درجة.',
    },
    {
      authorId: createdUsers[2].id,
      text: 'من الرائع رؤية بنية تحتية هندسية متماسكة تعتمد على الكلين كود والـ Keyset Pagination لتحقيق سرعة فائقة!',
    },
    {
      authorId: createdUsers[0].id,
      text: 'سؤال للنقاش: ما هي أهم المبادئ التي تحرص عليها عند كتابة كود عالي الاعتمادية (High Reliability)؟',
    },
    {
      authorId: createdUsers[1].id,
      text: 'صباح الخير والإنتاجية! لا تنسوا أذكار الصباح وورد القرآن الكريم 📖☕',
    },
  ];

  for (const p of postsData) {
    const existing = await prisma.post.findFirst({
      where: { authorId: p.authorId, text: p.text },
    });

    if (!existing) {
      const post = await prisma.post.create({
        data: {
          authorId: p.authorId,
          text: p.text,
          status: 'ACTIVE',
        },
      });
      console.log(`  📝 Post created: "${(post.text ?? '').slice(0, 30)}..."`);
    }
  }

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
