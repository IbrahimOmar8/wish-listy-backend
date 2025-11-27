# Wish Listy Backend API

A complete RESTful API for the Wish Listy mobile application built with Node.js, Express, and MongoDB.

## Features

- ✅ User registration and login with password
- ✅ User profile management
- ✅ Create and manage wishlists (Public/Private/Friends Only)
- ✅ Add/Update/Delete wishlist items
- ✅ Mark items as purchased
- ✅ Category-based wishlists
- ✅ JWT-based authentication
- ✅ MongoDB for data persistence
- ✅ bcryptjs for secure password hashing

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcryptjs** - Password hashing

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)

## Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd wish-listy-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory and add:

```env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/wish-listy

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=7d
```

4. **Start MongoDB**
```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud)
```

5. **Run the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication

#### Register New User
```http
POST /api/auth/register
Content-Type: application/json

{
  "fullName": "John Doe",
  "phoneNumber": "+1234567890",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "fullName": "John Doe",
    "phoneNumber": "+1234567890",
    "email": "john@example.com"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "fullName": "John Doe",
    "phoneNumber": "+1234567890",
    "email": "john@example.com",
    "profileImage": null
  }
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "fullName": "John Doe",
    "phoneNumber": "+1234567890",
    "email": "john@example.com",
    "profileImage": null,
    "isVerified": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Wishlists

#### Create Wishlist
```http
POST /api/wishlists
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Birthday Wishlist",
  "description": "Things I want for my birthday",
  "privacy": "public",
  "category": "birthday"
}
```

#### Get My Wishlists
```http
GET /api/wishlists
Authorization: Bearer <token>
```

#### Get Wishlist by ID
```http
GET /api/wishlists/:id
Authorization: Bearer <token>
```

#### Update Wishlist
```http
PUT /api/wishlists/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "privacy": "private"
}
```

#### Delete Wishlist
```http
DELETE /api/wishlists/:id
Authorization: Bearer <token>
```

### Items

#### Add Item to Wishlist
```http
POST /api/items
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "iPhone 15 Pro",
  "description": "Latest iPhone",
  "price": 999,
  "url": "https://apple.com",
  "priority": "high",
  "wishlistId": "60f7b3b3b3b3b3b3b3b3b3b3"
}
```

#### Get Items in Wishlist
```http
GET /api/items/wishlist/:wishlistId
Authorization: Bearer <token>
```

#### Update Item
```http
PUT /api/items/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Item Name",
  "price": 899
}
```

#### Mark Item as Purchased
```http
PUT /api/items/:id/purchase
Authorization: Bearer <token>
```

#### Delete Item
```http
DELETE /api/items/:id
Authorization: Bearer <token>
```

## Project Structure

```
wish-listy-backend/
├── src/
│   ├── config/
│   │   └── database.js           # MongoDB connection
│   ├── models/
│   │   ├── User.js               # User model
│   │   ├── Wishlist.js           # Wishlist model
│   │   └── Item.js               # Item model
│   ├── controllers/
│   │   ├── authController.js     # Auth logic
│   │   ├── wishlistController.js # Wishlist logic
│   │   └── itemController.js     # Item logic
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── wishlistRoutes.js
│   │   └── itemRoutes.js
│   ├── middleware/
│   │   ├── auth.js               # JWT verification
│   │   └── errorHandler.js       # Error handling
│   ├── utils/
│   │   └── jwt.js                # JWT utilities
│   ├── app.js                    # Express app
│   └── server.js                 # Server entry point
├── .env                          # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common HTTP Status Codes:
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Server Error

## Security Notes

- Always use HTTPS in production
- Keep `JWT_SECRET` secure and unique
- Use environment variables for all secrets
- Implement rate limiting for login attempts
- Add input validation and sanitization
- Use helmet for security headers
- Hash passwords with bcryptjs before storing

## Development Tips

1. **Testing with Postman**
   - Import API endpoints
   - Set Authorization header with Bearer token
   - Test each endpoint

2. **MongoDB**
   - Use MongoDB Compass for GUI
   - Or use mongo shell for CLI

3. **JWT Token**
   - Token expires in 7 days by default
   - Include token in Authorization header: `Bearer <token>`

## Deployment

### Heroku
```bash
heroku create wish-listy-api
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=<your-mongodb-uri>
heroku config:set JWT_SECRET=<your-secret>
git push heroku main
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ for Wish Listy
