import mongoose from 'mongoose';
import { Campaign } from '../models/Campaign.js';
import { Student } from '../models/Student.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { CampaignMessage } from '../models/CampaignMessage.js';
import { addMessageJobs } from '../queues/messageQueue.js';
import { renderTemplate, buildTemplateVariables } from '../utils/renderTemplate.js';
import { emitEvent } from '../queues/realtime.js';
import { logger } from '../utils/logger.js';

const ENQUEUE_BATCH = 2000; // rows materialised + jobs added per batch

/**
 * Translate a campaign's stored segment into a MongoDB query.
 * Empty segment => all students.
 */
export function buildSegmentQuery(segment = {}) {
  if (segment.studentIds?.length) {
    return { _id: { $in: segment.studentIds } };
  }
  const q = {};
  if (segment.course) q.course = segment.course;
  if (segment.batch) q.batch = segment.batch;
  if (segment.city) q.city = segment.city;
  if (segment.status) q.status = segment.status;
  if (segment.tags?.length) q.tags = { $in: segment.tags };
  return q;
}

/** Count how many students a segment targets (used for previews + totalRecipients). */
export function countAudience(segment) {
  return Student.countDocuments(buildSegmentQuery(segment));
}

/**
 * Materialise CampaignMessage rows for the audience and enqueue send jobs.
 * Streams the student collection with a cursor so 300K records never load into
 * memory at once. Idempotent-ish: re-running skips students already enqueued
 * (unique index on campaignId+studentId).
 */
export async function enqueueCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const template = await MessageTemplate.findById(campaign.templateId);
  if (!template) throw new Error('Campaign template not found');

  campaign.status = 'sending';
  campaign.startedAt = new Date();
  await campaign.save();
  emitEvent('campaign:status', { campaignId: String(campaign._id), status: 'sending' });

  const query = buildSegmentQuery(campaign.segment);
  const cursor = Student.find(query).lean().cursor({ batchSize: ENQUEUE_BATCH });

  let buffer = [];
  let total = 0;

  const flush = async () => {
    if (!buffer.length) return;
    const students = buffer;
    buffer = [];

    // 1) Build CampaignMessage docs.
    const docs = students.map((s) => {
      const vars = {
        name: s.name,
        phone: s.phone,
        email: s.email,
        course: s.course,
        batch: s.batch,
        city: s.city,
      };
      return {
        campaignId: campaign._id,
        studentId: s._id,
        phone: s.phone,
        body: renderTemplate(template.content, vars),
        status: 'queued',
        queuedAt: new Date(),
      };
    });

    // ordered:false => one duplicate doesn't abort the whole batch.
    let inserted = [];
    try {
      inserted = await CampaignMessage.insertMany(docs, { ordered: false });
    } catch (err) {
      // Collect the successfully inserted docs even when some were duplicates.
      inserted = err.insertedDocs || [];
      if (!err.insertedDocs) {
        logger.error('insertMany failed for campaign batch', err.message);
      }
    }

    // 2) Enqueue one job per inserted message.
    const jobs = inserted.map((m) => {
      const student = students.find((s) => String(s._id) === String(m.studentId));
      const vars = student
        ? {
            name: student.name,
            phone: student.phone,
            email: student.email,
            course: student.course,
            batch: student.batch,
            city: student.city,
          }
        : {};
      return {
        name: 'send',
        data: {
          campaignMessageId: String(m._id),
          campaignId: String(campaign._id),
          to: m.phone,
          body: m.body,
          template: template.metaTemplateName
            ? {
                name: template.metaTemplateName,
                language: template.language,
                variables: buildTemplateVariables(template.variables, vars),
              }
            : null,
        },
      };
    });
    await addMessageJobs(jobs);
    total += inserted.length;
  };

  for await (const student of cursor) {
    buffer.push(student);
    if (buffer.length >= ENQUEUE_BATCH) await flush();
  }
  await flush();

  campaign.totalRecipients = total;
  campaign.status = total > 0 ? 'sending' : 'completed';
  await campaign.save();

  logger.info(`Campaign ${campaign._id} enqueued ${total} messages`);
  emitEvent('campaign:enqueued', { campaignId: String(campaign._id), total });
  return total;
}

/**
 * Build a queue job payload for one CampaignMessage + its student variables.
 * Shared by initial enqueue and failed-message retries.
 */
function buildJob(campaign, template, message, vars) {
  return {
    name: 'send',
    data: {
      campaignMessageId: String(message._id),
      campaignId: String(campaign._id),
      to: message.phone,
      body: message.body,
      template: template.metaTemplateName
        ? {
            name: template.metaTemplateName,
            language: template.language,
            variables: buildTemplateVariables(template.variables, vars),
          }
        : null,
    },
  };
}

/**
 * Re-enqueue every failed message in a campaign. Resets them to "queued",
 * decrements the campaign's failedCount, and pushes fresh jobs. Returns the
 * number of messages requeued.
 */
export async function retryFailedMessages(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  const template = await MessageTemplate.findById(campaign.templateId);
  if (!template) throw new Error('Campaign template not found');

  const failed = await CampaignMessage.find({ campaignId, status: 'failed' }).lean();
  if (!failed.length) return 0;

  // Pull the matching students once for template variable substitution.
  const studentIds = failed.map((m) => m.studentId).filter(Boolean);
  const students = await Student.find({ _id: { $in: studentIds } }).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  const ids = failed.map((m) => m._id);
  await CampaignMessage.updateMany(
    { _id: { $in: ids } },
    { $set: { status: 'queued', error: null, failedAt: null, queuedAt: new Date() } }
  );

  const jobs = failed.map((m) => {
    const s = byId.get(String(m.studentId)) || {};
    const vars = { name: s.name, phone: s.phone, email: s.email, course: s.course, batch: s.batch, city: s.city };
    return buildJob(campaign, template, m, vars);
  });
  await addMessageJobs(jobs);

  // Reset campaign so it reflects the in-flight retries.
  await Campaign.updateOne(
    { _id: campaignId },
    { $set: { status: 'sending', completedAt: null }, $inc: { failedCount: -failed.length } }
  );

  logger.info(`Retrying ${failed.length} failed messages for campaign ${campaignId}`);
  emitEvent('campaign:status', { campaignId: String(campaignId), status: 'sending' });
  return failed.length;
}

/**
 * Recompute campaign counters from CampaignMessage rows and mark completed if
 * no messages remain in-flight. Cheap enough to call after status changes.
 */
export async function refreshCampaignCounters(campaignId) {
  const id = new mongoose.Types.ObjectId(campaignId);
  const agg = await CampaignMessage.aggregate([
    { $match: { campaignId: id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = Object.fromEntries(agg.map((r) => [r._id, r.count]));
  const sent = (counts.sent || 0) + (counts.delivered || 0) + (counts.read || 0);
  const delivered = (counts.delivered || 0) + (counts.read || 0);
  const read = counts.read || 0;
  const failed = counts.failed || 0;
  const inFlight = (counts.pending || 0) + (counts.queued || 0);

  const update = {
    sentCount: sent,
    deliveredCount: delivered,
    readCount: read,
    failedCount: failed,
  };
  if (inFlight === 0) {
    update.status = 'completed';
    update.completedAt = new Date();
  }

  const campaign = await Campaign.findByIdAndUpdate(campaignId, update, { new: true });
  emitEvent('campaign:counters', {
    campaignId: String(campaignId),
    ...update,
  });
  return campaign;
}

export default {
  enqueueCampaign,
  refreshCampaignCounters,
  retryFailedMessages,
  buildSegmentQuery,
  countAudience,
};
