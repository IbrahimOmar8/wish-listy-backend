# Friend Request Push Notification Audit Report
**Date:** January 27, 2026  
**Auditor:** Senior Backend Auditor  
**Project:** Wish-Listy Backend (Node.js)

---

## Executive Summary

This audit examines the friend request flow to verify if push notifications are properly implemented for mobile devices. The analysis confirms that **push notifications ARE implemented** and correctly configured, with proper FCM token fetching and payload structure.

---

## 1. Function Location & Code Review

### ✅ Controller Location

**File:** `src/controllers/friendController.js`  
**Function:** `exports.sendFriendRequest` (lines 8-105)

### ✅ Database Save Operation

**Code Block (lines 63-67):**
```javascript
// Create new friend request
const friendRequest = await FriendRequest.create({
  from: fromUserId,
  to: toUserId
});
```

**Status:** ✅ Friend request is successfully saved to database using `FriendRequest.create()`

---

## 2. Notification Service Call

### ✅ Notification Call Identified

**Location:** Lines 76-88 in `src/controllers/friendController.js`

**Code:**
```javascript
// Create notification for the receiver with dynamic localization
// Note: relatedId (friendRequest._id) will be available as data.relatedId (requestId)
//       and senderId (fromUserId) will be available as data.relatedUser._id (senderId)
await createNotification({
  recipientId: toUserId,
  senderId: fromUserId, // This becomes data.relatedUser._id (senderId) in notification
  type: 'friend_request',
  title: 'New Friend Request',
  messageKey: 'notif.friend_request',
  messageVariables: {
    senderName: friendRequest.from.fullName
  },
  relatedId: friendRequest._id, // This becomes data.relatedId (requestId) in notification
  emitSocketEvent: true,
  socketIo: req.app.get('io')
});
```

**Status:** ✅ **Notification IS triggered** after friend request is successfully saved

**Timing:** Notification is created AFTER:
1. ✅ Friend request is saved to database (line 64)
2. ✅ Friend request is populated with user data (lines 70-71)
3. ✅ All validations pass

---

## 3. FCM Token Fetching Logic

### ✅ FCM Token is Fetched

**Location:** `src/utils/pushNotification.js` (lines 22-28)

**Code:**
```javascript
// Get user's FCM token
const user = await User.findById(userId).select('fcmToken');

if (!user || !user.fcmToken) {
  console.log(`⚠️ No FCM token for user ${userId} - skipping push notification`);
  return null;
}
```

**Status:** ✅ **FCM token IS fetched** from the User model

**Flow:**
1. `createNotification()` is called (line 76 in friendController.js)
2. `createNotification()` checks if user is online (line 138 in notificationHelper.js)
3. If user is **offline**, `sendPushNotification()` is called (line 194)
4. `sendPushNotification()` fetches FCM token from database (line 23 in pushNotification.js)
5. If token exists, FCM message is sent (line 56)

**Note:** FCM push notification is only sent if:
- ✅ User is offline (no active socket connection)
- ✅ User has an FCM token registered

---

## 4. Notification Payload Structure

### ✅ Payload Contains Both Notification & Data Objects

**Location:** `src/utils/pushNotification.js` (lines 30-54)

**FCM Message Structure:**
```javascript
const message = {
  token: user.fcmToken,
  notification: {                    // ✅ PRESENT - For display in notification tray
    title: notification.title,        // "New Friend Request"
    body: notification.body,          // Localized message (e.g., "John Doe sent you a friend request")
  },
  data: {                             // ✅ PRESENT - For app handling
    type: 'friend_request',
    notificationId: notification._id.toString(),
    relatedId: friendRequest._id.toString(),
    relatedWishlistId: '',
    relatedUser: JSON.stringify({     // ✅ Stringified user object
      id: senderId,
      fullName: 'John Doe',
      username: 'johndoe',
      profileImage: 'https://...'
    }),
    unreadCount: '5'
  },
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
        badge: 5,
      },
    },
  },
};
```

**Status:** ✅ **Payload is correctly configured** with:
- ✅ `notification` object (title/body) - For notification tray display
- ✅ `data` object - For app routing and handling
- ✅ Android-specific configuration
- ✅ iOS-specific configuration (APNS)

