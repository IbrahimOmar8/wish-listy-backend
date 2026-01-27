# FCM & Notification Flow Audit Report
**Date:** January 27, 2026  
**Auditor:** Senior Backend Architect & Security Auditor  
**Project:** Wish-Listy Backend (Node.js)

---

## Executive Summary

This audit examines the Firebase Cloud Messaging (FCM) and notification flow implementation in the Wish-Listy backend. The system has a solid foundation with Socket.IO for real-time notifications and FCM for push notifications, but several critical gaps need to be addressed for proper Flutter frontend integration.

---

## 1. Firebase Initialization

### ✅ [Implemented]

**Location:** `src/config/firebase.js`

- Firebase Admin SDK is initialized using environment variables (secure approach)
- Uses `process.env.FIREBASE_PROJECT_ID` and related environment variables
- Graceful fallback if Firebase is not configured (logs warning, doesn't crash)
- Proper error handling with try-catch blocks
- Returns `null` if initialization fails, allowing the app to continue without push notifications

**Code Structure:**
```javascript
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  // ... other fields
};
```

### ⚠️ [Missing/Incomplete]

1. **No JSON File Fallback**: The code does NOT check for `wish-listy-adminsdk.json` file. It only uses environment variables.
   - **Impact**: If environment variables are not set, Firebase won't initialize
   - **Recommendation**: Add fallback to check for JSON file if env vars are missing (for local development)

2. **Environment Variables Documentation**: Missing documentation about required Firebase environment variables
   - **Required Variables:**
     - `FIREBASE_PROJECT_ID`
     - `FIREBASE_PRIVATE_KEY_ID`
     - `FIREBASE_PRIVATE_KEY`
     - `FIREBASE_CLIENT_EMAIL`
     - `FIREBASE_CLIENT_ID`
     - `FIREBASE_CERT_URL`

---

## 2. Token Management

### ✅ [Implemented]

**User Model** (`src/models/User.js`):
- ✅ `fcmToken` field exists (line 137-141)
- ✅ Type: `String` (single token, not array)
- ✅ Default: `null`
- ✅ Trimmed on save

**Routes** (`src/routes/authRoutes.js`):
- ✅ `PUT /api/auth/fcm-token` - Update FCM token (line 25)
- ✅ `DELETE /api/auth/fcm-token` - Remove FCM token (line 26)
- ✅ Both routes are protected with `protect` middleware

**Controllers** (`src/controllers/authController.js`):
- ✅ `updateFcmToken` function implemented (line 1021-1052)
- ✅ `removeFcmToken` function implemented (line 1060-1082)
- ✅ Token is also updated during login if provided (line 386-388)
- ✅ Token is removed on logout (line 999)

**Helper Functions** (`src/utils/pushNotification.js`):
- ✅ `updateFcmToken` helper function (line 176-185)
- ✅ `removeFcmToken` helper function (line 192-201)
- ✅ Invalid token cleanup: Automatically removes invalid tokens when FCM returns errors (line 60-66, 138-159)

### ⚠️ [Missing/Incomplete]

1. **Single Token Limitation**: The User model stores only ONE `fcmToken` (String), not an array
   - **Impact**: Users with multiple devices will only receive notifications on the last registered device
   - **Recommendation**: Consider migrating to `fcmTokens: [String]` array to support multiple devices per user

2. **Token Validation**: No validation of FCM token format before saving
   - **Recommendation**: Add basic format validation (FCM tokens are typically long strings)

3. **Token Refresh Logic**: No automatic token refresh mechanism
   - **Recommendation**: FCM tokens can expire; implement periodic refresh or handle token refresh events from Flutter

---

## 3. Dispatch Logic

### ✅ [Implemented]

**Notification Creation** (`src/utils/notificationHelper.js`):
- ✅ `createNotification` function handles both Socket.IO and FCM
- ✅ Socket.IO event is emitted if `emitSocketEvent` is true and `socketIo` is available (line 117-131)
- ✅ FCM push notification is sent after Socket.IO (line 134-149)
- ✅ Both mechanisms run independently (errors in one don't block the other)

**Socket.IO Integration** (`src/socket/index.js`):
- ✅ User-to-socket mapping maintained in `userSockets` Map
- ✅ Users join personal rooms on authentication
- ✅ Notifications emitted to user's room: `socketIo.to(recipientId.toString()).emit('notification', {...})`

**Notification Triggers**: Properly implemented in:
- ✅ Friend requests (`src/controllers/friendController.js`)
- ✅ Event invitations (`src/controllers/Eventcontroller.js`)
- ✅ Item purchases/reservations (`src/controllers/itemController.js`, `src/controllers/reservationController.js`)

### ❌ [Missing/Incomplete]

1. **CRITICAL: No Online/Offline Detection Logic**
   - **Current Behavior**: Both Socket.IO AND FCM are sent regardless of user's online status
   - **Expected Behavior**: 
     - If user is online (has active socket connection) → Send Socket.IO only
     - If user is offline (no socket connection) → Send FCM only
   - **Impact**: 
     - Unnecessary FCM calls (costs money)
     - Potential duplicate notifications
     - Battery drain on mobile devices
   - **Location**: `src/utils/notificationHelper.js` line 133-149
   - **Recommendation**: Add check before sending FCM:
     ```javascript
     // Check if user is online via Socket.IO
     const isUserOnline = socketIo && socketIo.sockets.adapter.rooms.has(recipientId.toString());
     
     if (!isUserOnline) {
       // Only send FCM if user is offline
       await sendPushNotification(...);
     }
     ```

2. **No Socket.IO Instance Access**: The `createNotification` function receives `socketIo` as a parameter, but there's no centralized way to check online status
   - **Recommendation**: Create a helper function to check if a user is online:
     ```javascript
     const isUserOnline = (userId, socketIo) => {
       if (!socketIo) return false;
       return socketIo.sockets.adapter.rooms.has(userId.toString());
     };
     ```

---

## 4. Payload Structure

### ✅ [Implemented]

**FCM Data Payload** (`src/utils/notificationHelper.js` line 138-144):
```javascript
data: {
  type: type,                                    // ✅ Present
  notificationId: notification._id.toString(),   // ✅ Present (as notificationId)
  relatedId: relatedId ? relatedId.toString() : '', // ✅ Present
  relatedWishlistId: relatedWishlistId ? relatedWishlistId.toString() : '', // ✅ Present
  unreadCount: unreadCount.toString(),           // ✅ Present (bonus field)
}
```

**Notification Model** (`src/models/Notification.js`):
- ✅ `type` field exists
- ✅ `relatedId` field exists
- ✅ `relatedWishlistId` field exists
- ✅ `relatedUser` field exists (ObjectId reference to User)

### ❌ [Missing/Incomplete]

1. **CRITICAL: Missing `relatedUser` in FCM Data Payload**
   - **Current Payload**: Does NOT include `relatedUser` information
   - **Expected Payload**: Should include `relatedUser` object with user details
   - **Impact**: Flutter frontend cannot identify who triggered the notification without an additional API call
   - **Location**: `src/utils/notificationHelper.js` line 138-144
   - **Fix Required**: Add `relatedUser` to the data payload:
     ```javascript
     data: {
       type: type,
       notificationId: notification._id.toString(),
       relatedId: relatedId ? relatedId.toString() : '',
       relatedWishlistId: relatedWishlistId ? relatedWishlistId.toString() : '',
       relatedUser: senderId ? JSON.stringify({
         id: senderId.toString(),
         fullName: notification.relatedUser?.fullName || '',
         username: notification.relatedUser?.username || '',
         profileImage: notification.relatedUser?.profileImage || ''
       }) : '', // Stringify object for FCM data payload
       unreadCount: unreadCount.toString(),
     }
     ```
   - **Note**: FCM data payload values must be strings, so the `relatedUser` object needs to be stringified

2. **Payload Key Naming**: Uses `notificationId` instead of just `id`
   - **Impact**: Minor inconsistency, but should be documented
   - **Recommendation**: Document the payload structure for Flutter team

---

## 5. Payload Sample

### Current FCM Payload (As Implemented)

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
    "unreadCount": "5"
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
        "badge": 5
      }
    }
  }
}
```

### Expected FCM Payload (After Fixes)

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
    "unreadCount": "5"
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
        "badge": 5
      }
    }
  }
}
```

