import express from 'express';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const templateRouter = express.Router();
templateRouter.use(requireAuth);

// GET /api/templates
templateRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await MessageTemplate.find().sort({ createdAt: -1 }).lean();
    res.json({ items });
  })
);

// GET /api/templates/:id
templateRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tpl = await MessageTemplate.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    res.json(tpl);
  })
);

// POST /api/templates
templateRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const tpl = await MessageTemplate.create({ ...req.body, createdBy: req.admin.id });
    res.status(201).json(tpl);
  })
);

// PUT /api/templates/:id
templateRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const tpl = await MessageTemplate.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    Object.assign(tpl, req.body);
    await tpl.save(); // triggers variable re-extraction
    res.json(tpl);
  })
);

// DELETE /api/templates/:id
templateRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await MessageTemplate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  })
);

export default templateRouter;
