const Notification = require('../models/Notification');
const User = require('../models/User');
const i18next = require('i18next');
const { sendPushNotification } = require('./pushNotification');

/**
 * Helper function to calculate unread count with badge dismissal logic
 * @param {String} userId - User ID to calculate unread count for
 * @returns {Promise<Number>} Unread notification count
 */
const getUnreadCountWithBadge = async (userId) => {
  const user = await User.findById(userId).select('lastBadgeSeenAt');
  const query = {
    user: userId,
    isRead: false
  };
  if (user && user.lastBadgeSeenAt) {
    query.createdAt = { $gt: user.lastBadgeSeenAt };
  }
  return await Notification.countDocuments(query);
};

/**
 * Helper function to check if a user has an active socket connection (is online)
 * @param {String} userId - User ID to check
 * @param {Object|null} socketIo - Socket.IO instance
 * @returns {Boolean} True if user is online, false otherwise
 */
const isUserOnline = (userId, socketIo) => {
  if (!socketIo || !userId) {
    return false;
  }
  
  try {
    // Check if user's room exists (users join rooms with their userId as room name)
    const roomName = userId.toString();
    return socketIo.sockets.adapter.rooms.has(roomName);
  } catch (error) {
    console.error('Error checking user online status:', error);
    return false;
  }
};

/**
 * Create a notification and optionally emit Socket.IO event
 * @param {Object} options - Notification options
 * @param {String} options.recipientId - User ID who receives the notification
 * @param {String|null} options.senderId - User ID who triggered the notification (null for system/private)
 * @param {String} options.type - Notification type (must be in enum)
 * @param {String} options.title - Notification title
 * @param {String} [options.message] - Notification message (direct string, used if messageKey not provided)
 * @param {String} [options.messageKey] - Translation key for dynamic localization (e.g., 'notif.event_invite')
 * @param {Object} [options.messageVariables] - Variables for interpolation (e.g., { senderName: 'John', eventName: 'Birthday' })
 * @param {String|null} options.relatedId - ID of related entity (Item, Event, etc.)
 * @param {String|null} options.relatedWishlistId - ID of related Wishlist (for Item-related notifications, enables smart navigation)
 * @param {Boolean} options.emitSocketEvent - Whether to emit Socket.IO event (default: true)
 * @param {Object|null} options.socketIo - Socket.IO instance (from req.app.get('io'))
 * @returns {Promise<Object>} Created notification document
 */
