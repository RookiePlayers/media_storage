import { GoogleAuth } from 'google-auth-library';
import EnvironmentRegister from '../register';

export const GCPConfig = () => {
    const gcpServiceAccountBase64 = EnvironmentRegister.getInstance().getEnvironment('gcp_service_account_key_base64');
    const scopes = EnvironmentRegister.getInstance().getEnvironment('gcp_drive_scopes') || 'https://www.googleapis.com/auth/drive.file';
    let GCP_SERVICE_ACCOUNT = {};
    try {
        if(!gcpServiceAccountBase64) {
            throw new Error('GCP service account base64 string is not defined in environment variables.');
        }
        const GCP_SERVICE_ACCOUNT_BUFFER = Buffer.from(gcpServiceAccountBase64, 'base64');
        GCP_SERVICE_ACCOUNT = JSON.parse(GCP_SERVICE_ACCOUNT_BUFFER.toString('utf-8'));
    } catch (error) {
        console.error('Failed to parse GCP service account credentials:', error);
    }

    const auth = new GoogleAuth({
        credentials: GCP_SERVICE_ACCOUNT,
        scopes: scopes
    });

    return {
        auth,
        GCP_SA: GCP_SERVICE_ACCOUNT
    }
}


