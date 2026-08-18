/**
 * Presentation grouping for rider cards. Does not change economics.
 * Matches BR-144 living-benefit vs other rider identity already stored on the DTO.
 */

export function isAcceleratedLivingBenefitRider(card = {}) {
  if (card.riderCategory === "living_benefit") {
    return true;
  }
  if (card.riderCategory === "other") {
    return false;
  }
  return /illness|injury|living benefit|accelerated|\babr\b/i.test(
    `${card.type || ""} ${card.rider || ""}`
  );
}
