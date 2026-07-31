/**
 * Sprint 22 — Appointment Engine REST API.
 */

const express = require("express");
const appointmentController = require("../controllers/appointmentController");
const { protectedRoute } = require("../middleware/protectedRoute");
const { requirePermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");

const router = express.Router();

router.use(...protectedRoute());

router.get("/profile", appointmentController.getProfile);
router.patch("/profile", appointmentController.updateProfile);
router.get("/availability", appointmentController.getAvailableSlots);

router.get("/", appointmentController.listAppointments);
router.post("/", requirePermission(PERMISSIONS.PROSPECT_WRITE), appointmentController.createAppointment);
router.get("/:id", appointmentController.getAppointment);
router.post(
  "/:id/reschedule",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.rescheduleAppointment
);
router.post(
  "/:id/cancel",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.cancelAppointment
);
router.post(
  "/:id/complete",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.completeAppointment
);
router.post(
  "/:id/human-assist",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.requestHumanAssist
);
router.post(
  "/:id/resolve-human-assist",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.resolveHumanAssist
);

router.post(
  "/:id/send-interview-details",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.sendInterviewDetails
);

router.get(
  "/:id/communication-preview",
  appointmentController.previewInterviewDetailsCommunication
);

router.get(
  "/:id/interview-reminder-preview",
  appointmentController.previewInterviewReminderCommunication
);

router.post(
  "/:id/send-interview-reminder",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.sendInterviewReminder
);

router.get(
  "/:id/zoom-invitation-preview",
  appointmentController.previewZoomInvitationCommunication
);

router.post(
  "/:id/send-zoom-invitation",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.sendZoomInvitation
);

router.get(
  "/:id/office-location-preview",
  appointmentController.previewOfficeLocationCommunication
);

router.post(
  "/:id/send-office-location",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.sendOfficeLocation
);

router.post(
  "/prospect/:phone/email",
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  appointmentController.collectEmail
);

module.exports = router;
