import express from 'express';
import multer from 'multer';
import os from 'os';
import { Student } from '../models/Student.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { importStudentsFromFile } from '../services/importService.js';

export const studentRouter = express.Router();
studentRouter.use(requireAuth);

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 100 * 1024 * 1024 } });

// Shared filter builder so list / export / bulk-delete stay consistent.
function buildStudentQuery({ search, course, batch, city, status, tags }) {
  const q = {};
  if (course) q.course = course;
  if (batch) q.batch = batch;
  if (city) q.city = city;
  if (status) q.status = status;
  if (tags) q.tags = { $in: String(tags).split(',').map((t) => t.trim()).filter(Boolean) };
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ name: rx }, { phone: rx }, { email: rx }];
  }
  return q;
}

// GET /api/students — paginated search + filter (Module 1)
studentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 25);
    const q = buildStudentQuery(req.query);

    const [items, total] = await Promise.all([
      Student.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Student.countDocuments(q),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// GET /api/students/stats — quick database overview (Module 1)
studentRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [total, active, byCourse, byCity] = await Promise.all([
      Student.estimatedDocumentCount(),
      Student.countDocuments({ status: 'active' }),
      Student.aggregate([{ $group: { _id: '$course', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
      Student.aggregate([{ $group: { _id: '$city', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
    ]);
    res.json({
      total,
      active,
      inactive: total - active,
      byCourse: byCourse.filter((r) => r._id).map((r) => ({ key: r._id, count: r.count })),
      byCity: byCity.filter((r) => r._id).map((r) => ({ key: r._id, count: r.count })),
    });
  })
);

// GET /api/students/export — stream filtered students as CSV (Module 1)
studentRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const q = buildStudentQuery(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.write('name,phone,email,course,batch,city,status\n');

    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cursor = Student.find(q).lean().cursor();
    for await (const s of cursor) {
      res.write([s.name, s.phone, s.email, s.course, s.batch, s.city, s.status].map(esc).join(',') + '\n');
    }
    res.end();
  })
);

// POST /api/students/bulk-delete — delete by ids OR by filter (Module 1)
studentRouter.post(
  '/bulk-delete',
  asyncHandler(async (req, res) => {
    const { ids, filter } = req.body;
    let result;
    if (Array.isArray(ids) && ids.length) {
      result = await Student.deleteMany({ _id: { $in: ids } });
    } else if (filter) {
      result = await Student.deleteMany(buildStudentQuery(filter));
    } else {
      return res.status(400).json({ error: 'Provide ids[] or a filter object' });
    }
    res.json({ deleted: result.deletedCount });
  })
);

// GET /api/students/filters — distinct values for segment dropdowns
studentRouter.get(
  '/filters',
  asyncHandler(async (_req, res) => {
    const [courses, batches, cities] = await Promise.all([
      Student.distinct('course'),
      Student.distinct('batch'),
      Student.distinct('city'),
    ]);
    res.json({
      courses: courses.filter(Boolean).sort(),
      batches: batches.filter(Boolean).sort(),
      cities: cities.filter(Boolean).sort(),
    });
  })
);

// POST /api/students — create one
studentRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const student = await Student.create(req.body);
    res.status(201).json(student);
  })
);

// POST /api/students/import — bulk CSV/Excel upload
studentRouter.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });
    const stats = await importStudentsFromFile(req.file.path, req.file.originalname);
    res.json({ message: 'Import complete', ...stats });
  })
);

// GET /api/students/:id — single record (after literal GET routes)
studentRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  })
);

// PUT /api/students/:id
studentRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  })
);

// DELETE /api/students/:id
studentRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  })
);

export default studentRouter;
