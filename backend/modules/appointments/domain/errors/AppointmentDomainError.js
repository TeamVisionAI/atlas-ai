class AppointmentDomainError extends Error {
  constructor(message, { code = "APPOINTMENT_DOMAIN_ERROR", statusCode = 400 } = {}) {
    super(message);
    this.name = "AppointmentDomainError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = {
  AppointmentDomainError
};
