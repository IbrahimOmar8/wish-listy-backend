# 🔧 إصلاح مشكلة CORS على Vercel

## 📋 المشكلة

بعد نشر الـ backend على Vercel، ظهرت مشاكل CORS:
- ❌ CORS errors في طلبات API
- ❌ 401 Unauthorized على preflight requests (OPTIONS)
- ❌ Flutter app لا يمكنها الاتصال بالـ API

## 🔍 السبب

1. **Authentication middleware يتدخل قبل CORS:**
   - طلبات OPTIONS (preflight) كانت تصل إلى `protect` middleware
   - `protect` middleware يرفضها بـ 401 لأنها لا تحتوي على token
   - CORS headers لا يتم إرسالها بسبب 401

2. **CORS configuration غير كامل:**
   - بعض الـ headers المطلوبة غير موجودة
   - Max-Age غير محدد

## ✅ الحل المطبق

### 1. تحديث `src/app.js`:
- ✅ تحسين CORS configuration
- ✅ إضافة explicit OPTIONS handler قبل أي routes
- ✅ إضافة headers إضافية: `X-Requested-With`, `Accept`, `Origin`
- ✅ إضافة `maxAge: 86400` (24 ساعة)

### 2. تحديث `src/middleware/auth.js`:
- ✅ Skip authentication للطلبات OPTIONS
- ✅ إرجاع 204 فوراً بدون authentication check

### 3. إضافة `vercel.json`:
- ✅ Configuration file لـ Vercel
- ✅ تعيين NODE_ENV إلى production

## 📝 التغييرات

### `src/app.js`
```javascript
// CORS Configuration - Must be before any routes
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
}));

// Handle preflight requests explicitly - BEFORE authentication middleware
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});
```

### `src/middleware/auth.js`
```javascript
exports.protect = async (req, res, next) => {
  // Skip authentication for OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  // ... rest of the code
};
```

### `vercel.json` (جديد)
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

## 🚀 خطوات النشر

1. **Commit التغييرات:**
   ```bash
   git add .
   git commit -m "Fix CORS issues for Vercel deployment"
   git push
   ```

2. **Vercel سيقوم بالـ redeploy تلقائياً** (إذا كان متصل بـ GitHub)
   أو قم بـ redeploy يدوياً من Vercel Dashboard

3. **التحقق من الإصلاح:**
   - افتح Flutter app
   - حاول Login أو أي API call
   - تحقق من Network tab في browser - يجب ألا ترى CORS errors

## ✅ النتيجة المتوقعة

- ✅ لا مزيد من CORS errors
- ✅ Preflight requests تعمل بشكل صحيح (204 response)
- ✅ API calls تعمل من Flutter app
- ✅ Socket.IO يعمل (لكن قد يحتاج SSL/HTTPS على Vercel)

## ⚠️ ملاحظات مهمة

1. **Socket.IO على Vercel:**
   - Vercel Serverless Functions قد لا تدعم WebSockets بشكل كامل
   - قد تحتاج إلى استخدام Vercel Edge Functions أو خدمة منفصلة لـ Socket.IO
   - أو استخدام polling فقط بدلاً من websocket

2. **Environment Variables:**
   - تأكد من إضافة جميع الـ environment variables في Vercel Dashboard
   - خاصة: `JWT_SECRET`, `MONGODB_URI`, `NODE_ENV`

3. **HTTPS:**
   - Vercel يوفر HTTPS تلقائياً
   - تأكد من استخدام `https://` في Flutter app (ليس `http://`)

## 🔗 روابط مفيدة

- [Vercel CORS Documentation](https://vercel.com/docs/concepts/functions/serverless-functions/runtimes/node-js#headers)
- [CORS Configuration Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
