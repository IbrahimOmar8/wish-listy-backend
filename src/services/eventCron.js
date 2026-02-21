const cron = require('node-cron');
const Event = require('../models/Event');
const EventInvitation = require('../models/Eventinvitation');
const { createNotification } = require('../utils/notificationHelper');

/**
 * Send event reminders to guests for events starting in exactly 2 days (48 hours).
 * Uses EventInvitation as source of truth for guests (invited, going, maybe - excludes declined).
 */
async function sendEventReminders(io) {
  const now = new Date();

  // Events whose date (calendar day) is 2 days from today
  const inTwoDays = new Date(now);
  inTwoDays.setDate(inTwoDays.getDate() + 2);
  const startOfDay = new Date(inTwoDays.getFullYear(), inTwoDays.getMonth(), inTwoDays.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(inTwoDays.getFullYear(), inTwoDays.getMonth(), inTwoDays.getDate(), 23, 59, 59, 999);

  const events = await Event.find({
    date: { $gte: startOfDay, $lte: endOfDay },
    status: 'upcoming'
  })
    .select('_id name creator')
    .populate('creator', '_id')
    .lean();

  for (const event of events) {
    // Get guests from EventInvitation: pending, accepted, maybe (exclude declined)
    const invitations = await EventInvitation.find({
      event: event._id,
      status: { $in: ['pending', 'accepted', 'maybe'] }
    })
      .select('invitee')
      .lean();

    const eventName = event.name || 'Event';
    const creatorId = event.creator && (event.creator._id || event.creator);

    for (const inv of invitations) {
      const guestId = inv.invitee;
      if (!guestId) continue;

      try {
        await createNotification({
          recipientId: guestId,
          senderId: creatorId,
          type: 'event_reminder',
          title: 'Event Reminder',
          messageKey: 'notif.event_reminder',
          messageVariables: { eventName },
          relatedId: event._id,
          emitSocketEvent: true,
          socketIo: io
        });
      } catch (err) {
        console.error('Event cron: failed to send reminder to guest', guestId, 'for event', event._id, err);
      }
    }
  }
}

/**
 * Start the event reminder cron (runs daily at 08:00 to stagger from reservation cron at :00)
 * @param {Object} io - Socket.IO instance (from app.get('io'))
 */
function startEventReminderCron(io) {
  cron.schedule('0 8 * * *', async () => {
    try {
      await sendEventReminders(io);
    } catch (error) {
      console.error('Event reminder cron error:', error);
    }
  });
  console.log('Event reminder cron started (daily at 08:00)');
}

module.exports = { startEventReminderCron, sendEventReminders };
