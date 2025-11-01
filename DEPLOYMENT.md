# Wish Listy Backend - Deployment Guide

Complete guide to deploy your Wish Listy backend API to production.

## 🚀 Quick Start (Local Development)

```bash
# 1. Clone and install
git clone <your-repo>
cd wish-listy-backend
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your values

# 3. Start MongoDB (if local)
mongod

# 4. Run the app
npm run dev
```

## ☁️ Deployment Options

### Option 1: Heroku (Recommended for Beginners)

#### Prerequisites
- Heroku account
- Heroku CLI installed
- Git initialized in your project

#### Steps

```bash
# 1. Login to Heroku
heroku login

# 2. Create a new Heroku app
heroku create wish-listy-api

# 3. Add MongoDB (mLab addon)
heroku addons:create mongolab:sandbox

# 4. Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your_secret_key
heroku config:set JWT_EXPIRE=7d
heroku config:set TWILIO_ACCOUNT_SID=your_sid
heroku config:set TWILIO_AUTH_TOKEN=your_token
heroku config:set TWILIO_PHONE_NUMBER=your_number
heroku config:set OTP_EXPIRY_MINUTES=10

# 5. Deploy
git push heroku main

# 6. Check logs
heroku logs --tail

# 7. Open app
heroku open
```

#### Update Procfile
Create a `Procfile` in root:
```
web: node src/server.js
```

---

### Option 2: Render.com (Free Tier Available)

#### Steps

