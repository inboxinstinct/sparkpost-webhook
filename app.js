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


app.post('/webhook', async (req, res) => {
    try {
      const webhookData = req.body[0]; 

      let eventData;
      if (webhookData.msys.hasOwnProperty('track_event')) {
          eventData = webhookData.msys.track_event;
      } else if (webhookData.msys.hasOwnProperty('message_event')) {
          eventData = webhookData.msys.message_event;
      } else if (webhookData.msys.hasOwnProperty('unsubscribe_event')) { 
          eventData = webhookData.msys.unsubscribe_event;
      } else {
          return res.status(400).send('Event type not recognized');
      }

      const campaignId = eventData.campaign_id;
      const email = eventData.rcpt_to;
      const eventType = eventData.type;

          // Check if campaignId is numeric
    if (isNaN(Number(campaignId))) {
      // Handle non-numeric campaignId (log, ignore, or process differently)
      console.error('IGNORED: Received non-numeric campaignId:', campaignId);
      res.status(200).send('Webhook processed');
  }

  await ActiveCampaign.findOneAndUpdate(
    { campaignId: campaignId },
    { $set: { lastUpdated: new Date() } },
    { upsert: true, new: true }
  );
  
      if (eventType === "delivery") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { delivered: email } } 
        );
        console.log(`Email ${email} added to delivered for campaign ${campaignId}`);
      } else if (eventType === "click") {
        // Find the campaign by ID and add the email to the clickers array
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { clickers: email } } 
        );
        console.log(`Email ${email} added to clickers for campaign ${campaignId}`);
      } else if (eventType === "open" || eventType === "initial_open") {
        // Find the campaign by ID and add the email to the openers array
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { openers: email } } 
        );
        console.log(`Email ${email} added to openers for campaign ${campaignId}`);
      } else if (eventType === "bounce") {
        // Extract the bounce code
        const bounceCode = eventData.bounce_class;
        // Find the campaign by ID and add the email and bounce code to the bouncers array
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $push: { bouncers: { email: email, bounceCode: bounceCode } } } 
        );
        console.log(`Bounce recorded for email ${email} with code ${bounceCode} for campaign ${campaignId}`);
      }  else if (eventType === "spam_complaint") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { complaints: email } } 
        );
        console.log(`Email ${email} added to complaints for campaign ${campaignId}`);
      } 
      // Handling unsubscribes
      else if (eventType === "list_unsubscribe" || eventType === "link_unsubscribe") {
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { unsubscribed: email } } 
        );
        console.log(`Email ${email} added to unsubscribed for campaign ${campaignId}`);
      }
  
      res.status(200).send('Webhook processed');
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).send('Internal Server Error');
    }
});


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