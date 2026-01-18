import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import EnvironmentRegister from '../register';

export const GCPConfig = () => {
    const env = EnvironmentRegister.getInstance();
    const oauthAccessToken = env.getEnvironment('gcp_oauth_access_token');
    const oauthRefreshToken = env.getEnvironment('gcp_oauth_refresh_token');
    const oauthClientId = env.getEnvironment('gcp_oauth_client_id');
    const oauthClientSecret = env.getEnvironment('gcp_oauth_client_secret');

    if (oauthAccessToken || oauthRefreshToken) {
        const oauthClient = new OAuth2Client(oauthClientId, oauthClientSecret);
        oauthClient.setCredentials({
            access_token: oauthAccessToken,
            refresh_token: oauthRefreshToken,
        });
        return {
            auth: oauthClient,
            GCP_SA: null,
        };
    }

    const gcpServiceAccountBase64 = env.getEnvironment('gcp_service_account_key_base64');
    const scopes = env.getEnvironment('gcp_drive_scopes') || 'https://www.googleapis.com/auth/drive.file';
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
        scopes: scopes.split(',').map(s => s.trim()),
    });

    return {
        auth,
        GCP_SA: GCP_SERVICE_ACCOUNT
    }
}

