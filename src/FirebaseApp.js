// import firebase from "firebase";
var firebase = require("firebase");
// require('dotenv').config()


// Initialize Firebase
  var config = {
    apiKey: "AIzaSyCbzifLOPONyCkD-qKWrTZEYgGEJ7ENlCQ",
    authDomain: "vrquitect.firebaseapp.com",
    databaseURL: "https://vrquitect.firebaseio.com",
    projectId: "vrquitect",
    storageBucket: "vrquitect.appspot.com",
    messagingSenderId: "64632163737"
  };
const dbFirebase = firebase.initializeApp(config).database();

module.exports = dbFirebase

// const app =  (function() {
//     var instance;

//     function createInstance() {
//       // var object = new Object("I am the instance");
//       var object = firebase.initializeApp({
//         apiKey: process.env.REACT_APP_FIREBASE_KEY,
//         authDomain: process.env.REACT_APP_FIREBASE_DOMAIN,
//         databaseURL: process.env.REACT_APP_FIREBASE_DATABASE,
//         projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
//         storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
//         messagingSenderId: process.env.REACT_APP_FIREBASE_SENDER_ID
//       });


//       return object;
//     }

//     return {
//       getInstance: function() {
//         if (!instance) {
//           instance = createInstance();
//         }
//         return instance;
//       }
//     };
//   })();

// firebase.initializeApp({
//   apiKey: process.env.REACT_APP_FIREBASE_KEY,
//   authDomain: process.env.REACT_APP_FIREBASE_DOMAIN,
//   databaseURL: process.env.REACT_APP_FIREBASE_DATABASE,
//   projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
//   storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
//   messagingSenderId: process.env.REACT_APP_FIREBASE_SENDER_ID
// });

// export default FbApp;
