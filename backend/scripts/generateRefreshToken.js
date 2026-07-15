const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const path = require("path");

const SCOPES = [
  "https://www.googleapis.com/auth/calendar"
];

async function main() {
  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: path.join(__dirname, "../../credentials.json"),
  });

  const oauth2Client = auth;

  console.log("\n==============================");
  console.log("REFRESH TOKEN");
  console.log("==============================\n");
  console.log(oauth2Client.credentials.refresh_token);
  console.log("\n==============================");
}

main().catch(console.error);