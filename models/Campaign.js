// models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  campaignId: { type: Number, required: true, unique: true },
  subject: { type: String, required: true },
  fromName: { type: String, required: true },
  fromEmail: { type: String, required: true },
  htmlContent: { type: String, required: true },
  stats: {
    opens: Number,
    clicks: Number,
    bounces: Number,
    successfulDeliveries: Number,
  },
  openers: [{ type: String, default: [] }], // List of email addresses
  clickers: [{ type: String, default: [] }], // List of email addresses
  bouncers: [{ type: String, default: [] }], // List of email addresses
  createdAt: { type: Date, default: Date.now },
});

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign;
