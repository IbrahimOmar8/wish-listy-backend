const cron = require('node-cron');
const Item = require('../models/Item');
const Reservation = require('../models/Reservation');
const Wishlist = require('../models/Wishlist');
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
    .lean();

  const wishlistIds = [...new Set(
    expiredItems
      .map(i => i.wishlist && (i.wishlist._id || i.wishlist).toString())
      .filter(Boolean)
  )];

  const wishlistsWithOwner = wishlistIds.length > 0
    ? await Wishlist.find({ _id: { $in: wishlistIds } })
        .select('_id owner')
        .populate({ path: 'owner', select: 'fullName', model: 'User' })
        .lean()
    : [];

  const ownerByWishlist = new Map();
  for (const w of wishlistsWithOwner) {
    const owner = w.owner;
    ownerByWishlist.set(w._id.toString(), {
      id: owner && (owner._id || owner),
      fullName: (owner && owner.fullName) || 'Owner'
    });
  }

  for (const item of expiredItems) {
    const wishlistIdRaw = item.wishlist && (item.wishlist._id || item.wishlist);
    const wishlistId = wishlistIdRaw ? wishlistIdRaw.toString() : null;
    const ownerData = wishlistId ? ownerByWishlist.get(wishlistId) : null;
    const ownerId = ownerData ? ownerData.id : null;
    const ownerName = (ownerData && ownerData.fullName) || 'Owner';

    const reservations = await Reservation.find({
      item: item._id,
      status: 'reserved'
    }).select('reserver').lean();

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
