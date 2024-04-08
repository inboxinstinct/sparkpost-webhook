const mongoose = require('mongoose');

const activeCampaignSchema = new mongoose.Schema({
  campaignId: { type: Number, required: true, unique: true },
  lastUpdated: { type: Date, default: Date.now }
});

const ActiveCampaign = mongoose.model('ActiveCampaign', activeCampaignSchema);

module.exports = ActiveCampaign;