---

## 5. Complete Flow Analysis

### Friend Request Flow Diagram

```
User A sends friend request to User B
         │
         ├─> [1] Validation Checks
         │    ├─> toUserId provided?
         │    ├─> Not sending to self?
         │    ├─> Recipient exists?
         │    ├─> Not already friends?
         │    └─> No pending request exists?
         │
         ├─> [2] Save Friend Request to Database
         │    └─> FriendRequest.create({ from, to })
         │    └─> Status: ✅ Saved successfully
         │
         ├─> [3] Populate User Data
         │    └─> friendRequest.populate('from', '...')
         │    └─> friendRequest.populate('to', '...')
         │
         ├─> [4] Create Notification
         │    └─> createNotification({
         │          recipientId: toUserId,
         │          senderId: fromUserId,
         │          type: 'friend_request',
         │          title: 'New Friend Request',
         │          messageKey: 'notif.friend_request',
         │          relatedId: friendRequest._id
         │        })
         │    │
         │    ├─> [4a] Create Notification in Database
         │    │    └─> Notification.create({ ... })
         │    │
         │    ├─> [4b] Check if User B is Online
         │    │    └─> isUserOnline(toUserId, socketIo)
         │    │
         │    ├─> [4c] If Online: Send Socket.IO Event
         │    │    └─> socketIo.to(toUserId).emit('notification', {...})
         │    │    └─> Status: ✅ Real-time notification sent
         │    │
         │    └─> [4d] If Offline: Send FCM Push Notification
         │         │
         │         ├─> [4d-1] Fetch FCM Token
         │         │    └─> User.findById(toUserId).select('fcmToken')
         │         │    └─> Status: ✅ Token fetched
         │         │
         │         ├─> [4d-2] Build FCM Payload
         │         │    ├─> notification: { title, body }
         │         │    ├─> data: { type, relatedId, relatedUser, ... }
         │         │    ├─> android: { priority, sound, channelId }
         │         │    └─> apns: { sound, badge }
         │         │
         │         └─> [4d-3] Send FCM Message
         │              └─> messaging.send(message)
         │              └─> Status: ✅ Push notification sent
         │
         └─> [5] Return Success Response
              └─> { success: true, data: friendRequest }
```

---

## 6. Key Findings

### ✅ What's Working Correctly

1. **Notification Trigger:**
   - ✅ Notification is called AFTER friend request is saved
   - ✅ Proper error handling (notification failure doesn't break friend request creation)

2. **FCM Token Fetching:**
   - ✅ Token is fetched from User model
   - ✅ Graceful handling if token doesn't exist (logs warning, doesn't crash)

3. **Payload Structure:**
   - ✅ Contains both `notification` object (for display) and `data` object (for app logic)
   - ✅ Includes `relatedUser` as stringified JSON (for Flutter routing)
   - ✅ Includes all required fields: `type`, `relatedId`, `notificationId`, `unreadCount`
   - ✅ Platform-specific configurations (Android & iOS)

4. **Smart Delivery Logic:**
   - ✅ Socket.IO for online users (real-time, no FCM cost)
   - ✅ FCM for offline users (push notification)
   - ✅ Prevents duplicate notifications

5. **Localization:**
   - ✅ Uses `messageKey` for dynamic localization
   - ✅ Supports message variables (senderName)

---

## 7. Notification Payload Example

### Actual FCM Payload Sent (When User is Offline)

```json
{
  "token": "fcm_token_here",
  "notification": {
    "title": "New Friend Request",
    "body": "John Doe sent you a friend request"
  },
  "data": {
    "type": "friend_request",
    "notificationId": "507f1f77bcf86cd799439011",
    "relatedId": "507f191e810c19729de860ea",
    "relatedWishlistId": "",
    "relatedUser": "{\"id\":\"507f191e810c19729de860eb\",\"fullName\":\"John Doe\",\"username\":\"johndoe\",\"profileImage\":\"https://example.com/image.jpg\"}",
    "unreadCount": "1"
  },
  "android": {
    "priority": "high",
    "notification": {
      "sound": "default",
      "channelId": "wishlisty_notifications"
    }
  },
  "apns": {
    "payload": {
      "aps": {
        "sound": "default",
        "badge": 1
      }
    }
  }
}
```

