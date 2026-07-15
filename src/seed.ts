import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import prisma from './lib/prisma';

const users = [
  {
    name:     'Alex Johnson',
    username: 'alexj',
    email:    'alex.johnson@modulink.app',
    password: 'Alex@1234',
    bio:      'Software engineer by day, gamer by night. Love coffee and clean code.',
  },
  {
    name:     'Sophia Martinez',
    username: 'sophiam',
    email:    'sophia.martinez@modulink.app',
    password: 'Sophia@1234',
    bio:      'UI/UX designer. I make things pretty and functional. Based in Barcelona.',
  },
  {
    name:     'Liam Chen',
    username: 'liamchen',
    email:    'liam.chen@modulink.app',
    password: 'Liam@1234',
    bio:      'Full-stack developer. Open source contributor. Tea > coffee.',
  },
  {
    name:     'Olivia Brooks',
    username: 'oliviab',
    email:    'olivia.brooks@modulink.app',
    password: 'Olivia@1234',
    bio:      'Photographer and travel blogger. Currently in Tokyo.',
  },
  {
    name:     'Noah Williams',
    username: 'noahw',
    email:    'noah.williams@modulink.app',
    password: 'Noah@1234',
    bio:      'DevOps engineer. Kubernetes fanatic. I automate everything.',
  },
  {
    name:     'Emma Patel',
    username: 'emmapatel',
    email:    'emma.patel@modulink.app',
    password: 'Emma@1234',
    bio:      'Data scientist at a fintech startup. Love music and hiking.',
  },
  {
    name:     'James Turner',
    username: 'jturner',
    email:    'james.turner@modulink.app',
    password: 'James@1234',
    bio:      'Mobile developer (React Native & Flutter). Building cool apps since 2015.',
  },
  {
    name:     'Ava Robinson',
    username: 'avarobin',
    email:    'ava.robinson@modulink.app',
    password: 'Ava@1234',
    bio:      'Cybersecurity analyst. CTF player. Stay safe out there!',
  },
  {
    name:     'Ethan Scott',
    username: 'ethanscott',
    email:    'ethan.scott@modulink.app',
    password: 'Ethan@1234',
    bio:      'Backend engineer. PostgreSQL & Redis enthusiast. Coffee addict.',
  },
  {
    name:     'Isabella Kim',
    username: 'isabellakim',
    email:    'isabella.kim@modulink.app',
    password: 'Isabella@1234',
    bio:      'Product manager at a SaaS company. Turning ideas into shipped features.',
  },
];

async function seed() {
  console.log('🌱  Seeding 10 users...\n');

  const lines: string[] = [
    '================================================================',
    '  ModuLink — Seed User Credentials',
    `  Generated: ${new Date().toLocaleString()}`,
    '================================================================',
    '',
  ];

  for (const u of users) {
    // Skip if email already exists
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  ⚠  Skipped (already exists): ${u.email}`);
      continue;
    }

    const hashed = await bcrypt.hash(u.password, 10);

    const created = await prisma.user.create({
      data: {
        name:     u.name,
        username: u.username,
        email:    u.email,
        password: hashed,
        bio:      u.bio,
      },
    });

    console.log(`  ✅  Created user #${created.id}: ${u.name} (${u.username})`);

    lines.push(`Name     : ${u.name}`);
    lines.push(`Username : ${u.username}`);
    lines.push(`Email    : ${u.email}`);
    lines.push(`Password : ${u.password}`);
    lines.push(`Bio      : ${u.bio}`);
    lines.push('----------------------------------------------------------------');
    lines.push('');
  }

  lines.push('================================================================');
  lines.push('  Keep this file secure — do not commit it to source control!');
  lines.push('================================================================');

  const outPath = path.join(__dirname, '..', 'seed-credentials.txt');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(`\n📄  Credentials saved to: ${outPath}`);
  console.log('✅  Seeding complete.\n');

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