1. **Create account** at [render.com](https://render.com)

2. **New Web Service** → Connect GitHub repo

3. **Configure**:
   - Name: `wish-listy-api`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free

4. **Environment Variables** (in dashboard):
   ```
   NODE_ENV=production
   PORT=5000
   MONGODB_URI=<your-mongodb-uri>
   JWT_SECRET=<your-secret>
   JWT_EXPIRE=7d
   TWILIO_ACCOUNT_SID=<your-sid>
   TWILIO_AUTH_TOKEN=<your-token>
   TWILIO_PHONE_NUMBER=<your-number>
   OTP_EXPIRY_MINUTES=10
   ```

5. **Deploy** → Click "Deploy"

---

### Option 3: Railway.app (Easy & Fast)

#### Steps

1. Visit [railway.app](https://railway.app)

2. **New Project** → Deploy from GitHub repo

3. **Add MongoDB** plugin (from marketplace)

4. **Environment Variables**:
   - Auto-filled: `MONGODB_URI` (from MongoDB plugin)
   - Add manually:
     ```
     NODE_ENV=production
     JWT_SECRET=your_secret
     TWILIO_ACCOUNT_SID=your_sid
     TWILIO_AUTH_TOKEN=your_token
     TWILIO_PHONE_NUMBER=your_number
     OTP_EXPIRY_MINUTES=10
     ```

5. **Deploy** → Automatic

---

### Option 4: DigitalOcean App Platform

#### Steps

1. Create account at [digitalocean.com](https://www.digitalocean.com)

2. **Apps** → Create App → GitHub

3. **Select repo** → Configure:
   - Name: `wish-listy-api`
   - Type: Web Service
   - Build Command: `npm install`
   - Run Command: `npm start`

4. **Add MongoDB** Database (managed)

5. **Environment Variables** in dashboard

6. **Deploy**

---

### Option 5: AWS Elastic Beanstalk

#### Prerequisites
- AWS account
- EB CLI installed

```bash
# 1. Initialize EB
eb init -p node.js wish-listy-api

# 2. Create environment
eb create wish-listy-production

# 3. Set environment variables
eb setenv NODE_ENV=production \
  MONGODB_URI=your_uri \
  JWT_SECRET=your_secret \
  TWILIO_ACCOUNT_SID=your_sid \
  TWILIO_AUTH_TOKEN=your_token

# 4. Deploy
eb deploy

# 5. Open
eb open
```

---

## 🗄️ Database Setup

### MongoDB Atlas (Cloud - Recommended)

1. **Create account** at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)

2. **Create Cluster**:
   - Choose FREE tier (M0)
   - Select region closest to your API

3. **Database Access**:
   - Create database user
   - Save username & password

4. **Network Access**:
   - Add IP: `0.0.0.0/0` (allow from anywhere)
   - For production, use specific IPs

5. **Connect**:
   - Get connection string
   - Replace `<password>` with your password
   - Add to environment variables:
     ```
     MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/wish-listy?retryWrites=true&w=majority
     ```

### Local MongoDB

```bash
# Install MongoDB
# macOS
brew install mongodb-community

# Ubuntu
sudo apt install mongodb

# Start service
brew services start mongodb-community  # macOS
sudo systemctl start mongodb           # Ubuntu

# Connection string
MONGODB_URI=mongodb://localhost:27017/wish-listy
```

---

## 📱 Twilio Setup

### Get Twilio Credentials

1. Sign up at [twilio.com](https://www.twilio.com)

2. **Console Dashboard**:
   - Account SID
   - Auth Token
   - Get a phone number

3. **For Testing** (Free Trial):
   - Add verified phone numbers
   - Limited to verified numbers

4. **For Production**:
   - Upgrade account
   - Can send to any number

### Alternative: Mock OTP (Development)

If you don't want to use Twilio in development, modify `src/utils/sms.js`:

```javascript
exports.sendOTP = async (phoneNumber, otp) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`📱 OTP for ${phoneNumber}: ${otp}`);
    return { success: true };
  }
  
  // Production Twilio code here
  try {
    const message = await twilioClient.messages.create({
      body: `Your Wish Listy verification code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    return message;
  } catch (error) {
    throw new Error('Failed to send OTP');
  }
};
```

---

## 🔒 Security Checklist

Before going to production:

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Use HTTPS only (most platforms do this automatically)
- [ ] Set `NODE_ENV=production`
- [ ] Restrict MongoDB IP access
- [ ] Enable rate limiting (add middleware)
- [ ] Add input validation
- [ ] Remove console.logs containing sensitive data
- [ ] Use environment variables for ALL secrets
- [ ] Add CORS whitelist for your mobile app domain
- [ ] Enable MongoDB authentication
- [ ] Set up monitoring and logging

### Add Rate Limiting

```bash
npm install express-rate-limit
```

In `src/app.js`:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## 🧪 Testing in Production

### Health Check
```bash
curl https://your-api.com/
```

### Test Authentication
```bash
# Send OTP
curl -X POST https://your-api.com/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# Verify OTP
curl -X POST https://your-api.com/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "otp": "123456"}'
```

---

## 📊 Monitoring

### Free Monitoring Tools

1. **Heroku**: Built-in metrics
2. **Render**: Dashboard analytics
3. **MongoDB Atlas**: Database monitoring
4. **Sentry.io**: Error tracking (free tier)
5. **LogRocket**: Session replay

### Add Sentry (Optional)

```bash
npm install @sentry/node
```

In `src/server.js`:
```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

// Add error handler
app.use(Sentry.Handlers.errorHandler());
```

---

## 🔄 CI/CD (Optional)

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.12.12
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "wish-listy-api"
          heroku_email: "your-email@example.com"
```

---

## 📱 Connect Mobile App

Update your mobile app's API base URL:

```javascript
// React Native example
const API_URL = 'https://your-deployed-api.com/api';

// Make requests
fetch(`${API_URL}/auth/send-otp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ phoneNumber: '+1234567890' })
});
```

---

## 🆘 Troubleshooting

### Common Issues

**MongoDB Connection Failed**
```bash
# Check connection string format
# Whitelist IP in MongoDB Atlas
# Verify username/password
```

**Twilio SMS Not Sending**
```bash
# Verify phone number is verified (trial)
# Check Twilio balance
# Verify credentials
```

**JWT Token Invalid**
```bash
# Check JWT_SECRET matches
# Verify token expiry
# Check Authorization header format: "Bearer <token>"
```

**CORS Errors**
```bash
# Add mobile app domain to CORS whitelist
# Or use cors() without restrictions for testing
```

---

## 🎉 You're Done!

Your Wish Listy backend is now deployed and ready to use!

**Next Steps**:
1. Test all endpoints with Postman
2. Connect your mobile app
3. Set up monitoring
4. Add custom domain (optional)
5. Scale as needed

For support, check the main README or open an issue on GitHub.