const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  receivedAt: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false },
  eventData: { type: mongoose.Schema.Types.Mixed, required: true }
});

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);

module.exports = WebhookEvent;