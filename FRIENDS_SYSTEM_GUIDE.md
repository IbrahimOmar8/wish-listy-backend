# Friends System Implementation Guide

This guide explains the complete friends system implementation for the Wish-Listy application.

## Overview

The friends system includes:
- User search by username, email, or phone
- Friend request sending and management
- Friend request acceptance/rejection
- People you may know (friend suggestions)
- Real-time notifications via Socket.IO
- User profile viewing

## Architecture

### Models

#### User Model
Location: [src/models/User.js](src/models/User.js)

Added fields:
- `email`: String (optional, validated email format)
- `phone`: String (optional)
- `friends`: Array of User ObjectIds (existing)

#### FriendRequest Model
Location: [src/models/FriendRequest.js](src/models/FriendRequest.js)

Fields:
- `from`: ObjectId ref User (required)
- `to`: ObjectId ref User (required)
- `status`: enum ['pending', 'accepted', 'rejected'] (default: 'pending')
- `createdAt`: Date
- `updatedAt`: Date

Indexes:
- Compound unique index on `{from, to, status}` for pending requests only

### Controllers

#### User Controller
Location: [src/controllers/userController.js](src/controllers/userController.js)

Methods:
- `searchUsers`: Search users by username, email, or phone
- `getUserProfile`: Get public profile information for a user

#### Friend Controller
Location: [src/controllers/friendController.js](src/controllers/friendController.js)

Methods:
- `sendFriendRequest`: Send a friend request to another user
- `getFriendRequests`: Get all incoming pending friend requests
- `respondToFriendRequest`: Accept or reject a friend request
- `getFriendSuggestions`: Get friend suggestions based on mutual friends

### Routes

#### User Routes
Location: [src/routes/userRoutes.js](src/routes/userRoutes.js)

- `GET /api/users/search?type={username|email|phone}&value={searchValue}`
- `GET /api/users/:id/profile`

#### Friend Routes
Location: [src/routes/friendRoutes.js](src/routes/friendRoutes.js)

- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests` - Get incoming requests
- `POST /api/friends/request/:id/respond` - Respond to request
- `GET /api/friends/suggestions` - Get friend suggestions

### Socket.IO Integration

#### Server Setup
Location: [src/socket/index.js](src/socket/index.js)

Features:
- JWT authentication for socket connections
- User rooms for targeted notifications
- Event handlers for user status

Modified files:
- [server.js](server.js:15-19): Initialize Socket.IO and make it accessible to routes
- [src/app.js](src/app.js:67-68): Mount user and friend routes

## API Endpoints

### 1. Search Users

**Endpoint**: `GET /api/users/search`

**Query Parameters**:
- `type`: One of `username`, `email`, `phone`
- `value`: Search value (case-insensitive, starts with)

**Example**:
```bash
GET /api/users/search?type=username&value=john
```

**Response**:
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "user_id",
      "fullName": "John Doe",
      "username": "johndoe",
      "profileImage": "https://..."
    }
  ]
}
```

### 2. Get User Profile

**Endpoint**: `GET /api/users/:id/profile`

