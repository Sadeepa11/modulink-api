import prisma from './lib/prisma';

async function main() {
  const count = await prisma.post.deleteMany();
  console.log(`Cleared ${count.count} posts from the database!`);
}

main()
  .catch((err) => {
    console.error('Error clearing posts:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
