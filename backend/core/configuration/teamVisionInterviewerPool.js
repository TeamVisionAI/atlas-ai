/**
 * Team Vision initial interviewer-pool data (BR-162).
 * Configuration only — the scheduler reads organization_settings.interviewerPool.
 */

const { TEAM_VISION_ORGANIZATION_ID } = require("../teamVisionSeedTenant");

const TEAM_VISION_ANA_USER_ID = "00000000-0000-4000-8000-000000000001";
const TEAM_VISION_NIOVEL_USER_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";

const TEAM_VISION_INTERVIEWER_POOL = Object.freeze({
  enabled: true,
  members: Object.freeze([
    {
      userId: TEAM_VISION_ANA_USER_ID,
      role: "primary",
      order: 1,
      displayName: "Ana Perez"
    },
    {
      userId: TEAM_VISION_NIOVEL_USER_ID,
      role: "overflow",
      order: 2,
      displayName: "Niovel Perez"
    }
  ])
});

module.exports = {
  TEAM_VISION_ORGANIZATION_ID,
  TEAM_VISION_ANA_USER_ID,
  TEAM_VISION_NIOVEL_USER_ID,
  TEAM_VISION_INTERVIEWER_POOL
};
