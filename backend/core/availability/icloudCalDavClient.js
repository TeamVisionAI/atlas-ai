/**
 * BR-161 — Read-only iCloud CalDAV client.
 * Never logs passwords, Basic Auth headers, raw ICS, titles, or attendees.
 */

const axios = require("axios");
const {
  createAvailabilityAuthError,
  createAvailabilityUnavailableError
} = require("./availabilityTypes");

const ICLOUD_CALDAV_ORIGIN = "https://caldav.icloud.com";
const REQUEST_TIMEOUT_MS = 12_000;

function createBasicAuthHeader(appleAccountEmail, appSpecificPassword) {
  const token = Buffer.from(
    `${String(appleAccountEmail || "").trim()}:${String(appSpecificPassword || "")}`,
    "utf8"
  ).toString("base64");
  return `Basic ${token}`;
}

function classifyCalDavStatus(status) {
  if (status === 401 || status === 403) {
    return createAvailabilityAuthError("ICLOUD_RECONNECT_REQUIRED");
  }
  if (status >= 500 || status === 429) {
    return createAvailabilityUnavailableError("ICLOUD_UNAVAILABLE");
  }
  return createAvailabilityUnavailableError("ICLOUD_UNAVAILABLE");
}

function classifyCalDavError(error) {
  if (error?.kind === "auth" || error?.kind === "unavailable") {
    return error;
  }
  const status = Number(error?.response?.status || 0);
  if (status) {
    return classifyCalDavStatus(status);
  }
  const code = String(error?.code || "");
  if (code === "ECONNABORTED" || code === "ETIMEDOUT" || code === "ECONNRESET") {
    return createAvailabilityUnavailableError("ICLOUD_UNAVAILABLE");
  }
  return createAvailabilityUnavailableError("ICLOUD_UNAVAILABLE");
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTagValues(xml, localName) {
  const pattern = new RegExp(
    `<[^>]*:?${localName}[^>]*>([\\s\\S]*?)</[^>]*:?${localName}>`,
    "gi"
  );
  const values = [];
  let match = pattern.exec(xml);
  while (match) {
    values.push(decodeXmlEntities(match[1].trim()));
    match = pattern.exec(xml);
  }
  return values;
}

function resolveHref(baseUrl, href) {
  if (!href) {
    return null;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

async function caldavRequest({
  method,
  url,
  appleAccountEmail,
  appSpecificPassword,
  headers = {},
  body = null,
  depth = null,
  httpPost = null
} = {}) {
  const request = httpPost || axios;
  try {
    const response = await request({
      method,
      url,
      data: body || undefined,
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        Authorization: createBasicAuthHeader(appleAccountEmail, appSpecificPassword),
        "Content-Type": "application/xml; charset=utf-8",
        ...(depth == null ? {} : { Depth: String(depth) }),
        ...headers
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw createAvailabilityAuthError("ICLOUD_RECONNECT_REQUIRED");
    }
    if (response.status >= 500 || response.status === 429) {
      throw createAvailabilityUnavailableError("ICLOUD_UNAVAILABLE");
    }
    if (response.status >= 400) {
      throw classifyCalDavStatus(response.status);
    }
    return {
      status: response.status,
      headers: response.headers || {},
      data: typeof response.data === "string" ? response.data : String(response.data || "")
    };
  } catch (error) {
    throw classifyCalDavError(error);
  }
}

async function discoverPrincipal(options) {
  const wellKnown = `${ICLOUD_CALDAV_ORIGIN}/.well-known/caldav`;
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal/></d:prop>
</d:propfind>`;
  const response = await caldavRequest({
    ...options,
    method: "PROPFIND",
    url: wellKnown,
    depth: 0,
    body
  });
  const href = extractTagValues(response.data, "href")[0];
  const principalUrl = resolveHref(response.headers.location || wellKnown, href);
  if (!principalUrl) {
    throw createAvailabilityUnavailableError("ICLOUD_DISCOVERY_FAILED");
  }
  return principalUrl;
}

async function discoverCalendarHome(options, principalUrl) {
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-home-set/></d:prop>
</d:propfind>`;
  const response = await caldavRequest({
    ...options,
    method: "PROPFIND",
    url: principalUrl,
    depth: 0,
    body
  });
  const hrefs = extractTagValues(response.data, "href");
  const homeHref = hrefs.find((value) => /calendars/i.test(value)) || hrefs[hrefs.length - 1];
  const homeUrl = resolveHref(principalUrl, homeHref);
  if (!homeUrl) {
    throw createAvailabilityUnavailableError("ICLOUD_DISCOVERY_FAILED");
  }
  return homeUrl;
}

function parseCalendarResponses(xml, homeUrl) {
  const chunks = String(xml || "").split(/<[^>]*:?response[^>]*>/i).slice(1);
  const calendars = [];
  for (const chunk of chunks) {
    if (!/<[^>]*:?calendar[\s/>]/i.test(chunk) && !/calendar-access/i.test(chunk)) {
      if (!/urn:ietf:params:xml:ns:caldav/i.test(chunk)) {
        continue;
      }
    }
    const href = extractTagValues(chunk, "href")[0];
    const displayName = extractTagValues(chunk, "displayname")[0] || "Calendar";
    const resolved = resolveHref(homeUrl, href);
    if (!resolved || resolved === homeUrl) {
      continue;
    }
    const isCalendar =
      /<[^>]*:?calendar[\s/>]/i.test(chunk) ||
      /calendar-access/i.test(chunk) ||
      /caldav/i.test(chunk);
    if (!isCalendar) {
      continue;
    }
    calendars.push({
      href: resolved,
      displayName: String(displayName).replace(/<[^>]+>/g, "").trim() || "Calendar"
    });
  }
  return calendars;
}

async function listCalendars(options, calendarHomeUrl) {
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`;
  const response = await caldavRequest({
    ...options,
    method: "PROPFIND",
    url: calendarHomeUrl,
    depth: 1,
    body
  });
  const calendars = parseCalendarResponses(response.data, calendarHomeUrl);
  if (!calendars.length) {
    throw createAvailabilityUnavailableError("ICLOUD_NO_CALENDARS");
  }
  return calendars;
}

function toCalDavUtc(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw createAvailabilityUnavailableError("ICLOUD_INVALID_WINDOW");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function queryCalendarEvents(options, calendarHref, timeMin, timeMax) {
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toCalDavUtc(timeMin)}" end="${toCalDavUtc(timeMax)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  const response = await caldavRequest({
    ...options,
    method: "REPORT",
    url: calendarHref,
    depth: 1,
    headers: { Accept: "text/xml, application/xml" },
    body
  });
  return extractTagValues(response.data, "calendar-data");
}

async function discoverIcloudCalendars(credentials, deps = {}) {
  const options = {
    appleAccountEmail: credentials.appleAccountEmail,
    appSpecificPassword: credentials.appSpecificPassword,
    httpPost: deps.httpPost || null
  };
  const principalUrl = await discoverPrincipal(options);
  const calendarHomeUrl = await discoverCalendarHome(options, principalUrl);
  const calendars = await listCalendars(options, calendarHomeUrl);
  return {
    principalUrl,
    calendarHomeUrl,
    calendars
  };
}

async function fetchIcloudCalendarIcs(credentials, calendarHref, timeMin, timeMax, deps = {}) {
  const options = {
    appleAccountEmail: credentials.appleAccountEmail,
    appSpecificPassword: credentials.appSpecificPassword,
    httpPost: deps.httpPost || null
  };
  return queryCalendarEvents(options, calendarHref, timeMin, timeMax);
}

module.exports = {
  ICLOUD_CALDAV_ORIGIN,
  createBasicAuthHeader,
  classifyCalDavError,
  discoverIcloudCalendars,
  fetchIcloudCalendarIcs,
  extractTagValues
};
