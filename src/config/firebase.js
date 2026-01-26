const admin = require('firebase-admin');

let firebaseApp = null;

const initializeFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  // Check if Firebase credentials are configured
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.log('⚠️ Firebase not configured - Push notifications disabled');
    return null;
  }

  try {
    // Initialize Firebase Admin with service account credentials from environment variables
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CERT_URL,
    };

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized successfully');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    return null;
  }
};

const getFirebaseMessaging = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }

  if (!firebaseApp) {
    return null;
  }

  return admin.messaging();
};

module.exports = {
  initializeFirebase,
  getFirebaseMessaging,
  admin,
};
