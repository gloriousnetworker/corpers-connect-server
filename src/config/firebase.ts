import admin from 'firebase-admin';
import { env } from './env';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      // Railway and most hosts store the private key with literal \n — replace them
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  console.info('✅ Firebase Admin initialised');
}

export const firebaseAdmin = admin;
export const fcm = admin.messaging();
