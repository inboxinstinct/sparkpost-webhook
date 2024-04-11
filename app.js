require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const ActiveCampaign = require('./models/ActiveCampaign');


mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', function() {
  console.log("Connected to MongoDB successfully");
})


const app = express();
const PORT = process.env.PORT || 3200;

app.use(bodyParser.json());

const Campaign = require('./models/Campaign');
const WebhookEvent = require('./models/WebhookEvent');

app.post('/webhook', async (req, res) => {
  try {
    // Assuming req.body is an array of webhook events
    const webhookEvents = req.body;
    
    // Process all webhook events in parallel
    await Promise.all(webhookEvents.map(async (webhookData) => {
      return WebhookEvent.create({
        eventData: webhookData
      });
    }));

    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Error saving webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});


async function deleteProcessedWebhookEvents() {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const result = await WebhookEvent.deleteMany({
      receivedAt: { $lt: tenMinutesAgo },
      processed: true
    });

    console.log(`Deleted ${result.deletedCount} processed webhook events.`);
  } catch (error) {
    console.error('Error deleting processed webhook events:', error);
  }
}


async function processWebhooks() {
  const unprocessedWebhooks = await WebhookEvent.find({ processed: false }).sort({ receivedAt: 1 });

  for (const webhookEvent of unprocessedWebhooks) {
    try {
      const webhookData = webhookEvent.eventData; // Assuming eventData contains the full webhook payload

      let eventData;
      if (webhookData.msys.hasOwnProperty('track_event')) {
        eventData = webhookData.msys.track_event;
      } else if (webhookData.msys.hasOwnProperty('message_event')) {
        eventData = webhookData.msys.message_event;
      } else if (webhookData.msys.hasOwnProperty('unsubscribe_event')) {
        eventData = webhookData.msys.unsubscribe_event;
      } else {
        console.error('Event type not recognized for webhook:', webhookEvent._id);
        continue; // Skip to the next webhook
      }

      const campaignId = eventData.campaign_id;
      const email = eventData.rcpt_to;
      const eventType = eventData.type;

      // Check if campaignId is numeric
      if (isNaN(Number(campaignId))) {
        console.error('IGNORED: Received non-numeric campaignId:', campaignId);
        continue; // Skip to the next webhook
      }

      await ActiveCampaign.findOneAndUpdate(
        { campaignId: campaignId },
        { $set: { lastUpdated: new Date() } },
        { upsert: true, new: true }
      );

      // Process the event based on its type, similar to your existing logic
      if (eventType === "delivery") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { delivered: email } }
        );
        console.log(`Email ${email} added to delivered for campaign ${campaignId}`);
      } else if (eventType === "click") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { clickers: email } }
        );
        console.log(`Email ${email} added to clickers for campaign ${campaignId}`);
      } else if (eventType === "open" || eventType === "initial_open") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { openers: email } }
        );
        console.log(`Email ${email} added to openers for campaign ${campaignId}`);
      } else if (eventType === "bounce") {
        const bounceCode = eventData.bounce_class;
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $push: { bouncers: { email: email, bounceCode: bounceCode } } }
        );
        console.log(`Bounce recorded for email ${email} with code ${bounceCode} for campaign ${campaignId}`);
      } else if (eventType === "spam_complaint") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { complaints: email } }
        );
        console.log(`Email ${email} added to complaints for campaign ${campaignId}`);
      } else if (eventType === "list_unsubscribe" || eventType === "link_unsubscribe") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { unsubscribed: email } }
        );
        console.log(`Email ${email} added to unsubscribed for campaign ${campaignId}`);
      }

      // Mark the webhook as processed
      await WebhookEvent.findByIdAndUpdate(webhookEvent._id, { processed: true });
    } catch (error) {
      console.error(`Error processing webhook ${webhookEvent._id}:`, error);
      // Optionally, implement retry logic or mark the webhook for manual review
    }
  }
}


setInterval(processWebhooks, 10000); 
setInterval(deleteProcessedWebhookEvents, 600000);

const updateStatsAndCleanup = async () => {
  const twoMinutesAgo = new Date(new Date().getTime() - 2 * 60000);
  const activeCampaigns = await ActiveCampaign.find({ lastUpdated: { $gte: twoMinutesAgo } });

  for (const activeCampaign of activeCampaigns) {
    const campaign = await Campaign.findOne({ campaignId: activeCampaign.campaignId });
    if (campaign) {
      // Recalculate stats
      const stats = {
        opens: campaign.openers.length,
        clicks: campaign.clickers.length,
        bounces: campaign.bouncers.length,
        successfulDeliveries: campaign.delivered.length,
        unsubscribes: campaign.unsubscribed.length,
        spamComplaints: campaign.complaints.length,
      };
      await Campaign.updateOne({ campaignId: campaign.campaignId }, { $set: { stats: stats } });
    }
  }

  // Remove inactive campaigns
  await ActiveCampaign.deleteMany({ lastUpdated: { $lt: twoMinutesAgo } });
};

// Run the task every 90 seconds
setInterval(updateStatsAndCleanup, 90000);

  
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});