#!/usr/bin/env node
/**
 * BR-074 — Controlled one-time initial securities authority bootstrap.
 *
 * Operations procedure only. Not an HTTP route. Not a normal Admin Users action.
 *
 * Safety:
 *   - Dry-run by default
 *   - Writes require CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP=yes AND --execute
 *   - Config loaded from a file path (avoid secrets in shell history)
 *
 * Usage (dry-run):
 *   node -r dotenv/config backend/scripts/bootstrapInitialSecuritiesAuthority.js \
 *     --config /secure/path/securities-bootstrap.json
 *
 * Usage (execute):
 *   CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP=yes \
 *   node -r dotenv/config backend/scripts/bootstrapInitialSecuritiesAuthority.js \
 *     --config /secure/path/securities-bootstrap.json \
 *     --execute
 *
 * Example config: backend/scripts/securities-authority-bootstrap.example.json
 * Keep real configs outside the repository. Do not place registration documents
 * or secrets in shell history or committed files.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  bootstrapInitialSecuritiesAuthority
} = require("../security/securitiesInitialAuthorityBootstrapService");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { configPath: null, execute: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--execute") {
      args.execute = true;
    } else if (token === "--config" || token === "-c") {
      args.configPath = argv[i + 1] || null;
      i += 1;
    } else if (token.startsWith("--config=")) {
      args.configPath = token.slice("--config=".length);
    }
  }

  return args;
}

function printHelp() {
  console.log(`BR-074 Initial Securities Authority Bootstrap

Dry-run (default):
  node -r dotenv/config backend/scripts/bootstrapInitialSecuritiesAuthority.js --config <file>

Execute:
  CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP=yes \\
  node -r dotenv/config backend/scripts/bootstrapInitialSecuritiesAuthority.js --config <file> --execute

Config file must include organizationId, targetUserId, technicalActor, evidence*,
effectiveFrom, permittedProductScope, and reason.
Do not put registration documents or secrets in shell history.
`);
}

function loadConfig(configPath) {
  if (!configPath) {
    const error = new Error("Missing --config <path> to bootstrap JSON file.");
    error.exitCode = 1;
    error.code = "BOOTSTRAP_CONFIG_REQUIRED";
    throw error;
  }

  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    const error = new Error(`Config file not found: ${resolved}`);
    error.exitCode = 1;
    error.code = "BOOTSTRAP_CONFIG_MISSING";
    throw error;
  }

  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw);
}

function assertExecuteGate(env, executeFlag) {
  if (!executeFlag) {
    return false;
  }

  if (env.CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP !== "yes") {
    const error = new Error(
      "Refusing to write. Set CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP=yes and pass --execute after dry-run review."
    );
    error.exitCode = 1;
    error.code = "BOOTSTRAP_CONFIRMATION_REQUIRED";
    throw error;
  }

  return true;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return { ok: true, help: true };
  }

  const config = loadConfig(args.configPath);
  const willExecute = assertExecuteGate(env, args.execute);

  const result = await bootstrapInitialSecuritiesAuthority({
    ...config,
    dryRun: !willExecute
  });

  // Print operational result only. Config file is never rewritten.
  // Evidence reference is already a short sanitized label from the config.
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  main()
    .then((result) => {
      if (result?.dryRun) {
        console.error("\nDry-run only — no writes performed. Re-run with CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP=yes --execute to apply.");
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: error.publicCode || error.code || "BOOTSTRAP_FAILED",
            message: error.message
          },
          null,
          2
        )
      );
      process.exit(error.exitCode || error.statusCode || 1);
    });
}

module.exports = {
  parseArgs,
  loadConfig,
  assertExecuteGate,
  main
};
