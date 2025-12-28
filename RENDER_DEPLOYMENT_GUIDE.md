# 🚀 دليل رفع Wish-Listy على Render.com

## 📋 جدول المحتويات

1. [نظرة عامة](#نظرة-عامة)
2. [الخطوة 1: إعداد MongoDB Atlas](#الخطوة-1-إعداد-mongodb-atlas)
3. [الخطوة 2: تجهيز الكود](#الخطوة-2-تجهيز-الكود)
4. [الخطوة 3: رفع على Render](#الخطوة-3-رفع-على-render)
5. [الخطوة 4: التحقق](#الخطوة-4-التحقق)
6. [الخطوة 5: إعدادات متقدمة](#الخطوة-5-إعدادات-متقدمة)
7. [حل المشاكل](#حل-المشاكل)

---

## نظرة عامة

### لماذا Render.com؟

✅ **دعم كامل لـ Socket.IO** بدون تعقيد
✅ **Free tier** سخية (750 ساعة/شهر)
✅ **Auto-deploy** من GitHub
✅ **SSL مجاني** تلقائياً
✅ **WebSockets** مدعوم بشكل native

⚠️ **ملاحظة:** Free tier تنام بعد 15 دقيقة من عدم الاستخدام (cold start ~30 ثانية)

---

## الخطوة 1: إعداد MongoDB Atlas

### 1.1 إنشاء حساب وCluster

1. اذهب إلى [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. سجل دخول أو أنشئ حساب جديد
3. انقر **"Create"** → **"Shared"** (Free tier)

### 1.2 تكوين الـ Cluster

**الإعدادات المقترحة:**
```
Provider: AWS
Region: eu-central-1 (Frankfurt) - الأقرب للشرق الأوسط
Cluster Tier: M0 Sandbox (Free)
Cluster Name: wishlisty-cluster
```

انقر **"Create Cluster"** → انتظر 3-5 دقائق

### 1.3 إعداد Database Access (المستخدمين)

1. في القائمة الجانبية: **Security → Database Access**
2. انقر **"Add New Database User"**
3. املأ البيانات:
   ```
   Authentication Method: Password
   Username: wishlisty-admin
   Password: [Generate Secure Password] - احفظها!
   Database User Privileges: Atlas admin
   ```
4. انقر **"Add User"**

### 1.4 إعداد Network Access (الشبكة)

1. في القائمة الجانبية: **Security → Network Access**
2. انقر **"Add IP Address"**
3. اختر **"Allow Access from Anywhere"**
   ```
   IP Address: 0.0.0.0/0
   Comment: Allow all (development)
   ```
4. انقر **"Confirm"**

⚠️ **للإنتاج:** استخدم Render IP addresses فقط

### 1.5 الحصول على Connection String

1. اذهب إلى **Deployment → Database**
2. انقر **"Connect"** بجانب cluster الخاص بك
3. اختر **"Connect your application"**
4. اختر:
   - Driver: Node.js
   - Version: 4.1 or later
5. انسخ الـ Connection String:
   ```
   mongodb+srv://wishlisty-admin:<password>@wishlisty-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=wishlisty-cluster
   ```
6. **مهم جداً:** استبدل `<password>` بكلمة المرور الفعلية
7. أضف اسم قاعدة البيانات قبل `?`:
   ```
   mongodb+srv://wishlisty-admin:YOUR_ACTUAL_PASSWORD@wishlisty-cluster.xxxxx.mongodb.net/wishlisty?retryWrites=true&w=majority
   ```

✅ **احفظ هذا الـ Connection String** - ستحتاجه في Render!

---

## الخطوة 2: تجهيز الكود

### 2.1 التحقق من الملفات

تأكد من وجود الملفات التالية (موجودة بالفعل في المشروع):

```
✅ render.yaml
✅ package.json (with engines)
✅ .env.example
✅ server.js
✅ .gitignore
✅ src/socket/index.js (Socket.IO configuration)
```

### 2.2 التحقق من .gitignore

تأكد من أن `.gitignore` يحتوي على:

```gitignore
# Environment variables - NEVER commit these!
.env
.env.local
.env.production

# Dependencies
node_modules/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
```

### 2.3 دفع الكود إلى GitHub

إذا لم يكن الكود على GitHub بعد:

```bash
# 1. Initialize Git (إذا لم يكن موجوداً)
git init

# 2. Add all files
git add .

# 3. Commit
git commit -m "feat: prepare for Render deployment with Socket.IO support"

# 4. Create GitHub repository
# اذهب إلى github.com وأنشئ repository جديد باسم: wish-listy-backend

# 5. Link to GitHub
git remote add origin https://github.com/YOUR_USERNAME/wish-listy-backend.git

# 6. Push
git branch -M main
git push -u origin main
```

✅ **الكود الآن على GitHub!**

---

## الخطوة 3: رفع على Render

### 3.1 إنشاء حساب Render

1. اذهب إلى [Render.com](https://dashboard.render.com/register)
2. سجل باستخدام **GitHub** (أسهل للربط)
3. امنح Render صلاحيات الوصول لـ repositories

### 3.2 إنشاء Web Service جديد

1. في [Render Dashboard](https://dashboard.render.com/)
2. انقر **"New +"** → **"Web Service"**

### 3.3 ربط GitHub Repository

1. اختر **"Build and deploy from a Git repository"**
2. انقر **"Next"**
3. ابحث عن repository: `wish-listy-backend`
4. انقر **"Connect"** بجانبه

### 3.4 تكوين Web Service

Render سيقرأ ملف `render.yaml` تلقائياً، لكن تحقق من:

**الصفحة 1: Service Details**
```
Name: wishlisty-backend
Region: Frankfurt (EU Central) - الأقرب للشرق الأوسط
Branch: main
Root Directory: (اتركه فارغاً)
```

**الصفحة 2: Build & Deploy**
```
Runtime: Node
Build Command: npm install
Start Command: npm start
```

**الصفحة 3: Plan**
```
Instance Type: Free
  - 750 hours/month
  - 512MB RAM
  - Auto-sleep after 15min inactivity

OR

Instance Type: Starter - $7/month (موصى به للإنتاج)
  - Always on
  - No cold starts
  - 512MB RAM
```

انقر **"Advanced"** لإضافة Environment Variables ⬇️

### 3.5 إضافة Environment Variables

في قسم **"Environment Variables"**، أضف:

#### المتغيرات الإلزامية:

| Key | Value | ملاحظات |
|-----|-------|---------|
| `NODE_ENV` | `production` | البيئة |
| `PORT` | `4000` | المنفذ |
| `MONGODB_URI` | `mongodb+srv://...` | من الخطوة 1.5 |
| `JWT_SECRET` | [انقر Generate] | توليد تلقائي آمن |
| `JWT_EXPIRE` | `7d` | مدة صلاحية التوكن |

**لإضافة JWT_SECRET:**
1. انقر **"Generate"** بجانب Value
2. سيتم توليد قيمة عشوائية آمنة تلقائياً

#### المتغيرات الاختيارية (إذا كنت تستخدمها):

| Key | Value | متى تحتاجها |
|-----|-------|-------------|
| `TWILIO_ACCOUNT_SID` | من Twilio Dashboard | إذا كنت تستخدم SMS OTP |
| `TWILIO_AUTH_TOKEN` | من Twilio Dashboard | إذا كنت تستخدم SMS OTP |
| `TWILIO_PHONE_NUMBER` | من Twilio | إذا كنت تستخدم SMS OTP |
| `OTP_EXPIRY_MINUTES` | `10` | إذا كنت تستخدم OTP |
| `CLOUDINARY_CLOUD_NAME` | من Cloudinary | إذا كنت تستخدم صور |
| `CLOUDINARY_API_KEY` | من Cloudinary | إذا كنت تستخدم صور |
| `CLOUDINARY_API_SECRET` | من Cloudinary | إذا كنت تستخدم صور |

### 3.6 Deploy! 🚀

1. تأكد من إدخال جميع Environment Variables
2. انقر **"Create Web Service"**
3. Render سيبدأ في:
   - ✅ Clone الكود من GitHub
   - ✅ تشغيل `npm install`
   - ✅ بناء المشروع
   - ✅ تشغيل `npm start`

**⏱️ الوقت المتوقع:**
- أول deployment: 3-5 دقائق
- Deployments التالية: 1-2 دقيقة

### 3.7 مراقبة Deployment

شاهد Logs في الوقت الفعلي:

1. انتظر حتى ترى **"Live"** في أعلى الصفحة
2. في تبويب **"Logs"**، ابحث عن:

```
==> Starting service with 'npm start'
✅ MongoDB Connected Successfully
🚀 Server running in production mode on port 4000
🔧 Starting Socket.IO initialization...
✅ Socket.IO setup complete and ready for connections
✅ Server fully initialized and ready
==> Your service is live 🎉
```

✅ **مبروك! التطبيق الآن Live!** 🎉

---

## الخطوة 4: التحقق

### 4.1 الحصول على URL

Render سيعطيك URL مثل:
```
https://wishlisty-backend.onrender.com
```

احفظ هذا الـ URL - ستحتاجه للـ API calls

### 4.2 اختبار الصفحة الرئيسية

**في المتصفح:**
افتح: `https://wishlisty-backend.onrender.com/`

يجب أن ترى:
```json
{
  "success": true,
  "message": "Wish Listy API is running",
  "version": "1.0.0",
  "endpoints": {
    "auth": "/api/auth",
    "wishlists": "/api/wishlists",
    "items": "/api/items",
    "events": "/api/events",
    "users": "/api/users",
    "friends": "/api/friends",
    "notifications": "/api/notifications",
    "reservations": "/api/reservations"
  }
}
```

**باستخدام curl:**
```bash
curl https://wishlisty-backend.onrender.com/
```

### 4.3 اختبار API

استخدم Postman أو curl:

```bash
# Test registration
curl -X POST https://wishlisty-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "username": "testuser",
    "password": "password123"
  }'
```

يجب أن ترى response بـ JWT token ✅

### 4.4 اختبار Socket.IO

**Option 1: استخدم Socket.IO Client Tool**

افتح [Socket.IO Tester](https://amritb.github.io/socketio-client-tool/)

```
Server URL: https://wishlisty-backend.onrender.com
Transports: websocket, polling
```

انقر **"Connect"** → يجب أن ترى "Connected" ✅

**Option 2: كود JavaScript**

```javascript
const socket = io('https://wishlisty-backend.onrender.com', {
  transports: ['websocket', 'polling'],
  reconnection: true
});

socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO!');
  console.log('Socket ID:', socket.id);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from Socket.IO');
});
```

---

## الخطوة 5: إعدادات متقدمة

### 5.1 تفعيل Auto-Deploy

يتم تفعيله تلقائياً! الآن كل push إلى `main` branch سيؤدي لـ deployment جديد:

```bash
# عدّل الكود
git add .
git commit -m "feat: add new feature"
git push

# Render سيبدأ deployment تلقائياً!
```

### 5.2 إضافة Custom Domain

**إذا كان لديك domain خاص:**

1. في Render Dashboard → Service
2. Settings → **"Custom Domains"**
3. انقر **"Add Custom Domain"**
4. أدخل domain: `api.wishlisty.com`

**في إعدادات DNS provider:**
```
Type: CNAME
Name: api
Value: wishlisty-backend.onrender.com
TTL: 3600
```

انتظر 10-60 دقيقة → ✅ SSL مجاني تلقائياً!

### 5.3 تحسين Performance

#### Option 1: Upgrade إلى Starter Plan

**$7/شهر** يعطيك:
- ✅ Always on (no cold starts)
- ✅ أسرع بكثير
- ✅ أكثر موثوقية

في Render Dashboard:
1. Settings → **"Instance Type"**
2. اختر **"Starter"**
3. انقر **"Save Changes"**

#### Option 2: Keep-Alive Ping (Free tier only)

استخدم خدمة مجانية لـ ping API كل 5 دقائق:

**UptimeRobot (مجاني):**
1. اذهب إلى [UptimeRobot.com](https://uptimerobot.com/)
2. أضف **New Monitor**:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: Wishlisty API
   URL: https://wishlisty-backend.onrender.com/
   Monitoring Interval: 5 minutes
   ```
3. ✅ الآن API لن ينام!

### 5.4 Health Check Endpoint

موجود بالفعل! Render يفحص `/` كل 5 دقائق.

لإضافة endpoint مخصص:

```javascript
// في src/app.js
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

في Render Settings:
```
Health Check Path: /health
```

---

## حل المشاكل

### ❌ المشكلة 1: Build Failed

**الخطأ:**
```
npm ERR! Cannot find module 'xyz'
```

**الحل:**
```bash
# محلياً:
rm -rf node_modules package-lock.json
npm install
npm test  # تأكد أن كل شيء يعمل

# Commit:
git add package-lock.json
git commit -m "fix: update dependencies"
git push
```

في Render:
- Settings → **"Clear Build Cache & Deploy"**

---

### ❌ المشكلة 2: MongoDB Connection Failed

**الخطأ:**
```
MongoNetworkError: connection refused
```

**الحلول:**

1. **تحقق من MONGODB_URI:**
   - اذهب إلى Render → Environment
   - تأكد من صحة Connection String
   - تأكد من استبدال `<password>` بالكلمة الفعلية

2. **تحقق من MongoDB Atlas Network Access:**
   - اذهب إلى MongoDB Atlas
   - Security → Network Access
   - تأكد من `0.0.0.0/0` موجود

3. **تحقق من Database User:**
   - Security → Database Access
   - تأكد من صحة username/password

4. **اختبر Connection String محلياً:**
   ```bash
   # في terminal
   mongo "mongodb+srv://user:pass@cluster.mongodb.net/wishlisty"
   ```

---

### ❌ المشكلة 3: Socket.IO لا يعمل

**الخطأ:**
```
WebSocket connection failed
```

**الحل:**

تأكد من تكوين Client بشكل صحيح:

```javascript
// ✅ صحيح
const socket = io('https://wishlisty-backend.onrender.com', {
  transports: ['websocket', 'polling'], // مهم جداً!
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// ❌ خطأ
const socket = io('https://wishlisty-backend.onrender.com', {
  transports: ['websocket'] // سيفشل إذا WebSocket مغلق
});
```

**في CORS (src/socket/index.js):**
```javascript
const io = require('socket.io')(server, {
  cors: {
    origin: '*', // أو حدد domains معينة
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});
```

---

### ❌ المشكلة 4: Cold Starts بطيئة

**الأعراض:**
- أول request بعد 15 دقيقة بطيء (30 ثانية)

**الحلول:**

1. **Upgrade إلى Starter** ($7/شهر) - الحل الأفضل
2. **استخدم UptimeRobot** لـ ping كل 5 دقائق (مجاني)
3. **استخدم Render Cron Job:**
   ```yaml
   # في render.yaml
   - type: cron
     name: keep-alive
     schedule: "*/5 * * * *"
     command: "curl https://wishlisty-backend.onrender.com/health"
   ```

---

### ❌ المشكلة 5: JWT Token Invalid

**الخطأ:**
```
JsonWebTokenError: invalid signature
```

**الحل:**

1. **تحقق من JWT_SECRET:**
   - Render → Environment
   - تأكد من وجود `JWT_SECRET`
   - **لا تغيره** بعد deployment (سيُبطل كل الـ tokens)

2. **تحقق من Authorization Header:**
   ```javascript
   // ✅ صحيح
   headers: {
     'Authorization': 'Bearer ' + token // مسافة بعد Bearer!
   }

   // ❌ خطأ
   headers: {
     'Authorization': token // بدون Bearer
   }
   ```

---

### ❌ المشكلة 6: CORS Errors

**الخطأ:**
```
Access to fetch has been blocked by CORS policy
```

**الحل:**

في `src/app.js`:
```javascript
app.use(cors({
  origin: '*', // أو حدد domains معينة
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## 📊 المراقبة

### في Render Dashboard

1. **Metrics:**
   - CPU Usage
   - Memory Usage
   - Request Count
   - Response Time

2. **Logs:**
   - Real-time logs
   - Error logs
   - Deploy logs

3. **Events:**
   - Deployment history
   - Restart events

### أدوات خارجية (اختياري)

**Sentry.io** - تتبع الأخطاء (مجاني)
```bash
npm install @sentry/node
```

**LogRocket** - تحليل المستخدمين

**New Relic** - مراقبة الأداء

---

## 💰 التكاليف

### Free Plan (مجاني تماماً)
```
✅ 750 ساعة/شهر
✅ SSL مجاني
✅ Auto-deploy
⚠️ Cold starts بعد 15 دقيقة
⚠️ 512MB RAM
```
**مناسب لـ:** التطوير، Demo، MVPs

### Starter Plan ($7/شهر)
```
✅ Always on (no cold starts)
✅ SSL مجاني
✅ Auto-deploy
✅ 512MB RAM
✅ Priority support
```
**مناسب لـ:** الإنتاج، Startups

### Standard Plan ($25/شهر)
```
✅ 2GB RAM
✅ Dedicated resources
✅ Auto-scaling
✅ Advanced metrics
```
**مناسب لـ:** تطبيقات كبيرة

---

## ✅ Checklist النهائي

قبل الـ Deployment:
- [ ] الكود موجود على GitHub
- [ ] MongoDB Atlas جاهز
- [ ] Connection String صحيح
- [ ] ملف `render.yaml` موجود
- [ ] `package.json` يحتوي على `engines`
- [ ] `.env.example` موجود
- [ ] `.gitignore` يستثني `.env`

بعد الـ Deployment:
- [ ] API يستجيب على `/`
- [ ] MongoDB متصل (تحقق من logs)
- [ ] Socket.IO يعمل
- [ ] Environment variables صحيحة
- [ ] Auto-deploy مفعّل
- [ ] اختبرت endpoints رئيسية

---

## 🎉 تهانينا!

**مشروعك الآن Live على الإنترنت!** 🎊

```
🔗 API URL: https://wishlisty-backend.onrender.com
🔗 API Docs: https://wishlisty-backend.onrender.com/api
🔌 Socket.IO: wss://wishlisty-backend.onrender.com
```

### الخطوات التالية:

1. ✅ شارك الـ URL مع فريقك
2. ✅ اربط Frontend بالـ API
3. ✅ أضف monitoring (Sentry, LogRocket)
4. ✅ فعّل UptimeRobot (إذا Free plan)
5. ✅ أضف Custom Domain (اختياري)
6. ✅ Upgrade إلى Starter عند الحاجة

---

## 📞 الدعم

### الموارد:
- [Render Docs](https://render.com/docs)
- [MongoDB Atlas Docs](https://www.mongodb.com/docs/atlas/)
- [Socket.IO Docs](https://socket.io/docs/v4/)

### Community:
- [Render Community](https://community.render.com/)
- [Render Discord](https://discord.gg/render)
- [GitHub Issues](https://github.com/YOUR_USERNAME/wish-listy-backend/issues)

---

**تم إنشاء هذا الدليل بواسطة Claude Sonnet 4.5** 🤖
**التاريخ: 23 ديسمبر 2025** 📅
