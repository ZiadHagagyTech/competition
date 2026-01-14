// ملف: js/firebase-config.js
// تهيئة Firebase — استخدم إعدادات مشروعك
// تأكد أن هذا الملف مُحمل قبل ملفات sheikh-register.js و sheikh-login.js

const firebaseConfig = {
  apiKey: "AIzaSyBPu6S06d4L-HqrwD_KDSeJiRDfPWh5BG0",
  authDomain: "generation-furqan-competition.firebaseapp.com",
  databaseURL: "https://generation-furqan-competition-default-rtdb.firebaseio.com",
  projectId: "generation-furqan-competition",
  storageBucket: "generation-furqan-competition.appspot.com",
  messagingSenderId: "20328522998",
  appId: "1:20328522998:web:a39f51db8c021d7c5d38d7"
};

if (!window.firebase) {
  console.error('Firebase SDK غير محمّل. تأكد من تحميل firebase-app-compat.js قبل هذا الملف.');
} else {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized');
  } catch (err) {
    console.error('Firebase initialize error', err);
  }
}