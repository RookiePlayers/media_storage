import { initializeApp, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import EnvironmentRegister from "../register";

export const FirebaseConfig = () => {
    const firebaseAdminSdkBase64 = EnvironmentRegister.getInstance().getEnvironment('firebase_service_account_key_base64');
    const bucket = EnvironmentRegister.getInstance().getEnvironment('firebase_storage_bucket');
    let config;
    try {
        if(!firebaseAdminSdkBase64) {
            throw new Error('Firebase Admin SDK base64 string is not defined in environment variables.');
        }
        const firebaseAdminSdkBuffer = Buffer.from(firebaseAdminSdkBase64, 'base64');
        config = JSON.parse(firebaseAdminSdkBuffer.toString('utf-8'));
    } catch (e) {
    console.error('Error parsing Firebase Admin SDK config[Make sure to add FIREBASE_SERVICE_ACCOUNT_BASE64 to your .env]: ', e);
    }
    const firebaseAdminConfig = {
        credential: cert(config),
        storageBucket: bucket
    };
    initializeApp(firebaseAdminConfig);

}

export const firebaseStorage = getStorage();