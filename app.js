const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', function() {
  console.log("Connected to MongoDB successfully");
})


const app = express();
const PORT = process.env.PORT || 3200;

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
    try {
      const webhookData = req.body[0]; // Assuming the webhook data is always in the first element of the array
      const campaignId = parseInt(webhookData.msys.track_event.campaign_id, 10);
      const email = webhookData.msys.track_event.rcpt_to;
      const eventType = webhookData.msys.track_event.type;
  
      if (eventType === "click") {
        // Find the campaign by ID and add the email to the clickers array
        await Campaign.updateOne(
          { campaignId: campaignId },
          { $addToSet: { clickers: email } } // $addToSet ensures the email is only added once
        );
        console.log(`Email ${email} added to clickers for campaign ${campaignId}`);
      }
  
      res.status(200).send('Webhook processed');
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});