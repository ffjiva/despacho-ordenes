importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyAb_0e8Hh_UfzN54S3VZGQXqUD3t53bWrQ",
  authDomain:        "despacho-ordenes.firebaseapp.com",
  projectId:         "despacho-ordenes",
  storageBucket:     "despacho-ordenes.firebasestorage.app",
  messagingSenderId: "694628838648",
  appId:             "1:694628838838:web:30e9745a0465b004f42517"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '📦 Despacho Ordenes';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.png'
  });
});
