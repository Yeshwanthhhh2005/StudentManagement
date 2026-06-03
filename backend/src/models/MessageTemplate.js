import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Body text with {{var}} placeholders, e.g. "Hi {{name}}, your class starts tomorrow."
    content: { type: String, required: true },
    // Ordered list of variable names found in `content`.
    variables: { type: [String], default: [] },

    // ── Meta Cloud API specifics ───────────────────────────────
    // The exact template name registered in WhatsApp Manager (required for cold sends).
    metaTemplateName: { type: String, trim: true },
    language: { type: String, default: 'en_US' },
    category: {
      type: String,
      enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
      default: 'MARKETING',
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

// Auto-extract {{variables}} from content before save so the API client doesn't have to.
templateSchema.pre('save', function extractVars(next) {
  if (this.isModified('content')) {
    const matches = [...this.content.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((m) => m[1]);
    this.variables = [...new Set(matches)];
  }
  next();
});

export const MessageTemplate = mongoose.model('MessageTemplate', templateSchema);
export default MessageTemplate;
