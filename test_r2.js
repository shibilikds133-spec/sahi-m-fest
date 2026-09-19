const { storageService } = require("./src/services/storage/storageService");

async function run() {
  const objectKey = "festivals/de289845-e465-4c7e-a470-820412156202/posters/generated_1787218287867-cnm384.jpg";
  const url = await storageService.getPresignedUrl(objectKey);
  console.log("Presigned URL:", url);
}
run().catch(console.error);
