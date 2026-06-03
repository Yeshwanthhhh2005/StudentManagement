import express from 'express';
import { Campaign } from '../models/Campaign.js';
import { Student } from '../models/Student.js';
import { CampaignMessage } from '../models/CampaignMessage.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const analyticsRouter = express.Router();
analyticsRouter.use(requireAuth);

// GET /api/analytics/overview — top-level dashboard metrics (Module 6)
analyticsRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [studentCount, campaignAgg] = await Promise.all([
      Student.estimatedDocumentCount(),
      Campaign.aggregate([
        {
          $group: {
            _id: null,
            campaigns: { $sum: 1 },
            totalRecipients: { $sum: '$totalRecipients' },
            sent: { $sum: '$sentCount' },
            delivered: { $sum: '$deliveredCount' },
            read: { $sum: '$readCount' },
            failed: { $sum: '$failedCount' },
          },
        },
      ]),
    ]);

    const a = campaignAgg[0] || {};
    const sent = a.sent || 0;
    const delivered = a.delivered || 0;
    const read = a.read || 0;

    res.json({
      students: studentCount,
      campaigns: a.campaigns || 0,
      totalRecipients: a.totalRecipients || 0,
      sent,
      delivered,
      read,
      failed: a.failed || 0,
      deliveryRate: sent ? +(delivered / sent).toFixed(4) : 0,
      readRate: delivered ? +(read / delivered).toFixed(4) : 0,
    });
  })
);

// GET /api/analytics/campaigns/:id — per-campaign performance report
analyticsRouter.get(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id).lean({ virtuals: true });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const statusBreakdown = await CampaignMessage.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      campaign,
      statusBreakdown: Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count])),
    });
  })
);

// GET /api/analytics/recent-campaigns — for dashboard table
analyticsRouter.get(
  '/recent-campaigns',
  asyncHandler(async (_req, res) => {
    const items = await Campaign.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .lean({ virtuals: true });
    res.json({ items });
  })
);

// GET /api/analytics/timeseries — daily sent/delivered/read/failed (Module 6)
analyticsRouter.get(
  '/timeseries',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const rows = await CampaignMessage.aggregate([
      { $match: { sentAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$sentAt' } },
          sent: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill gaps so the chart has a continuous date axis.
    const map = new Map(rows.map((r) => [r._id, r]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const r = map.get(d) || {};
      series.push({ date: d, sent: r.sent || 0, delivered: r.delivered || 0, read: r.read || 0, failed: r.failed || 0 });
    }
    res.json({ series });
  })
);

// GET /api/analytics/segments — delivery performance grouped by a field (Module 6)
analyticsRouter.get(
  '/segments',
  asyncHandler(async (req, res) => {
    const field = ['course', 'city', 'batch'].includes(req.query.by) ? req.query.by : 'course';

    const rows = await CampaignMessage.aggregate([
      { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 's' } },
      { $unwind: '$s' },
      {
        $group: {
          _id: `$s.${field}`,
          recipients: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
      { $sort: { recipients: -1 } },
      { $limit: 20 },
    ]);

    res.json({
      by: field,
      segments: rows.filter((r) => r._id).map((r) => ({
        key: r._id,
        recipients: r.recipients,
        delivered: r.delivered,
        read: r.read,
        failed: r.failed,
        deliveryRate: r.recipients ? +(r.delivered / r.recipients).toFixed(4) : 0,
      })),
    });
  })
);

// GET /api/analytics/campaigns/:id/export — per-message report as CSV (Module 6)
analyticsRouter.get(
  '/campaigns/:id/export',
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}.csv"`);
    res.write('phone,status,messageId,sentAt,deliveredAt,readAt,error\n');

    const esc = (v) => {
      const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cursor = CampaignMessage.find({ campaignId: req.params.id }).lean().cursor();
    for await (const m of cursor) {
      res.write([m.phone, m.status, m.messageId, m.sentAt, m.deliveredAt, m.readAt, m.error].map(esc).join(',') + '\n');
    }
    res.end();
  })
);

export default analyticsRouter;