---

## 6. Recommendations

### 🔴 Critical (Must Fix)

1. **Add Online/Offline Detection**
   - Implement logic to check if user is online before sending FCM
   - Prevents unnecessary FCM calls and duplicate notifications
   - **Priority**: HIGH

2. **Add `relatedUser` to FCM Payload**
   - Include sender/related user information in FCM data payload
   - Stringify the object since FCM data values must be strings
   - **Priority**: HIGH

### 🟡 Important (Should Fix)

3. **Support Multiple FCM Tokens**
   - Migrate from single `fcmToken` to `fcmTokens: [String]` array
   - Update all token management functions to handle arrays
   - **Priority**: MEDIUM

4. **Add Firebase JSON File Fallback**
   - Check for `wish-listy-adminsdk.json` if environment variables are missing
   - Useful for local development
   - **Priority**: MEDIUM

5. **Add Token Validation**
   - Validate FCM token format before saving
   - Reject obviously invalid tokens
   - **Priority**: LOW

### 🟢 Nice to Have

6. **Documentation**
   - Document required Firebase environment variables
   - Create FCM payload structure documentation for Flutter team
   - Add API documentation for FCM token endpoints

7. **Monitoring & Logging**
   - Add metrics for FCM success/failure rates
   - Log FCM errors for debugging
   - Track online/offline user statistics

