# 🚀 Deployment Files - Overview

## 📁 ملفات الـ Deployment

تم إضافة الملفات التالية لتسهيل رفع المشروع على Render.com:

### 1. **render.yaml** ⚙️
ملف التكوين الأساسي لـ Render. يحتوي على:
- إعدادات البناء والتشغيل
- Environment variables
- Region والـ plan

```yaml
services:
  - type: web
    name: wishlisty-backend
    env: node
    region: frankfurt
    ...
```

### 2. **.env.example** 📝
نموذج للمتغيرات البيئية المطلوبة:
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret
...
```

### 3. **QUICK_DEPLOY.md** ⚡
دليل سريع (5 دقائق) للرفع:
1. إعداد MongoDB Atlas
2. رفع على GitHub
3. ربط بـ Render
4. Deploy!

### 4. **RENDER_DEPLOYMENT_GUIDE.md** 📚
دليل شامل مفصّل يشمل:
- خطوات تفصيلية مع screenshots
- حل المشاكل الشائعة
- إعدادات متقدمة
- Custom domains
- Monitoring

### 5. **DEPLOYMENT.md** 📖
دليل عام يشمل خيارات متعددة:
- Render.com
- Railway.app
- Heroku
- DigitalOcean
- AWS

---

## 🎯 البداية السريعة

### للمبتدئين (موصى به):
```bash
# 1. اقرأ QUICK_DEPLOY.md
cat QUICK_DEPLOY.md

# 2. اتبع الخطوات 5
# 3. استمتع بالـ API!
```

### للمتقدمين:
```bash
# اقرأ الدليل الكامل
cat RENDER_DEPLOYMENT_GUIDE.md
```

---

## ✅ Checklist قبل الرفع

- [ ] الكود موجود على GitHub
- [ ] MongoDB Atlas جاهز
- [ ] قرأت الدليل المناسب
- [ ] جهزت Environment Variables
- [ ] `.env` موجود في `.gitignore`

---

## 🔗 الملفات

| الملف | الحجم | الاستخدام |
|------|------|----------|
| [render.yaml](./render.yaml) | 1.3KB | تكوين Render |
| [.env.example](./.env.example) | 727B | نموذج Environment Variables |
| [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) | 4.2KB | دليل سريع (5 دقائق) |
| [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md) | 18KB | دليل شامل لـ Render |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 8.7KB | خيارات متعددة |

---

## 🎯 الخطوات التالية

1. **اختر دليلك:**
   - مبتدئ؟ → [QUICK_DEPLOY.md](./QUICK_DEPLOY.md)
   - تريد التفاصيل؟ → [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md)
   - تريد خيارات أخرى؟ → [DEPLOYMENT.md](./DEPLOYMENT.md)

2. **اتبع الخطوات**

3. **استمتع بالـ API Live!** 🎉

---

## 💡 نصائح

### Free Plan
- ✅ مجاني 100%
- ⚠️ Cold starts بعد 15 دقيقة
- 💡 استخدم [UptimeRobot](https://uptimerobot.com/) لمنع النوم

### Starter Plan ($7/شهر)
- ✅ Always on
- ✅ No cold starts
- ✅ أسرع بكثير
- 💡 موصى به للإنتاج

---

## 🆘 مشاكل؟

### Quick Fixes

**MongoDB Connection Failed:**
```bash
# تحقق من MONGODB_URI
echo $MONGODB_URI  # يجب أن يبدأ بـ mongodb+srv://
```

**Socket.IO لا يعمل:**
```javascript
// تأكد من إضافة polling
const socket = io(URL, {
  transports: ['websocket', 'polling']  // ✅
});
```

**Build Failed:**
```bash
# امسح cache
# في Render: Settings → Clear Build Cache & Deploy
```

### دليل كامل

للمزيد: [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md) - قسم "حل المشاكل"

---

## 📞 الدعم

- [Render Docs](https://render.com/docs)
- [MongoDB Atlas Docs](https://www.mongodb.com/docs/atlas/)
- [Socket.IO Docs](https://socket.io/docs/v4/)

---

**✨ تم إنشاء هذه الملفات لتسهيل رفع المشروع على Render.com مع دعم كامل لـ Socket.IO**

**📅 23 ديسمبر 2025**