**Example**:
```bash
GET /api/users/507f1f77bcf86cd799439011/profile
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "fullName": "John Doe",
    "username": "johndoe",
    "profileImage": "https://...",
    "friendsCount": 42,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Send Friend Request

**Endpoint**: `POST /api/friends/request`

**Body**:
```json
{
  "toUserId": "507f1f77bcf86cd799439011"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Friend request sent successfully",
  "data": {
    "_id": "request_id",
    "from": { /* user object */ },
    "to": { /* user object */ },
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Validations**:
- Cannot send request to yourself
- Cannot send if already friends
- Cannot send if pending request exists

### 4. Get Friend Requests

**Endpoint**: `GET /api/friends/requests`

**Response**:
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "request_id",
      "from": {
        "_id": "user_id",
        "fullName": "John Doe",
        "username": "johndoe",
        "profileImage": "https://..."
      },
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 5. Respond to Friend Request

**Endpoint**: `POST /api/friends/request/:id/respond`

**Body**:
```json
{
  "action": "accept"
}
```
or
```json
{
  "action": "reject"
}
```

**Response (Accept)**:
```json
{
  "success": true,
  "message": "Friend request accepted",
  "data": { /* request object with status: 'accepted' */ }
}
```

**Behavior**:
- Only the receiver can respond
- On accept: Both users are added to each other's friends array
- On reject: Request status is updated to 'rejected'

### 6. Get Friend Suggestions

**Endpoint**: `GET /api/friends/suggestions`

**Response**:
```json
{
  "success": true,
  "count": 20,
  "data": [
    {
      "_id": "user_id",
      "fullName": "Jane Smith",
      "username": "janesmith",
      "profileImage": "https://...",
      "mutualFriendsCount": 5
    }
  ]
}
```

**Algorithm**:
- Excludes current user, existing friends, and users with pending/accepted requests
- Calculates mutual friends count
- Sorts by mutual friends count (descending)
- Limits to 20 suggestions

## Socket.IO Events

### Client Connection

```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});
```

### Events Emitted to Clients

#### 1. friend_request
Sent when a user receives a new friend request.

**Payload**:
```json
{
  "requestId": "request_id",
  "from": {
    "_id": "user_id",
    "fullName": "John Doe",
    "username": "johndoe",
    "profileImage": "https://..."
  },
  "message": "John Doe sent you a friend request"
}
```

#### 2. friend_request_accepted
Sent when someone accepts your friend request.

**Payload**:
```json
{
  "requestId": "request_id",
  "user": {
    "_id": "user_id",
    "fullName": "Jane Smith",
    "username": "janesmith",
    "profileImage": "https://..."
  },
  "message": "Jane Smith accepted your friend request"
}
```

#### 3. friend_request_rejected
Sent when someone rejects your friend request.

**Payload**:
```json
{
  "requestId": "request_id",
  "message": "Your friend request was rejected"
}
```

#### 4. user_status
Broadcast when a user comes online.

**Payload**:
```json
{
  "userId": "user_id",
  "status": "online"
}
```

### Client Example

See [client-socket-example.js](client-socket-example.js) for a complete working example.

## Testing the System

### Prerequisites
1. Start the server: `npm start`
2. Have at least 2 user accounts registered

### Test Flow

1. **Search for users**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://localhost:5000/api/users/search?type=username&value=john"
   ```

2. **Send friend request**:
   ```bash
   curl -X POST http://localhost:5000/api/friends/request \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"toUserId": "TARGET_USER_ID"}'
   ```

3. **Check incoming requests** (as the other user):
   ```bash
   curl -H "Authorization: Bearer OTHER_USER_TOKEN" \
     http://localhost:5000/api/friends/requests
   ```

4. **Accept the request**:
   ```bash
   curl -X POST http://localhost:5000/api/friends/request/REQUEST_ID/respond \
     -H "Authorization: Bearer OTHER_USER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"action": "accept"}'
   ```

5. **Get friend suggestions**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/api/friends/suggestions
   ```

## Security Considerations

1. **Authentication**: All routes require JWT authentication via the `protect` middleware
2. **Authorization**: Users can only respond to requests sent to them
3. **Input Validation**: All inputs are validated before processing
4. **Socket Authentication**: Socket.IO connections require valid JWT tokens
5. **Rate Limiting**: Consider adding rate limiting for friend requests to prevent spam

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created (friend request sent)
- `400`: Bad request (validation errors)
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (not authorized for this action)
- `404`: Not found (user/request not found)
- `500`: Server error

## Future Enhancements

Potential improvements:
1. Block/unblock users functionality
2. Friend request expiration
3. Notification preferences
4. Friend lists/groups
5. Activity feed for friends
6. Online status indicator
7. Last seen timestamp
8. Friend request notifications via email/SMS
9. Mutual friends display
10. Friend recommendations based on interests

## Files Created/Modified

### New Files
- `src/models/FriendRequest.js` - Friend request model
- `src/controllers/userController.js` - User search and profile
- `src/controllers/friendController.js` - Friend management
- `src/routes/userRoutes.js` - User routes
- `src/routes/friendRoutes.js` - Friend routes
- `src/socket/index.js` - Socket.IO initialization
- `client-socket-example.js` - Client example

### Modified Files
- `src/models/User.js` - Added email and phone fields
- `src/app.js` - Mounted new routes
- `server.js` - Initialized Socket.IO

## Support

For issues or questions, refer to the inline code comments or check the API response messages for detailed error information.
