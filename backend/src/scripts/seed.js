import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { Student } from '../models/Student.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { logger } from '../utils/logger.js';

const COURSES = ['JEE', 'NEET', 'Foundation', 'CUET'];
const BATCHES = ['2025', '2026', '2027'];
const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai'];

async function seed() {
  await connectDB();

  // 1) Default admin
  let admin = await Admin.findOne({ email: env.adminEmail });
  if (!admin) {
    admin = new Admin({ name: 'Admin', email: env.adminEmail });
    await admin.setPassword(env.adminPassword);
    await admin.save();
    logger.info(`Created admin: ${env.adminEmail} / ${env.adminPassword}`);
  } else {
    logger.info('Admin already exists');
  }

  // 2) Sample template
  const tplCount = await MessageTemplate.countDocuments();
  if (tplCount === 0) {
    await MessageTemplate.create({
      name: 'Class Reminder',
      content: 'Hi {{name}}, your {{course}} class starts tomorrow at 10 AM.',
      metaTemplateName: '', // set to your approved Meta template name for cold sends
      language: 'en_US',
      category: 'UTILITY',
      createdBy: admin._id,
    });
    logger.info('Created sample template');
  }

  // 3) Sample students (override count with: node src/scripts/seed.js 5000)
  const count = parseInt(process.argv[2], 10) || 500;
  const existing = await Student.estimatedDocumentCount();
  if (existing < count) {
    const batch = [];
    for (let i = existing; i < count; i++) {
      batch.push({
        name: `Student ${i + 1}`,
        phone: `+9190000${String(i).padStart(5, '0')}`,
        email: `student${i + 1}@example.com`,
        course: COURSES[i % COURSES.length],
        batch: BATCHES[i % BATCHES.length],
        city: CITIES[i % CITIES.length],
        status: 'active',
      });
      if (batch.length >= 2000) {
        await Student.insertMany(batch, { ordered: false }).catch(() => {});
        batch.length = 0;
      }
    }
    if (batch.length) await Student.insertMany(batch, { ordered: false }).catch(() => {});
    logger.info(`Seeded students up to ${count}`);
  }

  await mongoose.disconnect();
  logger.info('Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed failed', err);
  process.exit(1);
});
