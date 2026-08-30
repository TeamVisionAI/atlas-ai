const constants = require("./constants");
const filename = require("./filename");
const {
  createMemoryDocumentStore,
  createMemoryDocumentRequestStore,
  createMemoryObjectStorage
} = require("./memoryStore");

module.exports = {
  ...constants,
  ...filename,
  createMemoryDocumentStore,
  createMemoryDocumentRequestStore,
  createMemoryObjectStorage
};
