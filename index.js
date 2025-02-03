// index.js
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://totob12-loco-default-rtdb.firebaseio.com/'
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON bodies
app.use(express.json());

// Function to verify the Radar webhook signature
function verifyRadarSignature(req) {
    const signingId = req.headers['x-radar-signing-id'];
    const signature = req.headers['x-radar-signature'];

    if (!signingId || !signature) {
        console.error('Missing Radar signature headers.');
        return false;
    }

    // Use the token from an environment variable if set
    const token = process.env.RADAR_WEBHOOK_TOKEN || 'null';
    const hmac = crypto.createHmac('sha1', token);
    hmac.update(signingId);
    const computedSignature = hmac.digest('hex');

    if (computedSignature !== signature) {
        console.error('Invalid Radar signature:', { computedSignature, signature });
        return false;
    }
    return true;
}

// POST endpoint for Radar webhooks
app.post('/api', async (req, res) => {
    // Verify the request is coming from Radar
    if (!verifyRadarSignature(req)) {
        return res.status(403).send('Forbidden: Invalid signature');
    }

    // Radar may send a single event (key: "event") or multiple events (key: "events")
    let events = [];
    if (req.body.event) {
        events.push(req.body.event);
    } else if (req.body.events && Array.isArray(req.body.events)) {
        events = req.body.events;
    } else {
        console.error('No event data found in request body.');
        return res.status(400).send('Bad Request: No event data');
    }

    // console.log(events);

    // Process each event received from Radar
    for (const event of events) {
        try {
            // Extract the user ID. Radar’s payload nests the user info in "user"
            const userId = event.user && event.user.userId ? event.user.userId : null;
            if (!userId) {
                console.error('No userId found in event:', event);
                continue; // Skip this event if no userId is found
            }

            // Ensure that the event contains valid location data
            if (event.location &&
                event.location.coordinates &&
                event.location.coordinates.length === 2) {

                // Radar sends coordinates as [longitude, latitude]
                const [longitude, latitude] = event.location.coordinates;
                // Use the event's createdAt timestamp if available; otherwise use Firebase's server timestamp
                const timestamp = event.createdAt
                    ? new Date(event.createdAt).getTime()
                    : admin.database.ServerValue.TIMESTAMP;

                // Update the user's location in the Firebase Realtime Database
                await admin.database().ref(`users/${userId}`).update({
                    location: { latitude, longitude },
                    locationTimestamp: timestamp,
                });

                console.log(`Updated location for user ${userId}: (${latitude}, ${longitude})`);
            } else {
                console.error('Event does not contain valid location data:', event);
            }
        } catch (error) {
            console.error('Error processing event:', error);
        }
    }

    // Always respond with a 2xx status code to acknowledge receipt
    res.status(200).send('OK');
});

// A simple health-check endpoint (optional)
app.get('/health', (req, res) => {
    res.send('Server is healthy');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Radar Webhook server listening on port ${PORT}`);
});
