import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true }, // E.164, e.g. +919876543210
    email: { type: String, trim: true, lowercase: true },
    course: { type: String, trim: true, index: true },
    batch: { type: String, trim: true, index: true },
    city: { type: String, trim: true, index: true },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    // Free-form tags for ad-hoc segmentation beyond course/batch/city.
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Phone is the WhatsApp identity — enforce uniqueness to avoid dupes on re-import.
studentSchema.index({ phone: 1 }, { unique: true });
// Text search across the common lookup fields.
studentSchema.index({ name: 'text', email: 'text', phone: 'text' });

export const Student = mongoose.model('Student', studentSchema);
export default Student;