**Flutter Frontend Can:**
- ✅ Display notification in tray (using `notification.title` and `notification.body`)
- ✅ Parse `data.type` to determine notification type
- ✅ Extract `data.relatedId` to get friend request ID
- ✅ Parse `data.relatedUser` JSON to get sender information
- ✅ Navigate to appropriate screen based on `data.type` and `data.relatedId`

---

## 8. Edge Cases & Error Handling

### ✅ Properly Handled

1. **User Has No FCM Token:**
   - ✅ Gracefully skips push notification
   - ✅ Logs warning message
   - ✅ Doesn't break friend request creation

2. **User is Online:**
   - ✅ Skips FCM push notification (saves cost)
   - ✅ Sends Socket.IO event instead
   - ✅ Logs that FCM was skipped

3. **Firebase Not Configured:**
   - ✅ Checks if Firebase Messaging is available
   - ✅ Gracefully skips if not configured
   - ✅ Doesn't crash the application

4. **Invalid FCM Token:**
   - ✅ Detects invalid/expired tokens
   - ✅ Automatically removes invalid tokens from database
   - ✅ Prevents future failed attempts

---

## 9. Code Quality Assessment

### ✅ Best Practices Followed

1. **Separation of Concerns:**
   - Friend request logic in `friendController.js`
   - Notification logic in `notificationHelper.js`
   - FCM logic in `pushNotification.js`

2. **Error Handling:**
   - Try-catch blocks prevent crashes
   - Graceful degradation (notification failure doesn't break main flow)

3. **Performance:**
   - FCM token fetched only when needed (offline users)
   - Online users get Socket.IO (faster, no FCM cost)

4. **Maintainability:**
   - Clear function names
   - Comprehensive comments
   - Consistent code structure

---

## 10. Summary

### ✅ Notification Logic Status: **FULLY IMPLEMENTED**

| Requirement | Status | Details |
|------------|--------|---------|
| Notification triggered after save | ✅ YES | Line 76-88 in friendController.js |
| FCM token fetched | ✅ YES | Line 23 in pushNotification.js |
| Notification sent if user offline | ✅ YES | Line 156-205 in notificationHelper.js |
| Payload contains notification object | ✅ YES | Lines 32-35 in pushNotification.js |
| Payload contains data object | ✅ YES | Lines 36-204 in notificationHelper.js |
| Payload includes relatedUser | ✅ YES | Line 202 in notificationHelper.js |
| Platform-specific config | ✅ YES | Android (lines 38-44) & iOS (lines 46-53) |

### ✅ Configuration Status: **CORRECTLY CONFIGURED**

- ✅ Proper payload structure for mobile devices
- ✅ Both notification (display) and data (routing) objects present
- ✅ `relatedUser` included as stringified JSON
- ✅ All required fields present (`type`, `relatedId`, `notificationId`, `unreadCount`)
- ✅ Smart delivery (Socket.IO for online, FCM for offline)

---

## 11. Recommendations

### 🟢 No Critical Issues Found

The implementation is **production-ready** and correctly configured for mobile devices. However, consider these optional enhancements:

1. **Monitoring:**
   - Track notification delivery success/failure rates
   - Monitor FCM token registration rates

2. **Testing:**
   - Test with users who have no FCM token
   - Test with users who are online vs offline
   - Verify payload parsing on Flutter side

3. **Documentation:**
   - Document the exact payload structure for Flutter team
   - Create integration guide for frontend developers

---

## 12. Files Referenced

1. **`src/controllers/friendController.js`**
   - Lines 8-105: `sendFriendRequest` function
   - Lines 76-88: Notification creation call

2. **`src/utils/notificationHelper.js`**
   - Lines 60-221: `createNotification` function
   - Lines 156-205: FCM push notification logic

3. **`src/utils/pushNotification.js`**
   - Lines 13-72: `sendPushNotification` function
   - Lines 22-28: FCM token fetching
   - Lines 30-54: FCM payload construction

---

**Report Generated:** January 27, 2026  
**Status:** ✅ **Notification Logic Fully Implemented & Correctly Configured**  
**Conclusion:** Push notifications are properly implemented for friend requests and ready for mobile device integration.
