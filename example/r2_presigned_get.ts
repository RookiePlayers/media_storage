import dotenv from "dotenv";
dotenv.config({
  path:".env"
});

import { CloudFlareR2StorageService } from "../src/services/cloudFlareR2Storage";
import EnvironmentRegister from "../src/register";

async function main() {
  const env = EnvironmentRegister.getInstance();
  env.loadFromProcessEnv();

  const r2 = new CloudFlareR2StorageService();
  await r2.init();

  const upload = await r2.uploadFile({
    file: {
      name: "hello.txt",
      mimetype: "text/plain",
      data: Buffer.from("Hello from R2"),
    },
    uploadPath: "examples",
  });

  const key = upload.key ?? "";
  const presignedUrl = await r2.getPresignedUrl(key, 300);

  const response = await fetch(presignedUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();

  console.log("Uploaded key:", key);
  console.log("Presigned URL:", presignedUrl);
  console.log("Downloaded text:", text);
}

main().catch((error) => {
  console.error("R2 presigned GET example failed:", error);
  process.exitCode = 1;
});
