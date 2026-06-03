import express from 'express';
import { Campaign } from '../models/Campaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { CampaignMessage } from '../models/CampaignMessage.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { enqueueCampaign, countAudience, retryFailedMessages } from '../services/campaignService.js';
import { logger } from '../utils/logger.js';

export const campaignRouter = express.Router();
campaignRouter.use(requireAuth);

// GET /api/campaigns — history/list (Module 2)
campaignRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const q = {};
    if (req.query.status) q.status = req.query.status;

    const [items, total] = await Promise.all([
      Campaign.find(q)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('templateId', 'name')
        .lean({ virtuals: true }),
      Campaign.countDocuments(q),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// POST /api/campaigns/preview-audience — count recipients for a segment
campaignRouter.post(
  '/preview-audience',
  asyncHandler(async (req, res) => {
    const count = await countAudience(req.body.segment || {});
    res.json({ count });
  })
);

// POST /api/campaigns — create (draft, scheduled, or send immediately)
campaignRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, templateId, segment = {}, scheduledAt, sendNow } = req.body;
    if (!name || !templateId) {
      return res.status(400).json({ error: 'name and templateId are required' });
    }
    const template = await MessageTemplate.findById(templateId);
    if (!template) return res.status(400).json({ error: 'Template not found' });

    const totalRecipients = await countAudience(segment);

    const campaign = await Campaign.create({
      name,
      templateId,
      message: template.content,
      segment,
      totalRecipients,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : sendNow ? 'queued' : 'draft',
      createdBy: req.admin.id,
    });

    // Immediate execution: enqueue in background, respond right away.
    if (sendNow && !scheduledAt) {
      enqueueCampaign(campaign._id).catch((err) =>
        logger.error(`enqueueCampaign failed for ${campaign._id}`, err)
      );
    }

    res.status(201).json(campaign);
  })
);

// GET /api/campaigns/:id — detail with live counters
campaignRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id)
      .populate('templateId', 'name content')
      .lean({ virtuals: true });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  })
);

// POST /api/campaigns/:id/send — trigger a draft/scheduled campaign now
campaignRouter.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (['sending', 'completed'].includes(campaign.status)) {
      return res.status(409).json({ error: `Campaign already ${campaign.status}` });
    }
    campaign.status = 'queued';
    await campaign.save();
    enqueueCampaign(campaign._id).catch((err) =>
      logger.error(`enqueueCampaign failed for ${campaign._id}`, err)
    );
    res.json({ message: 'Campaign queued for sending', campaignId: campaign._id });
  })
);

// POST /api/campaigns/:id/cancel — mark cancelled (stops scheduler pickup)
campaignRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  })
);

// GET /api/campaigns/:id/messages — per-recipient tracking (Module 5)
campaignRouter.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const q = { campaignId: req.params.id };
    if (req.query.status) q.status = req.query.status;

    const [items, total] = await Promise.all([
      CampaignMessage.find(q)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('studentId', 'name')
        .lean(),
      CampaignMessage.countDocuments(q),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// PUT /api/campaigns/:id — edit a campaign that hasn't started yet (Module 2)
campaignRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(409).json({ error: `Cannot edit a campaign that is ${campaign.status}` });
    }

    const { name, templateId, segment, scheduledAt } = req.body;
    if (name) campaign.name = name;
    if (templateId) {
      const template = await MessageTemplate.findById(templateId);
      if (!template) return res.status(400).json({ error: 'Template not found' });
      campaign.templateId = templateId;
      campaign.message = template.content;
    }
    if (segment) {
      campaign.segment = segment;
      campaign.totalRecipients = await countAudience(segment);
    }
    if (scheduledAt !== undefined) {
      campaign.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
      campaign.status = scheduledAt ? 'scheduled' : 'draft';
    }
    await campaign.save();
    res.json(campaign);
  })
);

// POST /api/campaigns/:id/duplicate — clone a campaign as a fresh draft (Module 2)
campaignRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const src = await Campaign.findById(req.params.id).lean();
    if (!src) return res.status(404).json({ error: 'Campaign not found' });
    const copy = await Campaign.create({
      name: `${src.name} (copy)`,
      templateId: src.templateId,
      message: src.message,
      segment: src.segment,
      totalRecipients: src.totalRecipients,
      status: 'draft',
      createdBy: req.admin.id,
    });
    res.status(201).json(copy);
  })
);

// POST /api/campaigns/:id/retry-failed — re-enqueue failed messages (Module 2/5)
campaignRouter.post(
  '/:id/retry-failed',
  asyncHandler(async (req, res) => {
    const count = await retryFailedMessages(req.params.id);
    res.json({ message: `Requeued ${count} failed messages`, requeued: count });
  })
);

// DELETE /api/campaigns/:id — remove a campaign and its message records (Module 2)
campaignRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'sending') {
      return res.status(409).json({ error: 'Cannot delete a campaign while it is sending' });
    }
    await CampaignMessage.deleteMany({ campaignId: campaign._id });
    await campaign.deleteOne();
    res.json({ message: 'Campaign deleted' });
  })
);

export default campaignRouter;
