const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const changelog = await prisma.changelogEntry.create({
    data: {
      version: 'v1.1.0',
      title: 'Initial Changelog Feature',
      body: '## Welcome\\nThis is the very first changelog entry testing markdown.\\n- Added **Changelog** modal.\\n- Handled unread status properly.\\n- **Enjoy!**',
    },
  });
  console.log('Created changelog:', changelog);
}

main().catch(console.error).finally(() => prisma.$disconnect());
