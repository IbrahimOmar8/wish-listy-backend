const { getFirebaseMessaging } = require('../config/firebase');
const User = require('../models/User');

/**
 * Send push notification to a single user
 * @param {string} userId - The user ID to send notification to
 * @param {Object} notification - Notification data
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body/message
 * @param {Object} notification.data - Additional data payload
 * @returns {Promise<Object|null>} - FCM response or null if failed
 */
const sendPushNotification = async (userId, notification) => {
  try {
    const messaging = getFirebaseMessaging();

    if (!messaging) {
      console.log('⚠️ Firebase Messaging not available - skipping push notification');
      return null;
    }

    // Get user's FCM token
    const user = await User.findById(userId).select('fcmToken');

    if (!user || !user.fcmToken) {
      console.log(`⚠️ No FCM token for user ${userId} - skipping push notification`);
      return null;
    }

    const message = {
      token: user.fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      // Android specific configuration
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'wishlisty_notifications',
        },
      },
      // iOS specific configuration
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: notification.data?.unreadCount ? parseInt(notification.data.unreadCount) : 0,
          },
        },
      },
    };

    const response = await messaging.send(message);
    console.log(`✅ Push notification sent successfully to user ${userId}:`, response);
    return response;
  } catch (error) {
    // Handle invalid token - remove it from user
    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      console.log(`⚠️ Invalid FCM token for user ${userId} - removing token`);
      await User.findByIdAndUpdate(userId, { fcmToken: null });
    } else {
      console.error(`❌ Push notification error for user ${userId}:`, error.message);
    }
    return null;
  }
};

/**
 * Send push notification to multiple users
 * @param {string[]} userIds - Array of user IDs
 * @param {Object} notification - Notification data
 * @returns {Promise<Object>} - Results summary
 */
const sendPushNotificationToMany = async (userIds, notification) => {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
  };

  const messaging = getFirebaseMessaging();

  if (!messaging) {
    console.log('⚠️ Firebase Messaging not available - skipping all push notifications');
    return { ...results, skipped: userIds.length };
  }

  // Get all users with FCM tokens
  const users = await User.find({
    _id: { $in: userIds },
    fcmToken: { $ne: null },
  }).select('_id fcmToken');

  if (users.length === 0) {
    console.log('⚠️ No users with FCM tokens found');
    return { ...results, skipped: userIds.length };
  }

  results.skipped = userIds.length - users.length;

  // Build messages array
  const messages = users.map((user) => ({
    token: user.fcmToken,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: notification.data || {},
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'wishlisty_notifications',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  }));

  // Send all messages
  try {
    const response = await messaging.sendEach(messages);

    results.success = response.successCount;
    results.failed = response.failureCount;

    // Handle invalid tokens
    const invalidTokenUserIds = [];
    response.responses.forEach((resp, index) => {
      if (!resp.success) {
        const error = resp.error;
        if (
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokenUserIds.push(users[index]._id);
        }
      }
    });

    // Remove invalid tokens
    if (invalidTokenUserIds.length > 0) {
      await User.updateMany(
        { _id: { $in: invalidTokenUserIds } },
        { fcmToken: null }
      );
      console.log(`⚠️ Removed ${invalidTokenUserIds.length} invalid FCM tokens`);
    }

    console.log(`✅ Push notifications sent: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  } catch (error) {
    console.error('❌ Batch push notification error:', error.message);
    results.failed = users.length;
  }

  return results;
};

/**
 * Update user's FCM token
 * @param {string} userId - User ID
 * @param {string} fcmToken - New FCM token
 * @returns {Promise<boolean>} - Success status
 */
const updateFcmToken = async (userId, fcmToken) => {
  try {
    await User.findByIdAndUpdate(userId, { fcmToken });
    console.log(`✅ FCM token updated for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to update FCM token for user ${userId}:`, error.message);
    return false;
  }
};

/**
 * Remove user's FCM token (e.g., on logout)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
const removeFcmToken = async (userId) => {
  try {
    await User.findByIdAndUpdate(userId, { fcmToken: null });
    console.log(`✅ FCM token removed for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to remove FCM token for user ${userId}:`, error.message);
    return false;
  }
};

module.exports = {
  sendPushNotification,
  sendPushNotificationToMany,
  updateFcmToken,
  removeFcmToken,
};
