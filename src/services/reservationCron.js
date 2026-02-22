const cron = require('node-cron');
const Item = require('../models/Item');
const Reservation = require('../models/Reservation');
const { createNotification } = require('../utils/notificationHelper');

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/**
 * Task A: Auto-cancel expired reservations and notify reserver(s) only
 */
async function cancelExpiredReservations(io) {
  const now = new Date();
  const expiredItems = await Item.find({
    reservedUntil: { $ne: null, $lt: now }
  })
    .select('_id name wishlist')
    .populate({ path: 'wishlist', select: 'owner', populate: { path: 'owner', select: 'fullName' } })
    .lean();

  for (const item of expiredItems) {
    const reservations = await Reservation.find({
      item: item._id,
      status: 'reserved'
    }).select('reserver').lean();

    const wishlistId = item.wishlist && (item.wishlist._id ? item.wishlist._id.toString() : item.wishlist.toString());
    const ownerId = item.wishlist && item.wishlist.owner && (item.wishlist.owner._id || item.wishlist.owner);
    const ownerName = (item.wishlist && item.wishlist.owner && item.wishlist.owner.fullName) || 'Owner';

    for (const res of reservations) {
      await Reservation.findByIdAndUpdate(res._id, { status: 'cancelled' });
      try {
        await createNotification({
          recipientId: res.reserver,
          senderId: ownerId,
          type: 'reservation_expired',
          title: 'Reservation Expired',
          messageKey: 'notif.reservation_expired',
          messageVariables: { itemName: item.name || 'Item', ownerName },
          relatedId: item._id,
          relatedWishlistId: wishlistId,
          emitSocketEvent: true,
          socketIo: io
        });
      } catch (err) {
        console.error('Reservation cron: failed to send expiration notification to reserver', res.reserver, err);
      }
    }

    await Item.findByIdAndUpdate(item._id, {
      reservedUntil: null,
      reservationReminderSent: false,
      extensionCount: 0
    });
  }
}

/**
 * Task B: Send 48-hour reminder to reserver(s) only and mark reminder sent
 */
async function send48HourReminders(io) {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + FORTY_EIGHT_HOURS_MS);

  const itemsDueSoon = await Item.find({
    reservedUntil: { $ne: null, $gt: now, $lte: in48Hours },
    reservationReminderSent: false
  }).select('_id name wishlist').lean();

  for (const item of itemsDueSoon) {
    const reservations = await Reservation.find({
      item: item._id,
      status: 'reserved'
    }).select('reserver').lean();

    for (const res of reservations) {
      try {
        const wishlistId = item.wishlist && item.wishlist.toString ? item.wishlist.toString() : item.wishlist;
        await createNotification({
          recipientId: res.reserver,
          senderId: null,
          type: 'reservation_reminder',
          title: 'Reservation Reminder',
          messageKey: 'notif.reservation_reminder',
          messageVariables: { itemName: item.name || 'Item' },
          relatedId: item._id,
          relatedWishlistId: wishlistId,
          emitSocketEvent: true,
          socketIo: io
        });
      } catch (err) {
        console.error('Reservation cron: failed to send reminder to reserver', res.reserver, err);
      }
    }

    await Item.findByIdAndUpdate(item._id, { reservationReminderSent: true });
  }
}

/**
 * Start the reservation cron (runs every hour)
 * @param {Object} io - Socket.IO instance (from app.get('io'))
 */
function startReservationCron(io) {
  cron.schedule('0 * * * *', async () => {
    try {
      await cancelExpiredReservations(io);
      await send48HourReminders(io);
    } catch (error) {
      console.error('Reservation cron error:', error);
    }
  });
  console.log('Reservation expiration cron started (hourly)');
}

module.exports = { startReservationCron, cancelExpiredReservations, send48HourReminders };
