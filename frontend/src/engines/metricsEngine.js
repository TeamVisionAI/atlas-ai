/**
 * Mock metric panel data — replace with Workflow Engine when integrated.
 */

import {
  formatAtlasDateTime,
  formatProspectInterviewTime
} from "../utils/dateFormatter";

function formatInterviewTime(prospect) {
  const formatted = formatProspectInterviewTime(prospect);

  if (formatted) {
    return formatted;
  }

  const fallback = new Date();
  fallback.setHours(14, 0, 0, 0);
  return formatAtlasDateTime(fallback);
}

function getInterviewType(prospect) {
  return prospect.interview_type || (prospect.city === "Doral" ? "Office" : "Zoom");
}

export function buildMockInterviews(queue = []) {
  const interviews = queue
    .filter(
      (prospect) =>
        prospect.current_step === "CONFIRMED" || Boolean(prospect.interview_time)
    )
    .slice(0, 8)
    .map((prospect) => ({
      phone: prospect.phone,
      name: prospect.name,
      time: formatInterviewTime(prospect),
      interviewType: getInterviewType(prospect),
      status: prospect.current_step === "CONFIRMED" ? "Confirmed" : "Scheduled"
    }));

  if (interviews.length) {
    return interviews;
  }

  return [
    {
      phone: "queue-mock-01",
      name: "Maria Lopez",
      time: formatAtlasDateTime(new Date(Date.now() + 3600000)),
      interviewType: "Zoom",
      status: "Confirmed"
    },
    {
      phone: "queue-mock-04",
      name: "James Carter",
      time: formatAtlasDateTime(new Date(Date.now() - 3600000)),
      interviewType: "Office",
      status: "Confirmed"
    }
  ];
}

export function buildMockFollowUps(queue = []) {
  const followUps = queue
    .filter((prospect) => {
      const step = prospect.current_step;
      return step === "OCCUPATION" || step === "SCHEDULE" || step === "EMAIL";
    })
    .slice(0, 6)
    .map((prospect, index) => ({
      phone: prospect.phone,
      name: prospect.name,
      dueTime: formatAtlasDateTime(
        new Date(Date.now() + (index + 1) * 90 * 60 * 1000)
      ),
      status: index === 0 ? "Due Now" : "Scheduled"
    }));

  if (followUps.length) {
    return followUps;
  }

  return [
    {
      phone: "queue-mock-02",
      name: "Carlos Ruiz",
      dueTime: formatAtlasDateTime(createTimeToday(11, 0)),
      status: "Due Now"
    },
    {
      phone: "queue-mock-05",
      name: "Elena Torres",
      dueTime: formatAtlasDateTime(createTimeToday(16, 30)),
      status: "Scheduled"
    }
  ];
}

function createTimeToday(hours, minutes) {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function buildMockTasks(queue = []) {
  const tasks = [];

  queue.forEach((prospect) => {
    if (prospect.current_step === "CONFIRMED" && prospect.interview_time) {
      tasks.push({
        phone: prospect.phone,
        name: prospect.name,
        task: "Interview Outcome Needed"
      });
    }
  });

  queue.slice(0, 2).forEach((prospect, index) => {
    if (index === 0) {
      tasks.push({
        phone: prospect.phone,
        name: prospect.name,
        task: "Send Onboarding Package"
      });
    }

    if (index === 1) {
      tasks.push({
        phone: prospect.phone,
        name: prospect.name,
        task: "Schedule Orientation"
      });
    }
  });

  if (tasks.length < 3) {
    tasks.push({
      phone: "queue-mock-03",
      name: "Sofia Mendez",
      task: "Licensing Follow-up"
    });
  }

  return tasks.slice(0, 6);
}

export const METRIC_PANEL_TYPES = {
  INTERVIEWS: "interviews",
  FOLLOW_UPS: "followUps",
  TASKS: "tasks"
};

export function getMetricPanelTitleKey(type) {
  switch (type) {
    case METRIC_PANEL_TYPES.INTERVIEWS:
      return "missionControlMetricPanelInterviews";
    case METRIC_PANEL_TYPES.FOLLOW_UPS:
      return "missionControlMetricPanelFollowUps";
    case METRIC_PANEL_TYPES.TASKS:
      return "missionControlMetricPanelTasks";
    default:
      return "";
  }
}

/** @deprecated Use getMetricPanelTitleKey with translate() */
export function getMetricPanelTitle(type) {
  switch (type) {
    case METRIC_PANEL_TYPES.INTERVIEWS:
      return "Interviews";
    case METRIC_PANEL_TYPES.FOLLOW_UPS:
      return "Follow Ups";
    case METRIC_PANEL_TYPES.TASKS:
      return "Tasks";
    default:
      return "";
  }
}

export function buildMetricPanelData(type, queue = []) {
  switch (type) {
    case METRIC_PANEL_TYPES.INTERVIEWS:
      return buildMockInterviews(queue);
    case METRIC_PANEL_TYPES.FOLLOW_UPS:
      return buildMockFollowUps(queue);
    case METRIC_PANEL_TYPES.TASKS:
      return buildMockTasks(queue);
    default:
      return [];
  }
}