async function createNotification({
  recipientId,
  senderId = null,
  type,
  title,
  message = null,
  messageKey = null,
  messageVariables = {},
  relatedId = null,
  relatedWishlistId = null,
  emitSocketEvent = true,
  socketIo = null
}) {
  try {
    // Determine the final message: use localization if messageKey is provided, otherwise use direct message
    let finalMessage = message;
    
    if (messageKey) {
      try {
        // Fetch recipient to get their preferred language
        const recipient = await User.findById(recipientId).select('preferredLanguage');
        const lng = (recipient && recipient.preferredLanguage) || 'en';
        
        // Ensure i18next is initialized (should be done by middleware, but safety check)
        if (!i18next.isInitialized) {
          console.warn('i18next not initialized, falling back to default message');
          // Fallback: try to get translation anyway (it may still work)
        }
        
        // Get translation function for recipient's language
        const t = i18next.getFixedT(lng);
        
        // Generate localized message with variables
        finalMessage = t(messageKey, messageVariables);
        
        // If translation fails and returns the key, fallback to direct message
        if (finalMessage === messageKey && message) {
          console.warn(`Translation key '${messageKey}' not found for language '${lng}', using fallback message`);
          finalMessage = message;
        }
      } catch (error) {
        console.error('Error generating localized notification message:', error);
        // Fallback to direct message if localization fails
        if (message) {
          finalMessage = message;
        } else {
          // Last resort: use the messageKey as message
          finalMessage = messageKey;
        }
      }
    }
    
    // Ensure we have a message
    if (!finalMessage) {
      console.error('Warning: Notification created without message. Type:', type);
      finalMessage = title; // Fallback to title if no message provided
    }
    
    // Create notification in database
    const notification = await Notification.create({
      user: recipientId,        // Recipient (who gets the alert)
      relatedUser: senderId,    // Sender (who triggered it - nullable for privacy)
      type,
      title,
      message: finalMessage,
      relatedId,
      relatedWishlistId         // Wishlist ID for Item-related notifications (enables smart navigation)
    });

    // Populate relatedUser if senderId is provided
    if (senderId) {
      await notification.populate('relatedUser', 'fullName username profileImage');
    }

    // Calculate unread count with badge dismissal logic (once, reused for both Socket.IO and FCM)
    const unreadCount = await getUnreadCountWithBadge(recipientId);

    // Check if user is online (has active socket connection)
    const userIsOnline = isUserOnline(recipientId, socketIo);
    
    // 🔍 DEBUG: User Online Status Check
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 NOTIFICATION HELPER DEBUG');
    console.log('👤 Recipient ID:', recipientId);
    console.log('🌐 User Online Status:', userIsOnline ? '✅ ONLINE' : '❌ OFFLINE');
    console.log('📊 Unread Count:', unreadCount);
    console.log('═══════════════════════════════════════════════════════');

    // Emit Socket.IO event if requested and socketIo is available
    if (emitSocketEvent && socketIo) {
      try {
        // Emit to recipient's room
        socketIo.to(recipientId.toString()).emit('notification', {
          notification: notification.toObject(),
          unreadCount
        });
      } catch (socketError) {
        // Log socket error but don't fail the notification creation
        console.error('Socket.IO emit error:', socketError);
      }
    }

    // Send push notification ONLY if user is offline (app is in background/closed)
    // If user is online, they will receive the notification via Socket.IO
    if (!userIsOnline) {
      console.log('📱 User is OFFLINE - Proceeding to send FCM Push Notification...');
      try {
        // Prepare relatedUser object for FCM payload
        // FCM data payload values must be strings, so we stringify the relatedUser object
        let relatedUserString = '';
        
        if (notification.relatedUser && typeof notification.relatedUser === 'object') {
          // Check if relatedUser is populated (has properties like fullName) vs just an ObjectId
          if (notification.relatedUser.fullName !== undefined || notification.relatedUser.username !== undefined) {
            // relatedUser is populated with user data, extract the needed fields
            const relatedUserObj = {
              id: notification.relatedUser._id ? notification.relatedUser._id.toString() : (senderId ? senderId.toString() : ''),
              fullName: notification.relatedUser.fullName || '',
              username: notification.relatedUser.username || '',
              profileImage: notification.relatedUser.profileImage || ''
            };
            relatedUserString = JSON.stringify(relatedUserObj);
          } else if (senderId) {
            // relatedUser is an ObjectId (not populated), use senderId
            const relatedUserObj = {
              id: senderId.toString(),
              fullName: '',
              username: '',
              profileImage: ''
            };
            relatedUserString = JSON.stringify(relatedUserObj);
          }
        } else if (senderId) {
          // relatedUser is null or not an object, but senderId exists, create minimal object
          const relatedUserObj = {
            id: senderId.toString(),
            fullName: '',
            username: '',
            profileImage: ''
          };
          relatedUserString = JSON.stringify(relatedUserObj);
        }

        await sendPushNotification(recipientId, {
          title: title,
          body: finalMessage,
          data: {
            type: type,
            notificationId: notification._id.toString(),
            relatedId: relatedId ? relatedId.toString() : '',
            relatedWishlistId: relatedWishlistId ? relatedWishlistId.toString() : '',
            relatedUser: relatedUserString,
            unreadCount: unreadCount.toString(),
          },
        });
      } catch (pushError) {
        // Log push error but don't fail the notification creation
        console.error('Push notification error:', pushError);
      }
    } else {
      // User is online, skip FCM push notification
      console.log(`User ${recipientId} is online - skipping FCM push notification`);
    }

    return notification;
  } catch (error) {
    // Log error but don't throw - notification creation failure shouldn't break main flow
    console.error('Create notification error:', error);
    throw error; // Re-throw for caller to handle if needed
  }
}

module.exports = {
  createNotification,
  getUnreadCountWithBadge,
  isUserOnline
};
