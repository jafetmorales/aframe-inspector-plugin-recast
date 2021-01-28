// var firebase = require("firebase");
var firebase = require('firebase/app');
require('firebase/auth');
require('firebase/database');


// Initialize Firebase
  var config = {
    apiKey: "AIzaSyADzByPSy2AVnGwyQdBJ6Cib-nkboQ-VmM",
    authDomain: "vrquitect.firebaseapp.com",
    databaseURL: "https://vrquitect.firebaseio.com",
    projectId: "vrquitect",
    storageBucket: "vrquitect.appspot.com",
    messagingSenderId: "64632163737"
  };
  
  
// const dbFirebase = firebase.initializeApp(config).database();
// module.exports = dbFirebase


firebase.default.initializeApp(config);
const dbFirebase=firebase.default.database()
module.exports= dbFirebase