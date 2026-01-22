import 'dotenv/config';
import { CloudFlareR2StorageService } from '../src/services/cloudFlareR2Storage';
import EnvironmentRegister from '../src/register';

async function testR2PresignedUrls() {
  // Load environment variables from .env file
  const register = EnvironmentRegister.getInstance();
  register.loadFromProcessEnv();

  console.log('[Example] Loaded environments:', {
    firebase_service_account_key_base64: register.getEnvironment('firebase_service_account_key_base64') ? '***' : undefined,
    firebase_storage_bucket: register.getEnvironment('firebase_storage_bucket'),
    gcp_service_account_key_base64: register.getEnvironment('gcp_service_account_key_base64') ? '***' : undefined,
    gcp_drive_scopes: register.getEnvironment('gcp_drive_scopes'),
    gcp_oauth_access_token: register.getEnvironment('gcp_oauth_access_token') ? '***' : undefined,
    gcp_oauth_refresh_token: register.getEnvironment('gcp_oauth_refresh_token') ? '***' : undefined,
    gcp_oauth_client_id: register.getEnvironment('gcp_oauth_client_id'),
    gcp_oauth_client_secret: register.getEnvironment('gcp_oauth_client_secret') ? '***' : undefined,
    r2_account_id: register.getEnvironment('r2_account_id'),
    r2_bucket: register.getEnvironment('r2_bucket'),
    r2_access_key_id: register.getEnvironment('r2_access_key_id'),
    r2_access_key_secret: register.getEnvironment('r2_access_key_secret') ? '***' : undefined,
    r2_cdn_base: register.getEnvironment('r2_cdn_base'),
  });

  const r2Service = new CloudFlareR2StorageService();

  try {
    // Test presigned GET URL
    const getUrl = await r2Service.getPresignedUrl('test/sample-file.jpg', 3600);
    console.log('\n✅ Presigned GET URL generated successfully:');
    console.log(getUrl);

    // Test presigned PUT URL
    const putUrl = await r2Service.getPresignedUploadUrl('test/new-upload.jpg', 'image/jpeg', 3600);
    console.log('\n✅ Presigned PUT URL generated successfully:');
    console.log(putUrl);
  } catch (error) {
    console.error('\n❌ R2 presigned URL example failed:', error);
  }
}

testR2PresignedUrls();
