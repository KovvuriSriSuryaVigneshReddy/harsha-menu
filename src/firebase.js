import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBrLLjzqoji7PELPhlXtNM159DhUWr5J5s",
  authDomain: "harsha-restaurant.firebaseapp.com",
  projectId: "harsha-restaurant",
  storageBucket: "harsha-restaurant.firebasestorage.app",
  messagingSenderId: "624637010258",
  appId: "1:624637010258:web:af85054889ebc12ece1a8b",
  measurementId: "G-SLMQ59MK8S"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);