---

## 7. Security Considerations

### ✅ Good Practices Found

1. **Environment Variables**: Firebase credentials stored in environment variables (not hardcoded)
2. **Protected Routes**: FCM token endpoints require authentication
3. **Token Cleanup**: Invalid tokens are automatically removed
4. **Error Handling**: Proper error handling prevents crashes

### ⚠️ Security Recommendations

1. **Token Storage**: Ensure FCM tokens are not logged in production
2. **Rate Limiting**: Consider rate limiting on FCM token update endpoints
3. **Token Validation**: Validate token ownership (user can only update their own token)

---

## 8. Performance Considerations

### Current Issues

1. **Duplicate Notifications**: Sending both Socket.IO and FCM regardless of online status wastes resources
2. **Database Queries**: Each notification creation queries the user for FCM token (could be optimized)
3. **No Batching**: FCM messages sent individually (could batch for multiple recipients)

### Recommendations

1. **Implement Online Check**: Reduces FCM API calls by ~50-70% (depending on user online rate)
2. **Cache User Tokens**: Cache FCM tokens in memory (with TTL) to reduce database queries
3. **Batch FCM**: Use `sendEach` for multiple notifications (already implemented in `sendPushNotificationToMany`)

---

## 9. Testing Checklist

### Manual Testing Required

- [ ] Test FCM token update endpoint (`PUT /api/auth/fcm-token`)
- [ ] Test FCM token removal endpoint (`DELETE /api/auth/fcm-token`)
- [ ] Test notification creation with online user (should only receive Socket.IO)
- [ ] Test notification creation with offline user (should only receive FCM)
- [ ] Verify FCM payload contains all required fields (`type`, `relatedId`, `relatedWishlistId`, `relatedUser`)
- [ ] Test with invalid FCM token (should be cleaned up automatically)
- [ ] Test with multiple devices (if multi-token support is implemented)

---

## 10. Summary

### What's Working ✅

- Firebase initialization (using environment variables)
- FCM token storage in User model
- Token update/remove endpoints
- Socket.IO integration
- Notification creation flow
- Basic FCM payload structure (missing `relatedUser`)

### What Needs Fixing ❌

1. **CRITICAL**: Add online/offline detection before sending FCM
2. **CRITICAL**: Add `relatedUser` to FCM data payload
3. **IMPORTANT**: Consider multi-device token support
4. **IMPORTANT**: Add Firebase JSON file fallback for local dev

### Overall Assessment

**Status**: 🟡 **Functional but Incomplete**

The notification system is well-structured and mostly functional, but requires the two critical fixes mentioned above to properly support the Flutter frontend. The missing `relatedUser` in the payload and the lack of online/offline detection are the main blockers for a production-ready implementation.

---

## Appendix: File Locations

- **Firebase Config**: `src/config/firebase.js`
- **Push Notification Utils**: `src/utils/pushNotification.js`
- **Notification Helper**: `src/utils/notificationHelper.js`
- **Auth Controller**: `src/controllers/authController.js`
- **Auth Routes**: `src/routes/authRoutes.js`
- **User Model**: `src/models/User.js`
- **Notification Model**: `src/models/Notification.js`
- **Socket.IO Setup**: `src/socket/index.js`
- **Server Entry**: `server.js`

---

**Report Generated:** January 27, 2026  
**Next Review:** After implementing critical fixes
